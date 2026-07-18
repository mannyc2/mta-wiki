import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaObservationKind } from "@mta-wiki/db/types";
import { ASSERTION_STATUSES } from "@mta-wiki/pipeline/records/assertion-qualifiers";
import { RELATION_ENDPOINT_SHAPES, RELATION_FAMILIES, RELATION_FAMILY_BY_KIND, type RelationFamily } from "@mta-wiki/pipeline/records/relations";

export type TaxonomyRelationKind = {
  kind: string;
  subject_kinds?: MtaObservationKind[] | undefined;
  object_kinds?: MtaObservationKind[] | undefined;
};

export type TaxonomyFamily = {
  family: RelationFamily;
  kinds: TaxonomyRelationKind[];
};

export type TaxonomyDoc = {
  assertion_statuses: string[];
  families: TaxonomyFamily[];
};

export function buildTaxonomy(): TaxonomyDoc {
  const kindsByFamily = new Map<RelationFamily, string[]>();
  for (const family of RELATION_FAMILIES) kindsByFamily.set(family, []);
  for (const [kind, family] of RELATION_FAMILY_BY_KIND) {
    kindsByFamily.get(family)?.push(kind);
  }

  return {
    assertion_statuses: [...ASSERTION_STATUSES],
    families: RELATION_FAMILIES.map((family) => ({
      family,
      kinds: (kindsByFamily.get(family) ?? []).sort().map((kind) => {
        const shape = RELATION_ENDPOINT_SHAPES[kind];
        if (!shape) return { kind };
        return {
          kind,
          subject_kinds: [...shape.subject].sort(),
          object_kinds: [...shape.object].sort(),
        };
      }),
    })),
  };
}

export function taxonomyJson(doc = buildTaxonomy()) {
  const json = `${stableJson(doc as unknown as JsonValue)}\n`;
  parseTaxonomy(JSON.parse(json) as unknown);
  return json;
}

export function parseTaxonomy(value: unknown, artifactPath = "taxonomy.json"): TaxonomyDoc {
  const expected = buildTaxonomy();
  if (stableJson(value as JsonValue) !== stableJson(expected as unknown as JsonValue)) throw new Error(`${artifactPath}: does not match the supported taxonomy contract`);
  return value as TaxonomyDoc;
}
