import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface CreativeSessionMessage {
  id: string;
  clientMessageId: string;
  role: "author" | "system" | "task";
  text: string;
  source: { kind: "author" | "system-paraphrase" | "system-inference" | "task-result" };
  createdAt: string;
}

export interface CreativeSession {
  schemaVersion: "creative-session.v1";
  sessionId: string;
  projectSlug: string;
  status: "capturing" | "understanding";
  phase: "capture" | "understanding";
  collaborationMode: "guided" | "focused" | "review";
  activeQuestionId?: string;
  latestDirection: string;
  unconfirmedAssumptions: string[];
  decisionRefs: string[];
  pendingPatchRefs: string[];
  messages: CreativeSessionMessage[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

const projectLocks = new Map<string, Promise<void>>();

function sessionPath(root: string): string {
  return resolveInside(root, "sessions/creative-session.json");
}

function emptySession(projectSlug: string): CreativeSession {
  const now = new Date().toISOString();
  const base: Omit<CreativeSession, "fingerprint"> = {
    schemaVersion: "creative-session.v1" as const,
    sessionId: `session-${projectSlug}`,
    projectSlug,
    status: "capturing" as const,
    phase: "capture" as const,
    collaborationMode: "guided" as const,
    latestDirection: "",
    unconfirmedAssumptions: [],
    decisionRefs: [],
    pendingPatchRefs: [],
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  return { ...base, fingerprint: sessionFingerprint(base) };
}

function sessionFingerprint(session: Omit<CreativeSession, "fingerprint">): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    schemaVersion: session.schemaVersion,
    sessionId: session.sessionId,
    projectSlug: session.projectSlug,
    status: session.status,
    phase: session.phase,
    collaborationMode: session.collaborationMode,
    activeQuestionId: session.activeQuestionId,
    latestDirection: session.latestDirection,
    unconfirmedAssumptions: session.unconfirmedAssumptions,
    decisionRefs: session.decisionRefs,
    pendingPatchRefs: session.pendingPatchRefs,
    messages: session.messages
  })).digest("hex");
}

function normalizeSession(parsed: Record<string, unknown>, projectSlug: string): CreativeSession {
  if (parsed.projectSlug !== projectSlug || !Array.isArray(parsed.messages)) throw new Error("Invalid creative session manifest");
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== "creative-session.v1") throw new Error("CREATIVE_SESSION_INTEGRITY_FAILED");
  const base: Omit<CreativeSession, "fingerprint"> = {
    schemaVersion: "creative-session.v1" as const,
    sessionId: String(parsed.sessionId || `session-${projectSlug}`),
    projectSlug,
    status: parsed.status === "understanding" ? "understanding" as const : "capturing" as const,
    phase: parsed.phase === "understanding" || parsed.status === "understanding" ? "understanding" as const : "capture" as const,
    collaborationMode: parsed.collaborationMode === "focused" || parsed.collaborationMode === "review" ? parsed.collaborationMode : "guided" as const,
    ...(typeof parsed.activeQuestionId === "string" && parsed.activeQuestionId ? { activeQuestionId: parsed.activeQuestionId } : {}),
    latestDirection: typeof parsed.latestDirection === "string" ? parsed.latestDirection : "",
    unconfirmedAssumptions: Array.isArray(parsed.unconfirmedAssumptions) ? parsed.unconfirmedAssumptions.map(String) : [],
    decisionRefs: Array.isArray(parsed.decisionRefs) ? parsed.decisionRefs.map(String) : [],
    pendingPatchRefs: Array.isArray(parsed.pendingPatchRefs) ? parsed.pendingPatchRefs.map(String) : [],
    messages: parsed.messages.map((message) => {
      const item = message as Record<string, unknown>;
      const source = item.source as Record<string, unknown> | undefined;
      const kind = source?.kind === "system-paraphrase" || source?.kind === "system-inference" || source?.kind === "task-result" ? source.kind : "author";
      return { id: String(item.id), clientMessageId: String(item.clientMessageId), role: kind === "author" ? "author" as const : kind === "task-result" ? "task" as const : "system" as const, text: String(item.text), source: { kind }, createdAt: String(item.createdAt) };
    }),
    createdAt: String(parsed.createdAt || new Date().toISOString()),
    updatedAt: String(parsed.updatedAt || new Date().toISOString())
  };
  const fingerprint = sessionFingerprint(base);
  if (parsed.fingerprint !== undefined && parsed.fingerprint !== fingerprint) throw new Error("CREATIVE_SESSION_INTEGRITY_FAILED");
  return { ...base, fingerprint };
}

