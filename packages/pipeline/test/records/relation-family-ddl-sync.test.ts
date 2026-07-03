// Plan 016: the relations DDL CHECK must mirror RELATION_FAMILIES exactly (order included).
import { describe, expect, it } from "bun:test";
import { renderCreateTable } from "@mta-wiki/db/schema-ddl";
import { relations } from "@mta-wiki/db/schema";
import { RELATION_FAMILIES } from "@mta-wiki/pipeline/records/relations";

describe("relation_family DDL sync", () => {
  it("the CHECK enumerates RELATION_FAMILIES verbatim", () => {
    const expected = `relation_family IN (${RELATION_FAMILIES.map((family) => `'${family}'`).join(",")})`;
    expect(renderCreateTable(relations)).toContain(expected);
  });
});
