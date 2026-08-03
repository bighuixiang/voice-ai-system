import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertNotificationPlanIntegrity, planRunNotifications, persistNotificationPlan, readNotificationPlan } from "./notificationPolicy.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("run notification policy", () => {
  it("aggregates ordinary completions into one digest and deep-links each item", () => {
    const result = planRunNotifications({
      quiet: true,
      authorOnline: false,
      notificationLevel: "high-value",
      maxUnattendedWorkItems: 10,
      unattendedWorkItems: 5,
      events: [
        { eventId: "done-1", kind: "chapter-complete", title: "Chapter 1 ready", deepLink: "/runs/r1/work/w1" },
        { eventId: "done-2", kind: "chapter-complete", title: "Chapter 2 ready", deepLink: "/runs/r1/work/w2" }
      ]
    });
    expect(result).toMatchObject({ status: "digest", immediate: [], digest: { eventIds: ["done-1", "done-2"] } });
    expect(result.digest?.deepLinks).toEqual(["/runs/r1/work/w1", "/runs/r1/work/w2"]);
  });

  it("breaks quiet hours once for urgent gates and deduplicates repeated events", () => {
    const result = planRunNotifications({
      quiet: true,
      authorOnline: false,
      notificationLevel: "high-value",
      maxUnattendedWorkItems: 10,
      unattendedWorkItems: 1,
      events: [
        { eventId: "gate-1", kind: "l2-gate", title: "Author decision required", deepLink: "/runs/r1/attention/gate-1" },
        { eventId: "gate-1", kind: "l2-gate", title: "Duplicate", deepLink: "/runs/r1/attention/gate-1" },
        { eventId: "done-1", kind: "chapter-complete", title: "Chapter ready", deepLink: "/runs/r1/work/w1" }
      ]
    });
    expect(result.status).toBe("urgent");
    expect(result.immediate).toHaveLength(1);
    expect(result.immediate[0]).toMatchObject({ eventId: "gate-1", breakQuiet: true, deepLink: "/runs/r1/attention/gate-1" });
    expect(result.digest?.eventIds).toEqual(["done-1"]);
  });

  it("stops unattended continuation at the configured bound", () => {
    const result = planRunNotifications({ quiet: false, authorOnline: false, notificationLevel: "all", maxUnattendedWorkItems: 2, unattendedWorkItems: 2, events: [] });
    expect(result).toMatchObject({ status: "paused", blockedReason: "MAX_UNATTENDED_WORK_ITEMS" });
  });

  it("persists an immutable notification plan for quiet-hour replay", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "notification-plan-"));
    const plan = planRunNotifications({ quiet: true, authorOnline: false, notificationLevel: "high-value", maxUnattendedWorkItems: 5, unattendedWorkItems: 1, events: [{ eventId: "done", kind: "chapter-complete", title: "Ready", deepLink: "/runs/r1" }] });
    await expect(persistNotificationPlan(root, "plan-1", plan)).resolves.toMatchObject({ created: true, plan });
    await expect(persistNotificationPlan(root, "plan-1", plan)).resolves.toMatchObject({ created: false, plan });
    await expect(readNotificationPlan(root, "plan-1")).resolves.toEqual(plan);
    const changed = planRunNotifications({ quiet: true, authorOnline: false, notificationLevel: "all", maxUnattendedWorkItems: 5, unattendedWorkItems: 1, events: [{ eventId: "done", kind: "milestone", title: "Ready", deepLink: "/runs/r1" }] });
    await expect(persistNotificationPlan(root, "plan-1", changed)).rejects.toThrow("NOTIFICATION_PLAN_IMMUTABLE");
  });

  it("rejects a rehashed plan with malformed nested notification semantics", () => {
    const plan = planRunNotifications({ quiet: true, authorOnline: false, notificationLevel: "high-value", maxUnattendedWorkItems: 5, unattendedWorkItems: 1, events: [{ eventId: "done", kind: "chapter-complete", title: "Ready", deepLink: "/runs/r1" }] });
    const { fingerprint: _fingerprint, ...base } = plan;
    const forgedBase = { ...base, immediate: [{ ...plan.immediate[0], breakQuiet: "yes" }] };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertNotificationPlanIntegrity(forged as typeof plan)).toThrow("NOTIFICATION_PLAN_INTEGRITY_FAILED");
  });
});
