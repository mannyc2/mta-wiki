import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { repoRoot } from "@mta-wiki/core/paths";

type TokenizerJson = {
  added_tokens?: {
    content: string;
    id: number;
    special?: boolean;
  }[];
  model: {
    merges: string[];
  };
};

export const DEEPSEEK_TOKENIZER_ID = "deepseek-v4";
export const DEEPSEEK_TOKENIZER_SHA256 = "8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf";

const TOKENIZER_PATH = join(repoRoot, "packages", "pipeline", "assets", "tokenizers", DEEPSEEK_TOKENIZER_ID, "tokenizer.json.gz");
const SPECIAL_TOKEN_SENTINEL = "<｜";

const numberPattern = /\p{N}{1,3}/gu;
const cjkPattern = /[一-龥぀-ゟ゠-ヿ]+/gu;
const mainPattern =
  /[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~][A-Za-z]+|[^\r\n\p{L}\p{P}\p{S}]?[\p{L}\p{M}]+| ?[\p{P}\p{S}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+/gu;

const textEncoder = new TextEncoder();
const byteEncoder = buildByteEncoder();

let cachedTokenizer: DeepSeekTokenizer | undefined;

function buildByteEncoder() {
  const visibleBytes: number[] = [];
  for (let byte = 33; byte <= 126; byte += 1) visibleBytes.push(byte);
  for (let byte = 161; byte <= 172; byte += 1) visibleBytes.push(byte);
  for (let byte = 174; byte <= 255; byte += 1) visibleBytes.push(byte);

  const unicodePoints = [...visibleBytes];
  let next = 0;
  for (let byte = 0; byte <= 255; byte += 1) {
    if (!visibleBytes.includes(byte)) {
      visibleBytes.push(byte);
      unicodePoints.push(256 + next);
      next += 1;
    }
  }

  const encoder: string[] = [];
  for (let index = 0; index < visibleBytes.length; index += 1) {
    const byte = visibleBytes[index];
    const codePoint = unicodePoints[index];
    if (byte === undefined || codePoint === undefined) continue;
    encoder[byte] = String.fromCodePoint(codePoint);
  }
  return encoder;
}

function pairKey(left: string, right: string) {
  return `${left}\u0000${right}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isolateSplit(input: string[], pattern: RegExp) {
  const output: string[] = [];
  for (const piece of input) {
    pattern.lastIndex = 0;
    let cursor = 0;
    for (const match of piece.matchAll(pattern)) {
      const index = match.index;
      const value = match[0];
      if (index === undefined || value.length === 0) continue;
      if (index > cursor) output.push(piece.slice(cursor, index));
      output.push(value);
      cursor = index + value.length;
    }
    if (cursor < piece.length) output.push(piece.slice(cursor));
  }
  return output.filter((piece) => piece.length > 0);
}

function byteLevelEncode(value: string) {
  let output = "";
  for (const byte of textEncoder.encode(value)) {
    output += byteEncoder[byte] ?? "";
  }
  return output;
}

function parseTokenizer() {
  return JSON.parse(gunzipSync(readFileSync(TOKENIZER_PATH)).toString("utf8")) as TokenizerJson;
}

class DeepSeekTokenizer {
  private readonly mergeRanks = new Map<string, number>();
  private readonly specialTokenIds = new Map<string, number>();
  private readonly specialTokenPattern: RegExp | undefined;

  constructor(tokenizer: TokenizerJson) {
    tokenizer.model.merges.forEach((merge, rank) => {
      const separator = merge.indexOf(" ");
      if (separator === -1) return;
      const left = merge.slice(0, separator);
      const right = merge.slice(separator + 1);
      this.mergeRanks.set(pairKey(left, right), rank);
    });

    const specialTokens = (tokenizer.added_tokens ?? [])
      .filter((token) => token.special)
      .sort((a, b) => b.content.length - a.content.length || a.id - b.id);
    for (const token of specialTokens) this.specialTokenIds.set(token.content, token.id);
    this.specialTokenPattern =
      specialTokens.length === 0 ? undefined : new RegExp(specialTokens.map((token) => escapeRegex(token.content)).join("|"), "gu");
  }

  count(text: string) {
    let count = 0;
    for (const segment of this.segments(text)) {
      count += segment.special ? 1 : this.countOrdinaryText(segment.text);
    }
    return count;
  }

  private segments(text: string) {
    if (!this.specialTokenPattern || !text.includes(SPECIAL_TOKEN_SENTINEL)) return [{ text, special: false }];

    const segments: { text: string; special: boolean }[] = [];
    this.specialTokenPattern.lastIndex = 0;
    let cursor = 0;
    for (const match of text.matchAll(this.specialTokenPattern)) {
      const index = match.index;
      const value = match[0];
      if (index === undefined || value.length === 0) continue;
      if (index > cursor) segments.push({ text: text.slice(cursor, index), special: false });
      segments.push({ text: value, special: this.specialTokenIds.has(value) });
      cursor = index + value.length;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor), special: false });
    return segments;
  }

  private countOrdinaryText(text: string) {
    const pieces = isolateSplit(isolateSplit(isolateSplit([text], numberPattern), cjkPattern), mainPattern);
    let count = 0;
    for (const piece of pieces) count += this.countBpeTokens(byteLevelEncode(piece));
    return count;
  }

  private countBpeTokens(encodedPiece: string) {
    const parts = Array.from(encodedPiece);
    if (parts.length <= 1) return parts.length;

    while (parts.length > 1) {
      let bestRank = Number.POSITIVE_INFINITY;
      let bestIndex = -1;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const left = parts[index];
        const right = parts[index + 1];
        if (left === undefined || right === undefined) continue;
        const rank = this.mergeRanks.get(pairKey(left, right));
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          bestIndex = index;
        }
      }
      if (bestIndex === -1) break;
      const left = parts[bestIndex];
      const right = parts[bestIndex + 1];
      if (left === undefined || right === undefined) break;
      parts.splice(bestIndex, 2, left + right);
    }

    return parts.length;
  }
}

function tokenizer() {
  cachedTokenizer ??= new DeepSeekTokenizer(parseTokenizer());
  return cachedTokenizer;
}

export function countDeepSeekTokens(text: string) {
  return tokenizer().count(text);
}
