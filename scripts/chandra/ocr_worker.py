#!/usr/bin/env python3
"""Run queued Chandra OCR pages against a local OpenAI-compatible vLLM server."""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import html
import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from PIL import Image

try:
    from chandra.model.util import detect_repeat_token as chandra_detect_repeat_token
    from chandra.output import parse_layout as chandra_parse_layout
    from chandra.output import parse_markdown as chandra_parse_markdown
    from chandra.prompts import PROMPT_MAPPING as CHANDRA_PROMPT_MAPPING
except Exception:  # pragma: no cover - local fallback for machines without chandra-ocr installed
    chandra_detect_repeat_token = None
    chandra_parse_layout = None
    chandra_parse_markdown = None
    CHANDRA_PROMPT_MAPPING = None


MODEL_ID = "datalab-to/chandra-ocr-2"
ENGINE = "chandra-ocr-2"
DEFAULT_API_BASE = "http://localhost:8000/v1"
DEFAULT_MODEL_NAME = "chandra"
DEFAULT_DPI = 150
DEFAULT_MAX_PIXELS = 6_291_456
DEFAULT_MAX_OUTPUT_TOKENS = 12_384

ALLOWED_TAGS = [
    "math",
    "br",
    "i",
    "b",
    "u",
    "del",
    "sup",
    "sub",
    "table",
    "tr",
    "td",
    "p",
    "th",
    "div",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "ul",
    "ol",
    "li",
    "input",
    "a",
    "span",
    "img",
    "hr",
    "tbody",
    "small",
    "caption",
    "strong",
    "thead",
    "big",
    "code",
    "chem",
]
ALLOWED_ATTRIBUTES = [
    "class",
    "colspan",
    "rowspan",
    "display",
    "checked",
    "type",
    "border",
    "value",
    "style",
    "href",
    "alt",
    "align",
    "data-bbox",
    "data-label",
]

FALLBACK_OCR_LAYOUT_PROMPT = f"""OCR this image to HTML, arranged as layout blocks. Each layout block should be a div with the data-bbox attribute representing the bounding box of the block in x0 y0 x1 y1 format. Bboxes are normalized 0-1000. The data-label attribute is the label for the block.
Use the following labels: - Caption - Footnote - Equation-Block - List-Group - Page-Header - Page-Footer - Image - Section-Header - Table - Text - Complex-Block - Code-Block - Form - Table-Of-Contents - Figure - Chemical-Block - Diagram - Bibliography - Blank-Page
Only use these tags {ALLOWED_TAGS}, and these attributes {ALLOWED_ATTRIBUTES}.
Guidelines: * Inline math: Surround math with tags. Math expressions should be rendered in KaTeX-compatible LaTeX. Use display for block math. * Tables: Use colspan and rowspan attributes to match table structure. * Formatting: Maintain consistent formatting with the image, including spacing, indentation, subscripts/superscripts, and special characters. * Images: Include a description of any images in the alt attribute of an img tag. Do not fill out the src property. Describe in detail inside the div tag.
Also convert charts to high fidelity data, and convert diagrams to mermaid. * Forms: Mark checkboxes and radio buttons properly. * Text: join lines together properly into paragraphs using p tags. Use br tags for line breaks within paragraphs, but only when absolutely necessary to maintain meaning. * Chemistry: Use chem tags for chemical formulas with reactive SMILES. * Lists: Preserve indents and proper list markers. * Use the simplest possible HTML structure that accurately represents the content of the block. * Make sure the text is accurate and easy for a human to read and interpret. Reading order should be correct and natural.""".strip()
OCR_LAYOUT_PROMPT = (CHANDRA_PROMPT_MAPPING or {}).get("ocr_layout", FALLBACK_OCR_LAYOUT_PROMPT)
PLAIN_TEXT_OCR_PROMPT = """OCR this image to readable plain Markdown.
Preserve headings, lists, table rows, dates, numbers, and labels as accurately as possible.
Do not invent missing text. Do not repeat tokens. If the page is blank or unreadable, write a brief note saying so.""".strip()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def page_file(chandra_dir: Path, page_number: int) -> Path:
    return chandra_dir / "pages" / f"p{page_number:03d}.json"


def healthy_page(path: Path, page_number: int) -> bool:
    if not path.exists():
        return False
    try:
        parsed = json.loads(path.read_text())
    except Exception:
        return False
    if parsed.get("status") == "error" or parsed.get("error") is True:
        return False
    if parsed.get("page_number") not in (None, page_number):
        return False
    return parsed.get("status") == "ok" or isinstance(parsed.get("blocks"), list)


