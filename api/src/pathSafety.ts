import path from "node:path";

const unsafeSegment = /(^|[\\/])\.\.([\\/]|$)/;

export function assertSafeNovelPath(relativePath: string): string {
  if (!relativePath || relativePath.trim() !== relativePath) {
    throw new Error("File path is empty or padded");
  }

  if (path.isAbsolute(relativePath) || unsafeSegment.test(relativePath)) {
    throw new Error(`Unsafe file path: ${relativePath}`);
  }

  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("//")) {
    throw new Error(`Unsafe file path: ${relativePath}`);
  }

  return normalized;
}

export function resolveInside(root: string, relativePath: string): string {
  const safePath = assertSafeNovelPath(relativePath);
  const resolved = path.resolve(root, safePath);
  const resolvedRoot = path.resolve(root);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return resolved;
}
