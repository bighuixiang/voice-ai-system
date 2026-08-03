import { readCapabilityDependencyProof } from "./capabilityDependencyStore.js";
import { assertProjectCapabilityWrite, readProjectCapabilityManifest } from "./projectCapabilityManifest.js";

export async function assertCapabilityWriteAllowed(root: string, projectSlug: string, sliceId: string): Promise<void> {
  const manifest = await readProjectCapabilityManifest(root, projectSlug);
  if (!manifest) return;
  assertProjectCapabilityWrite(manifest, sliceId);
  const proof = await readCapabilityDependencyProof(root, sliceId, projectSlug);
  if (!proof) throw new Error(`CAPABILITY_DEPENDENCY_REQUIRED:${sliceId}`);
  if (proof.status !== "satisfied" || proof.unmet.length) throw new Error(`CAPABILITY_DEPENDENCY_BLOCKED:${sliceId}`);
}
