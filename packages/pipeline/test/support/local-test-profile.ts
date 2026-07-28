import { describe, it } from "bun:test";

export type LocalTestProfile = "corpus" | "authoring";

function enabled(profile: LocalTestProfile): boolean {
  return process.env.MTA_TEST_LOCAL_PROFILE === profile;
}

/**
 * Explicit hydrated-only case boundary.
 *
 * Hydrated cases are not registered at all in an ordinary clean-clone run.
 * The explicit profile runner performs the content-addressed corpus preflight,
 * selects the files that declare this boundary, and only then registers them.
 */
const inactive = (() => undefined) as unknown as typeof it;
const inactiveSuite = (() => undefined) as unknown as typeof describe;
export const corpusIt: typeof it = enabled("corpus") ? it : inactive;
export const authoringIt: typeof it = enabled("authoring") ? it : inactive;
export const corpusDescribe: typeof describe = enabled("corpus") ? describe : inactiveSuite;
export const authoringDescribe: typeof describe = enabled("authoring") ? describe : inactiveSuite;

export function localProfileEnabled(profile: LocalTestProfile): boolean {
  return enabled(profile);
}
