import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { buildExtractContract, DEFAULT_EXTRACT_RELEASE_ID, extractEnumVocabulary, extractPrompt } from "@mta-wiki/agents/extract";
import { repoRoot } from "@mta-wiki/core/paths";

describe("v2 extract agent contract", () => {
  it("renders a deterministic final-schema contract with v1 taxonomy relation families", () => {
    const contractA = buildExtractContract(DEFAULT_EXTRACT_RELEASE_ID);
    const contractB = buildExtractContract(DEFAULT_EXTRACT_RELEASE_ID);
    const taxonomy = JSON.parse(readFileSync(join(repoRoot, "data", "exports", "releases", DEFAULT_EXTRACT_RELEASE_ID, "taxonomy.json"), "utf8")) as {
      families: Array<{ family: string }>;
    };

    expect(contractA).toBe(contractB);
    expect(contractA).toContain(`"release_id":"${DEFAULT_EXTRACT_RELEASE_ID}"`);
    expect((contractA.match(/"family":/g) ?? []).length).toBe(taxonomy.families.length);
    for (const { family } of taxonomy.families) expect(contractA).toContain(`"${family}"`);
  });

  it("builds enum vocabulary from the release and embeds the source packet in the prompt", () => {
    const vocabulary = extractEnumVocabulary(DEFAULT_EXTRACT_RELEASE_ID);
    const prompt = extractPrompt("source_a", "## Source\np001_c0001 text", "{}\n");

    expect(vocabulary.relation_family?.length).toBeGreaterThan(0);
    expect(vocabulary.assertion_status).toContain("planned");
    expect(prompt).toContain("Extract source `source_a`");
    expect(prompt).toContain("p001_c0001 text");
    expect(prompt).toContain('"source_id":"source_a"');
  });
});