def pdf_page_count(pdf_path: Path) -> int:
    result = subprocess.run(["pdfinfo", str(pdf_path)], check=True, text=True, capture_output=True)
    match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, re.MULTILINE)
    if not match:
        raise RuntimeError(f"Could not read page count from pdfinfo output for {pdf_path}")
    return int(match.group(1))


def render_page(pdf_path: Path, page_number: int, dpi: int, max_pixels: int) -> Image.Image:
    with tempfile.TemporaryDirectory(prefix="mta-chandra-page-") as tmp:
        prefix = Path(tmp) / "page"
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-r",
                str(dpi),
                "-png",
                "-singlefile",
                str(pdf_path),
                str(prefix),
            ],
            check=True,
            capture_output=True,
        )
        image = Image.open(f"{prefix}.png").convert("RGB")
        if image.width * image.height > max_pixels:
            scale = (max_pixels / float(image.width * image.height)) ** 0.5
            image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))))
        return image.copy()


def image_data_url(image: Image.Image) -> str:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def call_chandra(
    args: argparse.Namespace,
    image: Image.Image,
    temperature: float,
    top_p: float,
    prompt: str = OCR_LAYOUT_PROMPT,
    max_tokens: int | None = None,
) -> tuple[str, int | None]:
    response = requests.post(
        f"{args.api_base.rstrip('/')}/chat/completions",
        json={
            "model": args.model_name,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": image_data_url(image)}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            "max_tokens": max_tokens or args.max_output_tokens,
            "temperature": temperature,
            "top_p": top_p,
        },
        timeout=args.request_timeout,
    )
    response.raise_for_status()
    parsed = response.json()
    return parsed["choices"][0]["message"]["content"], parsed.get("usage", {}).get("completion_tokens")


def repeat_ratio(text: str) -> float:
    words = re.findall(r"\w+", text.lower())
    if len(words) < 2:
        return 0.0
    bigrams = list(zip(words, words[1:]))
    return 1 - (len(set(bigrams)) / len(bigrams))


def should_retry_generation(raw: str, token_count: int | None, args: argparse.Namespace, max_output_tokens: int | None = None) -> str | None:
    if chandra_detect_repeat_token is not None:
        if chandra_detect_repeat_token(raw) or (len(raw) > 50 and chandra_detect_repeat_token(raw, cut_from_end=50)):
            return "repeat_token"
    if token_count is not None and token_count >= (max_output_tokens or args.max_output_tokens):
        return "max_output_tokens"
    if len(raw) > 10_000 and repeat_ratio(raw) > 0.95:
        return "high_repeat_ratio"
    return None


def plain_markdown_text(raw: str) -> str:
    soup = BeautifulSoup(raw, "html.parser")
    text = soup.get_text("\n", strip=True) if soup.find() else raw
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def plain_text_blocks(raw: str, image: Image.Image) -> list[dict[str, Any]]:
    text = plain_markdown_text(raw)
    if not text:
        text = "Blank or unreadable page."
    return [
        {
            "order": 1,
            "label": "text",
            "kind": "text",
            "text": text,
            "bbox": [0, 0, image.width, image.height],
        }
    ]


def plain_text_fallback(args: argparse.Namespace, image: Image.Image) -> tuple[str, int | None, str | None]:
    raw = ""
    tokens = None
    last_error = None
    max_tokens = min(args.max_output_tokens, args.fallback_max_output_tokens)
    for attempt in range(args.fallback_retries + 1):
        try:
            raw, tokens = call_chandra(args, image, 0.2 + (0.2 * attempt), 0.95, PLAIN_TEXT_OCR_PROMPT, max_tokens)
            retry_reason = should_retry_generation(raw, tokens, args, max_tokens)
            if retry_reason and attempt < args.fallback_retries:
                continue
            return raw, tokens, retry_reason
        except Exception as exc:
            last_error = str(exc)
            time.sleep(min(20, 2 * (attempt + 1)))
    return raw, tokens, last_error or "plain_text_fallback_failed"


def normalized_bbox(raw: str | None, width: int, height: int) -> list[int]:
    if not raw:
        return [0, 0, width, height]
    try:
        parts = [int(float(part)) for part in raw.split()]
        if len(parts) != 4:
            raise ValueError
    except Exception:
        return [0, 0, width, height]
    return [
        max(0, min(width, int(parts[0] * width / 1000))),
        max(0, min(height, int(parts[1] * height / 1000))),
        max(0, min(width, int(parts[2] * width / 1000))),
        max(0, min(height, int(parts[3] * height / 1000))),
    ]


