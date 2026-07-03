# MTA LLM Wiki

Filesystem-first MTA wiki pipeline for turning source documents into structured, source-backed
records and generated Markdown pages.

Durable project documentation lives in [docs/README.md](docs/README.md). Local planning notes are
kept outside Git under `plans/`.

## Live Site

The public static wiki is published at <https://mannyc2.github.io/mta-wiki/>.

## License & Data Provenance

Code is licensed under the MIT License. Source documents are public NYC/MTA government records
obtained from public agency websites. Extracted text and derived data are provided for research
and reference. To request a correction or takedown, open a GitHub issue.

## Current V0 Workflow

Prepare a captured source folder:

```bash
bun run harness prepare-source /path/to/sources/<sourceId>
```

This stages the raw source files and generates `raw/sources/<sourceId>/blocks.jsonl`, the required
block citation surface used by ingest agents.

Start the local Chandra vLLM server when producing new Chandra OCR through
tools that call Chandra's OpenAI-compatible vLLM API:

```bash
bun run chandra-server:start
bun run chandra-server:wait
```

The wrapper has no machine-local paths or secrets baked in. Configure local differences with
environment variables such as `CHANDRA_HF_CACHE`, `CHANDRA_VLLM_PORT`, `CHANDRA_VLLM_GPUS`, or
`CHANDRA_QUANT`.

Queue and refresh cached Chandra outputs for staged PDFs:

```bash
bun run chandra-queue
bun run chandra-run
```

For PDF ingest, Chandra output is required. Source prep writes PDF `blocks.jsonl` from
`chandra_ocr` blocks only; Poppler/text extraction and legacy normalization drafts are not fallback
ingest surfaces. The current `chandra-run` command rebuilds from cached
`raw/sources/*/chandra/pages/*.json` files; it does not start the vLLM server by itself.

Seed the current pilot submissions:

```bash
bun run harness seed-pilot
```

Materialize submissions into canonical records and wiki pages:

```bash
bun run harness materialize
```

Fresh public clones do not include `raw/`; `materialize` detects that case and rebuilds the local
SQLite projection from tracked canonical JSONL without rewriting canonical JSONL or wiki pages:

```bash
bun run materialize
```

Validate generated artifacts:

```bash
bun run validate
```

Audit the latest ingest run, or a specific submission JSONL/run id:

```bash
bun run audit
bun run audit 2026-06-08T16-50-10-718Z_3206939-260dd524_ingest_14th-street-busway-brochure
```

The audit report summarizes accepted/rejected submissions, observation kinds, citation surfaces,
raw-text hash usage, transcript tool use, rough token/cost efficiency, and heuristic warnings for
human review. It writes machine-readable output under `data/audits/`.

Dry-run the live agent entrypoints:

```bash
bun run harness ingest nyc_dot_14th_street_busway_brochure_pdf --dry-run
bun run harness write nyc_dot_14th_street_busway_brochure_pdf --dry-run
```

Live `ingest` uses MTA source/evidence/submission tools plus sandboxed `read` and `bash` for
inspection. Live `write` uses wiki page tools that only replace writer-owned regions plus sandboxed
`read`, `bash`, `write`, and `edit` for reactor-style wiki work.

## Wiki Reactor Sandbox

Sandbox settings live in `harness.config.json`.

By default, `bash` runs through Docker with `bp-sandbox:latest`, the repository mounted writable,
networking disabled, a read-only container root, and temporary writable `/tmp`. Host-side `read`,
`write`, and `edit` reject paths whose addressed path or resolved symlink path escapes the repo.

To run bash directly on the host instead of Docker, set:

```json
{
  "sandbox": {
    "bash": {
      "backend": "local"
    }
  }
}
```

## Model Provider

The harness is intentionally restricted to DeepSeek V4 Flash. Pioneer is the default provider; direct
DeepSeek is available as a secondary profile.

```bash
PIONEER_API_KEY=... bun run harness ingest m86_sbs_progress_report_2017
DEEPSEEK_API_KEY=... bun run harness ingest m86_sbs_progress_report_2017 --profile deepseek-flash
```

Enabled model ids:

- Pioneer: `deepseek-ai/DeepSeek-V4-Flash`
- Direct DeepSeek: `deepseek-v4-flash`

Provider calls use bounded retries and request timeouts so a slow upstream does not leave the
harness waiting forever. Defaults:

- `MTA_PROVIDER_TIMEOUT_MS`: `120000`, or `240000` for legacy normalization runs
- `MTA_PROVIDER_MAX_RETRIES`: `2`
- `MTA_PROVIDER_MAX_RETRY_DELAY_MS`: `15000`

Example:

```bash
MTA_PROVIDER_TIMEOUT_MS=300000 MTA_PROVIDER_MAX_RETRIES=3 bun run harness ingest m86_sbs_progress_report_2017
```
