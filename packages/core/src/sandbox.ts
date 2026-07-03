import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createBashTool,
  createEditTool,
  createLocalBashOperations,
  createReadTool,
  createWriteTool,
  type BashOperations,
  type EditOperations,
  type ReadOperations,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";
import { repoRoot } from "./paths.js";
import type { HarnessConfig, HarnessRunCommand } from "./types.js";

type SandboxCommand = HarnessRunCommand | "identity-review" | "ontology-normalize" | "canonicalize" | "canonicalize-review";

const DEFAULT_DOCKER_IMAGE = "bp-sandbox:latest";
const DEFAULT_TMPFS_SIZE = "512m";

let repoRealPathPromise: Promise<string> | undefined;

function repoRealPath() {
  repoRealPathPromise ??= realpath(repoRoot);
  return repoRealPathPromise;
}

function isWithin(parent: string, child: string) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function transcriptSandboxDirs(config: HarnessConfig) {
  return uniqueValues([config.transcriptsDir, "data/transcripts", "wiki/transcripts"]);
}

function blockedSandboxRoots(config: HarnessConfig) {
  return transcriptSandboxDirs(config).map((path) => resolve(repoRoot, path));
}

function isBlockedSandboxPath(absolutePath: string, config: HarnessConfig) {
  return blockedSandboxRoots(config).some((blockedRoot) => isWithin(blockedRoot, absolutePath));
}

function assertAddressedRepoPath(inputPath: string, config: HarnessConfig) {
  const absolutePath = resolve(inputPath);
  if (!isWithin(repoRoot, absolutePath)) {
    throw new Error(`Sandbox path is outside the repository: ${inputPath}`);
  }
  if (isBlockedSandboxPath(absolutePath, config)) {
    throw new Error(`Sandbox path is not available to agents: ${inputPath}`);
  }
  return absolutePath;
}

