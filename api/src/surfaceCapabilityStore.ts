import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { SurfaceCapabilityRegistry } from "./surfaceCapability.js";

function registryPath(root: string): string {
  return resolveInside(root, "sessions/surface-capability-registry.json");
}

export async function readSurfaceCapabilityRegistry(root: string, projectSlug: string): Promise<SurfaceCapabilityRegistry | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(registryPath(root), "utf8")) as SurfaceCapabilityRegistry;
    if (parsed.projectSlug !== projectSlug || parsed.schemaVersion !== "surface-capability-registry.v1" || !Array.isArray(parsed.capabilities)) {
      throw new Error("SURFACE_REGISTRY_INVALID");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeSurfaceCapabilityRegistry(root: string, registry: SurfaceCapabilityRegistry): Promise<void> {
  const target = registryPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}
