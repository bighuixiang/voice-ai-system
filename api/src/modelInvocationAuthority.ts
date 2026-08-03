import crypto from "node:crypto";
import fs from "node:fs/promises";
import { resolveInside } from "./pathSafety.js";
import { fingerprintContextManifest } from "./contextManifest.js";
import { readFrozenPublicationScope } from "./frozenPublicationScope.js";

export interface ModelInvocationAuthorityBinding {
  schemaVersion: "model-invocation-authority-binding.v1";
  bookRunId: string;
  frozenPublicationScopeRef: string;
  frozenPublicationScopeFingerprint: string;
  storyContractRef: string;
  storyContractFingerprint: string;
  outlineRef: string;
  outlineFingerprint: string;
  forecastRef: string;
  forecastFingerprint: string;
  contextManifestRef: string;
  contextManifestFingerprint: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprintFields = ["frozenPublicationScopeFingerprint", "storyContractFingerprint", "outlineFingerprint", "forecastFingerprint", "contextManifestFingerprint"] as const;

export function assertModelInvocationAuthorityBinding(value: unknown): asserts value is ModelInvocationAuthorityBinding {
  if (!value || typeof value !== "object") throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_INVALID");
  const binding = value as Partial<ModelInvocationAuthorityBinding>;
  const requiredRefs = [binding.bookRunId, binding.frozenPublicationScopeRef, binding.storyContractRef, binding.outlineRef, binding.forecastRef, binding.contextManifestRef];
  if (requiredRefs.some((ref) => typeof ref !== "string" || !ref.trim()) || fingerprintFields.some((key) => typeof binding[key] !== "string" || !/^[a-f0-9]{64}$/i.test(binding[key] as string)) || typeof binding.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(binding.fingerprint)) throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_INVALID");
  const { fingerprint: _fingerprint, ...base } = binding as ModelInvocationAuthorityBinding;
  if (hash(base) !== binding.fingerprint) throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_INTEGRITY_FAILED");
}

export function createModelInvocationAuthorityBinding(input: Omit<ModelInvocationAuthorityBinding, "schemaVersion" | "fingerprint">): ModelInvocationAuthorityBinding {
  const base = { schemaVersion: "model-invocation-authority-binding.v1" as const, ...input };
  assertModelInvocationAuthorityBinding({ ...base, fingerprint: hash(base) });
  return { ...base, fingerprint: hash(base) };
}

async function readSource(root: string, ref: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(resolveInside(root, ref), "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") throw new Error("MODEL_INVOCATION_AUTHORITY_SOURCE_MISSING");
    throw error;
  }
}

function sourceFingerprint(value: Record<string, unknown>, ref: string): string {
  if (value.schemaVersion === "context-manifest.v1") {
    return fingerprintContextManifest(value as never);
  }
  return typeof value.fingerprint === "string" ? value.fingerprint : "";
}

/** Build the immutable authority tuple consumed by every governed model call. */
export async function createBookRunAuthorityBinding(root: string, run: { bookRunId: string; frozenPublicationScopeRef?: string }): Promise<ModelInvocationAuthorityBinding> {
  if (!run.frozenPublicationScopeRef) throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_UNAVAILABLE");
  const scopeId = run.frozenPublicationScopeRef.split("/").pop()?.replace(/\.json$/i, "") || "";
  const scope = await readFrozenPublicationScope(root, scopeId);
  if (!scope || scope.projectSlug.trim() === "") throw new Error("MODEL_INVOCATION_AUTHORITY_SOURCE_MISSING");
  const story = scope.evidence.storyContract;
  const outline = scope.evidence.outlineVersion;
  if (story.status !== "bound" || outline.status !== "bound" || !story.fingerprint || !outline.fingerprint) {
    throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_UNAVAILABLE");
  }
  const forecastRef = "planning/length-forecast.json";
  const contextManifestRef = "sessions/context-manifest.json";
  const [scopeValue, storyValue, outlineValue, forecastValue, contextManifestValue] = await Promise.all([
    readSource(root, run.frozenPublicationScopeRef),
    readSource(root, story.ref),
    readSource(root, outline.ref),
    readSource(root, forecastRef),
    readSource(root, contextManifestRef)
  ]);
  const fingerprints = {
    frozenPublicationScopeFingerprint: sourceFingerprint(scopeValue, run.frozenPublicationScopeRef),
    storyContractFingerprint: sourceFingerprint(storyValue, story.ref),
    outlineFingerprint: sourceFingerprint(outlineValue, outline.ref),
    forecastFingerprint: sourceFingerprint(forecastValue, forecastRef),
    contextManifestFingerprint: sourceFingerprint(contextManifestValue, contextManifestRef)
  };
  if (Object.values(fingerprints).some((value) => !/^[a-f0-9]{64}$/i.test(value))) throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_UNAVAILABLE");
  return createModelInvocationAuthorityBinding({
    bookRunId: run.bookRunId,
    frozenPublicationScopeRef: run.frozenPublicationScopeRef,
    ...fingerprints,
    storyContractRef: story.ref,
    outlineRef: outline.ref,
    forecastRef,
    contextManifestRef
  });
}

export async function verifyModelInvocationAuthorityBinding(root: string, binding: ModelInvocationAuthorityBinding): Promise<void> {
  assertModelInvocationAuthorityBinding(binding);
  const sources: Array<[string, string]> = [
    [binding.frozenPublicationScopeRef, binding.frozenPublicationScopeFingerprint],
    [binding.storyContractRef, binding.storyContractFingerprint],
    [binding.outlineRef, binding.outlineFingerprint],
    [binding.forecastRef, binding.forecastFingerprint],
    [binding.contextManifestRef, binding.contextManifestFingerprint]
  ];
  for (const [ref, expectedFingerprint] of sources) {
    let value: unknown;
    try {
      value = JSON.parse(await fs.readFile(resolveInside(root, ref), "utf8"));
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") throw new Error("MODEL_INVOCATION_AUTHORITY_SOURCE_MISSING");
      throw error;
    }
    if (!value || typeof value !== "object" || sourceFingerprint(value as Record<string, unknown>, ref) !== expectedFingerprint) throw new Error("MODEL_INVOCATION_AUTHORITY_STALE");
  }
  const runPath = resolveInside(root, `sessions/book-runs/${binding.bookRunId}.json`);
  try { await fs.access(runPath); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") throw new Error("MODEL_INVOCATION_AUTHORITY_RUN_MISSING");
    throw error;
  }
}