def block_text(label: str, div: Any) -> str:
    if label in {"Image", "Figure"}:
        img = div.find("img")
        alt = img.get("alt") if img else None
        if alt:
            return html.unescape(str(alt)).strip()
    return " ".join(div.get_text(" ", strip=True).split())


def html_to_markdownish(raw_html: str) -> str:
    if chandra_parse_markdown is not None:
        return chandra_parse_markdown(raw_html) or ""
    soup = BeautifulSoup(raw_html, "html.parser")
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5"]):
        level = int(tag.name[1])
        tag.string = f"{'#' * level} {tag.get_text(' ', strip=True)}"
    for table in soup.find_all("table"):
        table.insert_before(soup.new_string("\n"))
        table.insert_after(soup.new_string("\n"))
    text = soup.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_blocks(raw_html: str, image: Image.Image) -> list[dict[str, Any]]:
    if chandra_parse_layout is not None:
        layout = chandra_parse_layout(raw_html, image)
        blocks = []
        kind_map = {
            "title": "heading",
            "section-header": "heading",
            "page-header": "heading",
            "text": "paragraph",
            "text-inline-math": "paragraph",
            "handwriting": "paragraph",
            "bibliography": "paragraph",
            "table-of-contents": "paragraph",
            "complex-block": "paragraph",
            "code-block": "paragraph",
            "equation-block": "paragraph",
            "formula": "paragraph",
            "list-group": "list_item",
            "list-item": "list_item",
            "caption": "caption",
            "table": "table",
            "form": "table",
            "image": "figure",
            "figure": "figure",
            "diagram": "figure",
            "picture": "figure",
            "chemical-block": "figure",
            "page-footer": "footnote",
            "footnote": "footnote",
            "page-number": "footnote",
        }
        for index, block in enumerate(layout):
            label = (block.label or "block").lower()
            soup = BeautifulSoup(block.content or "", "html.parser")
            blocks.append(
                {
                    "order": index + 1,
                    "label": label,
                    "kind": kind_map.get(label, "paragraph"),
                    "text": soup.get_text(" ", strip=True),
                    "bbox": block.bbox,
                }
            )
        return blocks

    soup = BeautifulSoup(raw_html, "html.parser")
    divs = soup.find_all("div", recursive=False)
    if not divs:
        divs = soup.find_all("div")
    blocks = []
    for div in divs:
        label = div.get("data-label") or "Text"
        if label == "Blank-Page":
            continue
        text = block_text(label, div)
        if not text and label not in {"Image", "Figure"}:
            continue
        kind = {
            "Section-Header": "heading",
            "Page-Header": "heading",
            "Caption": "caption",
            "Table": "table",
            "Form": "table",
            "Image": "figure",
            "Figure": "figure",
            "Diagram": "figure",
            "Footnote": "footnote",
            "Page-Footer": "footnote",
            "List-Group": "list_item",
        }.get(label, "text")
        blocks.append(
            {
                "order": len(blocks) + 1,
                "label": label.lower().replace("-", "_"),
                "kind": kind,
                "text": text,
                "bbox": normalized_bbox(div.get("data-bbox"), image.width, image.height),
            }
        )
    if not blocks:
        text = " ".join(soup.get_text(" ", strip=True).split())
        if text:
            blocks.append({"order": 1, "label": "text", "kind": "text", "text": text, "bbox": [0, 0, image.width, image.height]})
    return blocks


