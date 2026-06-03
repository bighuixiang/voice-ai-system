import path from "node:path";

export function getRepoRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "api") {
    return path.dirname(cwd);
  }
  return cwd;
}

export function getNovelsRoot(): string {
  return path.resolve(process.env.NOVELS_ROOT || path.join(getRepoRoot(), "novels"));
}

export function getTempRoot(): string {
  return path.resolve(process.env.NOVEL_TEMP_ROOT || path.join(getRepoRoot(), ".tmp", "novel-codex"));
}
