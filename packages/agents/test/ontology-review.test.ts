import { describe, expect, it } from "bun:test";
import { ontologyAgentDefinitions } from "@mta-wiki/agents/ontology-review";

describe("ontology review agents", () => {
  it("defines the bounded ontology work queues", () => {
    expect(ontologyAgentDefinitions().map((agent) => agent.agent_id)).toEqual([
      "route-service-identity",
      "project-corridor-spatial",
      "entity-source-role",
      "metric-claim-ontology",
      "relation-ontology",
      "lifecycle-intervention-taxonomy",
      "source-gap-resolution",
    ]);
  });

  it("keeps each agent constrained by an explicit decision contract", () => {
    for (const agent of ontologyAgentDefinitions()) {
      expect(agent.owns.length).toBeGreaterThan(0);
      expect(agent.decision_contract).toContain("needs_more_data");
      expect(agent.decision_contract).toContain("no_change");
    }
  });
});