def read_manifest(chandra_dir: Path) -> dict[str, Any]:
    path = chandra_dir / "manifest.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def write_manifest(entry: dict[str, Any], page_count: int, completed: list[int], failed: list[int], failures: list[dict[str, Any]], dpi: int) -> None:
    chandra_dir = Path(entry["chandra_dir"])
    all_pages = set(range(1, page_count + 1))
    completed_set = set(completed)
    failed_set = set(failed) - completed_set
    manifest = {
        **read_manifest(chandra_dir),
        "source_id": entry["source_id"],
        "engine": ENGINE,
        "model": MODEL_ID,
        "pdf_path": entry["pdf_path"],
        "page_count": page_count,
        "completed_pages": sorted(completed_set),
        "failed_pages": sorted(failed_set),
        "missing_pages": sorted(all_pages - completed_set),
        "failures": failures[-100:],
        "render_dpi": dpi,
        "updated_at": utc_now(),
    }
    chandra_dir.mkdir(parents=True, exist_ok=True)
    (chandra_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def process_page(args: argparse.Namespace, entry: dict[str, Any], page_number: int) -> dict[str, Any]:
    chandra_dir = Path(entry["chandra_dir"])
    out_path = page_file(chandra_dir, page_number)
    if not args.force and healthy_page(out_path, page_number):
        return {"page": page_number, "status": "skipped"}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image = render_page(Path(entry["pdf_path"]), page_number, args.render_dpi, args.max_pixels)
    if args.plain_text_only:
        fallback_raw, fallback_tokens, fallback_error = plain_text_fallback(args, image)
        if fallback_raw:
            markdown = plain_markdown_text(fallback_raw)
            payload = {
                "source_id": entry["source_id"],
                "page_number": page_number,
                "engine": ENGINE,
                "model": MODEL_ID,
                "generated_at": utc_now(),
                "render_dpi": args.render_dpi,
                "image_size": [image.width, image.height],
                "html": "",
                "markdown": markdown,
                "blocks": plain_text_blocks(fallback_raw, image),
                "tables": [],
                "token_count": fallback_tokens,
                "status": "ok",
                "fallback_mode": "plain_text_ocr",
                "fallback_reason": "plain_text_only" if not fallback_error else f"plain_text_only:{fallback_error}",
            }
            out_path.write_text(json.dumps(payload, indent=2) + "\n")
            return {"page": page_number, "status": "ok"}
        payload = {
            "source_id": entry["source_id"],
            "page_number": page_number,
            "engine": ENGINE,
            "model": MODEL_ID,
            "generated_at": utc_now(),
            "render_dpi": args.render_dpi,
            "status": "error",
            "error": f"plain_text_only_failed:{fallback_error}",
            "token_count": fallback_tokens,
        }
        out_path.write_text(json.dumps(payload, indent=2) + "\n")
        return {"page": page_number, "status": "error", "error": payload["error"]}
    raw = ""
    tokens = None
    last_error = None
    retry_reason = None
    temperature = args.temperature
    top_p = args.top_p
    for attempt in range(args.retries + 1):
        try:
            raw, tokens = call_chandra(args, image, temperature, top_p)
            retry_reason = should_retry_generation(raw, tokens, args)
            if retry_reason and attempt < args.retries:
                print(f"[chandra] retry {entry['source_id']} page {page_number}: {retry_reason}", flush=True)
                temperature = min(temperature + 0.2, 0.8)
                top_p = 0.95
                continue
            break
        except Exception as exc:
            last_error = str(exc)
            time.sleep(min(30, 2 * (attempt + 1)))
    if last_error and not raw:
        fallback_raw, fallback_tokens, fallback_error = plain_text_fallback(args, image)
        if fallback_raw:
            markdown = plain_markdown_text(fallback_raw)
            payload = {
                "source_id": entry["source_id"],
                "page_number": page_number,
                "engine": ENGINE,
                "model": MODEL_ID,
                "generated_at": utc_now(),
                "render_dpi": args.render_dpi,
                "image_size": [image.width, image.height],
                "html": "",
                "markdown": markdown,
                "blocks": plain_text_blocks(fallback_raw, image),
                "tables": [],
                "token_count": fallback_tokens,
                "status": "ok",
                "fallback_mode": "plain_text_ocr",
                "fallback_reason": last_error if not fallback_error else f"{last_error}; plain_text_fallback={fallback_error}",
            }
            out_path.write_text(json.dumps(payload, indent=2) + "\n")
            return {"page": page_number, "status": "ok"}
        payload = {
            "source_id": entry["source_id"],
            "page_number": page_number,
            "engine": ENGINE,
            "model": MODEL_ID,
            "generated_at": utc_now(),
            "render_dpi": args.render_dpi,
            "status": "error",
            "error": f"{last_error}; plain_text_fallback={fallback_error}",
        }
        out_path.write_text(json.dumps(payload, indent=2) + "\n")
        return {"page": page_number, "status": "error", "error": last_error}
    if retry_reason:
        fallback_raw, fallback_tokens, fallback_error = plain_text_fallback(args, image)
        if fallback_raw:
            markdown = plain_markdown_text(fallback_raw)
            payload = {
                "source_id": entry["source_id"],
                "page_number": page_number,
                "engine": ENGINE,
                "model": MODEL_ID,
                "generated_at": utc_now(),
                "render_dpi": args.render_dpi,
                "image_size": [image.width, image.height],
                "html": "",
                "markdown": markdown,
                "blocks": plain_text_blocks(fallback_raw, image),
                "tables": [],
                "token_count": fallback_tokens,
                "status": "ok",
                "fallback_mode": "plain_text_ocr",
                "fallback_reason": (
                    f"quality_retry_exhausted:{retry_reason}"
                    if not fallback_error
                    else f"quality_retry_exhausted:{retry_reason}; plain_text_fallback={fallback_error}"
                ),
            }
            out_path.write_text(json.dumps(payload, indent=2) + "\n")
            return {"page": page_number, "status": "ok"}
        payload = {
            "source_id": entry["source_id"],
            "page_number": page_number,
            "engine": ENGINE,
            "model": MODEL_ID,
            "generated_at": utc_now(),
            "render_dpi": args.render_dpi,
            "status": "error",
            "error": f"quality_retry_exhausted:{retry_reason}; plain_text_fallback={fallback_error}",
            "token_count": tokens,
        }
        out_path.write_text(json.dumps(payload, indent=2) + "\n")
        return {"page": page_number, "status": "error", "error": payload["error"]}

    payload = {
        "source_id": entry["source_id"],
        "page_number": page_number,
        "engine": ENGINE,
        "model": MODEL_ID,
        "generated_at": utc_now(),
        "render_dpi": args.render_dpi,
        "image_size": [image.width, image.height],
        "html": raw,
        "markdown": html_to_markdownish(raw),
        "blocks": parse_blocks(raw, image),
        "tables": [],
        "token_count": tokens,
        "status": "ok",
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    return {"page": page_number, "status": "ok"}


def process_source(args: argparse.Namespace, entry: dict[str, Any]) -> dict[str, Any]:
    chandra_dir = Path(entry["chandra_dir"])
    page_count = int(entry.get("page_count") or pdf_page_count(Path(entry["pdf_path"])))
    completed = [page for page in range(1, page_count + 1) if healthy_page(page_file(chandra_dir, page), page)]
    failed: list[int] = []
    failures: list[dict[str, Any]] = read_manifest(chandra_dir).get("failures") or []
    missing = [page for page in range(1, page_count + 1) if args.force or page not in set(completed)]
    if args.max_pages:
        missing = missing[: args.max_pages]
    write_manifest(entry, page_count, completed, failed, failures, args.render_dpi)
    if not missing:
        return {"source_id": entry["source_id"], "page_count": page_count, "processed": 0, "failed": 0}

    processed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        futures = [executor.submit(process_page, args, entry, page) for page in missing]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            page = int(result["page"])
            if result["status"] == "ok":
                processed += 1
                if page not in completed:
                    completed.append(page)
            elif result["status"] == "error":
                failed.append(page)
                failures.append({"page": page, "error": result.get("error"), "at": utc_now()})
            done = len(completed)
            print(f"[chandra] {entry['source_id']} page {page}/{page_count}: {result['status']} ({done}/{page_count} complete)", flush=True)
            write_manifest(entry, page_count, completed, failed, failures, args.render_dpi)
    return {"source_id": entry["source_id"], "page_count": page_count, "processed": processed, "failed": len(failed)}


def process_global_queue(args: argparse.Namespace, entries: list[dict[str, Any]]) -> dict[str, int]:
    states: dict[str, dict[str, Any]] = {}
    tasks: list[tuple[dict[str, Any], int]] = []
    for entry in entries:
        chandra_dir = Path(entry["chandra_dir"])
        page_count = int(entry.get("page_count") or pdf_page_count(Path(entry["pdf_path"])))
        completed = [page for page in range(1, page_count + 1) if healthy_page(page_file(chandra_dir, page), page)]
        failed: list[int] = []
        failures: list[dict[str, Any]] = read_manifest(chandra_dir).get("failures") or []
        missing = [page for page in range(1, page_count + 1) if args.force or page not in set(completed)]
        if args.max_pages:
            missing = missing[: args.max_pages]
        states[entry["source_id"]] = {
            "entry": entry,
            "page_count": page_count,
            "completed": completed,
            "failed": failed,
            "failures": failures,
            "processed": 0,
        }
        write_manifest(entry, page_count, completed, failed, failures, args.render_dpi)
        tasks.extend((entry, page) for page in missing)

    if not tasks:
        return {"processed_sources": len(entries), "failed_sources": 0, "processed_pages": 0, "failed_pages": 0}

    failed_sources: set[str] = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        future_entries = {executor.submit(process_page, args, entry, page): (entry, page) for entry, page in tasks}
        for future in concurrent.futures.as_completed(future_entries):
            entry, page = future_entries[future]
            state = states[entry["source_id"]]
            page_count = int(state["page_count"])
            completed = state["completed"]
            failed = state["failed"]
            failures = state["failures"]
            try:
                result = future.result()
            except Exception as exc:
                result = {"page": page, "status": "error", "error": str(exc)}
                failed_sources.add(entry["source_id"])
            page_number = int(result["page"])
            if result["status"] in {"ok", "skipped"}:
                if result["status"] == "ok":
                    state["processed"] += 1
                if page_number not in completed:
                    completed.append(page_number)
            elif result["status"] == "error":
                failed.append(page_number)
                failures.append({"page": page_number, "error": result.get("error"), "at": utc_now()})
            done = len(completed)
            print(f"[chandra] {entry['source_id']} page {page_number}/{page_count}: {result['status']} ({done}/{page_count} complete)", flush=True)
            write_manifest(entry, page_count, completed, failed, failures, args.render_dpi)

    processed_pages = sum(int(state["processed"]) for state in states.values())
    failed_pages = sum(len(state["failed"]) for state in states.values())
    return {
        "processed_sources": len(entries),
        "failed_sources": len(failed_sources),
        "processed_pages": processed_pages,
        "failed_pages": failed_pages,
    }


def load_entries(manifest_path: Path) -> list[dict[str, Any]]:
    manifest = json.loads(manifest_path.read_text())
    return [entry for entry in manifest["entries"] if entry["status"] in {"queued", "partial"}]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--api-base", default=os.environ.get("VLLM_API_BASE", DEFAULT_API_BASE))
    parser.add_argument("--model-name", default=os.environ.get("VLLM_MODEL_NAME", DEFAULT_MODEL_NAME))
    parser.add_argument("--render-dpi", type=int, default=int(os.environ.get("CHANDRA_RENDER_DPI", DEFAULT_DPI)))
    parser.add_argument("--max-pixels", type=int, default=int(os.environ.get("CHANDRA_MAX_PIXELS", DEFAULT_MAX_PIXELS)))
    parser.add_argument("--max-output-tokens", type=int, default=int(os.environ.get("CHANDRA_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS)))
    parser.add_argument("--request-timeout", type=int, default=int(os.environ.get("CHANDRA_REQUEST_TIMEOUT", "240")))
    parser.add_argument("--max-workers", type=int, default=int(os.environ.get("CHANDRA_MAX_WORKERS", "8")))
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--retries", type=int, default=int(os.environ.get("CHANDRA_RETRIES", "2")))
    parser.add_argument("--fallback-retries", type=int, default=int(os.environ.get("CHANDRA_FALLBACK_RETRIES", "2")))
    parser.add_argument("--fallback-max-output-tokens", type=int, default=int(os.environ.get("CHANDRA_FALLBACK_MAX_OUTPUT_TOKENS", "4096")))
    parser.add_argument("--plain-text-only", action="store_true", default=os.environ.get("CHANDRA_PLAIN_TEXT_ONLY", "0") == "1")
    parser.add_argument("--global-queue", action="store_true", default=os.environ.get("CHANDRA_GLOBAL_QUEUE", "0") == "1")
    parser.add_argument("--temperature", type=float, default=float(os.environ.get("CHANDRA_TEMPERATURE", "0")))
    parser.add_argument("--top-p", type=float, default=float(os.environ.get("CHANDRA_TOP_P", "0.1")))
    args = parser.parse_args()

    entries = load_entries(Path(args.manifest))
    if args.global_queue:
        print(json.dumps(process_global_queue(args, entries), indent=2), flush=True)
        return 0

    processed_sources = 0
    failed_sources = 0
    processed_pages = 0
    failed_pages = 0
    for entry in entries:
        try:
            result = process_source(args, entry)
            processed_sources += 1
            processed_pages += result["processed"]
            failed_pages += result["failed"]
        except Exception as exc:
            failed_sources += 1
            print(f"[chandra] failed source {entry['source_id']}: {exc}", flush=True)
    print(
        json.dumps(
            {
                "processed_sources": processed_sources,
                "failed_sources": failed_sources,
                "processed_pages": processed_pages,
                "failed_pages": failed_pages,
            }
        ),
        flush=True,
    )
    return 1 if failed_sources else 0


if __name__ == "__main__":
    raise SystemExit(main())