async function readSession(root: string, projectSlug: string): Promise<CreativeSession> {
  try {
    const raw = await fs.readFile(sessionPath(root), "utf8");
    return normalizeSession(JSON.parse(raw) as Record<string, unknown>, projectSlug);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return emptySession(projectSlug);
    throw error;
  }
}

async function writeSession(root: string, session: CreativeSession): Promise<void> {
  const target = sessionPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function withCreativeSessionLock<T>(projectSlug: string, operation: () => Promise<T>): Promise<T> {
  const previous = projectLocks.get(projectSlug) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  projectLocks.set(projectSlug, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (projectLocks.get(projectSlug) === current) projectLocks.delete(projectSlug);
  }
}

export async function readCreativeSession(root: string, projectSlug: string): Promise<CreativeSession> {
  return readSession(root, projectSlug);
}

export async function appendAuthorMessage(input: {
  root: string;
  projectSlug: string;
  clientMessageId: string;
  text: string;
}): Promise<{ session: CreativeSession; created: boolean }> {
  const clientMessageId = input.clientMessageId.trim();
  const text = input.text.trim();
  if (!clientMessageId || clientMessageId.length > 200) throw new Error("clientMessageId is required and must be at most 200 characters");
  if (!text || text.length > 50_000) throw new Error("text is required and must be at most 50000 characters");

  return withCreativeSessionLock(input.projectSlug, async () => {
    const session = await readSession(input.root, input.projectSlug);
    const existing = session.messages.find((message) => message.clientMessageId === clientMessageId);
    if (existing) return { session, created: false };

    return appendMessageLocked(input.root, session, clientMessageId, text, "author");
  });
}

type SessionMessageKind = CreativeSessionMessage["source"]["kind"];

async function appendMessageLocked(root: string, session: CreativeSession, clientMessageId: string, text: string, kind: SessionMessageKind): Promise<{ session: CreativeSession; created: boolean }> {
  const existing = session.messages.find((message) => message.clientMessageId === clientMessageId);
  if (existing) return { session, created: false };
  const now = new Date().toISOString();
  const next = { ...session, messages: [...session.messages, { id: `message-${clientMessageId}`, clientMessageId, role: kind === "author" ? "author" as const : kind === "task-result" ? "task" as const : "system" as const, text, source: { kind }, createdAt: now }], updatedAt: now };
  const saved = { ...next, fingerprint: sessionFingerprint(next) };
  await writeSession(root, saved);
  return { session: saved, created: true };
}

export async function appendSessionMessage(input: { root: string; projectSlug: string; clientMessageId: string; text: string; kind: Exclude<SessionMessageKind, "author"> }): Promise<{ session: CreativeSession; created: boolean }> {
  const clientMessageId = input.clientMessageId.trim();
  const text = input.text.trim();
  if (!clientMessageId || clientMessageId.length > 200) throw new Error("clientMessageId is required and must be at most 200 characters");
  if (!text || text.length > 50_000) throw new Error("text is required and must be at most 50000 characters");
  return withCreativeSessionLock(input.projectSlug, async () => appendMessageLocked(input.root, await readSession(input.root, input.projectSlug), clientMessageId, text, input.kind));
}

export async function updateCreativeSessionState(input: {
  root: string; projectSlug: string; expectedFingerprint: string;
  phase: CreativeSession["phase"]; collaborationMode: CreativeSession["collaborationMode"]; activeQuestionId?: string;
  latestDirection: string; unconfirmedAssumptions: string[]; decisionRefs: string[]; pendingPatchRefs: string[];
}): Promise<{ session: CreativeSession }> {
  return withCreativeSessionLock(input.projectSlug, async () => {
    const current = await readSession(input.root, input.projectSlug);
    if (current.fingerprint !== input.expectedFingerprint) throw new Error("CREATIVE_SESSION_VERSION_CONFLICT");
    const next = {
      ...current,
      status: input.phase === "understanding" ? "understanding" as const : "capturing" as const,
      phase: input.phase,
      collaborationMode: input.collaborationMode,
      ...(input.activeQuestionId ? { activeQuestionId: input.activeQuestionId } : {}),
      latestDirection: input.latestDirection,
      unconfirmedAssumptions: [...input.unconfirmedAssumptions],
      decisionRefs: [...input.decisionRefs],
      pendingPatchRefs: [...input.pendingPatchRefs],
      updatedAt: new Date().toISOString()
    };
    const saved = { ...next, fingerprint: sessionFingerprint(next) };
    await writeSession(input.root, saved);
    return { session: saved };
  });
}
