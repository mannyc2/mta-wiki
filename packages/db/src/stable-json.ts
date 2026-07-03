import { createHash } from "node:crypto";
import type { JsonValue } from "./types.js";

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const pairs = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry as JsonValue)}`);
    return `{${pairs.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableHash(value: JsonValue) {
  return sha256(stableJson(value));
}

export function shortHash(value: JsonValue, length = 16) {
  return stableHash(value).slice(0, length);
}

