import { basename, join } from "node:path";
import { JsonlSessionRepo, type JsonlSessionMetadata } from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { HarnessConfig } from "./types.js";
import { repoRoot } from "./paths.js";

function createSessionRepo(config: HarnessConfig) {
  const env = new NodeExecutionEnv({ cwd: repoRoot });
  const sessionRepo = new JsonlSessionRepo({
    fs: env,
    sessionsRoot: join(repoRoot, config.transcriptsDir, "sessions"),
  });
  return { env, sessionRepo };
}

export async function createHarnessSession(config: HarnessConfig, sessionId: string) {
  const { env, sessionRepo } = createSessionRepo(config);
  const session = await sessionRepo.create({
    id: sessionId,
    cwd: repoRoot,
  });
  const metadata = await session.getMetadata();
  return { env, session, sessionPath: metadata.path };
}

export async function openHarnessSession(config: HarnessConfig, sessionPath: string) {
  const { env, sessionRepo } = createSessionRepo(config);
  const metadata: JsonlSessionMetadata = {
    id: basename(sessionPath, ".jsonl"),
    createdAt: new Date(0).toISOString(),
    cwd: repoRoot,
    path: sessionPath,
  };
  const session = await sessionRepo.open(metadata);
  const openedMetadata = await session.getMetadata();
  return { env, session, sessionPath: openedMetadata.path };
}
