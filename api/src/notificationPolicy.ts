export type NotificationKind =
  | "chapter-complete"
  | "l2-gate"
  | "budget-stop"
  | "security-stop"
  | "stagnation"
  | "failure"
  | "completion-preflight"
  | "milestone";
export type NotificationLevel = "high-value" | "all";

export interface RunNotificationEvent {
  eventId: string;
  kind: NotificationKind;
  title: string;
  deepLink: string;
}

export interface NotificationPlan {
  schemaVersion: "run-notification-plan.v1";
  status: "idle" | "digest" | "urgent" | "paused";
  immediate: Array<RunNotificationEvent & { breakQuiet: boolean }>;
  digest?: { eventIds: string[]; deepLinks: string[]; count: number };
  blockedReason?: "MAX_UNATTENDED_WORK_ITEMS";
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const urgentKinds = new Set<NotificationKind>([
  "l2-gate",
  "budget-stop",
  "security-stop",
  "stagnation",
  "failure",
  "completion-preflight"
]);

export function planRunNotifications(input: {
  quiet: boolean;
  authorOnline: boolean;
  notificationLevel: NotificationLevel;
  maxUnattendedWorkItems: number;
  unattendedWorkItems: number;
  events: RunNotificationEvent[];
}): NotificationPlan {
  if (!Number.isInteger(input.maxUnattendedWorkItems) || input.maxUnattendedWorkItems < 1 || !Number.isInteger(input.unattendedWorkItems) || input.unattendedWorkItems < 0) {
    throw new Error("NOTIFICATION_BUDGET_INVALID");
  }
  const unique = new Map<string, RunNotificationEvent>();
  for (const event of input.events) {
    if (!event.eventId.trim() || !event.deepLink.trim() || !event.title.trim()) throw new Error("NOTIFICATION_EVENT_INVALID");
    if (!unique.has(event.eventId)) unique.set(event.eventId, { ...event });
  }
  if (!input.authorOnline && input.unattendedWorkItems >= input.maxUnattendedWorkItems) {
    const base = { schemaVersion: "run-notification-plan.v1" as const, status: "paused" as const, immediate: [], blockedReason: "MAX_UNATTENDED_WORK_ITEMS" as const };
    return { ...base, fingerprint: hash(base) };
  }
  const events = [...unique.values()];
  const immediate = events
    .filter((event) => urgentKinds.has(event.kind) || (event.kind === "milestone" && input.notificationLevel === "all"))
    .map((event) => ({ ...event, breakQuiet: input.quiet }));
  const digestEvents = events.filter((event) => !immediate.some((item) => item.eventId === event.eventId));
  const digest = digestEvents.length
    ? { eventIds: digestEvents.map((event) => event.eventId), deepLinks: digestEvents.map((event) => event.deepLink), count: digestEvents.length }
    : undefined;
  const base = {
    schemaVersion: "run-notification-plan.v1",
    status: immediate.length ? "urgent" : digest ? "digest" : "idle",
    immediate,
    ...(digest ? { digest } : {})
  };
  return { ...base, fingerprint: hash(base) } as NotificationPlan;
}

function planPath(root: string, planId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(planId)) throw new Error("NOTIFICATION_PLAN_ID_INVALID");
  return resolveInside(root, path.join("sessions", "notification-plans", `${planId}.json`));
}

export function assertNotificationPlanIntegrity(plan: NotificationPlan): NotificationPlan {
  const { fingerprint: _fingerprint, ...base } = plan;
  const immediateValid = Array.isArray(plan.immediate) && plan.immediate.every((event) => event && typeof event.eventId === "string" && event.eventId.trim() && typeof event.kind === "string" && typeof event.title === "string" && event.title.trim() && typeof event.deepLink === "string" && event.deepLink.trim() && typeof event.breakQuiet === "boolean");
  const digestValid = plan.digest === undefined || (Array.isArray(plan.digest.eventIds) && Array.isArray(plan.digest.deepLinks) && Number.isInteger(plan.digest.count) && plan.digest.count > 0 && plan.digest.eventIds.length === plan.digest.count && plan.digest.deepLinks.length === plan.digest.count && plan.digest.eventIds.every((id) => typeof id === "string" && id.trim()) && plan.digest.deepLinks.every((link) => typeof link === "string" && link.trim()));
  const statusValid = plan.status === "paused" ? plan.blockedReason === "MAX_UNATTENDED_WORK_ITEMS" && plan.immediate.length === 0 && plan.digest === undefined : plan.blockedReason === undefined;
  const shapeValid = plan.status === "digest" ? plan.digest !== undefined : plan.status === "idle" ? plan.immediate.length === 0 && plan.digest === undefined : plan.status === "urgent" ? plan.immediate.length > 0 : true;
  if (plan.schemaVersion !== "run-notification-plan.v1" || !["idle", "digest", "urgent", "paused"].includes(plan.status) || !immediateValid || !digestValid || !statusValid || !shapeValid || !/^[a-f0-9]{64}$/i.test(plan.fingerprint) || hash(base) !== plan.fingerprint) throw new Error("NOTIFICATION_PLAN_INTEGRITY_FAILED");
  return plan;
}

export async function readNotificationPlan(root: string, planId: string): Promise<NotificationPlan | null> {
  try { return assertNotificationPlanIntegrity(JSON.parse(await fs.readFile(planPath(root, planId), "utf8")) as NotificationPlan); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistNotificationPlan(root: string, planId: string, plan: NotificationPlan): Promise<{ created: boolean; plan: NotificationPlan }> {
  assertNotificationPlanIntegrity(plan);
  const target = planPath(root, planId);
  const existing = await readNotificationPlan(root, planId);
  if (existing) {
    if (existing.fingerprint === plan.fingerprint) return { created: false, plan: existing };
    throw new Error("NOTIFICATION_PLAN_IMMUTABLE");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { created: true, plan };
}
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