async function nearestExistingRealPath(absolutePath: string) {
  let current = absolutePath;

  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : undefined;
      if (code !== "ENOENT") throw error;

      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function assertSandboxPath(inputPath: string, config: HarnessConfig) {
  const absolutePath = assertAddressedRepoPath(inputPath, config);
  const [rootRealPath, targetRealPath] = await Promise.all([repoRealPath(), nearestExistingRealPath(absolutePath)]);

  if (!isWithin(rootRealPath, targetRealPath)) {
    throw new Error(`Sandbox path resolves outside the repository: ${inputPath}`);
  }
  if (isBlockedSandboxPath(targetRealPath, config)) {
    throw new Error(`Sandbox path resolves to a path that is not available to agents: ${inputPath}`);
  }

  return absolutePath;
}

function sandboxReadOperations(config: HarnessConfig): ReadOperations {
  return {
    async access(path) {
      const sandboxPath = await assertSandboxPath(path, config);
      await access(sandboxPath, constants.R_OK);
    },
    async readFile(path) {
      const sandboxPath = await assertSandboxPath(path, config);
      return readFile(sandboxPath);
    },
  };
}

function sandboxWriteOperations(config: HarnessConfig): WriteOperations {
  return {
    async mkdir(path) {
      const sandboxPath = await assertSandboxPath(path, config);
      await mkdir(sandboxPath, { recursive: true });
    },
    async writeFile(path, content) {
      const sandboxPath = await assertSandboxPath(path, config);
      await writeFile(sandboxPath, content, "utf8");
    },
  };
}

function sandboxEditOperations(config: HarnessConfig): EditOperations {
  return {
    async access(path) {
      const sandboxPath = await assertSandboxPath(path, config);
      await access(sandboxPath, constants.R_OK | constants.W_OK);
    },
    async readFile(path) {
      const sandboxPath = await assertSandboxPath(path, config);
      return readFile(sandboxPath);
    },
    async writeFile(path, content) {
      const sandboxPath = await assertSandboxPath(path, config);
      await writeFile(sandboxPath, content, "utf8");
    },
  };
}

function dockerUserArg() {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") return [];
  return ["--user", `${process.getuid()}:${process.getgid()}`];
}

function normalizeContainerWorkdir(cwd: string, config: HarnessConfig) {
  const absolutePath = assertAddressedRepoPath(cwd, config);
  return absolutePath.split(sep).join("/");
}

function dockerRunArgs(command: string, cwd: string, config: HarnessConfig) {
  const bashConfig = config.sandbox?.bash;
  const image = bashConfig?.dockerImage ?? DEFAULT_DOCKER_IMAGE;
  const network = bashConfig?.network ?? "none";
  const readOnlyRoot = bashConfig?.readOnlyRoot ?? true;
  const tmpfsSize = bashConfig?.tmpfsSize ?? DEFAULT_TMPFS_SIZE;
  const shell = bashConfig?.shell ?? "bash";
  const args = ["run", "--rm", "--cap-drop", "ALL", "--security-opt", "no-new-privileges"];

  if (network === "none") {
    args.push("--network", "none");
  } else {
    args.push("--network", "host");
  }

  if (readOnlyRoot) args.push("--read-only");

  const transcriptTmpfsArgs = blockedSandboxRoots(config).flatMap((path) => [
    "--tmpfs",
    `${path}:rw,nosuid,nodev,size=64m`,
  ]);

  args.push(
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,size=${tmpfsSize}`,
    ...transcriptTmpfsArgs,
    ...dockerUserArg(),
    "--volume",
    `${repoRoot}:${repoRoot}:rw`,
    "--workdir",
    normalizeContainerWorkdir(cwd, config),
    "--env",
    "HOME=/tmp",
    "--env",
    "BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-transpiler-cache",
    "--env",
    "npm_config_cache=/tmp/npm-cache",
    image,
    shell,
    "-lc",
    command,
  );

  return args;
}

function createDockerBashOperations(config: HarnessConfig): BashOperations {
  return {
    async exec(command, cwd, options) {
      await assertSandboxPath(cwd, config);

      return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn("docker", dockerRunArgs(command, cwd, config), {
          cwd: repoRoot,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        let settled = false;
        let timedOut = false;
        let killTimer: NodeJS.Timeout | undefined;
        let timeoutTimer: NodeJS.Timeout | undefined;

        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          if (timeoutTimer) clearTimeout(timeoutTimer);
          if (killTimer) clearTimeout(killTimer);
          options.signal?.removeEventListener("abort", abort);
          callback();
        };

        const terminate = () => {
          if (child.killed) return;
          child.kill("SIGTERM");
          killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
        };

        const abort = () => {
          terminate();
        };

        timeoutTimer =
          options.timeout !== undefined && options.timeout > 0
            ? setTimeout(() => {
                timedOut = true;
                terminate();
              }, options.timeout * 1000)
            : undefined;

        if (options.signal?.aborted) {
          terminate();
        } else {
          options.signal?.addEventListener("abort", abort, { once: true });
        }

        child.stdout?.on("data", options.onData);
        child.stderr?.on("data", options.onData);
        child.on("error", (error) => settle(() => rejectPromise(error)));
        child.on("close", (exitCode) =>
          settle(() => {
            if (options.signal?.aborted) {
              rejectPromise(new Error("aborted"));
              return;
            }
            if (timedOut) {
              rejectPromise(new Error(`timeout:${options.timeout}`));
              return;
            }
            resolvePromise({ exitCode });
          }),
        );
      });
    },
  };
}

function createSandboxBashOperations(config: HarnessConfig): BashOperations {
  if ((config.sandbox?.bash?.backend ?? "docker") === "local") {
    const local = createLocalBashOperations(config.sandbox?.bash?.shell ? { shellPath: config.sandbox.bash.shell } : undefined);
    return {
      async exec(command, cwd, options) {
        await assertSandboxPath(cwd, config);
        if (transcriptSandboxDirs(config).some((path) => command.includes(path))) {
          throw new Error("Sandbox bash may not access transcript paths.");
        }
        return local.exec(command, cwd, options);
      },
    };
  }

  return createDockerBashOperations(config);
}

export function createWikiReactorSandboxTools(config: HarnessConfig, command: SandboxCommand): AgentTool[] {
  const tools: AgentTool[] = [
    createReadTool(repoRoot, { operations: sandboxReadOperations(config) }),
    createBashTool(repoRoot, { operations: createSandboxBashOperations(config) }),
  ];

  if (command === "write") {
    tools.push(
      createWriteTool(repoRoot, { operations: sandboxWriteOperations(config) }),
      createEditTool(repoRoot, { operations: sandboxEditOperations(config) }),
    );
  }

  return tools;
}

export function createWikiReactorReadTools(config: HarnessConfig): AgentTool[] {
  return [createReadTool(repoRoot, { operations: sandboxReadOperations(config) })];
}

export function sandboxSystemPrompt(command: SandboxCommand, config: HarnessConfig) {
  const backend = config.sandbox?.bash?.backend ?? "docker";
  const common = [
    "Sandbox tools are available for repository-local work.",
    `The bash tool uses the ${backend} backend from the repository root.`,
    "The read tool is limited to files whose addressed and resolved paths stay inside this repository.",
    `Transcript files under ${config.transcriptsDir} are not available to agents.`,
  ];

  if (command === "ingest") {
    return [
      ...common,
      "Use read and bash only for source/repo inspection; submit durable extracted facts through MTA submission tools.",
    ].join("\n");
  }

  if (command === "write") {
    return [
      ...common,
      "The write and edit tools are also limited to repository-local paths.",
      "For materialized wiki pages, prefer mta_write_writer_context so generated frontmatter remains runner-owned.",
    ].join("\n");
  }

  if (command === "ask") {
    return [
      ...common,
      "Use read and bash only for read-only repository inspection when a tool result points to more context.",
      "Do not modify repository files; this is a read-only question-answering session that returns a cited answer.",
    ].join("\n");
  }

  return [
    ...common,
    "Use read and bash only for read-only repository inspection when a packet pointer needs more context.",
    command === "ontology-normalize"
      ? "Do not modify repository files; the ontology-normalize runner writes validated/quarantined decision journals after your final JSON response."
      : "Do not modify repository files; the identity-review runner writes staged suggestion files after your final JSON response.",
  ].join("\n");
}
