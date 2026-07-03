import { writerRegion } from "@mta-wiki/pipeline/materialize/writer-change-gate";
import type { JsonObject } from "@mta-wiki/db/types";

export const PRIMITIVE_KINDS = ["route", "corridor", "project", "entity", "metric", "cite"] as const;
export const BLOCK_PRIMITIVE_KINDS = ["route", "corridor", "project", "entity", "metric"] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];
export type BlockPrimitiveKind = (typeof BLOCK_PRIMITIVE_KINDS)[number];

export type InlinePrimitive = {
  kind: PrimitiveKind;
  id: string;
  blockId?: string | undefined;
  label: string;
  offset: number;
  raw: string;
};

export type BlockPrimitive = {
  kind: BlockPrimitiveKind | string;
  id?: string | undefined;
  data?: JsonObject | undefined;
  offset: number;
  raw: string;
  error?: "unknown_kind" | "invalid_json" | "missing_id" | undefined;
};

const INLINE_PRIMITIVE_RE = /\[\[(route|corridor|project|entity|metric|cite):([^#|\]\s]+)(?:#([^|\]\s]+))?\|([\s\S]*?)\]\]/gu;
const FENCE_RE = /(?:^|\n)```([^\n`]*)\n([\s\S]*?)\n```/gu;

function isBlockPrimitiveKind(kind: string): kind is BlockPrimitiveKind {
  return (BLOCK_PRIMITIVE_KINDS as readonly string[]).includes(kind);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseInlinePrimitives(markdown: string): InlinePrimitive[] {
  const primitives: InlinePrimitive[] = [];
  for (const match of markdown.matchAll(INLINE_PRIMITIVE_RE)) {
    const kind = match[1] as PrimitiveKind;
    const id = match[2]!;
    const blockId = match[3];
    const label = match[4]!;
    primitives.push({
      kind,
      id,
      blockId,
      label,
      offset: match.index ?? 0,
      raw: match[0]!,
    });
  }
  return primitives;
}

export function parseBlockPrimitives(markdown: string): BlockPrimitive[] {
  const primitives: BlockPrimitive[] = [];
  for (const match of markdown.matchAll(FENCE_RE)) {
    const info = match[1]?.trim() ?? "";
    if (!info.startsWith("mta:")) continue;
    const kind = info.slice("mta:".length).trim();
    const body = match[2] ?? "";
    const raw = match[0]!.startsWith("\n") ? match[0]!.slice(1) : match[0]!;
    const offset = (match.index ?? 0) + (match[0]!.startsWith("\n") ? 1 : 0);

    if (!isBlockPrimitiveKind(kind)) {
      primitives.push({ kind, offset, raw, error: "unknown_kind" });
      continue;
    }

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      primitives.push({ kind, offset, raw, error: "invalid_json" });
      continue;
    }
    if (!isJsonObject(data) || typeof data.id !== "string" || !data.id.trim()) {
      primitives.push({ kind, offset, raw, data: isJsonObject(data) ? data : undefined, error: "missing_id" });
      continue;
    }
    primitives.push({ kind, id: data.id, data, offset, raw });
  }
  return primitives;
}

export function extractWriterRegion(markdown: string): string | null {
  const region = writerRegion(markdown);
  if (!region) return null;
  return region
    .replace(/^<!-- mta-wiki:writer:start -->\n?/u, "")
    .replace(/\n?<!-- mta-wiki:writer:end -->$/u, "");
}
