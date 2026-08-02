import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../../core/src/paths";

it("threads the owned clean-clone database through every post-rebuild gate", () => {
	const script = readFileSync(
		join(repoRoot, "scripts/check-clean-clone.ts"),
		"utf8",
	);
	expect(script).toContain("rebuildResolvedTransitDb(");
	expect(script).toContain(
		"exposeOwnedProjection(ownedCanonicalDb, repositoryCanonicalDb)",
	);
	expect(script).toContain(
		"exposeOwnedProjection(ownedResolvedTransitDb, repositoryResolvedTransitDb)",
	);
	expect(script).toContain('run("bun", ["run", "validate"]);');
	expect(script).toContain(
		'run("bun", ["scripts/determinism-anchor.ts"]);',
	);
	expect(script).toContain(
		'run("bun", ["packages/cli/src/cli.ts", "verify-release", "v1-rc28"]);',
	);
	expect(script).toContain(
		'join(ownedRoot, "reference-adapter.json"),',
	);
});
