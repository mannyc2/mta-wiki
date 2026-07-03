import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(currentDir, "../../..");

export function normalizeRepoPath(input: string) {
  const absolutePath = resolve(repoRoot, input);
  const relativePath = relative(repoRoot, absolutePath);

  if (relativePath === "" || isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Path is outside the repository: ${input}`);
  }

  return {
    absolutePath,
    relativePath: relativePath.split(sep).join("/"),
  };
}
