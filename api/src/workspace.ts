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

export function getPlatformRoot(): string {
  return path.resolve(process.env.PLATFORM_ROOT || path.join(getRepoRoot(), "platform"));
}

export function getDataRoot(): string {
  return path.resolve(process.env.NOVEL_DATA_ROOT || path.join(getRepoRoot(), "data"));
}

export function getDatabasePath(): string {
  return path.resolve(process.env.NOVEL_DB_PATH || path.join(getDataRoot(), "creative-platform.sqlite"));
}

export function getTempRoot(): string {
  return path.resolve(process.env.NOVEL_TEMP_ROOT || path.join(getRepoRoot(), ".tmp", "novel-codex"));
}
