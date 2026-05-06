import { readFileSync } from "node:fs";
import path from "node:path";

let loadedRoot: string | null = null;

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separator = trimmed.indexOf("=");
  if (separator <= 0) return null;
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
}

function isNodeTestRuntime(): boolean {
  return Boolean(process.env.NODE_TEST_CONTEXT);
}

export function loadRootEnv(repoRoot?: string): void {
  if (!repoRoot && isNodeTestRuntime()) return;
  const resolvedRepoRoot = repoRoot || path.resolve(process.cwd(), "../..");
  if (loadedRoot === resolvedRepoRoot) return;
  try {
    const envText = readFileSync(path.join(resolvedRepoRoot, ".env"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const pair = parseEnvLine(line);
      if (!pair) continue;
      const [key, value] = pair;
      if (!process.env[key]) process.env[key] = value;
    }
    loadedRoot = resolvedRepoRoot;
  } catch {
    loadedRoot = resolvedRepoRoot;
  }
}
