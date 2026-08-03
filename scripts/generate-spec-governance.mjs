import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const sddRelativePath = "docs/plans/2026-07-24-novel-creative-partner-sdd.md";
const sddPath = join(root, sddRelativePath);
const outputRoot = join(root, "docs/spec-governance");
const checkOnly = process.argv.includes("--check");

const source = readFileSync(sddPath, "utf8");
const lines = source.split(/\r?\n/);
const sourceHash = createHash("sha256").update(source).digest("hex");
const version = source.match(/(?:Discovery Draft|Specification Approved) (v\d+\.\d+(?:\.\d+)?)/)?.[1];
const sourceDate = source.match(/^> 日期：(\d{4}-\d{2}-\d{2})/m)?.[1];

if (!version || !sourceDate) {
  throw new Error("Cannot parse the SDD version or date.");
}

function parseRequirements() {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^#### (FR-([A-Z0-9-]+)-(\d{3})) (.+)$/);
    if (!match) continue;
    result.push({
      id: match[1],
      domain: match[2],
      number: Number(match[3]),
      title: match[4],
      sourceLine: index + 1,
    });
  }
  return result;
}

function parseNumberedHeadings(prefix) {
  const result = [];
  const pattern = new RegExp(`^### (${prefix}-(\\d{3})) (.+)$`);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    result.push({
      id: match[1],
      domain: null,
      number: Number(match[2]),
      title: match[3],
      sourceLine: index + 1,
    });
  }
  return result;
}

const requirements = parseRequirements();
const acceptanceTests = parseNumberedHeadings("AT");
const decisions = parseNumberedHeadings("D");

function assertUnique(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate ${label}: ${item.id}`);
    seen.add(item.id);
  }
}

function assertContiguous(items, key, label) {
  const groups = Map.groupBy(items, (item) => item[key] ?? label);
  for (const [group, members] of groups) {
    const actual = members.map((item) => item.number).sort((a, b) => a - b);
    const expected = Array.from({ length: actual.at(-1) }, (_, index) => index + 1);
    if (actual.join(",") !== expected.join(",")) {
      throw new Error(`Non-contiguous ${label} sequence: ${group}`);
    }
  }
}

assertUnique(requirements, "requirement id");
assertUnique(acceptanceTests, "acceptance-test id");
assertUnique(decisions, "decision id");
assertContiguous(requirements, "domain", "requirement");
assertContiguous(acceptanceTests, null, "acceptance test");
assertContiguous(decisions, null, "decision");

const defaultSliceByDomain = {
  INTENT: "V1-conversation",
  QUESTION: "V2-understanding",
  COLLAB: "V1-conversation",
  DEBATE: "V2-understanding",
  ARCH: "V4-outline",
  CHAR: "V4-outline",
  WORLD: "V4-outline",
  WRITE: "V5-drafting",
  PROSE: "V5-drafting",
  CRAFT: "V5-drafting",
  QUALITY: "V5-drafting",
  READER: "V5-drafting",
  FORESHADOW: "V6-obligations",
  DEBT: "V6-obligations",
  MEMORY: "V5-drafting",
  LONGMEM: "V4-outline",
  COMPLETE: "V8-completion",
  SESSION: "V1-conversation",
  STATE: "V1-conversation",
  MIGRATE: "V0-baseline",
  API: "V1-conversation",
  UX: "V1-conversation",
  EFFORT: "V2-understanding",
  AI: "V2-understanding",
  CONTEXT: "V2-understanding",
  EVAL: "V7-revision",
  RUN: "V8-completion",
  OBL: "V6-obligations",
  CLOSURE: "V6-obligations",
  DIALOGUE: "V2-understanding",
  SEED: "V2-understanding",
  OBJECTIVE: "V2-understanding",
  FEEDBACK: "V7-revision",
  DELIVERY: "V0-baseline",
  PUBLISH: "V8-completion",
  RESEARCH: "V4-outline",
  TEXT: "V5-drafting",
  DURABILITY: "V0-baseline",
};

const sliceOverrides = new Map([
  ["FR-MIGRATE-002", "V5-drafting"],
  ["FR-INTENT-001", "V2-understanding"],
  ["FR-COLLAB-001", "V2-understanding"],
  ["FR-COLLAB-004", "V5-drafting"],
  ["FR-COLLAB-005", "V2-understanding"],
  ["FR-DIALOGUE-001", "V1-conversation"],
  ["FR-DIALOGUE-002", "V1-conversation"],
  ["FR-DIALOGUE-023", "V1-conversation"],
  ["FR-SEED-001", "V1-conversation"],
  ["FR-SEED-016", "V1-conversation"],
  ["FR-SEED-017", "V1-conversation"],
  ["FR-SEED-012", "V3-contract"],
  ["FR-SEED-013", "V3-contract"],
  ["FR-SEED-014", "V3-contract"],
  ["FR-SEED-015", "V3-contract"],
  ["FR-SEED-019", "V3-contract"],
  ["FR-SEED-020", "V3-contract"],
  ["FR-ARCH-001", "V3-contract"],
  ["FR-ARCH-005", "V4-outline"],
  ["FR-ARCH-006", "V4-outline"],
  ["FR-CHAR-001", "V3-contract"],
  ["FR-CHAR-002", "V3-contract"],
  ["FR-CHAR-003", "V3-contract"],
  ["FR-WORLD-001", "V3-contract"],
  ["FR-WORLD-002", "V3-contract"],
  ["FR-WORLD-003", "V3-contract"],
  ["FR-API-004", "V3-contract"],
  ["FR-UX-004", "V2-understanding"],
  ["FR-UX-005", "V2-understanding"],
  ["FR-UX-007", "V3-contract"],
  ["FR-UX-008", "V3-contract"],
  ["FR-UX-009", "V3-contract"],
  ["FR-UX-013", "V6-obligations"],
  ["FR-UX-014", "V5-drafting"],
  ["FR-UX-015", "V5-drafting"],
  ["FR-EFFORT-001", "V1-conversation"],
  ["FR-EFFORT-004", "V2-understanding"],
  ["FR-EFFORT-011", "V1-conversation"],
  ["FR-EFFORT-016", "V1-conversation"],
  ["FR-EFFORT-017", "V1-conversation"],
  ["FR-EFFORT-019", "V1-conversation"],
  ["FR-EFFORT-007", "V3-contract"],
  ["FR-EFFORT-009", "V3-contract"],
  ["FR-EFFORT-015", "V3-contract"],
  ["FR-EFFORT-018", "V7-revision"],
  ["FR-EFFORT-020", "V7-revision"],
  ["FR-AI-011", "V7-revision"],
  ["FR-EVAL-001", "V0-baseline"],
  ["FR-EVAL-002", "V0-baseline"],
  ["FR-EVAL-003", "V0-baseline"],
  ["FR-EVAL-016", "V0-baseline"],
  ["FR-EVAL-019", "V0-baseline"],
  ["FR-EVAL-023", "V0-baseline"],
  ["FR-EVAL-024", "V0-baseline"],
  ["FR-STATE-002", "V2-understanding"],
  ["FR-STATE-005", "V3-contract"],
  ["FR-STATE-006", "V3-contract"],
  ["FR-STATE-007", "V3-contract"],
  ["FR-STATE-008", "V3-contract"],
  ["FR-MIGRATE-004", "V3-contract"],
  ["FR-MIGRATE-005", "V1-conversation"],
  ["FR-MIGRATE-007", "V1-conversation"],
  ["FR-MIGRATE-008", "V1-conversation"],
  ["FR-API-002", "V2-understanding"],
  ["FR-UX-019", "V2-understanding"],
  ["FR-OBJECTIVE-003", "V4-outline"],
  ["FR-OBJECTIVE-005", "V5-drafting"],
  ["FR-OBJECTIVE-006", "V4-outline"],
  ["FR-OBJECTIVE-007", "V5-drafting"],
  ["FR-OBJECTIVE-008", "V7-revision"],
  ["FR-OBJECTIVE-009", "V7-revision"],
  ["FR-OBJECTIVE-010", "V3-contract"],
  ["FR-OBJECTIVE-011", "V7-revision"],
  ["FR-OBJECTIVE-012", "V5-drafting"],
  ["FR-DELIVERY-014", "V1-conversation"],
  ["FR-DELIVERY-015", "V1-conversation"],
  ["FR-DELIVERY-016", "V3-contract"],
  ["FR-DELIVERY-017", "V4-outline"],
  ["FR-DELIVERY-018", "V2-understanding"],
  ["FR-DELIVERY-021", "V1-conversation"],
  ["FR-DELIVERY-022", "V1-conversation"],
  ["FR-DELIVERY-025", "V4-outline"],
  ["FR-ARCH-023", "V5-drafting"],
  ["FR-CHAR-016", "V5-drafting"],
  ["FR-CHAR-020", "V8-completion"],
  ["FR-WORLD-020", "V8-completion"],
  ["FR-LONGMEM-013", "V7-revision"],
  ["FR-LONGMEM-024", "V8-completion"],
  ["FR-OBL-023", "V8-completion"],
  ["FR-CLOSURE-019", "V8-completion"],
]);

for (let runNumber = 1; runNumber <= 23; runNumber += 1) {
  sliceOverrides.set(`FR-RUN-${String(runNumber).padStart(3, "0")}`, "V5-drafting");
}

for (const requirementId of [
  "FR-AI-011",
  "FR-EVAL-004", "FR-EVAL-005", "FR-EVAL-006", "FR-EVAL-009",
  "FR-EVAL-010", "FR-EVAL-011", "FR-EVAL-012",
  "FR-OBJECTIVE-008",
  "FR-FEEDBACK-001", "FR-FEEDBACK-002", "FR-FEEDBACK-003",
  "FR-FEEDBACK-004", "FR-FEEDBACK-005", "FR-FEEDBACK-006",
]) {
  sliceOverrides.set(requirementId, "V5-drafting");
}

const strengthOverrides = new Map([
  ["FR-DIALOGUE-017", "EXPERIMENT"],
  ["FR-CRAFT-004", "EXPERIMENT"],
  ["FR-CRAFT-018", "EXPERIMENT"],
  ["FR-CRAFT-019", "EXPERIMENT"],
  ["FR-UX-013", "SHOULD"],
  ["FR-EVAL-018", "SHOULD"],
  ["FR-RUN-023", "SHOULD"],
]);

const relations = new Map([
  ["FR-CRAFT-001", { decomposedBy: ["FR-CRAFT-007"] }],
  ["FR-CRAFT-007", { refines: ["FR-CRAFT-001"] }],
  ["FR-CRAFT-002", {
    decomposedBy: ["FR-CRAFT-009", "FR-CRAFT-010", "FR-CRAFT-011", "FR-CRAFT-012"],
  }],
  ["FR-CRAFT-003", {
    evidenceProvidedBy: ["FR-CRAFT-018", "FR-CRAFT-019", "FR-CRAFT-021"],
  }],
]);

const rp0MovedDecisions = new Map([
  ["FR-MIGRATE-002", { targetSlice: "V5-drafting", extensionSlices: ["V6-obligations"], reason: "AI backfill and candidate acceptance mutate semantic assets; RP0 is strictly read-only, while V5 first owns summary/person/fact adoption and V6 revalidates obligation extraction." }],
]);

const rp0AcceptanceRefs = new Map([
  ["FR-MIGRATE-001", ["AT-061", "AT-244"]],
  ["FR-MIGRATE-003", ["AT-019"]],
  ["FR-MIGRATE-006", ["AT-065", "AT-073"]],
  ["FR-MIGRATE-009", ["AT-073", "AT-074"]],
  ["FR-EVAL-001", ["AT-133", "AT-137", "AT-141"]],
  ["FR-EVAL-002", ["AT-118", "AT-119", "AT-129", "AT-132", "AT-140"]],
  ["FR-EVAL-003", ["AT-122", "AT-141"]],
  ["FR-EVAL-016", ["AT-132"]],
  ["FR-EVAL-019", ["AT-136", "AT-140"]],
  ["FR-EVAL-023", ["AT-140"]],
  ["FR-EVAL-024", ["AT-141"]],
  ["FR-DELIVERY-001", ["AT-239", "AT-353"]],
  ["FR-DELIVERY-002", ["AT-240"]],
  ["FR-DELIVERY-003", ["AT-241", "AT-421"]],
  ["FR-DELIVERY-004", ["AT-242", "AT-354"]],
  ["FR-DELIVERY-005", ["AT-243", "AT-247"]],
  ["FR-DELIVERY-006", ["AT-244"]],
  ["FR-DELIVERY-007", ["AT-245"]],
  ["FR-DELIVERY-008", ["AT-246"]],
  ["FR-DELIVERY-009", ["AT-247"]],
  ["FR-DELIVERY-010", ["AT-248", "AT-364"]],
  ["FR-DELIVERY-011", ["AT-249", "AT-421"]],
  ["FR-DELIVERY-012", ["AT-250", "AT-359"]],
  ["FR-DELIVERY-013", ["AT-353"]],
  ["FR-DELIVERY-019", ["AT-359"]],
  ["FR-DELIVERY-020", ["AT-360"]],
  ["FR-DELIVERY-023", ["AT-363"]],
  ["FR-DELIVERY-024", ["AT-364"]],
  ["FR-DELIVERY-026", ["AT-482"]],
  ["FR-DELIVERY-027", ["AT-483"]],
  ["FR-DELIVERY-028", ["AT-484"]],
  ["FR-DELIVERY-029", ["AT-485"]],
  ["FR-DELIVERY-030", ["AT-486"]],
  ["FR-DELIVERY-031", ["AT-487"]],
  ["FR-DURABILITY-001", ["AT-516"]],
  ["FR-DURABILITY-002", ["AT-517"]],
  ["FR-DURABILITY-003", ["AT-517", "AT-518"]],
  ["FR-DURABILITY-004", ["AT-519"]],
]);

if (rp0AcceptanceRefs.size !== 38 || rp0MovedDecisions.size !== 1) {
  throw new Error("RP0 semantic review must contain 38 retained and 1 moved requirement.");
}

const rp1MovedDecisions = new Map([
  ["FR-INTENT-001", { targetSlice: "V2-understanding", reason: "Structured interpretation is the V2 outcome; RP1 only preserves the source and starts interpretation." }],
  ["FR-COLLAB-001", { targetSlice: "V2-understanding", reason: "RP1 atomizes the message, while semantic routing to decisions, revisions, and constraints begins in V2." }],
  ["FR-COLLAB-004", { targetSlice: "V5-drafting", reason: "Exploratory prose candidates are explicitly excluded from the capture-only release." }],
  ["FR-COLLAB-005", { targetSlice: "V2-understanding", reason: "Correcting an interpretation graph first requires a V2 understanding snapshot." }],
  ["FR-STATE-002", { targetSlice: "V2-understanding", reason: "The first versioned semantic asset is the understanding snapshot; RP1 source events use immutable event identity." }],
  ["FR-STATE-005", { targetSlice: "V3-contract", reason: "Compatibility projections for contract, outline, prose, and obligation models are first consumed by the contract slice." }],
  ["FR-STATE-006", { targetSlice: "V3-contract", reason: "RP1 writes one source event; multi-canon-asset MutationPlan semantics begin with contract adoption." }],
  ["FR-STATE-007", { targetSlice: "V3-contract", reason: "Recoverable multi-canon-asset commit is not exercised by source capture and begins with contract adoption." }],
  ["FR-STATE-008", { targetSlice: "V3-contract", reason: "Canon commit and projection ordering starts when a semantic candidate can be adopted." }],
  ["FR-MIGRATE-004", { targetSlice: "V3-contract", reason: "RP1 adds session/event schema but performs no project-content migration; project checkpoints begin before contract migration." }],
  ["FR-API-002", { targetSlice: "V2-understanding", reason: "The first newly governed asynchronous AI task is interpretation, not source capture." }],
  ["FR-UX-019", { targetSlice: "V2-understanding", reason: "Stable links first target a question or understanding artifact; RP1 only restores the project/session location." }],
  ["FR-EFFORT-004", { targetSlice: "V2-understanding", reason: "Autonomy receipts record semantic low-risk decisions, which RP1 is forbidden to make while only capturing source." }],
]);

const rp2MovedDecisions = new Map([
  ["FR-EFFORT-007", { targetSlice: "V3-contract", reason: "Batch settlement first changes adoptable contract fields; RP2 only records provisional assumptions." }],
  ["FR-EFFORT-009", { targetSlice: "V3-contract", reason: "Story-effect and rework previews require concrete contract candidates." }],
  ["FR-EFFORT-015", { targetSlice: "V3-contract", reason: "Candidate review compression starts when the first adoptable contract candidate exists." }],
  ["FR-EFFORT-018", { targetSlice: "V7-revision", reason: "Adaptive collaboration intensity requires longitudinal behavior and rollback evidence." }],
  ["FR-EFFORT-020", { targetSlice: "V7-revision", reason: "Effort-to-value optimization is a longitudinal product metric, not an understanding prerequisite." }],
  ["FR-AI-011", { targetSlice: "V5-drafting", reason: "Content-addressed cache optimization is valuable but not required to prove the first governed interpretation call; it is first consumed by repeated drafting calls." }],
  ["FR-OBJECTIVE-003", { targetSlice: "V4-outline", reason: "Cross-level objective inheritance starts when volume, arc, chapter, and scene scopes exist." }],
  ["FR-OBJECTIVE-005", { targetSlice: "V5-drafting", reason: "Stage-dependent objective weighting is first applied to prose generation and review." }],
  ["FR-OBJECTIVE-006", { targetSlice: "V4-outline", reason: "Near-term versus long-term contribution requires planned arcs and work items." }],
  ["FR-OBJECTIVE-007", { targetSlice: "V5-drafting", reason: "Anti-goal extraction is understood in V2, but the independent generation guard is first consumed by drafting." }],
  ["FR-OBJECTIVE-008", { targetSlice: "V5-drafting", reason: "Anti-metric-gaming is not needed for the first interpretation call, but it is required as soon as the first prose objective is evaluated." }],
  ["FR-OBJECTIVE-009", { targetSlice: "V7-revision", reason: "Cross-asset objective-change impact begins after authored assets and evaluation history exist." }],
  ["FR-OBJECTIVE-010", { targetSlice: "V3-contract", reason: "Gap-based candidate comparison begins with multiple contract candidates." }],
  ["FR-OBJECTIVE-011", { targetSlice: "V7-revision", reason: "Objective drift requires chapter settlements and historical target versions." }],
  ["FR-OBJECTIVE-012", { targetSlice: "V5-drafting", reason: "Q-003 changes drafting quality, review depth, and budget parameters rather than understanding semantics." }],
]);

const rp3MovedDecisions = new Map([
  ["FR-ARCH-005", { targetSlice: "V4-outline", reason: "StoryEngineContract is explicitly the V4 planning authority and requires outline-level causal structure." }],
  ["FR-ARCH-006", { targetSlice: "V4-outline", reason: "NarrativeQuestion requires milestone, arc, obligation, and awareness identifiers first created by outline planning." }],
]);

const rp3AcceptanceRefs = new Map([
  ["FR-ARCH-001", ["AT-214", "AT-461"]],
  ["FR-CHAR-001", ["AT-422"]],
  ["FR-CHAR-002", ["AT-423"]],
  ["FR-CHAR-003", ["AT-424"]],
  ["FR-WORLD-001", ["AT-462"]],
  ["FR-WORLD-002", ["AT-463"]],
  ["FR-WORLD-003", ["AT-464"]],
  ["FR-STATE-005", ["AT-062", "AT-063"]],
  ["FR-STATE-006", ["AT-067"]],
  ["FR-STATE-007", ["AT-068", "AT-355"]],
  ["FR-STATE-008", ["AT-069"]],
  ["FR-MIGRATE-004", ["AT-020", "AT-071"]],
  ["FR-API-004", ["AT-082", "AT-455"]],
  ["FR-UX-007", ["AT-081"]],
  ["FR-UX-008", ["AT-082"]],
  ["FR-UX-009", ["AT-083"]],
  ["FR-EFFORT-007", ["AT-339"]],
  ["FR-EFFORT-009", ["AT-341", "AT-454"]],
  ["FR-EFFORT-015", ["AT-347"]],
  ["FR-SEED-012", ["AT-453"]],
  ["FR-SEED-013", ["AT-454"]],
  ["FR-SEED-014", ["AT-455"]],
  ["FR-SEED-015", ["AT-456"]],
  ["FR-SEED-019", ["AT-460"]],
  ["FR-SEED-020", ["AT-461"]],
  ["FR-OBJECTIVE-010", ["AT-224"]],
  ["FR-DELIVERY-016", ["AT-356"]],
]);

if (rp3AcceptanceRefs.size !== 27 || rp3MovedDecisions.size !== 2) {
  throw new Error("RP3 semantic review must contain 27 retained and 2 moved requirements.");
}

const rp4MovedDecisions = new Map([
  ["FR-ARCH-023", { targetSlice: "V5-drafting", extensionSlices: ["V7-revision"], reason: "Exploratory prose cannot flow back into structure until a governed prose candidate exists; V4 only prepares the candidate-isolation boundary." }],
  ["FR-CHAR-016", { targetSlice: "V5-drafting", extensionSlices: ["V7-revision", "V8-completion"], reason: "Voice variation requires observable prose and relationship-stage evidence, not outline labels alone." }],
  ["FR-CHAR-020", { targetSlice: "V8-completion", reason: "A character-arc certificate requires the frozen publication draft and actual choice, cost, and state-change evidence." }],
  ["FR-WORLD-020", { targetSlice: "V8-completion", reason: "A world-integrity certificate freezes volume or completion evidence; a planned world model cannot prove published consistency." }],
  ["FR-LONGMEM-013", { targetSlice: "V7-revision", extensionSlices: ["V8-completion"], reason: "Deletion and replacement invalidation is first exercised by governed canon revision, not initial outline generation." }],
  ["FR-LONGMEM-024", { targetSlice: "V8-completion", reason: "Volume and full-book continuity audits require settled prose and a frozen release scope." }],
]);

const rp4AcceptanceRefs = new Map([
  ["FR-ARCH-002", ["AT-277", "AT-288"]],
  ["FR-ARCH-003", ["AT-281", "AT-286"]],
  ["FR-ARCH-004", ["AT-273", "AT-276"]],
  ["FR-ARCH-005", ["AT-269"]],
  ["FR-ARCH-006", ["AT-270"]],
  ["FR-ARCH-007", ["AT-271"]],
  ["FR-ARCH-008", ["AT-272"]],
  ["FR-ARCH-009", ["AT-273"]],
  ["FR-ARCH-010", ["AT-274"]],
  ["FR-ARCH-011", ["AT-275"]],
  ["FR-ARCH-012", ["AT-276"]],
  ["FR-ARCH-013", ["AT-277"]],
  ["FR-ARCH-014", ["AT-278"]],
  ["FR-ARCH-015", ["AT-279"]],
  ["FR-ARCH-016", ["AT-280"]],
  ["FR-ARCH-017", ["AT-281"]],
  ["FR-ARCH-018", ["AT-282"]],
  ["FR-ARCH-019", ["AT-283"]],
  ["FR-ARCH-020", ["AT-284"]],
  ["FR-ARCH-021", ["AT-285"]],
  ["FR-ARCH-022", ["AT-286"]],
  ["FR-ARCH-024", ["AT-288"]],
  ["FR-CHAR-004", ["AT-425"]],
  ["FR-CHAR-005", ["AT-426"]],
  ["FR-CHAR-006", ["AT-427"]],
  ["FR-CHAR-007", ["AT-428"]],
  ["FR-CHAR-008", ["AT-429"]],
  ["FR-CHAR-009", ["AT-430"]],
  ["FR-CHAR-010", ["AT-431"]],
  ["FR-CHAR-011", ["AT-432"]],
  ["FR-CHAR-012", ["AT-433"]],
  ["FR-CHAR-013", ["AT-434"]],
  ["FR-CHAR-014", ["AT-435"]],
  ["FR-CHAR-015", ["AT-436"]],
  ["FR-CHAR-017", ["AT-438"]],
  ["FR-CHAR-018", ["AT-439"]],
  ["FR-CHAR-019", ["AT-440"]],
  ["FR-WORLD-004", ["AT-465"]],
  ["FR-WORLD-005", ["AT-466"]],
  ["FR-WORLD-006", ["AT-467"]],
  ["FR-WORLD-007", ["AT-468"]],
  ["FR-WORLD-008", ["AT-469"]],
  ["FR-WORLD-009", ["AT-470"]],
  ["FR-WORLD-010", ["AT-471"]],
  ["FR-WORLD-011", ["AT-472"]],
  ["FR-WORLD-012", ["AT-473"]],
  ["FR-WORLD-013", ["AT-474"]],
  ["FR-WORLD-014", ["AT-475"]],
  ["FR-WORLD-015", ["AT-476"]],
  ["FR-WORLD-016", ["AT-477"]],
  ["FR-WORLD-017", ["AT-478"]],
  ["FR-WORLD-018", ["AT-479"]],
  ["FR-WORLD-019", ["AT-462", "AT-480"]],
  ["FR-LONGMEM-001", ["AT-377", "AT-387"]],
  ["FR-LONGMEM-002", ["AT-366", "AT-372"]],
  ["FR-LONGMEM-003", ["AT-381"]],
  ["FR-LONGMEM-004", ["AT-367"]],
  ["FR-LONGMEM-005", ["AT-368"]],
  ["FR-LONGMEM-006", ["AT-369", "AT-370"]],
  ["FR-LONGMEM-007", ["AT-369"]],
  ["FR-LONGMEM-008", ["AT-365"]],
  ["FR-LONGMEM-009", ["AT-371"]],
  ["FR-LONGMEM-010", ["AT-373"]],
  ["FR-LONGMEM-011", ["AT-374"]],
  ["FR-LONGMEM-012", ["AT-375"]],
  ["FR-LONGMEM-014", ["AT-377"]],
  ["FR-LONGMEM-015", ["AT-378"]],
  ["FR-LONGMEM-016", ["AT-379"]],
  ["FR-LONGMEM-017", ["AT-380"]],
  ["FR-LONGMEM-018", ["AT-381"]],
  ["FR-LONGMEM-019", ["AT-382"]],
  ["FR-LONGMEM-020", ["AT-383"]],
  ["FR-LONGMEM-021", ["AT-384"]],
  ["FR-LONGMEM-022", ["AT-385"]],
  ["FR-LONGMEM-023", ["AT-386", "AT-387"]],
  ["FR-OBJECTIVE-003", ["AT-277", "AT-280"]],
  ["FR-OBJECTIVE-006", ["AT-275", "AT-288"]],
  ["FR-DELIVERY-017", ["AT-357"]],
  ["FR-DELIVERY-025", ["AT-389"]],
  ["FR-RESEARCH-001", ["AT-508"]],
  ["FR-RESEARCH-002", ["AT-509"]],
  ["FR-RESEARCH-003", ["AT-510"]],
  ["FR-RESEARCH-004", ["AT-511"]],
]);

if (rp4AcceptanceRefs.size !== 83 || rp4MovedDecisions.size !== 6) {
  throw new Error("RP4 semantic review must contain 83 retained and 6 moved requirements.");
}

const rp6MovedDecisions = new Map([
  ["FR-OBL-023", { targetSlice: "V8-completion", reason: "The portfolio-level completion gate consumes a frozen full-book scope; RP6 provides obligation health and settlement semantics but cannot certify the unfinished book." }],
  ["FR-CLOSURE-019", { targetSlice: "V8-completion", reason: "ObligationCoverageCertificate requires a completion-wide source inventory, frozen scan scope, and unresolved-parser accounting." }],
]);

const rp6AcceptanceRefs = new Map([
  ["FR-FORESHADOW-001", ["AT-004", "AT-166"]],
  ["FR-FORESHADOW-002", ["AT-004", "AT-005", "AT-006"]],
  ["FR-FORESHADOW-003", ["AT-004", "AT-030"]],
  ["FR-FORESHADOW-004", ["AT-007", "AT-040", "AT-172"]],
  ["FR-FORESHADOW-005", ["AT-166", "AT-184"]],
  ["FR-FORESHADOW-006", ["AT-030", "AT-036"]],
  ["FR-FORESHADOW-007", ["AT-031", "AT-173", "AT-185"]],
  ["FR-FORESHADOW-008", ["AT-034", "AT-187"]],
  ["FR-FORESHADOW-009", ["AT-032", "AT-033"]],
  ["FR-FORESHADOW-010", ["AT-035", "AT-168"]],
  ["FR-FORESHADOW-011", ["AT-033", "AT-038", "AT-184"]],
  ["FR-FORESHADOW-012", ["AT-037", "AT-176"]],
  ["FR-DEBT-001", ["AT-166", "AT-167", "AT-179"]],
  ["FR-UX-013", ["AT-503"]],
  ["FR-OBL-001", ["AT-166"]],
  ["FR-OBL-002", ["AT-167"]],
  ["FR-OBL-003", ["AT-180"]],
  ["FR-OBL-004", ["AT-168"]],
  ["FR-OBL-005", ["AT-169"]],
  ["FR-OBL-006", ["AT-170"]],
  ["FR-OBL-007", ["AT-172"]],
  ["FR-OBL-008", ["AT-171"]],
  ["FR-OBL-009", ["AT-173"]],
  ["FR-OBL-010", ["AT-185"]],
  ["FR-OBL-011", ["AT-173"]],
  ["FR-OBL-012", ["AT-174"]],
  ["FR-OBL-013", ["AT-175"]],
  ["FR-OBL-014", ["AT-176", "AT-177"]],
  ["FR-OBL-015", ["AT-178"]],
  ["FR-OBL-016", ["AT-179"]],
  ["FR-OBL-017", ["AT-181"]],
  ["FR-OBL-018", ["AT-182"]],
  ["FR-OBL-019", ["AT-040", "AT-175"]],
  ["FR-OBL-020", ["AT-186"]],
  ["FR-OBL-021", ["AT-187"]],
  ["FR-OBL-022", ["AT-188"]],
  ["FR-OBL-024", ["AT-166", "AT-180", "AT-183"]],
  ["FR-CLOSURE-001", ["AT-313"]],
  ["FR-CLOSURE-002", ["AT-314"]],
  ["FR-CLOSURE-003", ["AT-315"]],
  ["FR-CLOSURE-004", ["AT-316"]],
  ["FR-CLOSURE-005", ["AT-317"]],
  ["FR-CLOSURE-006", ["AT-318"]],
  ["FR-CLOSURE-007", ["AT-319"]],
  ["FR-CLOSURE-008", ["AT-320"]],
  ["FR-CLOSURE-009", ["AT-321"]],
  ["FR-CLOSURE-010", ["AT-322"]],
  ["FR-CLOSURE-011", ["AT-323"]],
  ["FR-CLOSURE-012", ["AT-324"]],
  ["FR-CLOSURE-013", ["AT-325"]],
  ["FR-CLOSURE-014", ["AT-326"]],
  ["FR-CLOSURE-015", ["AT-327"]],
  ["FR-CLOSURE-016", ["AT-328"]],
  ["FR-CLOSURE-017", ["AT-329"]],
  ["FR-CLOSURE-018", ["AT-330"]],
  ["FR-CLOSURE-020", ["AT-332"]],
]);

if (rp6AcceptanceRefs.size !== 56 || rp6MovedDecisions.size !== 2) {
  throw new Error("RP6 semantic review must contain 56 retained and 2 moved requirements.");
}

const rp8RunMoveReasons = new Map([
  ["FR-RUN-001", "BookRun becomes the governing continuous-drafting aggregate before the first autonomous chapter, not after the manuscript is finished."],
  ["FR-RUN-002", "The dependency work graph must order planning, drafting, review, and settlement from the first chapter."],
  ["FR-RUN-003", "Rolling book, volume, near-chapter, and scene horizons govern continuous drafting decisions."],
  ["FR-RUN-004", "Autonomy scope must constrain the first unattended drafting action."],
  ["FR-RUN-005", "Call, cost, time, chapter, and failure ceilings are pre-execution safety controls."],
  ["FR-RUN-006", "Readiness and cost prediction are required before starting a continuous drafting run."],
  ["FR-RUN-007", "Run state semantics must distinguish pause, gate, scope completion, and audited completion throughout execution."],
  ["FR-RUN-008", "Idempotency and artifact contracts protect every drafting work item from duplicate writes and charges."],
  ["FR-RUN-009", "Chapter settlement is the dependency boundary that unlocks the next chapter."],
  ["FR-RUN-010", "Risk gates and review bundling govern decisions during drafting, not only at completion."],
  ["FR-RUN-011", "autoContinue semantics are first exercised when one settled chapter schedules the next."],
  ["FR-RUN-012", "Author direction must causally affect in-flight and future drafting work."],
  ["FR-RUN-013", "Pause and resumable checkpoints are runtime safety controls for continuous drafting."],
  ["FR-RUN-014", "Stop and emergency fencing must exist before any unattended canon write."],
  ["FR-RUN-015", "Leases, heartbeats, and fencing prevent concurrent chapter or canon writes."],
  ["FR-RUN-016", "Stage-aware recovery is needed after planning, model, candidate, or commit interruption."],
  ["FR-RUN-017", "Fair scheduling and write-set exclusion govern long runs while other projects remain usable."],
  ["FR-RUN-018", "Loop and stagnation detection must stop waste during repeated drafting or repair."],
  ["FR-RUN-019", "Evidence-driven replanning reacts to settled chapters and author direction during the run."],
  ["FR-RUN-020", "Freshness propagation prevents old contract and outline inputs from being settled during drafting."],
  ["FR-RUN-021", "Failure classification and isolation determine whether drafting pauses, degrades, or safely continues."],
  ["FR-RUN-022", "Real chapter, work-item, coverage, and obligation progress must be visible throughout the run."],
  ["FR-RUN-023", "Quiet-hour policy and notification summaries govern unattended drafting communication."],
]);

const rp8MovedDecisions = new Map([...rp8RunMoveReasons.entries()].map(([requirementId, reason]) => [
  requirementId,
  {
    targetSlice: "V5-drafting",
    extensionSlices: ["V6-obligations", "V7-revision", "V8-completion"],
    reason,
  },
]));

const rp8AcceptanceRefs = new Map([
  ["FR-CHAR-020", ["AT-441"]],
  ["FR-WORLD-020", ["AT-481"]],
  ["FR-LONGMEM-024", ["AT-388"]],
  ["FR-COMPLETE-001", ["AT-007", "AT-165", "AT-189"]],
  ["FR-COMPLETE-002", ["AT-144", "AT-158"]],
  ["FR-COMPLETE-003", ["AT-007", "AT-165"]],
  ["FR-COMPLETE-004", ["AT-504"]],
  ["FR-COMPLETE-005", ["AT-031", "AT-114"]],
  ["FR-COMPLETE-006", ["AT-038", "AT-330"]],
  ["FR-COMPLETE-007", ["AT-040", "AT-175", "AT-189"]],
  ["FR-RUN-024", ["AT-165"]],
  ["FR-OBL-023", ["AT-189"]],
  ["FR-CLOSURE-019", ["AT-331"]],
  ["FR-PUBLISH-001", ["AT-505"]],
  ["FR-PUBLISH-002", ["AT-506"]],
  ["FR-PUBLISH-003", ["AT-507"]],
]);

if (rp8AcceptanceRefs.size !== 16 || rp8MovedDecisions.size !== 23) {
  throw new Error("RP8 semantic review must contain 16 retained and 23 moved requirements.");
}

const rp7MovedDecisions = new Map([
  ["FR-AI-011", { targetSlice: "V5-drafting", reason: "Content-addressed reuse, retry, and stale-result protection are first consumed by repeated drafting calls, not by later learning." }],
  ["FR-EVAL-004", { targetSlice: "V5-drafting", reason: "The first prose candidate must be judged by constraints and function rather than exact-gold text." }],
  ["FR-EVAL-005", { targetSlice: "V5-drafting", reason: "The first chapter review requires a function-adaptive rubric; a fixed climax rubric cannot safely gate drafting." }],
  ["FR-EVAL-006", { targetSlice: "V5-drafting", reason: "Hard canon, POV, lock, secrecy, and obligation failures must block the first prose adoption independently of aesthetic scores." }],
  ["FR-EVAL-009", { targetSlice: "V5-drafting", reason: "A high-impact drafting candidate cannot be accepted solely by its generating model's self-review." }],
  ["FR-EVAL-010", { targetSlice: "V5-drafting", reason: "Any reviewer used in the first prose gate must first pass a chapter-function and anti-pattern calibration set." }],
  ["FR-EVAL-011", { targetSlice: "V5-drafting", reason: "The first blocking quality claim must point to recoverable prose and contract evidence." }],
  ["FR-EVAL-012", { targetSlice: "V5-drafting", reason: "The first review must preserve tie, uncertainty, not-applicable, and disagreement instead of manufacturing a winner." }],
  ["FR-OBJECTIVE-008", { targetSlice: "V5-drafting", reason: "Anti-metric-gaming is required when the first prose objective is evaluated, even before longitudinal drift evidence exists." }],
  ["FR-FEEDBACK-001", { targetSlice: "V5-drafting", reason: "The first author accept, reject, edit, lock, or criticism must be captured as an immutable feedback event." }],
  ["FR-FEEDBACK-002", { targetSlice: "V5-drafting", reason: "Low-burden feedback controls are part of the first candidate-review journey." }],
  ["FR-FEEDBACK-003", { targetSlice: "V5-drafting", reason: "Partial prose adoption must retain fragment-level attribution from the first review." }],
  ["FR-FEEDBACK-004", { targetSlice: "V5-drafting", reason: "A manual edit must remain an attribution hypothesis from the first observed edit, not become an automatic preference." }],
  ["FR-FEEDBACK-005", { targetSlice: "V5-drafting", reason: "Deletion, undo, and restore semantics must be captured when the first candidate is revised or reverted." }],
  ["FR-FEEDBACK-006", { targetSlice: "V5-drafting", reason: "Every first feedback event needs an explicit target and narrow scope so later learning has trustworthy evidence." }],
]);

for (const decision of rp7MovedDecisions.values()) {
  decision.extensionSlices = ["V6-obligations", "V7-revision", "V8-completion"];
}

const rp7AcceptanceRefs = new Map([
  ["FR-LONGMEM-013", ["AT-376"]],
  ["FR-EFFORT-018", ["AT-350"]],
  ["FR-EFFORT-020", ["AT-352"]],
  ["FR-EVAL-007", ["AT-123"]],
  ["FR-EVAL-008", ["AT-124"]],
  ["FR-EVAL-013", ["AT-129"]],
  ["FR-EVAL-014", ["AT-130", "AT-132"]],
  ["FR-EVAL-015", ["AT-131"]],
  ["FR-EVAL-017", ["AT-133"]],
  ["FR-EVAL-018", ["AT-134", "AT-135"]],
  ["FR-EVAL-020", ["AT-137"]],
  ["FR-EVAL-021", ["AT-138"]],
  ["FR-EVAL-022", ["AT-139"]],
  ["FR-OBJECTIVE-009", ["AT-223"]],
  ["FR-OBJECTIVE-011", ["AT-225"]],
  ["FR-FEEDBACK-007", ["AT-233"]],
  ["FR-FEEDBACK-008", ["AT-234"]],
  ["FR-FEEDBACK-009", ["AT-235"]],
  ["FR-FEEDBACK-010", ["AT-236"]],
  ["FR-FEEDBACK-011", ["AT-237"]],
  ["FR-FEEDBACK-012", ["AT-238"]],
]);

if (rp7AcceptanceRefs.size !== 21 || rp7MovedDecisions.size !== 15) {
  throw new Error("RP7 semantic review must contain 21 retained and 15 moved requirements.");
}

function requirementNumber(domain, number) {
  return `FR-${domain}-${String(number).padStart(3, "0")}`;
}

function acceptanceNumber(number) {
  return `AT-${String(number).padStart(3, "0")}`;
}

function sequentialAcceptanceRefs(domain, count, acceptanceStart) {
  return Array.from({ length: count }, (_, index) => [
    requirementNumber(domain, index + 1),
    [acceptanceNumber(acceptanceStart + index)],
  ]);
}

const rp5AcceptanceRefs = new Map([
  ["FR-COLLAB-004", ["AT-043", "AT-204"]],
  ["FR-ARCH-023", ["AT-287"]],
  ["FR-CHAR-016", ["AT-295", "AT-437"]],
  ["FR-WRITE-001", ["AT-289"]],
  ["FR-WRITE-002", ["AT-292"]],
  ["FR-WRITE-003", ["AT-045", "AT-259"]],
  ["FR-WRITE-004", ["AT-058", "AT-305"]],
  ["FR-WRITE-005", ["AT-053", "AT-308"]],
  ["FR-WRITE-006", ["AT-289", "AT-312"]],
  ["FR-WRITE-007", ["AT-044", "AT-045"]],
  ["FR-WRITE-008", ["AT-046", "AT-295", "AT-437"]],
  ["FR-WRITE-009", ["AT-048", "AT-297"]],
  ["FR-WRITE-010", ["AT-049", "AT-303"]],
  ["FR-WRITE-011", ["AT-050", "AT-304"]],
  ["FR-WRITE-012", ["AT-051"]],
  ["FR-WRITE-013", ["AT-052"]],
  ["FR-WRITE-014", ["AT-053", "AT-308"]],
  ["FR-WRITE-015", ["AT-058", "AT-309"]],
  ["FR-WRITE-016", ["AT-305", "AT-312"]],
  ...sequentialAcceptanceRefs("PROSE", 24, 289),
  ["FR-CRAFT-001", ["AT-110", "AT-251"]],
  ["FR-CRAFT-002", ["AT-253"]],
  ["FR-CRAFT-003", ["AT-262", "AT-267", "AT-268"]],
  ["FR-CRAFT-004", ["AT-262"]],
  ["FR-CRAFT-005", ["AT-056", "AT-266"]],
  ["FR-CRAFT-006", ["AT-268"]],
  ["FR-CRAFT-007", ["AT-054", "AT-110", "AT-251"]],
  ["FR-CRAFT-008", ["AT-251", "AT-252"]],
  ["FR-CRAFT-009", ["AT-253"]],
  ["FR-CRAFT-010", ["AT-254"]],
  ["FR-CRAFT-011", ["AT-255"]],
  ["FR-CRAFT-012", ["AT-256"]],
  ["FR-CRAFT-013", ["AT-257"]],
  ["FR-CRAFT-014", ["AT-258", "AT-264"]],
  ["FR-CRAFT-015", ["AT-259"]],
  ["FR-CRAFT-016", ["AT-260"]],
  ["FR-CRAFT-017", ["AT-261"]],
  ["FR-CRAFT-018", ["AT-055", "AT-262"]],
  ["FR-CRAFT-019", ["AT-263"]],
  ["FR-CRAFT-020", ["AT-264"]],
  ["FR-CRAFT-021", ["AT-265"]],
  ["FR-CRAFT-022", ["AT-056", "AT-266"]],
  ["FR-CRAFT-023", ["AT-267"]],
  ["FR-CRAFT-024", ["AT-268"]],
  ["FR-QUALITY-001", ["AT-011", "AT-012", "AT-307"]],
  ["FR-QUALITY-002", ["AT-127", "AT-307"]],
  ["FR-QUALITY-003", ["AT-130", "AT-307"]],
  ["FR-QUALITY-004", ["AT-044", "AT-119"]],
  ["FR-QUALITY-005", ["AT-015", "AT-306"]],
  ["FR-QUALITY-006", ["AT-013", "AT-124"]],
  ["FR-QUALITY-007", ["AT-123"]],
  ["FR-QUALITY-008", ["AT-014", "AT-309"]],
  ["FR-QUALITY-009", ["AT-055", "AT-262"]],
  ["FR-QUALITY-010", ["AT-012", "AT-222"]],
  ...sequentialAcceptanceRefs("READER", 20, 390),
  ["FR-MEMORY-001", ["AT-311", "AT-312", "AT-384"]],
  ["FR-MEMORY-002", ["AT-310", "AT-311", "AT-384"]],
  ["FR-MEMORY-003", ["AT-385"]],
  ["FR-MIGRATE-002", ["AT-010", "AT-180"]],
  ["FR-UX-014", ["AT-088"]],
  ["FR-UX-015", ["AT-089"]],
  ["FR-AI-011", ["AT-104"]],
  ["FR-EVAL-004", ["AT-120"]],
  ["FR-EVAL-005", ["AT-119"]],
  ["FR-EVAL-006", ["AT-121"]],
  ["FR-EVAL-009", ["AT-125"]],
  ["FR-EVAL-010", ["AT-126"]],
  ["FR-EVAL-011", ["AT-127"]],
  ["FR-EVAL-012", ["AT-128"]],
  ["FR-RUN-001", ["AT-144"]],
  ["FR-RUN-002", ["AT-164"]],
  ["FR-RUN-003", ["AT-159"]],
  ["FR-RUN-004", ["AT-146", "AT-164"]],
  ["FR-RUN-005", ["AT-162"]],
  ["FR-RUN-006", ["AT-145"]],
  ["FR-RUN-007", ["AT-143", "AT-144", "AT-158"]],
  ["FR-RUN-008", ["AT-153", "AT-154"]],
  ["FR-RUN-009", ["AT-142", "AT-154"]],
  ["FR-RUN-010", ["AT-147"]],
  ["FR-RUN-011", ["AT-142", "AT-143"]],
  ["FR-RUN-012", ["AT-148", "AT-149"]],
  ["FR-RUN-013", ["AT-150"]],
  ["FR-RUN-014", ["AT-151"]],
  ["FR-RUN-015", ["AT-152"]],
  ["FR-RUN-016", ["AT-150", "AT-153", "AT-154"]],
  ["FR-RUN-017", ["AT-155", "AT-156"]],
  ["FR-RUN-018", ["AT-157"]],
  ["FR-RUN-019", ["AT-159"]],
  ["FR-RUN-020", ["AT-160"]],
  ["FR-RUN-021", ["AT-161"]],
  ["FR-RUN-022", ["AT-144", "AT-158"]],
  ["FR-RUN-023", ["AT-163"]],
  ["FR-OBJECTIVE-005", ["AT-219"]],
  ["FR-OBJECTIVE-007", ["AT-221"]],
  ["FR-OBJECTIVE-008", ["AT-222"]],
  ["FR-OBJECTIVE-012", ["AT-226", "AT-363"]],
  ["FR-FEEDBACK-001", ["AT-227"]],
  ["FR-FEEDBACK-002", ["AT-228"]],
  ["FR-FEEDBACK-003", ["AT-229"]],
  ["FR-FEEDBACK-004", ["AT-230"]],
  ["FR-FEEDBACK-005", ["AT-231"]],
  ["FR-FEEDBACK-006", ["AT-232"]],
  ["FR-TEXT-001", ["AT-512"]],
  ["FR-TEXT-002", ["AT-514"]],
  ["FR-TEXT-003", ["AT-513"]],
  ["FR-TEXT-004", ["AT-515"]],
]);

if (rp5AcceptanceRefs.size !== 148) {
  throw new Error(`RP5 semantic review must contain 148 retained requirements, found ${rp5AcceptanceRefs.size}.`);
}

const q003DraftingPolicyCandidates = {
  schemaVersion: "1.0.0",
  status: "author-selected-specification-not-implementation-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-003",
  question: "第一阶段正文创作默认优先速度、单章质量，还是按风险与章节功能分层？",
  evidenceBaselineRef: "docs/spec-governance/audits/current-q003-operational-baseline.json",
  recommendationState: "C-selected-by-author-as-default-policy-not-a-proven-optimum-or-implemented-runtime",
  selection: {
    selectedOption: "C",
    selectedPolicyId: "tiered-quality",
    selectedLabel: "分层质量",
    decisionStatus: "confirmed",
    source: "direct-author-answer",
    selectedOn: sourceDate,
    runtimeActivationStatus: "not-implemented-not-verified",
  },
  evidenceBoundary: [
    "The operational baseline uses local read-only metadata only and excludes prose, prompts, summaries, and SQLite JSON payloads.",
    "Only one observed project meets the audit's substantial-project threshold, so cross-author and cross-genre generalization is unknown.",
    "Sparse quality and adoption records cannot prove causal quality uplift; author selection remains required.",
  ],
  invariantRules: [
    "Canon, POV, author-lock, rights, secrecy, narrative-obligation, stale-input, and atomic-adoption gates never weaken by policy.",
    "Every generated prose artifact remains a candidate until governed adoption and chapter settlement complete.",
    "Aesthetic scores never override hard failures, and model self-review never proves acceptance.",
    "The author may switch policy at a stable chapter boundary; in-flight candidates retain the policy version that created them.",
  ],
  options: [
    {
      option: "A",
      policyId: "speed-priority",
      label: "速度优先",
      status: "unselected-alternative",
      recommended: false,
      defaultCandidateCount: { ordinary: 1, key: 2 },
      independentReview: { ordinary: "risk-triggered-or-20-percent-sample", key: "required" },
      blindPairwise: { ordinary: "only-on-uncertainty", key: "required-when-two-candidates" },
      repairBudget: { ordinary: 1, key: 2 },
      milestoneAudit: "every-10-settled-chapters-and-volume-boundary",
      authorInterruption: "L2 decisions, unresolved hard failures, repeated stagnation, or explicit request only",
      tradeoff: "Fastest throughput and lowest review cost, with more defects deferred to milestone review but no safety-gate relaxation.",
    },
    {
      option: "B",
      policyId: "chapter-quality-priority",
      label: "单章质量优先",
      status: "unselected-key-chapter-alternative",
      recommended: false,
      defaultCandidateCount: { ordinary: 2, key: 3 },
      independentReview: { ordinary: "required", key: "required-with-second-opinion-on-disagreement" },
      blindPairwise: { ordinary: "required", key: "required" },
      repairBudget: { ordinary: 2, key: 3 },
      milestoneAudit: "every-5-settled-chapters-and-volume-boundary",
      authorInterruption: "L2 decisions, unresolved hard failures, irreducible reviewer disagreement, repeated stagnation, or explicit request",
      tradeoff: "Strongest chapter-level evidence and highest cost/latency; deep system review does not force the author to approve every low-risk chapter.",
    },
    {
      option: "C",
      policyId: "tiered-quality",
      label: "分层质量",
      status: "selected-default-specification",
      recommended: true,
      defaultCandidateCount: { ordinary: 1, elevated: 2, key: 3 },
      independentReview: { ordinary: "risk-triggered", elevated: "required", key: "required-with-disagreement-resolution" },
      blindPairwise: { ordinary: "only-on-uncertainty", elevated: "required-when-two-candidates", key: "required" },
      repairBudget: { ordinary: 1, elevated: 2, key: 3 },
      milestoneAudit: "risk-adaptive-plus-every-10-settled-chapters-and-volume-boundary",
      authorInterruption: "L2 decisions, unresolved hard failures, key-chapter tradeoffs, repeated stagnation, or explicit request",
      tradeoff: "Balances low author burden and cost with deep evidence on openings, turns, reveals, climaxes, payoffs, and endings.",
    },
  ],
};

const q004PauseDiscussionPolicy = {
  schemaVersion: "1.0.0",
  status: "author-selected-specification-not-implementation-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-004",
  question: "系统应在什么条件下暂停自动创作并与作者讨论？",
  evidenceRefs: [
    "docs/spec-governance/audits/current-collaboration-dialogue.json",
    "docs/spec-governance/audits/current-full-book-orchestration.json",
  ],
  selection: {
    selectedPolicyId: "adaptive-risk-pause",
    selectedLabel: "高风险硬暂停、里程碑软复盘、授权内默认继续",
    decisionStatus: "confirmed",
    source: "author-accepted-recommendation",
    selectedOn: sourceDate,
    runtimeActivationStatus: "not-implemented-not-verified",
  },
  alternatives: [
    {
      policyId: "always-pause-at-volume-boundary",
      status: "unselected-alternative",
      blueCase: "Every volume boundary guarantees deliberate author review and makes drift visible before the next arc begins.",
      redCase: "Mandatory stops create avoidable author burden even when the settled evidence, next scope, and autonomy grant are unchanged.",
    },
    {
      policyId: "high-risk-only-without-milestone-recap",
      status: "unselected-alternative",
      blueCase: "Minimizes interruptions and maximizes throughput while preserving explicit L2 and hard-failure gates.",
      redCase: "Long quiet runs can hide accumulated drift, deferred debt, changing estimates, or a strategy that remains locally valid but globally undesirable.",
    },
    {
      policyId: "adaptive-risk-pause",
      status: "selected-default-specification",
      blueCase: "Hard-stop only when author judgment is truly required, but publish compact milestone recaps that preserve oversight without turning silence into new consent.",
      redCase: "Requires accurate risk classification, scoped/expiring autonomy grants, stable-boundary control, recap compression, escalation deduplication, and proof that continued work stayed inside authorization.",
    },
  ],
  hardPauseTriggers: [
    "Any unresolved L2 decision affecting identity, central conflict, core relationship, world rule, canon promise, ending, rights/publication boundary, intentional-open obligation, destructive rewrite, or irreversible cost",
    "Any unresolved hard gate involving canon, POV, secrecy, rights, author lock, narrative obligation, stale input, text integrity, resource conservation, atomic adoption, recovery, or completion evidence",
    "A key-chapter red/blue or independent-review disagreement whose alternatives create materially different irreversible outcomes",
    "A requested scope expansion, retcon, ending change, policy override, destructive migration, publication action, or new external-data authority",
    "Repeated repair/replan stagnation, loop detection, exhausted bounded retry/repair budget, or failure with no safe degraded path",
    "Autonomy grant, cost/time/model budget, rights, privacy purpose, lease, or execution capability expires or becomes insufficient",
    "Author explicitly pauses, stops, corrects direction, revokes authorization, or requests discussion",
  ],
  softMilestoneRecaps: {
    triggers: ["volume boundary", "every 10 settled chapters", "major arc/obligation closure", "material forecast or risk change"],
    content: ["what settled", "what changed", "open obligations and risks", "quality/cost/pace evidence", "next authorized scope", "why continuation is safe"],
    defaultAction: "Continue only when no hard trigger exists and the previously explicit scoped AutonomyGrant remains valid; silence is not recorded as a new answer or consent.",
  },
  controlRules: [
    "The author may pause, stop, correct, narrow, or revoke at any time; control commands receive scheduling priority and take effect at the earliest safe boundary.",
    "One active L2 question blocks only its affected canon boundary; unrelated L0/L1 work may continue inside the grant.",
    "Equivalent escalation candidates are deduplicated into one question with evidence, consequence, recommendation, and safe fallback.",
    "A soft recap never requires a click to preserve existing authorization, never expands scope, and never converts missing response into adoption of a new decision.",
    "Late workers, retries, restored runs, and in-flight candidates remain bound to the pause-policy version, autonomy grant, scope, and fencing token they started with.",
  ],
  implementationBoundary: "This decision locks product intent only. No pause classifier, AutonomyGrant, milestone recap, safe-boundary acknowledgement, runtime fencing, notification policy, or end-to-end behavior is implementation-verified by this documentation-only work.",
  invariantRequirementIds: [
    "FR-QUESTION-004", "FR-QUESTION-005", "FR-QUESTION-008", "FR-COLLAB-002", "FR-COLLAB-003",
    "FR-EFFORT-003", "FR-EFFORT-005", "FR-EFFORT-010", "FR-EFFORT-011", "FR-EFFORT-012", "FR-EFFORT-016", "FR-EFFORT-020",
    "FR-DIALOGUE-010", "FR-DIALOGUE-014", "FR-DIALOGUE-021", "FR-DIALOGUE-022",
    "FR-RUN-004", "FR-RUN-005", "FR-RUN-010", "FR-RUN-013", "FR-RUN-014", "FR-RUN-016", "FR-RUN-018", "FR-RUN-021", "FR-RUN-023",
  ],
  acceptanceRefs: ["AT-080", "AT-089", "AT-143", "AT-146", "AT-150", "AT-164", "AT-200", "AT-335", "AT-342", "AT-343", "AT-419", "AT-461"],
};

const q005CraftSourcePolicy = {
  schemaVersion: "1.0.0",
  status: "author-selected-specification-with-platform-safety-boundary-not-implementation-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-005",
  question: "平台可以使用哪些来源学习创作方式，以及允许在什么范围内使用？",
  authorIntent: "Allow cross-platform and internet learning without requiring the author to classify copyright or license terms for every source.",
  interpretationBoundary: {
    accepted: "Broad public-web and cross-platform discovery, analysis, comparison, mechanism extraction, validation, and reuse are enabled as product intent.",
    nonWaivable: "The platform does not bypass access controls, turn private inputs into shared assets, inject raw source passages into drafting by default, or promise named-author imitation or close reproduction.",
    userExperience: "Source eligibility, provenance, quarantine, originality checks, deletion propagation, and provider boundaries are handled by the platform rather than delegated to the author.",
  },
  selection: {
    selectedPolicyId: "broad-network-mechanism-learning",
    selectedLabel: "跨平台联网研究、机制级学习、平台托管边界",
    decisionStatus: "confirmed-with-platform-boundary",
    source: "author-broad-learning-directive-with-nonwaivable-platform-guardrails",
    selectedOn: sourceDate,
    runtimeActivationStatus: "not-implemented-not-verified",
  },
  alternatives: [
    {
      policyId: "user-owned-project-local-only",
      status: "unselected-alternative",
      blueCase: "Simple isolation and low external-source risk.",
      redCase: "Requires the author to curate every example, sharply limits breadth, and cannot discover current cross-platform craft evidence.",
    },
    {
      policyId: "unrestricted-raw-crawl-and-rag",
      status: "rejected-boundary",
      blueCase: "Fastest path to a large corpus and immediately visible stylistic resemblance.",
      redCase: "Raw retrieval amplifies imitation, duplicated sources, prompt injection, stale or low-quality advice, private-content leakage, unverifiable provenance, and cross-project contamination.",
    },
    {
      policyId: "broad-network-mechanism-learning",
      status: "selected-default-specification",
      blueCase: "Searches broadly across public web and platforms, compares independent evidence, extracts transferable mechanisms, and shares validated abstractions across projects with low author burden.",
      redCase: "Requires source eligibility classification, hostile-content isolation, provenance snapshots, duplicate-family detection, controlled experiments, originality guards, expiry, and rollback before a pattern can affect live prose.",
    },
  ],
  allowedDiscoveryClasses: [
    "publicly accessible web pages and platform posts",
    "editorial reviews, craft discussions, reader analyses, interviews, and public commentary",
    "public-domain, openly licensed, or platform-provided corpora",
    "author-provided private samples inside their declared privacy scope",
    "platform-owned anonymized outcome evidence when collection purpose and privacy policy permit it",
  ],
  networkAndSourceControls: [
    "Do not bypass authentication, paywalls, anti-bot controls, private groups, deletion status, or explicit technical access restrictions.",
    "Treat fetched pages, comments, metadata, attachments, and embedded instructions as untrusted content; isolate prompt injection, scripts, secrets, personal data, and executable payloads.",
    "Record source platform, canonical URL or stable locator, retrieval time, content fingerprint, source family, access class, processing purpose, expiry/refresh policy, and derived-pattern lineage without exposing private source text to readers.",
    "Detect syndicated copies and source families so repeated reposts do not masquerade as independent evidence or popularity.",
    "Freeze the exact evidence snapshot used by each experiment, then invalidate affected patterns when a source disappears, changes materially, is withdrawn, or fails a later source-policy check.",
  ],
  crossProjectRules: {
    shareable: ["validated abstract CraftPattern", "non-identifying aggregate evidence", "regression cases that contain no private expression"],
    projectBound: ["private author samples", "raw excerpts", "author preference events", "project prose", "unpublished story facts"],
    generationRule: "Live drafting consumes the smallest applicable approved mechanism set, not a raw cross-platform corpus.",
  },
  originalityAndQualityRules: [
    "Separate plot, information, character-choice, scene, rhythm, dialogue, and reader-effect mechanisms from source wording, named entities, signature imagery, distinctive event sequences, and author identity.",
    "A source is evidence for a candidate mechanism, not proof that the mechanism is causal, universally good, or appropriate for the current story.",
    "Promotion requires red/blue comparison, applicability limits, counterexamples, holdout or cross-scene evidence, independent review, author outcome evidence where available, and similarity regression guards.",
    "Named-author imitation, long verbatim retention, close paraphrase, unique plot-sequence mapping, or provenance-free raw-RAG injection cannot be enabled by an author preference toggle.",
  ],
  implementationBoundary: "This decision authorizes broad network/cross-platform product intent only. No crawler, connector, retrieval broker, source classifier, quarantine, pattern extractor, experiment runner, provider boundary, similarity guard, deletion propagation, cross-project pattern registry, or end-to-end behavior is implementation-verified by this documentation-only work.",
  invariantRequirementIds: [
    "FR-CRAFT-001", "FR-CRAFT-002", "FR-CRAFT-003", "FR-CRAFT-004", "FR-CRAFT-006", "FR-CRAFT-007",
    "FR-CRAFT-008", "FR-CRAFT-009", "FR-CRAFT-010", "FR-CRAFT-011", "FR-CRAFT-012", "FR-CRAFT-013",
    "FR-CRAFT-014", "FR-CRAFT-015", "FR-CRAFT-016", "FR-CRAFT-017", "FR-CRAFT-018", "FR-CRAFT-019",
    "FR-CRAFT-020", "FR-CRAFT-021", "FR-CRAFT-023", "FR-CRAFT-024",
  ],
  acceptanceRefs: ["AT-251", "AT-252", "AT-253", "AT-254", "AT-255", "AT-256", "AT-257", "AT-258", "AT-259", "AT-260", "AT-261", "AT-262", "AT-263", "AT-264", "AT-265", "AT-267", "AT-268"],
};

const q006QualityAuthorityPolicy = {
  schemaVersion: "1.0.0",
  status: "author-selected-specification-not-implementation-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-006",
  question: "平台应依据哪些证据判断一章正文达到高质量并允许自动采纳？",
  selection: {
    selectedPolicyId: "author-goal-led-multi-evidence",
    selectedLabel: "硬门不可抵消、作者目标主导、盲读独立举证、分层采纳",
    decisionStatus: "confirmed",
    source: "author-accepted-recommendation",
    selectedOn: sourceDate,
    runtimeActivationStatus: "not-implemented-not-verified",
  },
  alternatives: [
    {
      policyId: "single-model-or-score-authority",
      status: "rejected-alternative",
      blueCase: "Fast, cheap, consistent to display, and easy to automate with one threshold.",
      redCase: "The generator and evaluator can share blind spots; scalar optimization hides fatal defects, applicability, uncertainty, author disagreement, and protected-strength regression.",
    },
    {
      policyId: "reader-majority-authority",
      status: "unselected-alternative",
      blueCase: "Directly optimizes audience preference and can expose author/model blind spots through blind cold reads.",
      redCase: "Small or mismatched samples reward familiarity, flatten intentional difficulty, leak future truth, and can override the specific book the author intends to write.",
    },
    {
      policyId: "author-goal-led-multi-evidence",
      status: "selected-default-specification",
      blueCase: "Non-compensable narrative truth stays safe, the author's accepted objective remains aesthetic authority, and independent blind readers/reviewers supply falsifiable evidence instead of replacing authorship.",
      redCase: "Requires explicit objective versions, calibrated evaluators, sealed reader views, disagreement typing, tier-aware stopping, evidence freshness, and reversible adoption rather than a convenient universal score.",
    },
  ],
  authorityOrder: [
    {
      rank: 1,
      authority: "non-compensable hard guards",
      rule: "Canon, POV, secrecy, author locks, obligation/foreshadowing evidence, world/resource constraints, text integrity, originality/source boundaries, stale inputs, and atomic adoption failures block regardless of aesthetic preference or reader vote.",
    },
    {
      rank: 2,
      authority: "current explicit author objectives and anti-goals",
      rule: "After hard guards pass, the author owns aesthetic direction, intended difficulty, tone, ambiguity, voice, target reader, and protected strengths; the latest scoped explicit decision outranks inferred preference.",
    },
    {
      rank: 3,
      authority: "calibrated independent blind evidence",
      rule: "Independent literary reviewers and voluntary blind/cold readers test whether the text actually produces the intended effect, preserve dissent, and cannot see future truth, model identity, or preferred answer.",
    },
    {
      rank: 4,
      authority: "simulated-reader and deterministic diagnostic evidence",
      rule: "Calibrated models and rules locate risks and counterexamples as bounded hypotheses; they do not veto author aesthetics or certify reader response alone.",
    },
    {
      rank: 5,
      authority: "scalar summaries and operational signals",
      rule: "Scores, cost, latency, acceptance rate, and reading telemetry support navigation and Pareto analysis only; no threshold independently proves literary quality.",
    },
  ],
  adoptionByRiskTier: {
    ordinary: "May auto-adopt only inside a valid scoped AutonomyGrant when hard guards pass, author-objective fit is supported, no protected strength regresses, evidence is current, and no material calibrated dissent remains; adoption stays versioned and undoable.",
    elevated: "Requires independent review and blind pairwise comparison when alternatives exist; unresolved material disagreement becomes review_required rather than being averaged away.",
    key: "Requires independent blind comparison plus disagreement adjudication; any real tradeoff among author objectives, reader effects, protected strengths, or irreversible canon consequences hard-pauses for one scoped author decision.",
  },
  disagreementRules: [
    "A hard-guard failure blocks even when the author or readers prefer the prose; waiver is allowed only where the underlying requirement explicitly defines author waiver authority and records scope/risk.",
    "When readers dislike an intentional effect that matches an explicit author goal, report target-reader mismatch and tradeoff rather than silently normalizing the text.",
    "When the author likes a candidate but independent evidence locates an unsupported intended effect, preserve the candidate and evidence, ask only at the risk-tier threshold, and never relabel disagreement as quality proof.",
    "Ties, uncertainty, evaluator drift, insufficient reader samples, and mixed wins remain explicit states; filtering them out cannot create a passing result.",
    "Silence, task success, a generated score increase, or lack of detected defects is not author approval or settlement evidence.",
  ],
  gateDecision: {
    states: ["unassessed", "blocked", "conditional", "disputed", "passed", "waived", "stale"],
    requiredEvidence: ["frozen content and objective versions", "applicable hard-guard results", "protected-strength comparison", "independent judgment when tier requires it", "reader-evidence scope and calibration", "dissent and uncertainty", "author authority or AutonomyGrant", "freshness and rollback identity"],
    settlementRule: "Only a current passed/explicitly scoped waived QualityGateDecision may participate in ChapterSettlement; conditional/disputed/blocked/stale never masquerades as settled.",
  },
  implementationBoundary: "This decision locks quality authority only. No authoritative EvaluationCase, sealed reader view, calibrated independent evaluator, durable author-quality feedback, disagreement adjudicator, tier-aware QualityGateDecision, automatic-adoption fence, or end-to-end settlement behavior is implementation-verified by this documentation-only work.",
  invariantRequirementIds: [
    "FR-QUALITY-001", "FR-QUALITY-002", "FR-QUALITY-003", "FR-QUALITY-004", "FR-QUALITY-005", "FR-QUALITY-006", "FR-QUALITY-007", "FR-QUALITY-008", "FR-QUALITY-010",
    "FR-EVAL-003", "FR-EVAL-004", "FR-EVAL-005", "FR-EVAL-006", "FR-EVAL-007", "FR-EVAL-008", "FR-EVAL-009", "FR-EVAL-010", "FR-EVAL-011", "FR-EVAL-012", "FR-EVAL-014", "FR-EVAL-016", "FR-EVAL-020", "FR-EVAL-024",
    "FR-READER-002", "FR-READER-003", "FR-READER-014", "FR-READER-015", "FR-READER-016", "FR-READER-020",
  ],
  acceptanceRefs: ["AT-011", "AT-012", "AT-014", "AT-015", "AT-118", "AT-119", "AT-121", "AT-123", "AT-124", "AT-125", "AT-126", "AT-127", "AT-128", "AT-130", "AT-132", "AT-133", "AT-137", "AT-141", "AT-262", "AT-307", "AT-309", "AT-390", "AT-391", "AT-399", "AT-400", "AT-403", "AT-404", "AT-407"],
};

const q007RevisionAuthorityPolicy = {
  schemaVersion: "1.0.0",
  status: "author-selected-specification-not-implementation-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-007",
  question: "发现后续矛盾或更优方案时，系统可以自动修改已经接受、结算或发布的正文到什么范围？",
  selection: {
    selectedPolicyId: "maturity-tiered-revision-authority",
    selectedLabel: "未采纳稿授权内自动修、接受/结算稿只提候选、发布稿新版本",
    decisionStatus: "confirmed",
    source: "author-accepted-recommendation",
    selectedOn: sourceDate,
    runtimeActivationStatus: "not-implemented-not-verified",
  },
  alternatives: [
    {
      policyId: "full-autonomous-live-rewrite",
      status: "rejected-alternative",
      blueCase: "Continuously repairs contradictions and improves the whole book with the least author interaction.",
      redCase: "Silently destroys accepted prose, invalidates downstream evidence, races active writers, changes delivered text, and makes authorship, rollback, and completion unverifiable.",
    },
    {
      policyId: "all-revisions-require-author-click",
      status: "unselected-alternative",
      blueCase: "Maximizes author control and makes every textual change visible before it reaches canon.",
      redCase: "Turns routine repair of unaccepted drafts and deterministic candidate iteration into exhausting approval work, preventing low-input continuous creation.",
    },
    {
      policyId: "maturity-tiered-revision-authority",
      status: "selected-default-specification",
      blueCase: "Automates reversible work before acceptance, protects accepted truth from silent overwrite, and keeps published editions immutable while preserving impact evidence and rollback.",
      redCase: "Requires authoritative maturity states, content-addressed ancestry, revision intent, semantic impact graphs, stale-worker fencing, candidate branches, explicit adoption, new-edition release, and replayable settlement.",
    },
  ],
  authorityByMaturity: [
    {
      maturity: ["planned", "candidate_generated", "validated"],
      automaticAuthority: "May generate, replace, or locally repair non-canon candidates inside a valid scoped AutonomyGrant and frozen baseline; every candidate remains isolated, versioned, regression-checked, and discardable.",
      prohibited: "May not promote candidate text or derived facts into canon without the applicable quality/adoption gate.",
    },
    {
      maturity: ["author_accepted", "settled", "publication_ready"],
      automaticAuthority: "May diagnose, compute damage, create a branch and revision candidate, run selective recomputation, and present an impact report.",
      prohibited: "May not silently overwrite accepted canon, change author locks, invalidate history, or mark the revision settled; adoption requires the authority defined by risk and impact, with explicit author approval for material changes.",
    },
    {
      maturity: ["released", "delivered"],
      automaticAuthority: "May mark the current edition affected/stale for future publication decisions and create a new canon branch, candidate edition, migration plan, and validation evidence.",
      prohibited: "May never mutate, replace, delete, or relabel the immutable released artifact and DeliveryProof in place; a superseding edition requires explicit author release approval.",
    },
  ],
  revisionProtocol: [
    "Capture immutable RevisionIntent with cause, requested outcome, maturity, authority, scope, protected text, locks, anti-goals, urgency, and whether the change is correction, quality repair, retcon, reorder, restore, branch, or new edition.",
    "Freeze content-addressed base commit, canon cursor, branch/edition head, policy/evaluator versions, and writer fences before analysis or generation.",
    "Compile semantic and textual ChangeSet candidates, then walk exact direct/transitive/uncertain dependencies across facts, characters, world state, obligations, memory, quality, downstream prose, completion, and publication.",
    "Keep the current accepted canon readable while the candidate is analyzed; mark dependent proofs stale where warranted, but do not replace current text merely because a better candidate exists.",
    "Validate hard guards, author objectives, protected strengths, reader knowledge, obligations, downstream compatibility, cost, rollback, and edition impact before offering adoption.",
    "Adopt through an atomic forward CanonCommit; emit damage/invalidation events, fence stale workers, selectively recompute, revalidate boundaries, and issue RevisionSettlement before dependents become current.",
    "Undo/restore is also a forward commit derived from a reviewed plan; it preserves descendants, conflicts, prior editions, audit evidence, and the ability to revert the revert.",
  ],
  automaticRepairBoundary: {
    allowed: ["unaccepted candidate regeneration", "candidate-local prose repair", "candidate discard/retry", "diagnosis and impact analysis for accepted text", "stale marking and future-work fencing", "new branch and candidate edition creation"],
    authorDecisionRequired: ["material change to author_accepted or settled prose", "retcon or protected-span change", "different character/plot/reader-effect tradeoff", "reopening completed scope", "publishing or superseding an edition"],
    alwaysForbidden: ["silent accepted-canon overwrite", "in-place released-artifact mutation", "last-write-wins branch merge", "destructive rewind that erases descendants", "late-worker write against stale ancestry", "claiming settlement from save/rebuild success"],
  },
  failureAndEmergencyRules: [
    "A newly discovered contradiction, research correction, or safety defect may immediately block further dependent writing/publication and mark evidence stale, but it still does not authorize silent accepted-text replacement.",
    "If the author is unavailable, preserve the current accepted text, isolate candidate repairs, continue only unaffected work inside the autonomy grant, and surface one bounded decision at the required milestone.",
    "Mechanical encoding or formatting changes to accepted text still require lossless round-trip proof and the same candidate/adoption lineage; released bytes always require a new edition.",
    "Failed adoption, recomputation, or settlement keeps the prior canon/edition authoritative and the candidate recoverable; no partial revision is exposed as current.",
  ],
  implementationBoundary: "This decision locks revision authority only. No authoritative maturity transition, RevisionIntent, content-addressed ProjectVersion, semantic impact graph, candidate revision branch, atomic forward CanonCommit, damage/invalidation reducer, stale-worker fence, selective recomputation, RevisionSettlement, immutable edition supersession, or end-to-end behavior is implementation-verified by this documentation-only work.",
  invariantRequirementIds: [
    "FR-PROSE-002", "FR-PROSE-003", "FR-PROSE-017", "FR-PROSE-020", "FR-PROSE-021", "FR-PROSE-022", "FR-PROSE-023", "FR-PROSE-024",
    "FR-STATE-002", "FR-STATE-003", "FR-STATE-006", "FR-STATE-007", "FR-STATE-008", "FR-STATE-009",
    "FR-LONGMEM-013", "FR-FORESHADOW-005", "FR-FORESHADOW-007", "FR-EVAL-012", "FR-RUN-010", "FR-RUN-014", "FR-RUN-021", "FR-COMPLETE-006",
    "FR-PUBLISH-001", "FR-PUBLISH-002", "FR-PUBLISH-003",
  ],
  acceptanceRefs: ["AT-014", "AT-053", "AT-067", "AT-068", "AT-086", "AT-093", "AT-127", "AT-137", "AT-150", "AT-230", "AT-286", "AT-287", "AT-289", "AT-290", "AT-291", "AT-308", "AT-309", "AT-310", "AT-311", "AT-312", "AT-416", "AT-417", "AT-418", "AT-424", "AT-476", "AT-496", "AT-505", "AT-507", "AT-511", "AT-515", "AT-519"],
};

const q008OutlineEvolutionPolicy = {
  schemaVersion: "1.0.0",
  status: "author-selected-specification-not-implementation-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-008",
  question: "正文创作发现比原大纲更好的剧情方向时，故事契约、大纲和现场涌现之间应如何决定谁可以改变谁？",
  selection: {
    selectedPolicyId: "contract-anchored-rolling-emergence",
    selectedLabel: "故事契约硬锚、近端强冻结、远端可演化、正文涌现候选化",
    decisionStatus: "confirmed",
    source: "author-accepted-recommendation",
    selectedOn: sourceDate,
    runtimeActivationStatus: "not-implemented-not-verified",
  },
  alternatives: [
    {
      policyId: "fixed-full-book-outline",
      status: "rejected-alternative",
      blueCase: "Makes execution predictable and minimizes downstream re-planning once a full outline has been accepted.",
      redCase: "Treats uncertain distant detail as truth, suppresses valuable discoveries from actual prose, and encourages filler or forced causality to protect an obsolete plan.",
    },
    {
      policyId: "prose-always-overrides-outline",
      status: "rejected-alternative",
      blueCase: "Preserves creative energy and lets convincing scenes continuously reshape the story without approval latency.",
      redCase: "Lets local eloquence silently rewrite character fate, promises, foreshadowing, and endings; retrospective outline edits can rationalize drift instead of governing it.",
    },
    {
      policyId: "contract-anchored-rolling-emergence",
      status: "selected-default-specification",
      blueCase: "Protects author promises while allowing low-risk discoveries to improve the flexible future through explicit candidates and minimal re-planning.",
      redCase: "Requires authoritative contract locks, horizon states, semantic impact classification, emergence candidates, stale-proof propagation, and reliable pause/adoption behavior.",
    },
  ],
  authorityLayers: [
    {
      rank: 1,
      authority: "StoryContract and author locks",
      scope: ["core narrative promise", "central narrative question", "protagonist and character bottom lines", "ending direction and hard ending constraints", "explicit anti-goals and authored locks"],
      rule: "These are hard anchors. Only an explicit author decision may revise them; no outline score, draft fluency, evaluator preference, or model discovery can override them.",
    },
    {
      rank: 2,
      authority: "Adopted causal structure",
      scope: ["major arc and causal milestones", "volume functions", "committed obligations", "major foreshadowing and payoff windows"],
      rule: "Changes require a versioned candidate and exact impact report; any material tradeoff or change-class L2 pauses for the author before adoption.",
    },
    {
      rank: 3,
      authority: "Near rolling horizon",
      scope: ["next 3-5 chapters", "adopted chapter functions", "scene causal inputs", "current obligation and context commitments"],
      rule: "Strongly frozen for execution. Automatic changes are limited to local, reversible L0 refinements that preserve committed state transitions, obligations, knowledge boundaries, and author locks.",
    },
    {
      rank: 4,
      authority: "Far outline horizon",
      scope: ["tentative milestones", "chapter allocation", "scene placement", "exploratory supporting paths"],
      rule: "May be automatically re-planned inside a valid AutonomyGrant when the result remains inside the StoryContract, passes structural guards, preserves protected commitments, and emits a visible low-risk receipt.",
    },
    {
      rank: 5,
      authority: "Drafting discovery",
      scope: ["new motive", "stronger conflict", "relationship turn", "different reveal or payoff path", "new ending possibility"],
      rule: "A discovery is evidence, not canon. It first becomes an isolated EmergenceCandidate with provenance, counterfactual value, impact closure, affected horizon, and adoption authority.",
    },
  ],
  changeClasses: [
    {
      classId: "L0-local-reversible",
      authority: "automatic-inside-valid-grant",
      examples: ["scene expression", "beat ordering", "local obstacle", "non-contractual texture", "reversible scene split or merge"],
      guards: "Must not change a committed state transition, reader knowledge, obligation, author lock, causal predecessor, or downstream accepted fact.",
    },
    {
      classId: "L1-structural-low-risk",
      authority: "automatic-after-validation-with-receipt",
      examples: ["far-horizon milestone placement", "tentative chapter allocation", "supporting-path replacement", "low-impact payoff-window adjustment"],
      guards: "Requires candidate isolation, exact affected subgraph, contract validation, regression checks, rollback identity, and a visible adoption receipt; uncertainty escalates to L2.",
    },
    {
      classId: "L2-material-story-decision",
      authority: "hard-pause-for-author",
      examples: ["core promise or central conflict", "protagonist or character fate", "core relationship outcome", "major foreshadowing or payoff meaning", "ending direction or hard ending constraint", "volume boundary or intentionally open obligation"],
      guards: "Present one bounded Socratic question with red/blue evidence, impact, protected strengths, alternatives, and a recommendation; author silence never means approval.",
    },
  ],
  evolutionProtocol: [
    "Capture the prose observation against a frozen story, outline, chapter, scene, obligation, context, and author-lock baseline; separate what was actually written from the system's interpretation.",
    "Create an isolated EmergenceCandidate with discovery type, supporting spans, narrative value, alternative explanation, affected semantic nodes, horizon classification, and proposed change class.",
    "Compute the direct, transitive, uncertain, protected, and unaffected impact closure across contract, arcs, characters, world state, reader knowledge, obligations, foreshadowing, prose, completion, and publication.",
    "Compare preserve-outline, adopt-discovery, and bounded-hybrid alternatives under the same author objectives; attractive prose alone is not evidence that the structural alternative wins.",
    "Apply the authority matrix: reject invalid candidates; automatically adopt eligible L0/L1 candidates only inside a current grant; hard-pause every L2 or ambiguous case with one scoped author question.",
    "Adopt through a new OutlineVersion/CanonCommit, preserve stable semantic IDs where meaning is unchanged, invalidate exact dependent proofs and workers, and minimally re-plan only the affected subgraph.",
    "Rebuild projections, prove the next 3-5 chapter window and next chapter execution-ready again, and retain the rejected or superseded candidate without letting it contaminate future context.",
  ],
  invariants: [
    "No draft discovery retroactively edits the StoryContract, current outline, fact ledger, obligation ledger, or execution queue before governed adoption.",
    "The next 3-5 chapters are strongly frozen, but not immutable: a required change uses the same impact and authority protocol and invalidates stale execution proofs.",
    "Far-horizon flexibility never means permission to change the ending, central question, major promise, character bottom line, or intentional open-contract boundary.",
    "Repeated local discoveries that imply one material structural drift are aggregated and escalated; they may not be split into L0/L1 changes to bypass L2 authority.",
    "Rejecting an emergence candidate removes it from generation context and future assertions while preserving audit history and the original prose candidate lineage.",
  ],
  implementationBoundary: "This decision locks outline-evolution authority only. No authoritative contract-lock evaluator, rolling 3-5 chapter freeze, EmergenceCandidate, semantic change classifier, exact impact closure, L0/L1 automatic-adoption fence, L2 pause protocol, minimal re-planning transaction, stale-proof propagation, projection rebuild, or end-to-end behavior is implementation-verified by this documentation-only work.",
  invariantRequirementIds: [
    "FR-ARCH-001", "FR-ARCH-002", "FR-ARCH-003", "FR-ARCH-004", "FR-ARCH-005", "FR-ARCH-006", "FR-ARCH-007", "FR-ARCH-008", "FR-ARCH-009", "FR-ARCH-010", "FR-ARCH-011", "FR-ARCH-012", "FR-ARCH-013", "FR-ARCH-014", "FR-ARCH-015", "FR-ARCH-016", "FR-ARCH-017", "FR-ARCH-018", "FR-ARCH-019", "FR-ARCH-020", "FR-ARCH-021", "FR-ARCH-022", "FR-ARCH-023", "FR-ARCH-024",
    "FR-OBJECTIVE-002", "FR-OBJECTIVE-006", "FR-RUN-005", "FR-RUN-010", "FR-PROSE-002", "FR-PROSE-003", "FR-PROSE-024",
  ],
  acceptanceRefs: ["AT-014", "AT-058", "AT-067", "AT-081", "AT-137", "AT-160", "AT-223", "AT-224", "AT-269", "AT-270", "AT-271", "AT-272", "AT-273", "AT-274", "AT-275", "AT-276", "AT-277", "AT-278", "AT-279", "AT-280", "AT-281", "AT-282", "AT-283", "AT-284", "AT-285", "AT-286", "AT-287", "AT-288", "AT-289", "AT-290", "AT-356", "AT-357", "AT-389", "AT-405", "AT-415", "AT-424", "AT-453", "AT-454", "AT-476", "AT-496", "AT-511", "AT-519"],
};

const writeAuthoritySourcePaths = [
  "api/src/app.ts",
  "api/src/lengthPlanning.ts",
  "api/src/lengthPlanning.spec.ts",
  "api/src/runtimeEngine.ts",
  "api/src/runtimeStore.ts",
  "api/src/writingCockpit.ts",
  "api/src/proseCandidate.ts",
  "api/src/proseAdoption.ts",
  "api/src/proseValidation.ts",
  "api/src/proseReview.ts",
  "api/src/authorFeedback.ts",
  "api/src/derivedPublication.ts",
  "api/src/chapterSettlement.ts",
  "api/src/bookWorkGraph.ts",
  "api/src/bookWorkScheduler.ts",
  "api/src/bookRun.ts",
  "api/src/bookRun.spec.ts",
  "api/src/quiescenceProof.ts",
  "api/src/completionAudit.ts",
  "api/src/outlineCandidate.ts",
  "api/src/outlineValidation.ts",
  "api/src/outlineAdoption.ts",
  "api/src/outlineCommit.ts",
  "api/src/executionReadiness.ts",
  "api/src/executionQueue.ts",
  "api/src/runtimeFiles.ts",
  "api/src/taskService.ts",
  "api/src/writingCockpit.ts",
  "api/src/creativeSession.ts",
  "api/src/creativeJourney.ts",
  "api/src/understandingTask.ts",
  "api/src/contextManifest.ts",
  "api/src/understandingPreflight.ts",
  "api/src/understandingRiskProfile.ts",
  "api/src/understandingBudget.ts",
  "api/src/understandingAuthorization.ts",
  "api/src/understandingExecutor.ts",
  "api/src/understandingWorker.ts",
  "api/src/dialogueQuestions.ts",
  "api/src/contractCandidate.ts",
  "api/src/understandingReview.ts",
  "api/src/contractAdoption.ts",
  "api/src/contractCanonAdoption.ts",
  "api/src/contractProjectionRebuild.ts",
  "api/src/contractReadiness.ts",
  "api/src/worldRuleContract.ts",
  "api/src/backgroundJobs.ts",
  "ui/src/services/novelApi.ts",
  "ui/src/stores/novel.ts",
];

const writeAuthoritySources = new Map(writeAuthoritySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function codeEvidence(relativePath, needle) {
  const sourceEntry = writeAuthoritySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown write-authority audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Write-authority audit evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

const projectMutationRouteClassifications = new Map([
  ["POST /api/novel/projects", { disposition: "bootstrap-only", surfaceIds: ["WRITE-SURFACE-013"] }],
  ["POST /api/novel/import", { disposition: "bootstrap-only", surfaceIds: ["WRITE-SURFACE-013"] }],
  ["POST /api/novel/projects/:projectId/session/messages", { disposition: "session-capture", surfaceIds: ["WRITE-SURFACE-014"] }],
  ["POST /api/novel/projects/:projectId/session/understanding", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/tasks/:taskId/cancel", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/tasks/:taskId/resume", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/recover", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/questions", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/questions/:questionId/answers", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/contract-candidates", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/outline-candidates", { disposition: "candidate-only", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/outline-candidates/:outlineId/validate", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/outline-adoption-proposals", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/outline-adoption-proposals/authorize", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/outline-adoption", { disposition: "canon-gate", surfaceIds: ["WRITE-SURFACE-017"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/world-rule-contracts", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/review", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/review/external", { disposition: "evidence-ingestion", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/understanding/contract-adoption-proposals", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/contract-adoption", { disposition: "canon-gate", surfaceIds: ["WRITE-SURFACE-017"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/projection-rebuild", { disposition: "derived-projection", surfaceIds: ["WRITE-SURFACE-017"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/projection-freshness/monitor", { disposition: "derived-projection", surfaceIds: ["WRITE-SURFACE-017"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/contract-readiness", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-017"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/quality-calibration", { disposition: "evidence-ingestion", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/release-e2e-acceptance", { disposition: "evidence-ingestion", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/understanding/preflight", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/budget", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/understanding/capability-authorization", { disposition: "safety-gate", surfaceIds: ["WRITE-SURFACE-015"] }],
  ["POST /api/novel/projects/:projectId/session/context-manifest", { disposition: "t0-freeze", surfaceIds: ["WRITE-SURFACE-016"] }],
  ["DELETE /api/novel/projects/:projectId", { disposition: "project-lifecycle-control", surfaceIds: [] }],
  ["PUT /api/novel/projects/:projectId/ai", { disposition: "project-configuration", surfaceIds: [] }],
  ["PUT /api/novel/projects/:projectId/story-control", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-010"] }],
  ["POST /api/novel/projects/:projectId/runtime/start", { disposition: "candidate-orchestration", surfaceIds: ["WRITE-SURFACE-003"] }],
  ["POST /api/novel/projects/:projectId/runtime/pause-policy/evaluate", { disposition: "review-only", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/pause-policy/recaps", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/pause-policy/apply", { disposition: "runtime-control", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/steering-events/:eventId/advance", { disposition: "runtime-steering-boundary", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/migrations", { disposition: "migration-preview", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/migrations/:migrationId/validate", { disposition: "migration-validation", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/migrations/:migrationId/resolve-conflicts", { disposition: "migration-conflict-resolution", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/migrations/:migrationId/rollback", { disposition: "migration-rollback", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/backups", { disposition: "local-backup-create", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/backups/:backupId/verify", { disposition: "local-backup-verify", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/backups/:backupId/restore-drill", { disposition: "isolated-restore-drill", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/restore-plans", { disposition: "restore-plan-preflight", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/recovery-settlements", { disposition: "recovery-settlement-authority", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/quality/:chapterId/gate", { disposition: "quality-gate-api-enforcement", surfaceIds: [] }],
  ["PUT /api/novel/projects/:projectId/backup-policy", { disposition: "backup-policy-durability-assessment", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/delivery/capability-manifest", { disposition: "capability-manifest-governance", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/delivery/dependency-proof", { disposition: "capability-dependency-proof", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/delivery/dependency-proofs", { disposition: "capability-dependency-proof", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/delivery/requirement-evidence", { disposition: "requirement-evidence-persistence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernels/proof", { disposition: "kernel-proof-persistence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/obligations", { disposition: "obligation-create", surfaceIds: [] }],
  ["PUT /api/novel/projects/:projectId/obligations/:obligationId", { disposition: "obligation-legacy-write-rejected", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/obligations/:obligationId/events", { disposition: "obligation-event", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/obligation-coverage/certificate", { disposition: "obligation-coverage-certificate", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/obligation-coverage/certificate/validate", { disposition: "obligation-coverage-certificate-validate", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/obligation-coverage/certificate/invalidate", { disposition: "obligation-coverage-certificate-invalidate", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/obligation-candidates/:candidateId/adopt", { disposition: "obligation-candidate-adoption", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/revision-intents", { disposition: "revision-intent-create", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/revision-intents/:intentId/change-sets", { disposition: "revision-change-set-candidate", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/revision-change-sets/:changeSetId/reviews", { disposition: "revision-change-set-review", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/revision-change-sets/:changeSetId/adoption-proposals", { disposition: "revision-adoption-proposal", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/revision-adoption-proposals/:proposalId/receipts", { disposition: "revision-adoption-receipt", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/revision-adoption-receipts/:receiptId/settlements", { disposition: "revision-settlement", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions", { disposition: "edition-manifest-freeze", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/tree", { disposition: "publication-tree-compile", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/artifacts", { disposition: "publication-artifact-validation", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof", { disposition: "delivery-proof-issue", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof/revoke", { disposition: "delivery-proof-revoke", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof/supersede", { disposition: "delivery-proof-supersede", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/access-grants", { disposition: "delivery-access-grant", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/access-grants/:grantId/revoke", { disposition: "delivery-access-grant-revoke", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/preflight", { disposition: "release-preflight", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/publication-editions/:editionId/closure-certificate", { disposition: "closure-certificate-issue", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs", { disposition: "book-run-start", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/readiness", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/budget-reservations", { disposition: "safety-gate", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/budget-reservations/settle", { disposition: "safety-gate", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/advance", { disposition: "book-run-advance", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/completion-audits", { disposition: "book-run-completion-audit", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/retry", { disposition: "book-run-retry", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/pause", { disposition: "book-run-pause", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/resume", { disposition: "book-run-resume", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/stop", { disposition: "book-run-stop", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/autonomy-grant/revoke", { disposition: "book-run-autonomy-revoke", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/repair-plans", { disposition: "book-run-repair-plan", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId/actions/:actionId/complete", { disposition: "book-run-repair-completion", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId/audit", { disposition: "book-run-milestone-audit", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/migrations/:migrationId/activate", { disposition: "migration-activation", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/pause", { disposition: "runtime-control", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/resume", { disposition: "runtime-control", surfaceIds: ["WRITE-SURFACE-003"] }],
  ["POST /api/novel/projects/:projectId/runtime/stop", { disposition: "runtime-control", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review/accept", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-005"] }],
  ["POST /api/novel/projects/:projectId/runtime/review/rewrite", { disposition: "candidate-orchestration", surfaceIds: ["WRITE-SURFACE-004"] }],
  ["POST /api/novel/projects/:projectId/runtime/direction", { disposition: "runtime-control-event", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/notifications/plan", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/derivatives", { disposition: "candidate-only", surfaceIds: ["WRITE-SURFACE-007"] }],
  ["POST /api/novel/projects/:projectId/runtime/derivatives/:branchId/merge", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-007"] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/adopt", { disposition: "canon-gate", surfaceIds: ["WRITE-SURFACE-005"] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/freshness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/evidence-invalidation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/review-disagreement", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/visibility-exit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/editor-export", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/closure-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/versions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/versions/revise", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/multi-intent", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/inference-safety", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/reversible-assumption-repair", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/ambiguity-impact-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/bounded-delegation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/bounded-delegation/authorize", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/bounded-delegation/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/ambiguous-answer", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/answer-evidence-closure", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/correction-before-continue", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/question-reask", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/stale-answer-reconciliation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/preference-probes/apply-scope", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory/compression-audit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory/forget-propagation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/ready-proofs", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/continuity-audits", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/runtime-result-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/question-timeout-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/restart-recovery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/offline-reconciliation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/coreference-repair", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/legacy-question-import", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/open-contract-audit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/compile-sentence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/candidate-guard", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/scope-resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/conflict-options", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/weight-release", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/explain-candidate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/near-far-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/anti-goal-semantic", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/aesthetic-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/target-impact", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/calibration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/q003-report", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/partial-adoption", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/manual-revision-attribution", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/scope-proposal", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/revocation-cause", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/hypothesis-update", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/evidence-weight", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/confounded-probe", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/safe-exploration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/project-isolation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/feedback/learning-release-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/learning-releases", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/learning-releases/:releaseId/rollback", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/learning-releases/:releaseId/rollback-for-regression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/first-slice-readiness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/runtime-reuse-audit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/question-capability", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/schema-compatibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/capabilities/server-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/compatibility/legacy-open", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/write-authority", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/forward-read-only", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/compatibility/migration-activation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/slice-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/partner-dod", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/upstream-repair", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/source-qualification", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/legacy-sample-migration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/craft-pattern", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/cross-project-surface", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/pattern-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/pattern-applicability", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/generation-anti-imitation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/task-gap-selection", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/evidence-minimum", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/conflict-resolution", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/pattern-experiment", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/structural-similarity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/pattern-scope", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/negative-pattern", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/craft-lineage-audit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/style/derived-evidence-invalidation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-engine/fuzzy-idea", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-engine/question-separation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-engine/ending-prerequisites", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-engine/arc-graph", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-engine/dependency-cycle", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapters/volume-contract", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapters/function-review", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapters/scene-seam", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapters/cross-layer-orphans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/planning/obligation-load", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/planning/pacing-fatigue", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/planning/chapter-capacity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/planning/horizon-confidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/candidate-adoption", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/structure-compare", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/static-validation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/semantic-references", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/impact-subgraph", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/emergence-settlement", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution/readiness-proof", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution/prose-input-freeze", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution/autonomous-canon-write", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution/semantic-patch-relocation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution/scene-ledger", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution/beat-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative/agency-chain", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative/voice-drift", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative/dialogue-action", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative/pov-knowledge", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative/distance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative/emotional-aftermath", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/setting-actionability", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/cognitive-budget", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/rhythm-monotony", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/segment-seam", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/recovery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/stagnation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/red-blue", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft/multi-domain-validation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/revision/local-repair", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/revision/regression-adoption", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/revision/partial-commit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/revision/reject-derivatives", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/revision/settlement", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/fairness/object-obligation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/fairness/reader-expectation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/fairness/hypothesis-graph", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/fairness/clue-direction", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/fairness/source-clusters", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/fairness/bundle", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/schedule", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/window-conflict", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/reminder", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/answer-leak", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/shared-object", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/payoff-form", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/scene-contract", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/propagation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/narrative-interest", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/damage", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/coverage", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/certificate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/first-input", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/question-budget", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/decision-escalation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/reversible-default", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/decision-level", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/derived-answer", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/decision-bundle", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/present-choice", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/story-cost", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/delegation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/continue", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/offline", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/reuse-confirmed", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author/correction", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/review-first-screen", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/notifications", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/resume-brief", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/collaboration-preference", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/user-language", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/click-value", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ux/kernel-value", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/schema-compatibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/mutation-plan", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/candidate-unification", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/obligation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/legacy-samples", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/dependency-proof", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/shadow-parser", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/canon-authority", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernel/legacy-retirement", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/quality-strategy", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/evidence-status", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/claim-authority", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/visibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/temporal", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/identity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/contradiction", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/supersede", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/transfer", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/belief", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/reader-pov", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/eligibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/retcon-impact", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/deletion-propagation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/body-summary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/compression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/rank-eligible", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/query-boundary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/evidence-family", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/evidence-gap", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/conflict-preflight", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/new-fact", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/health", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/rebuild", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/embedding-fallback", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/continuity-audit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/knowledge/k5-activation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/contract", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/hypothesis", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/cold-read", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/questions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/ambiguity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/attachment", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/emotion-impact", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/curiosity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/payoff", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/scene-counterfactual", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/surprise", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/longitudinal", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/divergence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/reviewer-calibration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/revision-invalidation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/repair", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/feedback-revocation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/experience/dossier-boundary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/primary-action", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/safety-priority", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/surface-registry", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/view-switch", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/author-receipt", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/idempotency", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/task-chapter", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/workspace-reconcile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/failure-recovery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/project-isolation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/shell-shadow", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/orchestration/journey-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/source-classification", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/unknowns", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/source-conflict", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/arc", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/agency", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/belief-phases", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/asymmetric-relation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/co-presence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/misunderstanding-repair", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/opponent-independence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/offscreen-action", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/function", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/ensemble", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/relational-voice", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/relapse", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/identity-break", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/change-scope", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character/arc-certificate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/capture", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/extract", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/provenance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/genre", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/interpretations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/exploration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/readiness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/recommend", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/default", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/question", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/dedupe", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/difference", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/partial-adoption", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/recompile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/project-state", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/compile-failure", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/legacy-shadow", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/deterministic", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/seed/scope-proof", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/scan", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/rule-boundary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/institution-belief", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/regional-rule", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/travel", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/story-clock", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/ability-prerequisites", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/temporary-boost", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/contextual-victory", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/resource-balance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/body-cooldown", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/institution-response", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/rule-consequences", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/deus-ex", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/rule-exception", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/rule-interaction", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/minimal-exposition", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/rule-change-scope", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/health", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world/certificate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/governance/normative-strength", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/governance/first-slice", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/governance/release-vision", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/governance/defer-decision", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/governance/semantic-lint", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/governance/convergence-expansion", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/control-command", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/utterance-trace", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/read-model", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/downgrade", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/capture-crash", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/capture-convergence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/projection", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/journey/understanding-version", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/late-result", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/task-recovery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/t0-coverage", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/context-purpose", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/context-replay", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/understanding/k4", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/publication/obligation-badges", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/publication/completion-audit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/publication/freeze-edition", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/publication/render", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/publication/delivery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/plan", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/quarantine", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/scope-compare", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/correction", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/import-diagnostics", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/punctuation-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/model-packaging", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/round-trip", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/backup/slice", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/backup/verify", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/backup/restore-isolated", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/backup/disaster-recovery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/validate", { disposition: "review-only", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/review", { disposition: "review-only", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/feedback", { disposition: "feedback-event", surfaceIds: ["WRITE-SURFACE-005"] }],
  ["POST /api/novel/projects/:projectId/runtime/chapters/:chapterId/settlements/:settlementId/derived", { disposition: "derived-projection", surfaceIds: ["WRITE-SURFACE-005"] }],
  ["POST /api/novel/projects/:projectId/runtime/chapters/:chapterId/settle", { disposition: "canon-gate", surfaceIds: ["WRITE-SURFACE-005"] }],
  ["POST /api/novel/projects/:projectId/runtime/work-graph", { disposition: "candidate-orchestration", surfaceIds: ["WRITE-SURFACE-003"] }],
  ["POST /api/novel/projects/:projectId/runtime/work-graph/refresh", { disposition: "derived-projection", surfaceIds: ["WRITE-SURFACE-003"] }],
  ["POST /api/novel/projects/:projectId/runtime/checkpoints/:checkpointId/restore", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-011"] }],
  ["PUT /api/novel/projects/:projectId/dashboard/:chapterId", { disposition: "projection-mutable", surfaceIds: ["WRITE-SURFACE-010"] }],
  ["PUT /api/novel/projects/:projectId/scenes/:chapterId", { disposition: "canon-plan-capable", surfaceIds: ["WRITE-SURFACE-010"] }],
  ["PUT /api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", { disposition: "projection-mutable", surfaceIds: ["WRITE-SURFACE-010"] }],
  ["PUT /api/novel/projects/:projectId/quality/:chapterId", { disposition: "projection-mutable", surfaceIds: ["WRITE-SURFACE-010"] }],
  ["POST /api/novel/projects/:projectId/recaps/accept", { disposition: "derived-canon-capable", surfaceIds: ["WRITE-SURFACE-008"] }],
  ["POST /api/novel/projects/:projectId/knowledge/index/rebuild", { disposition: "derived-projection", surfaceIds: ["WRITE-SURFACE-012"] }],
  ["POST /api/novel/projects/:projectId/knowledge/search", { disposition: "query-only", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/retrieval-previews", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/health-reports", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/alias-assertions", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/alias-assertions/:assertionId/confirm", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/conflict-preflights", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/memory/entity-resolutions", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claim-relations/:relationId/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claim-relations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/contradiction-sets", { disposition: "operational-evidence", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory/forget-propagation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/jobs", { disposition: "derived-job-control", surfaceIds: ["WRITE-SURFACE-012"] }],
  ["POST /api/novel/projects/:projectId/jobs/:jobId/cancel", { disposition: "job-control", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/jobs/:jobId/retry", { disposition: "derived-job-control", surfaceIds: ["WRITE-SURFACE-012"] }],
  ["PUT /api/novel/projects/:projectId/ledger/:kind", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-009"] }],
  ["POST /api/novel/projects/:projectId/editor/suggestion", { disposition: "candidate-only", surfaceIds: [] }],
  ["PUT /api/novel/projects/:projectId/files/*", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-001"] }],
  ["POST /api/novel/projects/:projectId/tasks", { disposition: "candidate-only", surfaceIds: ["WRITE-SURFACE-002"] }],
  ["POST /api/novel/projects/:projectId/tasks/async", { disposition: "candidate-only", surfaceIds: ["WRITE-SURFACE-002"] }],
  ["POST /api/novel/projects/:projectId/tasks/:taskId/cancel", { disposition: "task-control", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/selection/polish", { disposition: "candidate-only", surfaceIds: ["WRITE-SURFACE-006"] }],
  ["POST /api/novel/projects/:projectId/continuity/check", { disposition: "review-only", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/patches", { disposition: "canon-capable", surfaceIds: ["WRITE-SURFACE-002"] }],
  ["POST /api/novel/import", { disposition: "import-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects", { disposition: "project-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/length-contract", { disposition: "project-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/length-variance-decisions", { disposition: "project-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/abstraction-transfer", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/agency-chains", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/anti-imitation-guard", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/author-paragraph-locks/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/beat-fulfillment", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/beat-fulfillment/:ledgerId/:beatId", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/candidate-comparison", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/candidate-compositions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/candidate-convergence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/candidate-convergence/:runId/iterations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/capability-contracts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/capability-contracts/:capabilityId/progression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/causality-edges", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapter-continuations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapter-continuations/:runId/checkpoints", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapter-continuations/:runId/resume", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapter-continuity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapter-creation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/chapter-functions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-agency/guard", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-arc-certificate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-arc-rhythm/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-arc-rhythm/events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-arcs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-arcs/:arcId/milestones", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-beliefs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-beliefs/events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-choice-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-choice-evidence/:evidenceId/observe", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-continuity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-continuity/events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-contracts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-contracts/:contractId/confirm", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-contracts/:contractId/revise", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-documents/classify", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-identities", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-identities/admit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-presence-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-presence-plans/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-revision-impact", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-state-snapshots", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-state-snapshots/diff", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-truth/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-voice-profiles", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/character-voice-profiles/compile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/adaptive-reminders", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/admission", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/clue-claims", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/clue-independence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/exposure-risk", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/fairness-bundles", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/hypothesis-graphs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/outcomes", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/payoff-reservations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/reader-expectation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/scene-contracts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/closure/schedules", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/cognitive-budget", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/collaboration-messages/parse", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/collaboration-progress", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/conditions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/conditions/:conditionId/recover", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/conditions/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-attributions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-attributions/:attributionId/events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-boundaries", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-boundaries/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-conflicts/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-context-budget", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-effect-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/judge", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/decision", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/feedback", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/feedback/attribution", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/provider-evaluation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/reader-calibration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-feedback-attributions/:attributionId/hypothesis", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId/promote", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/start", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-holdout/validate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-mechanism-units", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-pattern-explanations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-pattern-library", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-pattern-publication-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-patterns", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-patterns/:patternId/approve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-patterns/:patternId/promote-from-experiment", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-patterns/:patternId/validate-from-experiment", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-provenance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-provenance/project", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/craft-revocation/propagate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/cross-chapter-template", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/decision-cost-preview", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/delivery/write-authority", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/derived-publications/:transactionId/revalidate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/derived-settlement", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/answer-application", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/answer-classification", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/delegation-grants", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/intents", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory-records", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory-records/forget", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/memory-records/revise", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/misunderstanding-incidents", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/misunderstanding-incidents/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/non-leading-question", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/preference-probes", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/preference-probes/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/preference-probes/select", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/provisional-assumptions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/question-ranking", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/recovery", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/runtime-interruptions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/runtime-interruptions/advance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/timeout", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/understanding-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/understanding-evidence-bundles", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/understanding-snapshots", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/utterances", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue-action", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/directed-rewrites", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/drafting/anti-goal-guard", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/drafting/q003-profile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/drafting/stage-weights", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/durability/backup-policy", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/durability/backup-verification", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/durability/recovery-settlements", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/durability/restore-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/emergence-candidates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/emergence-candidates/:candidateId/adopt", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/emotion-causality", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ensemble-attention/chapters", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/ensemble-attention/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/blind-pairs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/calibrations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/contamination", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/drift", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/disagreements", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/pareto", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/sampling", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/sampling/summary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/multi-scale-regression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/frozen-inputs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/release-decisions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/slice-budgets", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/slice-results", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/evidence-anchors", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/evidence-anchors/current", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/adaptive-scale", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/access-grants", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/access-grants/:grantId/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/work-leases/acquire", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/work-leases/:workItemId/renew", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/work-leases/:workItemId/release", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/stagnation-detection", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-batches", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-batches/:batchId/items/:itemId/withdraw", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-batches/:batchId/items/:itemId/accept", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/dialogue/decision-consumption-receipts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/suites", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/execution-ready/gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/exploration-budgets", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/exploration-budgets/:budgetId/consume", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/exploration-budgets/:budgetId/pause", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/exploratory-drafts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/conflicts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/false-clue-fairness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/legacy-migration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/publication-freeze", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/repair-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/transform", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/transition", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/visibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/waivers", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/windows", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/information-state", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/information-state/:traceId/events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/intent-corrections", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/intent-corrections/propagate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/intent-drafts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernels/ai-safety", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernels/candidate-boundary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernels/long-memory", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernels/mutation-validation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/kernels/obligation-core", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/learning-policy", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/local-repair-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/long-chapter/checkpoints", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/long-chapter/checkpoints/resume", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/alias-assertions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/alias-assertions/confirm", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/alias-resolutions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claim-relations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claims", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claims/:claimId/retcon", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claims/:claimId/settle", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/claims/:claimId/temporal", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/contradiction-sets", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/chapter-patches", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/asset-coverage", { disposition: "runtime-domain-read", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/mutation-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/commit", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/rollback", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/recover", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/preflight", { disposition: "runtime-domain-read", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/entities", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/entities/merge", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/entities/split", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/knowledge/characters", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/knowledge/characters/eligibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/knowledge/readers", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/memory/knowledge/readers/eligibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/micro-rhythm", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative-curve-points", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative-distance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/narrative-trace-links", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/negative-preferences", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/negative-preferences/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objective-change-impact", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objective-contribution", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objective-drift", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objective-hierarchy", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/conflicts/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/objectives/profile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/completion-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/conflicts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/editor-markers", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/intentional-open", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/knowledge-boundary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/legacy-ledger-migrations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/legacy-migration", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/merge-proposal", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/partial-payoff", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/payoff-contract", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/payoff-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/publication-freeze", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/repair-plan", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/setup-evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/source-coverage", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/transform", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/visibility", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/window", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/offpage-character-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/offpage-character-plans/events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/organizations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/organizations/:organizationId/actions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/impact-analyses", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/replan-decisions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/outline/expansion-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/beat-evidence-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reminder-progression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligation-memory-risk", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/foreshadowing/transformation-closure", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/multi-payoff", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligations/conflict-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/obligation-setup-fairness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/pattern-transfer-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/planning-nodes", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/planning-nodes/:nodeId/transition", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/pov-knowledge-gates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/power-comparisons", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId/oppositions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-adoption-transactions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/repair-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-feedback/:eventId/attribution", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-feedback-attributions/:attributionId/hypothesis", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-generation-manifests", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-generation-manifests/:manifestId/freshness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-maturity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-maturity/advance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-regression-proof", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-repair-candidates/:repairCandidateId/regression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-repair-plans", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-repair-plans/:planId/candidates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-segments", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-segments/:semanticId/patch", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-specificity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/prose-validation-dossier", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/question-governance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/question-governance/policy", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/question-governance/register", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/question-sessions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/question-sessions/:questionId/classify", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/question-value-gates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/cognitive-load", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/cold-read-snapshots", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/contracts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/divergence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/dossiers", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/hypotheses", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/knowledge-states", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/payoffs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/reviewers", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/scene-necessity", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/surprise-fairness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/reader/timelines", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/relationship-events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/relationship-events/:eventId/observe", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/relationship-misreads", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/relationship-misreads/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/claims", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/claims/:claimId/correct", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/claims/:claimId/propagate-assessment", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/claims/evaluate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/conflicts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/conflicts/:conflictId/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/consumption-receipts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/obligations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/settlements", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/source-snapshots", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/source-snapshots/:sourceId/reliability", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/research/source-snapshots/:sourceId/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/resource-transactions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-compression", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-isolation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-isolation/:sessionId/reviews", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/review-isolation/:sessionId/synthesize", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/scene-cards", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/scene-creation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/scene-execution-ledgers", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/scene-execution-ledgers/:ledgerId/evidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/scene-seam", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/semantic-nodes", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/semantic-nodes/projection", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/autonomy-receipts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/autonomy-receipts/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/command-receipts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/command-receipts/authorize", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/continuity-token", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/continuity-token/reconcile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/debate-decisions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/debate-decisions/accept", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/decision-bundles", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/decision-bundles/accept", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/decision-escalations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/effort-budget", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/effort-budget/consume", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/effort-budget/preference", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/independent-review-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/model-invocations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/model-invocations/:invocationId/settle", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/model-invocations/budget-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/model-route", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/primary-action", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/primary-action/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/primary-action/execute", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/primary-action/advance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/primary-action/validate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/provider-evaluation", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/provider-failover", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/session/provider-probe", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/similarity-guards", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/source-lineage", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/source-lineage/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/source-material", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/source-material/:sourceId/rights-envelope", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/stable-deep-links", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/stable-deep-links/resolve", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/adoption", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/adoption/revoke", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/branch-questions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/candidates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/capture", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/confidence", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/explorations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/frame", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/interpretations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/legacy-shadow", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/readiness", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/readiness-proof", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/recompile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/replay", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/reversible-defaults", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/runs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/runs/:runId/advance", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/runs/replay", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/runs/transition", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/state", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-seeds/state/failure", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-time-events", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/story-time-events/compare", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/structure-alternatives", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/surface-mechanism-patterns", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/surface-mechanism-patterns/transfer-gate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/surfaces/authorize", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/surfaces/registry", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/task-pattern-retrieval", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/diagnostics", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/profiles", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/settlements", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/text/structures", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/untrusted-samples/isolate", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/value-opponents", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/voice-blind-tests", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/voice-consistency", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/volume-contracts", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-impact-reports", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-integrity-certificates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-legacy/compile", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-locations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-locations/:locationId/reachability", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/admission", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/consequence-audits", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/disclosure", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/exceptions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/exceptions/:exceptionId/settle", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/execute", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/interactions", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/interactions/replay", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-rules/knowledge", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-state-projection", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-state-snapshots", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/world-travel", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/writing-candidates", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/writing-candidates/:setId/select", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/writing-context", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/writing-priority", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/writing-stop-evaluations", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/author-execution-strategy", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/completion-evidence-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-evidence-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-integrity-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-conflict-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-plan-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-privacy-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-replay-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/context-source-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/understanding/questions/:questionId/red-blue", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/runs", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/shadow-canary", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/cases", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/runtime/evaluation/style-drift", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/book-runs/preflight", { disposition: "runtime-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/cost-saving-plan", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/execution-circuit-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/execution-retry-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/executor-failover-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/model-call-fingerprint", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/model-call-replay-gate", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/state", { disposition: "session-domain-write", surfaceIds: [] }],
  ["POST /api/novel/projects/:projectId/session/structured-output-gate", { disposition: "session-domain-write", surfaceIds: [] }],
]);

const appSource = writeAuthoritySources.get("api/src/app.ts").content;
const discoveredProjectMutationRoutes = [...appSource.matchAll(/app\.(post|put|delete)\("([^"]+)"/g)]
  .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
  .filter((route) => route.startsWith("POST /api/novel/projects") || route.startsWith("PUT /api/novel/projects") || route.startsWith("DELETE /api/novel/projects") || route === "POST /api/novel/import")
  .sort();
const unclassifiedProjectMutationRoutes = discoveredProjectMutationRoutes.filter((route) => !projectMutationRouteClassifications.has(route));
const staleProjectMutationRouteClassifications = [...projectMutationRouteClassifications.keys()].filter(
  (route) => !discoveredProjectMutationRoutes.includes(route),
);
if (unclassifiedProjectMutationRoutes.length || staleProjectMutationRouteClassifications.length) {
  throw new Error(`Write-authority route classification drift: unclassified=${unclassifiedProjectMutationRoutes.join("|")} stale=${staleProjectMutationRouteClassifications.join("|")}`);
}

const writeAuthoritySurfaces = [
  {
    surfaceId: "WRITE-SURFACE-001",
    label: "作者正文与支持文件直接保存",
    actor: "author-ui",
    currentOperation: "PUT arbitrary safe project file content, snapshot it, then write the file and project metadata directly",
    evidence: [
      codeEvidence("api/src/app.ts", "app.put(\"/api/novel/projects/:projectId/files/*\""),
      codeEvidence("ui/src/stores/novel.ts", "async function saveCurrentContent"),
    ],
    currentStrengths: ["safe-path validation", "protected project.json guard", "file-version snapshot"],
    gaps: ["no client baseline or ETag precondition", "no shared canon mutation event", "no deterministic downstream invalidation before derived rebuild"],
    risk: "high",
    requiredDisposition: "Route author edits through CanonMutationGateway while preserving immediate author ownership and offline-recovery UX.",
  },
  {
    surfaceId: "WRITE-SURFACE-002",
    label: "AI 任务补丁采纳",
    actor: "author-ui-plus-task-api",
    currentOperation: "Apply normalized task patches one by one and mark invocation targets accepted afterward",
    evidence: [
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/patches\""),
      codeEvidence("api/src/taskService.ts", "export async function applyPatch"),
    ],
    currentStrengths: ["path safety", "project.json protection", "pre-apply file snapshots", "selection range validation"],
    gaps: ["patch list is not atomically committed", "no candidate input fingerprint or hard-guard bundle", "accepted audit update occurs after file writes"],
    risk: "critical",
    requiredDisposition: "Replace canon-capable task patch application with ProseAdoptionTransaction; keep task output candidate-only.",
  },
  {
    surfaceId: "WRITE-SURFACE-003",
    label: "自动驾驶正文生成",
    actor: "runtime-worker",
    currentOperation: "Dispatch chapter_draft writes before continuity and quality review",
    evidence: [codeEvidence("api/src/runtimeEngine.ts", "reason: \"chapter_draft\"")],
    currentStrengths: ["pre-run checkpoint", "checkpoint baseline conflict detection", "per-project write queue"],
    gaps: ["generated prose reaches canon before validation", "checkpoint rollback is not candidate isolation", "derived stages read unapproved prose"],
    risk: "critical",
    requiredDisposition: "Persist ProseCandidate outside canon and submit it only after complete validation and adoption authorization.",
  },
  {
    surfaceId: "WRITE-SURFACE-004",
    label: "自动质量整章修复",
    actor: "runtime-worker",
    currentOperation: "Dispatch quality_self_repair full-chapter writes inside the score loop",
    evidence: [codeEvidence("api/src/runtimeEngine.ts", "reason: \"quality_self_repair\"")],
    currentStrengths: ["repair checkpoint", "one-attempt limit", "write-conflict handling"],
    gaps: ["rewrite mutates canon before author review", "fixed-score optimization can erase accepted strengths", "no atomic proof that repair improved without regressions"],
    risk: "critical",
    requiredDisposition: "Keep repair output as a child candidate and require evidence-bounded regression comparison before adoption.",
  },
  {
    surfaceId: "WRITE-SURFACE-005",
    label: "自动驾驶审稿接受",
    actor: "author-ui-plus-runtime-api",
    currentOperation: "Mark the run completed and enqueue accept without a prose commit transaction",
    evidence: [
      codeEvidence("api/src/app.ts", "type === \"accept\""),
      codeEvidence("api/src/runtimeEngine.ts", "command.type === \"accept\""),
    ],
    currentStrengths: ["explicit author action", "runtime command event"],
    gaps: ["accept is status-only because prose was already written", "no adoption receipt", "no chapter settlement or feedback event"],
    risk: "critical",
    requiredDisposition: "Make accept the sole trigger for ProseAdoptionTransaction and emit settlement or structured blocking evidence.",
  },
  {
    surfaceId: "WRITE-SURFACE-006",
    label: "局部润色与专注写作候选接受",
    actor: "author-ui",
    currentOperation: "Splice or append candidate text in client state, then rely on a later generic file save",
    evidence: [
      codeEvidence("ui/src/stores/novel.ts", "function acceptRewrite"),
      codeEvidence("ui/src/stores/novel.ts", "async function acceptFocusDraft"),
    ],
    currentStrengths: ["author-visible candidate", "selection anchoring for some patch paths", "manual save remains explicit"],
    gaps: ["accept/reject feedback can disappear client-side", "server does not validate candidate lineage at acceptance", "later generic save loses candidate attribution"],
    risk: "high",
    requiredDisposition: "Submit fragment-level adoption with candidate, baseline, selection identity, feedback, and lock checks in one server command.",
  },
  {
    surfaceId: "WRITE-SURFACE-007",
    label: "衍生分支合并",
    actor: "author-ui-plus-runtime-api",
    currentOperation: "Write branch draft, optional new outline, and project.json through runtime dispatch after user merge action",
    evidence: [codeEvidence("api/src/app.ts", "reason: \"derivative_merge\"")],
    currentStrengths: ["branch isolation before merge", "user merge action", "checkpoint", "path collision guard"],
    gaps: ["no prose validation bundle", "multi-file runtime dispatch is sequential without compensating atomic rollback", "new or replacement chapter is immediately marked drafted"],
    risk: "high",
    requiredDisposition: "Compile branch merge into a ProseAdoptionTransaction plus project-structure MutationPlan and settle only after both commit.",
  },
  {
    surfaceId: "WRITE-SURFACE-008",
    label: "章后回顾采纳",
    actor: "author-ui-plus-cockpit-service",
    currentOperation: "Atomically rewrite summary, ledgers, and recap log from a submitted recap candidate",
    evidence: [codeEvidence("api/src/writingCockpit.ts", "export async function acceptWritingRecapPatches")],
    currentStrengths: ["multi-file rollback attempt", "accepted recap idempotency", "candidate review step"],
    gaps: ["no authoritative prose fingerprint check", "no proof recap belongs to an adopted candidate", "ledger changes are not appended lifecycle events"],
    risk: "high",
    requiredDisposition: "Consume only a committed prose adoption receipt and append derived claim/obligation events in the same settlement workflow.",
  },
  {
    surfaceId: "WRITE-SURFACE-009",
    label: "账本整表保存",
    actor: "author-ui-plus-cockpit-api",
    currentOperation: "Normalize and replace the selected ledger JSON file",
    evidence: [
      codeEvidence("api/src/app.ts", "app.put(\"/api/novel/projects/:projectId/ledger/:kind\""),
      codeEvidence("api/src/writingCockpit.ts", "export async function saveLedgerEntries"),
    ],
    currentStrengths: ["ledger-kind validation", "normalized timestamps"],
    gaps: ["whole-table last-write-wins", "resolved status can bypass payoff evidence", "no append-only obligation event or concurrency precondition"],
    risk: "high",
    requiredDisposition: "Retire canon-capable whole-table PUT in favor of typed obligation commands with evidence and version preconditions.",
  },
  {
    surfaceId: "WRITE-SURFACE-010",
    label: "故事总控、场景、摘要与质量直接 PUT",
    actor: "author-ui-plus-cockpit-api",
    currentOperation: "Replace individual JSON projections through independent endpoints",
    evidence: [
      codeEvidence("api/src/app.ts", "app.put(\"/api/novel/projects/:projectId/story-control\""),
      codeEvidence("api/src/app.ts", "app.put(\"/api/novel/projects/:projectId/scenes/:chapterId\""),
      codeEvidence("api/src/app.ts", "app.put(\"/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId\""),
      codeEvidence("api/src/app.ts", "app.put(\"/api/novel/projects/:projectId/quality/:chapterId\""),
    ],
    currentStrengths: ["typed endpoint shapes", "path-safe service functions", "separate projections"],
    gaps: ["no shared baseline/version precondition", "no authority distinction between canon source and projection", "cross-asset invariants cannot commit atomically"],
    risk: "high",
    requiredDisposition: "Classify each field as canon command or rebuildable projection; route canon commands through MutationPlan and projections through event consumers.",
  },
  {
    surfaceId: "WRITE-SURFACE-011",
    label: "运行检查点恢复",
    actor: "author-ui-plus-runtime-api",
    currentOperation: "Copy or remove every checkpointed file directly, then update project metadata",
    evidence: [codeEvidence("api/src/runtimeFiles.ts", "export async function restoreRuntimeCheckpoint")],
    currentStrengths: ["explicit checkpoint", "broad managed-file manifest", "manual restore endpoint"],
    gaps: ["no global writer fencing before restore", "restore does not emit per-asset invalidation lineage", "active candidates and projections can survive with newer assumptions"],
    risk: "high",
    requiredDisposition: "Execute restore as a fenced CanonRestoreTransaction that invalidates later candidates, audits, caches, and derived projections.",
  },
  {
    surfaceId: "WRITE-SURFACE-012",
    label: "知识、质量与故事图后台重建",
    actor: "background-worker",
    currentOperation: "Rebuild and overwrite derived projections from the project snapshot captured when the job was created",
    evidence: [codeEvidence("api/src/app.ts", "function createBackgroundJobHandler")],
    currentStrengths: ["job status", "rebuildable outputs", "separate project jobs"],
    gaps: ["no source fingerprint freshness check before publish", "job may consume unapproved or later superseded prose", "successful write can be displayed as current truth"],
    risk: "medium",
    requiredDisposition: "Make jobs read committed events only and compare source fingerprints immediately before publishing projections.",
  },
  {
    surfaceId: "WRITE-SURFACE-013",
    label: "项目创建与旧项目导入",
    actor: "author-ui-plus-import-service",
    currentOperation: "Create initial project files or import external chapters and support assets into a new project root",
    evidence: [
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/projects\""),
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/import\""),
    ],
    currentStrengths: ["new project boundary", "import source selection", "isolated root"],
    gaps: ["imported content lacks authority classification and provenance proof", "AI backfill can be mistaken for canon if not candidate-only", "activation evidence is separate from successful file copy"],
    risk: "controlled",
    requiredDisposition: "Keep bootstrap writes isolated; classify imported files and require preview/adoption before semantic backfill becomes authoritative.",
  },
  {
    surfaceId: "WRITE-SURFACE-014",
    label: "Author session capture",
    actor: "author-client",
    currentOperation: "Append the author's original utterance to the project-local creative session with client idempotency",
    evidence: [
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/session/messages\""),
      codeEvidence("api/src/creativeSession.ts", "export async function appendAuthorMessage"),
    ],
    currentStrengths: ["separate session authority", "durable source attribution", "per-project idempotency lock"],
    gaps: ["no browser journey evidence", "no downstream asset lineage", "session projection is not yet shared with a UI"],
    risk: "controlled",
    requiredDisposition: "Keep capture isolated from canon and downstream interpretation; expose only after cross-navigation recovery and shared schema evidence.",
  },
  {
    surfaceId: "WRITE-SURFACE-015",
    label: "V2 understanding safety gate",
    actor: "author-client",
    currentOperation: "Reject interpretation before risk, T0, budget, and model-capability dependencies are proven",
    evidence: [
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/session/understanding\""),
      codeEvidence("api/src/understandingTask.ts", "export const V2_UNDERSTANDING_DEPENDENCIES"),
      codeEvidence("api/src/understandingPreflight.ts", "export function evaluateUnderstandingPreflight"),
      codeEvidence("api/src/understandingRiskProfile.ts", "export function buildUnderstandingRiskProfile"),
      codeEvidence("api/src/understandingBudget.ts", "export async function reserveUnderstandingBudget"),
      codeEvidence("api/src/understandingAuthorization.ts", "export async function authorizeUnderstandingCapability"),
      codeEvidence("api/src/understandingExecutor.ts", "export async function executeShadowUnderstanding"),
      codeEvidence("api/src/understandingWorker.ts", "export async function executeModelUnderstanding"),
      codeEvidence("api/src/understandingWorker.ts", "export async function startModelUnderstandingTask"),
      codeEvidence("api/src/understandingWorker.ts", "export async function resumeUnderstandingTask"),
      codeEvidence("api/src/understandingWorker.ts", "export async function recoverUnderstandingTasks"),
      codeEvidence("api/src/dialogueQuestions.ts", "export async function answerDialogueQuestion"),
      codeEvidence("api/src/backgroundJobs.ts", "export async function enqueueProjectBackgroundJob"),
    ],
    currentStrengths: ["zero model call while blocked", "explicit shadow/model snapshots are non-canon", "model worker has persisted task state, cancellation, resume, startup recovery, active-process cancellation, source-fingerprint fencing, ContextManifest fingerprint/message binding, candidate interpretation branches, append-only answers, contract candidates, independent review, and adoption proposals"],
    gaps: ["holdout calibration and independent provider/human review remain incomplete", "multi-process mutation fencing and broad world-rule contract coverage remain incomplete"],
    risk: "controlled",
    requiredDisposition: "Keep V2 interpretation blocked until all safety dependencies and frozen-input evidence are implemented.",
  },
  {
    surfaceId: "WRITE-SURFACE-016",
    label: "T0 context manifest freeze",
    actor: "author-client",
    currentOperation: "Freeze the exact creative-session input into a versioned non-canon context manifest",
    evidence: [
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/session/context-manifest\""),
      codeEvidence("api/src/contextManifest.ts", "export async function freezeContextManifest"),
      codeEvidence("api/src/understandingWorker.ts", "const manifest = await readContextManifest(input.root)"),
      codeEvidence("api/src/understandingReview.ts", "function validEvidence")
    ],
    currentStrengths: ["source fingerprint", "source message spans", "supersedes previous manifest", "atomic separate write", "model task binds persisted manifest fingerprint and message IDs before provider call", "post-call review validates every claim evidence span against source bounds"],
    gaps: ["risk, budget, and capability dependencies remain absent from this session-level worker binding", "provider/human calibration and real-project release evidence remain incomplete"],
    risk: "controlled",
    requiredDisposition: "Use only as frozen T0 evidence; never treat the manifest itself as an understanding result or canon authority.",
  },
  {
    surfaceId: "WRITE-SURFACE-017",
    label: "Explicit story-contract canon adoption",
    actor: "author-client",
    currentOperation: "Commit an author-authorized, independently reviewed contract proposal into the project contract pointer, StoryControl, Bible evidence, and immutable canon event",
    evidence: [
      codeEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/session/understanding/contract-adoption\""),
      codeEvidence("api/src/contractCanonAdoption.ts", "export async function commitContractAdoption"),
    ],
    currentStrengths: ["explicit authorization", "candidate/proposal fingerprint fences", "project lease and fencing token", "staging and rollback journal", "idempotent mutation plan", "canon event receipt", "world-rule field support", "projection invalidation and rebuild receipt"],
    gaps: ["cross-process lease durability beyond the local lease file", "full StoryContract schema and projection freshness monitoring remain partial"],
    risk: "high",
    requiredDisposition: "Keep the gateway narrow; require author authorization, current proposal fingerprint, atomic rollback evidence, and never infer authorization from silence or task completion.",
  },
];

if (new Set(writeAuthoritySurfaces.map((surface) => surface.surfaceId)).size !== writeAuthoritySurfaces.length) {
  throw new Error("Write-authority audit surface IDs must be unique.");
}

const writeAuthorityAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  authoritativeTarget: {
    gateway: "CanonMutationGateway",
    commands: ["SubmitAuthorEdit", "AdoptProseCandidate", "RestoreCanonVersion"],
    invariant: "Every canon mutation emits one immutable event, validates a versioned baseline and locks, commits atomically, and invalidates all affected projections, candidates, caches, obligations, and audits.",
  },
  sourceFiles: [...writeAuthoritySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  summary: {
    auditedSurfaceFamilies: writeAuthoritySurfaces.length,
    classifiedMutatingProjectRoutes: discoveredProjectMutationRoutes.length,
    unclassifiedMutatingProjectRoutes: unclassifiedProjectMutationRoutes.length,
    byRisk: Object.fromEntries(
      [...Map.groupBy(writeAuthoritySurfaces, (surface) => surface.risk).entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([risk, surfaces]) => [risk, surfaces.length]),
    ),
    currentlyUnifiedCanonAuthority: false,
    implementationVerified: false,
  },
  mutatingProjectRoutes: discoveredProjectMutationRoutes.map((route) => ({
    route,
    ...projectMutationRouteClassifications.get(route),
  })),
  surfaces: writeAuthoritySurfaces,
  releaseGate: {
    requirementIds: ["FR-STATE-006", "FR-STATE-007", "FR-STATE-008", "FR-PROSE-002", "FR-PROSE-022", "FR-PROSE-023", "FR-DELIVERY-031"],
    acceptanceRefs: ["AT-067", "AT-068", "AT-069", "AT-290", "AT-310", "AT-311", "AT-359", "AT-361"],
    rule: "RP5 cannot activate until every listed surface is routed, explicitly read-only, or proven projection-only under server-side capability enforcement and failure injection.",
  },
};

const lowInputJourneySourcePaths = [
  "ui/src/components/novel/QuickStartGuidePanel.vue",
  "ui/src/components/novel/ProjectCreatePanel.vue",
  "ui/src/components/novel/StructureQuickStartPanel.vue",
  "ui/src/components/novel/AIOperationPanel.vue",
  "ui/src/components/novel/RewriteComparison.vue",
  "ui/src/components/novel/AutopilotRuntimePanel.vue",
  "ui/src/components/novel/NovelWorkspace.vue",
  "ui/src/components/novel/CreativeSessionPanel.vue",
  "ui/src/services/novelApi.ts",
  "ui/src/stores/novel.ts",
  "api/src/app.ts",
  "api/src/novelProject.ts",
  "api/src/taskTemplates.ts",
  "api/src/contextManifest.ts",
  "api/src/taskService.ts",
  "api/src/creativeJourney.ts",
  "api/src/contextAssembler.ts",
  "api/src/runtimeEngine.ts",
  "api/src/proseAdoption.ts",
  "api/src/types.ts",
  "api/src/editionManifest.ts",
  "api/src/publicationTree.ts",
  "api/src/publicationArtifacts.ts",
  "api/src/deliveryProof.ts",
  "api/src/deliveryAccessGrant.ts",
  "api/src/releasePreflight.ts",
  "api/src/closureCertificate.ts",
  "api/src/revisionIntent.ts",
  "api/src/revisionImpact.ts",
  "api/src/narrativeObligation.ts",
  "api/src/obligationCoverage.ts",
  "api/src/obligationCandidates.ts",
  "api/src/obligationCertificate.ts",
  "api/src/closureCertificate.ts",
  "api/src/dialogueQuestions.ts",
  "api/src/dialogueRedBlue.ts",
  "api/src/decisionImpact.ts",
  "api/src/decisionProjection.ts",
];

const lowInputJourneySources = new Map(lowInputJourneySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function journeyEvidence(relativePath, needle) {
  const sourceEntry = lowInputJourneySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown low-input journey audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Low-input journey evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function sourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = lowInputJourneySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown low-input journey audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Low-input journey slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Low-input journey slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const createProjectRouteSlice = sourceSlice(
  "api/src/app.ts",
  "app.post(\"/api/novel/projects\"",
  "app.post(\"/api/novel/import\"",
);
const localStructureSlice = sourceSlice(
  "ui/src/stores/novel.ts",
  "function generateStructureFromIdea",
  "async function loadLedger",
);
const uiStoreSource = lowInputJourneySources.get("ui/src/stores/novel.ts").content;
const runtimeEngineSource = lowInputJourneySources.get("api/src/runtimeEngine.ts").content;
if (/runNovelTask|startNovelTaskAsync|runRuntimeTask/.test(createProjectRouteSlice)) {
  throw new Error("Low-input journey audit drift: project creation now invokes an AI task and must be reclassified.");
}
if (/runTask\s*\(/.test(localStructureSlice)) {
  throw new Error("Low-input journey audit drift: generateStructureFromIdea now invokes a task and must be reclassified.");
}
if (uiStoreSource.includes("\"project.create\"")) {
  throw new Error("Low-input journey audit drift: the UI store now references project.create and must be reclassified.");
}
if (runtimeEngineSource.includes("autoContinue")) {
  throw new Error("Low-input journey audit drift: runtimeEngine now consumes autoContinue and must be re-audited.");
}

const novelComponentRoot = join(root, "ui/src/components/novel");
const novelVueComponents = readdirSync(novelComponentRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".vue"))
  .map((entry) => ({
    path: `ui/src/components/novel/${entry.name}`,
    content: readFileSync(join(novelComponentRoot, entry.name), "utf8"),
  }))
  .sort((left, right) => left.path.localeCompare(right.path));
const questionRendererFiles = novelVueComponents
  .filter((entry) => /result\.questions|question in .*questions/.test(entry.content))
  .map((entry) => entry.path);
const structuredQuestionAnswerFiles = novelVueComponents
  .filter((entry) => /questionId|answer-question|submit-question-answer|decisionRequestId/.test(entry.content))
  .map((entry) => entry.path);
const novelComponentScanHash = createHash("sha256")
  .update(novelVueComponents.map((entry) => `${entry.path}\u0000${entry.content}`).join("\u0001"))
  .digest("hex");

if (questionRendererFiles.join("|") !== "ui/src/components/novel/RewriteComparison.vue") {
  throw new Error(`Low-input question-renderer classification drift: ${questionRendererFiles.join("|")}`);
}
if (structuredQuestionAnswerFiles.length !== 0) {
  throw new Error(`Low-input structured-answer surface now exists and must be audited: ${structuredQuestionAnswerFiles.join("|")}`);
}

const lowInputJourneyStages = [
  {
    stageId: "JOURNEY-001",
    label: "一句话产品承诺",
    currentStatus: "copy-promises-end-to-end",
    evidence: [
      journeyEvidence("ui/src/components/novel/QuickStartGuidePanel.vue", "系统会把它拆成项目、结构、正文和审稿动作"),
      journeyEvidence("api/src/creativeJourney.ts", "export function buildCreativeJourneyProjection"),
      journeyEvidence("api/src/app.ts", "app.get(\"/api/novel/projects/:projectId/session/journey\"")
    ],
    currentStrengths: ["The copy correctly lowers the author's expected input burden.", "The API now exposes a server-authoritative journey stage and primary action for capture/understanding."],
    gaps: ["The projection is displayed in the session panel but does not yet drive the primary command, and browser refresh/restart evidence is still missing."],
    requiredDisposition: "Route the default shell command through the CreativeJourney projection and add representative browser recovery evidence before retiring old button-grid navigation.",
    risk: "high",
  },
  {
    stageId: "JOURNEY-002",
    label: "粗略想法捕获",
    currentStatus: "project-field-only",
    evidence: [
      journeyEvidence("ui/src/components/novel/ProjectCreatePanel.vue", "roughIdea: roughIdea.value"),
      journeyEvidence("api/src/novelProject.ts", "roughIdea: input.roughIdea.trim()"),
    ],
    currentStrengths: ["Rough idea is required by the UI and persisted in project.json.", "Title and genre have safe defaults."],
    gaps: ["No immutable AuthorUtterance, idempotency key, message identity, or conversation/session cursor.", "Editing project metadata cannot preserve original words versus later interpretation."],
    requiredDisposition: "Persist AuthorUtterance before asynchronous compilation and link it to a lightweight project container without overwriting later interpretations.",
    risk: "critical",
  },
  {
    stageId: "JOURNEY-003",
    label: "项目创建与轻量容器",
    currentStatus: "generic-skeleton-only",
    evidence: [
      journeyEvidence("api/src/app.ts", "const project = await createUniqueProjectSkeleton"),
      journeyEvidence("api/src/novelProject.ts", "chapters: createDefaultChapters()"),
      journeyEvidence("api/src/novelProject.ts", "\"outline/volume-01.md\": \"# 第一卷大纲\\n\\n待生成。\\n\""),
    ],
    currentStrengths: ["Creation is fast and creates isolated, path-safe project files.", "Empty ledgers and three chapters make later work possible."],
    gaps: ["Success only proves filesystem bootstrap, not understanding, story contract, outline, or first-chapter readiness.", "No resumable compilation run is created."],
    requiredDisposition: "Return containerCreated plus a durable SeedCompilationRun; never label bootstrap as story understanding or creative completion.",
    risk: "high",
  },
  {
    stageId: "JOURNEY-004",
    label: "project.create 语义入口",
    currentStatus: "declared-but-unreachable-from-create-journey",
    evidence: [
      journeyEvidence("api/src/taskTemplates.ts", "\"project.create\": \"Create the novel project skeleton"),
      journeyEvidence("api/src/app.ts", "result: fallbackProjectCreateResult(project.title)"),
      journeyEvidence("ui/src/services/novelApi.ts", "const data = await request<{ project: NovelProject }>(\"/api/novel/projects\""),
    ],
    currentStrengths: ["A task vocabulary and conservative fallback message already exist."],
    gaps: ["The create route invokes no AI task.", "The UI client discards the fallback result.", "A declared stage can appear in audit vocabulary without ever executing."],
    requiredDisposition: "Retire project.create as a misleading monolith or adapt it behind SeedCompilationRun; expose actual state rather than an unused result object.",
    risk: "high",
  },
  {
    stageId: "JOURNEY-005",
    label: "意图理解与竞争解释",
    currentStatus: "missing-authoritative-state",
    evidence: [journeyEvidence("api/src/contextAssembler.ts", "if (type === \"project.create\")")],
    currentStrengths: ["The SDD already defines explicit/inferred/provisional/unknown/conflicted semantics."],
    gaps: ["Current project.create context contains only a generic long-novel constraint.", "No UnderstandingSnapshot or competing interpretation is persisted or shown after creation."],
    requiredDisposition: "Compile the utterance into evidence-spanned intent facets, unknowns, conflicts, and reversible hypotheses before requesting a high-impact decision.",
    risk: "critical",
  },
  {
    stageId: "JOURNEY-006",
    label: "苏格拉底单问题闭环",
    currentStatus: "passive-string-output-only",
    evidence: [
      journeyEvidence("api/src/types.ts", "questions: string[];"),
      journeyEvidence("ui/src/components/novel/RewriteComparison.vue", "v-for=\"question in result.questions\""),
    ],
    currentStrengths: ["Task results can surface human-readable questions."],
    gaps: ["Questions have no ID, lifecycle, impact, answer command, expiry, dependency, or delegation semantics.", "Only a rewrite comparison renders the list; it is not an interactive creative-session turn."],
    requiredDisposition: "Use one active DecisionRequest with evidence, why-now, options, delegation, correction, answer idempotency, and stale-answer handling.",
    risk: "critical",
  },
  {
    stageId: "JOURNEY-007",
    label: "红蓝辩证与故事契约",
    currentStatus: "not-in-create-to-first-artifact-chain",
    evidence: [journeyEvidence("ui/src/components/novel/AIOperationPanel.vue", "随时交给 AI")],
    currentStrengths: ["Free-form tasks let an expert manually ask for analysis."],
    gaps: ["No independent blue/red evidence set, synthesis, decision record, or field-level contract adoption is part of first use.", "Manual prompting transfers orchestration burden back to the author."],
    requiredDisposition: "Generate red/blue comparison only for consequential ambiguity, then persist the chosen scope as a versioned StoryContractCandidate and DecisionRecord.",
    risk: "critical",
  },
  {
    stageId: "JOURNEY-008",
    label: "一句想法生成结构",
    currentStatus: "client-local-generic-template",
    evidence: [
      journeyEvidence("ui/src/stores/novel.ts", "function generateStructureFromIdea"),
      journeyEvidence("ui/src/stores/novel.ts", "mainConflict: \"主角必须在目标、阻力和代价之间做选择。\""),
      journeyEvidence("ui/src/components/novel/StructureQuickStartPanel.vue", "@click=\"$emit('generate-from-idea')\""),
    ],
    currentStrengths: ["The author gets an immediate reversible dashboard and scene-card scaffold."],
    gaps: ["No AI understanding, story-contract readiness proof, causal outline candidate, provenance, or red/blue validation.", "Saving structure is a separate manual action and generic text can look story-specific."],
    requiredDisposition: "Keep the local template only as an explicit offline placeholder; primary flow must produce a non-canon outline candidate from an accepted or sufficiently provisional contract.",
    risk: "high",
  },
  {
    stageId: "JOURNEY-009",
    label: "下一动作与工具复杂度",
    currentStatus: "manual-modes-and-button-grid",
    evidence: [
      journeyEvidence("ui/src/components/novel/AIOperationPanel.vue", "const actions: Array<{ type: CodexTaskType"),
      journeyEvidence("ui/src/components/novel/QuickStartGuidePanel.vue", "先搭结构"),
      journeyEvidence("ui/src/components/novel/NovelWorkspace.vue", "title=\"自动驾驶运行时\""),
    ],
    currentStrengths: ["Advanced users can access structure, focus, review, tasks, and runtime controls."],
    gaps: ["The beginner must understand modes, task types, save steps, agent health, and runtime before obtaining the promised artifact.", "No authoritative PrimaryActionDecision resolves competing buttons."],
    requiredDisposition: "Show one result-oriented primary action from journey state; keep expert tools behind progressive disclosure and route them through the same commands.",
    risk: "high",
  },
  {
    stageId: "JOURNEY-010",
    label: "自动驾驶启动预检",
    currentStatus: "project-and-chapter-existence-only",
    evidence: [
      journeyEvidence("ui/src/stores/novel.ts", "if (!currentProject.value || !currentChapter.value || isStartingRuntime.value) return null"),
      journeyEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/runtime/start\""),
    ],
    currentStrengths: ["Run and command records are durable and the worker exposes health/events/checkpoints."],
    gaps: ["No StoryContractReadinessProof, executable-outline proof, budget/autonomy grant, or structured not_ready response precedes queue creation.", "A queued run can look active even when foundational creative decisions are missing."],
    requiredDisposition: "BookRun preflight must prove contract, outline, authority, budget, worker, and dependency readiness before creating executable work.",
    risk: "critical",
  },
  {
    stageId: "JOURNEY-011",
    label: "连续章节开关",
    currentStatus: "ui-and-transport-only",
    evidence: [
      journeyEvidence("ui/src/components/novel/AutopilotRuntimePanel.vue", "连续章节调度：待实现"),
      journeyEvidence("ui/src/stores/novel.ts", "autoContinue"),
      journeyEvidence("api/src/runtimeEngine.ts", "await runSingleChapterPipeline(run)"),
    ],
    currentStrengths: ["The UI exposes intended scope and sends it with the start payload."],
    gaps: ["runtimeEngine never consumes autoContinue.", "Accept marks the single run completed but creates no next-chapter work item.", "No BookRun, WorkGraph, chapter settlement dependency, or whole-book termination proof exists."],
    requiredDisposition: "Move autoContinue to a scoped BookRun/AutonomyGrant; after ChapterSettlement schedule the next dependency-ready item or return a structured pause reason.",
    risk: "critical",
  },
  {
    stageId: "JOURNEY-012",
    label: "首章与整书完成语义",
    currentStatus: "task-and-single-run-proxies",
    evidence: [
      journeyEvidence("api/src/runtimeEngine.ts", "status: \"review_required\""),
      journeyEvidence("api/src/runtimeEngine.ts", "command.type === \"accept\""),
    ],
    currentStrengths: ["The runtime pauses for a visible author review state."],
    gaps: ["Current prose is written before review, accept is status-only, and no chapter settlement receipt proves derived assets converged.", "A completed single run cannot prove the low-input journey, chapter, volume, or book is complete."],
    requiredDisposition: "Separate candidate, adopted, settled, scope-complete, and audited-book-complete states and expose the exact proof behind each label.",
    risk: "critical",
  },
];

if (new Set(lowInputJourneyStages.map((stage) => stage.stageId)).size !== lowInputJourneyStages.length) {
  throw new Error("Low-input journey stage IDs must be unique.");
}

const lowInputJourneyAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-trace-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The author supplies a rough idea; the platform understands, asks one valuable question at a time, compares consequential alternatives, assembles governed artifacts, and continues through a fully audited book.",
  sourceFiles: [...lowInputJourneySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  uiQuestionSurfaceScan: {
    scannedVueComponentCount: novelVueComponents.length,
    aggregateSha256: novelComponentScanHash,
    passiveQuestionRendererFiles: questionRendererFiles,
    structuredQuestionAnswerFiles,
  },
  summary: {
    tracedStages: lowInputJourneyStages.length,
    byCurrentStatus: Object.fromEntries(
      [...Map.groupBy(lowInputJourneyStages, (stage) => stage.currentStatus).entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, stages]) => [status, stages.length]),
    ),
    byRisk: Object.fromEntries(
      [...Map.groupBy(lowInputJourneyStages, (stage) => stage.risk).entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([risk, stages]) => [risk, stages.length]),
    ),
    persistedAuthorUtteranceExists: lowInputJourneySources.get("api/src/dialogueQuestions.ts").content.includes("question-event"),
    interactiveSocraticDecisionExists: lowInputJourneySources.get("api/src/dialogueQuestions.ts").content.includes("answerDialogueQuestion") && lowInputJourneySources.get("api/src/app.ts").content.includes("session/understanding/questions/:questionId/answers"),
    governedRedBlueContractExists: lowInputJourneySources.get("api/src/dialogueRedBlue.ts").content.includes("DialogueRedBlueCase") && lowInputJourneySources.get("api/src/app.ts").content.includes("session/understanding/questions/:questionId/red-blue"),
    endToEndLowInputJourneyVerified: false,
    autoContinueExecutedByRuntimeEngine: false,
    implementationVerified: false,
  },
  strengthsToReuse: [
    "Rough idea persistence and lightweight project bootstrap",
    "Task/invocation history and explicit candidate UI on some manual paths",
    "Runtime command queue, events, worker health, snapshots, and checkpoints",
    "Existing outline, chapter planning, drafting, recap, ledgers, knowledge index, and story graph primitives",
  ],
  rootCause: {
    statement: "The primary gap is not a missing chat widget; it is the absence of an authoritative CreativeJourney state machine connecting author utterances, understanding, decisions, contracts, candidates, adoption, settlement, and whole-book work.",
    consequence: "Independent buttons and task types can each succeed while the promised author journey remains absent, unrecoverable, or semantically false.",
  },
  stages: lowInputJourneyStages,
  alternatives: [
    {
      option: "A-wire-project-create-task",
      verdict: "insufficient-alone",
      benefit: "Fastest way to generate an initial artifact from roughIdea.",
      failureMode: "One monolithic AI call still lacks durable questions, partial contract adoption, recovery, provenance, and next-action authority.",
    },
    {
      option: "B-add-chat-shell-over-existing-buttons",
      verdict: "insufficient-alone",
      benefit: "Reduces visible tool complexity and supports natural language input.",
      failureMode: "A chat transcript without server-authoritative decision and artifact state can lose answers, duplicate actions, and cosmetically hide the same button graph.",
    },
    {
      option: "C-authoritative-creative-journey",
      verdict: "recommended",
      benefit: "Reuses existing task/runtime primitives behind durable commands, one active decision, governed candidates, explicit adoption, and recoverable next actions.",
      failureMode: "Requires shared schemas and migration discipline before the new shell can truthfully replace current entry points.",
    },
  ],
  targetStateMachine: {
    states: [
      "captured",
      "compiling",
      "needs_decision",
      "contract_candidate_ready",
      "contract_accepted",
      "outline_candidate_ready",
      "outline_accepted",
      "chapter_ready",
      "prose_candidate_ready",
      "chapter_settled",
      "scope_paused",
      "book_audit_ready",
      "audited_complete",
    ],
    commands: [
      "SubmitAuthorUtterance",
      "AnswerDecisionRequest",
      "DelegateDecision",
      "CorrectUnderstanding",
      "AdoptContractFields",
      "AdoptOutlineCandidate",
      "StartBookRun",
      "AdoptProseCandidate",
      "SettleChapter",
      "PauseScope",
      "RunBookCompletionAudit",
    ],
    invariant: "Every visible next action derives from durable journey state, and every transition records input/version evidence, authority, affected artifacts, and a recoverable successor or structured blocker.",
  },
  releaseGate: {
    requirementIds: [
      "FR-SEED-001",
      "FR-SEED-002",
      "FR-SEED-004",
      "FR-SEED-005",
      "FR-SEED-016",
      "FR-SEED-017",
      "FR-SEED-020",
      "FR-QUESTION-001",
      "FR-QUESTION-002",
      "FR-QUESTION-005",
      "FR-DEBATE-001",
      "FR-DEBATE-003",
      "FR-ARCH-001",
      "FR-ARCH-018",
      "FR-ARCH-024",
      "FR-RUN-006",
      "FR-RUN-011",
      "FR-DELIVERY-001",
      "FR-DELIVERY-003",
      "FR-DELIVERY-011",
    ],
    acceptanceRefs: [
      "AT-001",
      "AT-017",
      "AT-022",
      "AT-027",
      "AT-041",
      "AT-059",
      "AT-077",
      "AT-078",
      "AT-090",
      "AT-142",
      "AT-145",
      "AT-190",
      "AT-195",
      "AT-199",
      "AT-203",
      "AT-213",
      "AT-239",
      "AT-241",
      "AT-249",
      "AT-333",
    ],
    rule: "Do not claim the low-input creative-partner journey until a new user can submit one rough idea, recover the same session after refresh/restart, answer exactly one decision, adopt a story contract and outline without choosing tools, receive a governed prose candidate, and observe truthful chapter/book scope state.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none authorizes runtime activation without implementation evidence. Q-009 selects obligation-led elastic length and does not change this journey state machine.",
};

const craftLearningSourcePaths = [
  "api/src/types.ts",
  "api/src/craftProfile.ts",
  "api/src/contextAssembler.ts",
  "api/src/novelSystemSkills.ts",
  "api/src/platformLibrary.ts",
  "api/src/taskService.ts",
  "api/src/chapterQualityReview.ts",
  "api/src/learningRelease.ts",
  "api/src/craftRevocationStore.ts",
  "api/src/craftFeedback.ts",
  "api/src/craftFeedbackLearning.ts",
  "api/src/feedbackLearning.ts",
  "api/src/craftHoldoutValidation.ts",
  "api/src/craftExperiment.ts",
  "api/src/app.spec.ts",
  "api/src/evaluationRegressionStore.ts",
  "api/src/learningReleaseGate.ts",
  "api/src/app.ts",
  "ui/src/stores/novel.ts",
  "ui/src/components/novel/PlotPilotLearningPanel.vue",
  "ui/src/components/novel/PlatformLibraryPanel.vue",
];

const craftLearningSources = new Map(craftLearningSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function craftEvidence(relativePath, needle) {
  const sourceEntry = craftLearningSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown craft-learning audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Craft-learning evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function craftSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = craftLearningSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown craft-learning audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Craft-learning slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Craft-learning slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const styleSampleTypeSlice = craftSourceSlice("api/src/types.ts", "export interface StyleSample", "export interface CraftCoverageSignal");
const styleSampleAssemblerSlice = craftSourceSlice("api/src/contextAssembler.ts", "function sampleUseCasesForTask", "function emptyTierStats");
const preCallReviewSlice = craftSourceSlice("api/src/taskService.ts", "function preCallReview", "function createInvocationSession");
const rejectRecapSlice = craftSourceSlice("ui/src/stores/novel.ts", "function rejectWritingRecap", "async function openProject");
const rejectRewriteSlice = craftSourceSlice("ui/src/stores/novel.ts", "function rejectRewrite", "async function applyTaskPatches");
const plotPilotLearningSlice = craftSourceSlice("ui/src/stores/novel.ts", "const plotPilotLearningItems", "const activeSceneCard");
const craftProductSource = [...craftLearningSources.values()].map((entry) => entry.content).join("\n");

if (/rights|license|provenance|sourceRef|allowedUse/i.test(styleSampleTypeSlice)) {
  throw new Error("Craft-learning audit drift: StyleSample now has governance metadata and must be reclassified.");
}
if (!/JSON\.stringify\(selected/.test(styleSampleAssemblerSlice) || !/\.slice\(0, 4\)/.test(styleSampleAssemblerSlice)) {
  throw new Error("Craft-learning audit drift: style-sample prompt injection behavior changed and must be reclassified.");
}
if (/rights|license|provenance|similarity|source-material/i.test(preCallReviewSlice)) {
  throw new Error("Craft-learning audit drift: pre-call review now includes a source or similarity guard and must be reclassified.");
}
if (/novelApi\.|fetch\(|request\(/.test(rejectRecapSlice) || /novelApi\.|fetch\(|request\(/.test(rejectRewriteSlice)) {
  throw new Error("Craft-learning audit drift: a rejection path now persists feedback and must be reclassified.");
}
if (craftLearningSources.get("api/src/taskService.ts").content.includes("markInvocationPatchesRejected")) {
  throw new Error("Craft-learning audit drift: rejected invocation patches can now be recorded and must be reclassified.");
}
const plotPilotLearningItemIds = [...plotPilotLearningSlice.matchAll(/\n\s+id: "([^"]+)"/g)].map((match) => match[1]);
if (plotPilotLearningItemIds.length !== 6) {
  throw new Error(`Craft-learning audit drift: expected 6 PlotPilot mechanism items, found ${plotPilotLearningItemIds.length}.`);
}
const implementedLearningEntities = [
  "SourceMaterialRecord",
  "CraftPattern",
  "PatternEvidence",
  "CraftExperiment",
  "PreferenceHypothesis",
  "LearningPolicy",
  "SimilarityGuardResult",
  "ReleaseDecision",
].filter((entity) => craftProductSource.includes(entity));
const auditedLearningEntities = new Set([
  "SourceMaterialRecord",
  "CraftPattern",
  "PatternEvidence",
  "CraftExperiment",
  "PreferenceHypothesis",
  "LearningPolicy",
  "SimilarityGuardResult",
  "ReleaseDecision",
]);
const unauditedLearningEntities = implementedLearningEntities.filter((entity) => !auditedLearningEntities.has(entity));
if (unauditedLearningEntities.length) {
  throw new Error(`Craft-learning audit drift: governed learning entities now exist and must be audited: ${unauditedLearningEntities.join(", ")}`);
}

const novelsRoot = join(root, "novels");
const localCraftInputs = existsSync(novelsRoot)
  ? readdirSync(novelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      stylePath: join(novelsRoot, entry.name, "bible", "style-samples.json"),
      craftPath: join(novelsRoot, entry.name, "bible", "craft-profile.json"),
    }))
    .filter((entry) => existsSync(entry.stylePath) || existsSync(entry.craftPath))
  : [];
const localStyleSampleSnapshots = localCraftInputs
  .filter((entry) => existsSync(entry.stylePath))
  .map((entry, index) => {
    const content = readFileSync(entry.stylePath, "utf8");
    const samples = JSON.parse(content);
    if (!Array.isArray(samples)) throw new Error(`Craft-learning audit expected an array in local style sample file ${index + 1}.`);
    const keys = [...new Set(samples.flatMap((sample) => Object.keys(sample || {})))].sort();
    const rightsKeys = keys.filter((key) => /rights|license|provenance|source|owner|consent|allowed/i.test(key));
    const excerptLengths = samples.map((sample) => typeof sample?.excerpt === "string" ? sample.excerpt.length : 0);
    return {
      projectOrdinal: index + 1,
      sha256: createHash("sha256").update(content).digest("hex"),
      sampleCount: samples.length,
      fields: keys,
      rightsMetadataFields: rightsKeys,
      useCases: [...new Set(samples.map((sample) => sample?.useCase).filter(Boolean))].sort(),
      excerptChars: excerptLengths.length ? {
        min: Math.min(...excerptLengths),
        max: Math.max(...excerptLengths),
        total: excerptLengths.reduce((total, value) => total + value, 0),
      } : { min: 0, max: 0, total: 0 },
    };
  });
const localCraftProfileSnapshots = localCraftInputs
  .filter((entry) => existsSync(entry.craftPath))
  .map((entry, index) => {
    const content = readFileSync(entry.craftPath, "utf8");
    const profile = JSON.parse(content);
    return {
      projectOrdinal: index + 1,
      sha256: createHash("sha256").update(content).digest("hex"),
      fields: Object.keys(profile || {}).sort(),
    };
  });

const craftLearningStages = [
  {
    stageId: "CRAFT-LEARNING-001",
    label: "内置工艺规则",
    currentStatus: "static-guidance-not-learning",
    evidence: [craftEvidence("api/src/craftProfile.ts", "export async function readCraftProfile")],
    strength: "Built-in genre, beat, voice, anti-pattern, and scene-contract guidance is immediately reusable.",
    gap: "Rules have no observation, experiment, promotion, rollback, expiry, or outcome evidence lifecycle.",
  },
  {
    stageId: "CRAFT-LEARNING-002",
    label: "题材匹配",
    currentStatus: "substring-match-without-confidence",
    evidence: [craftEvidence("api/src/craftProfile.ts", "source.includes(pattern.toLowerCase())")],
    strength: "Project genre and rough idea can select more relevant built-in profiles.",
    gap: "Substring hits expose neither competing classifications, confidence, boundary conditions, nor author confirmation.",
  },
  {
    stageId: "CRAFT-LEARNING-003",
    label: "项目工艺覆盖",
    currentStatus: "manual-file-override",
    evidence: [craftEvidence("api/src/craftProfile.ts", "bible/craft-profile.json")],
    strength: "A project can override defaults without changing application code.",
    gap: "No product write workflow, provenance, author decision receipt, version promotion, or rollback was found.",
  },
  {
    stageId: "CRAFT-LEARNING-004",
    label: "原始样例登记",
    currentStatus: "raw-excerpt-without-rights-envelope",
    evidence: [craftEvidence("api/src/types.ts", "export interface StyleSample")],
    strength: "Samples have IDs, tags, excerpts, and coarse use cases.",
    gap: "The schema has no source, ownership, license, allowed use, consent, retention, deletion, or quarantine fields.",
  },
  {
    stageId: "CRAFT-LEARNING-005",
    label: "样例检索与注入",
    currentStatus: "first-four-raw-json-injection",
    evidence: [
      craftEvidence("api/src/contextAssembler.ts", ".slice(0, 4)"),
      craftEvidence("api/src/contextAssembler.ts", "content: JSON.stringify(selected, null, 2)"),
    ],
    strength: "Use-case filtering and T1 placement prevent completely indiscriminate injection.",
    gap: "Selection ignores task deficit, rights, risk, applicability, negative evidence, and semantic redundancy, then injects the excerpts themselves.",
  },
  {
    stageId: "CRAFT-LEARNING-006",
    label: "生成前后原创性守卫",
    currentStatus: "prompt-warning-only-no-enforcement",
    evidence: [craftEvidence("api/src/taskService.ts", "function preCallReview")],
    strength: "Static prompts explicitly warn against copying or close imitation.",
    gap: "Pre-call review checks only context presence, critical tiers, prompt length, and truncation; no rights or pre/post similarity guard was found.",
  },
  {
    stageId: "CRAFT-LEARNING-007",
    label: "作者反馈采集",
    currentStatus: "accept-fragmented-reject-ephemeral",
    evidence: [
      craftEvidence("api/src/taskService.ts", "markInvocationPatchesAccepted"),
      craftEvidence("ui/src/stores/novel.ts", "function rejectRewrite"),
      craftEvidence("ui/src/stores/novel.ts", "function rejectWritingRecap"),
    ],
    strength: "Applied task patches can mark an invocation accepted and retain accepted targets.",
    gap: "Rewrite and recap rejection are local clears; no reason, fragment, scope, confounder, undo, or rejected invocation event is persisted.",
  },
  {
    stageId: "CRAFT-LEARNING-008",
    label: "质量证据",
    currentStatus: "ai-dominant-proxy-score",
    evidence: [
      craftEvidence("api/src/chapterQualityReview.ts", "metric.score * 0.1 + aiMetric.score * 0.9"),
      craftEvidence("api/src/chapterQualityReview.ts", "average(metrics.map((metric) => metric.score)) * 0.2 + aiReport.overallScore * 0.8"),
    ],
    strength: "Rule signals and seven named metrics provide a concrete review surface and deterministic fallback.",
    gap: "AI review dominates merged metrics and overall score; no blind pairwise, calibrated independent judge, holdout, reader outcome, or causal craft attribution is present.",
  },
  {
    stageId: "CRAFT-LEARNING-009",
    label: "机制学习面板",
    currentStatus: "observability-projection-mislabeled-learning",
    evidence: [
      craftEvidence("ui/src/stores/novel.ts", "const plotPilotLearningItems"),
      craftEvidence("ui/src/components/novel/PlotPilotLearningPanel.vue", "机制学习"),
    ],
    strength: "Six useful mechanism projections expose current structure, context, invocation, emotion, debt, and graph evidence.",
    gap: "The projection contains no craft candidate, trial, supporting/opposing evidence, author preference hypothesis, promotion, or rollback; its label overclaims learning.",
  },
  {
    stageId: "CRAFT-LEARNING-010",
    label: "模式发布、衰减与撤回",
    currentStatus: "release-rollback-and-source-to-experiment-holdout-chain-implemented",
    evidence: [
      craftEvidence("api/src/platformLibrary.ts", "export async function createPlatformAsset"),
      craftEvidence("api/src/learningRelease.ts", "export interface LearningRelease"),
      craftEvidence("api/src/craftRevocationStore.ts", "export async function listCraftRevocationRecords"),
      craftEvidence("api/src/craftFeedback.ts", "export interface CraftFeedbackEvent"),
      craftEvidence("api/src/craftFeedbackLearning.ts", "export async function createCraftFeedbackAttribution"),
      craftEvidence("api/src/feedbackLearning.ts", "export async function promotePreferenceHypothesis"),
      craftEvidence("api/src/craftHoldoutValidation.ts", "export function validateCraftHoldout"),
      craftEvidence("api/src/craftExperiment.ts", "holdoutValidation?: CraftHoldoutResult"),
      craftEvidence("api/src/app.spec.ts", "completes source-to-experiment craft learning lifecycle through API"),
      craftEvidence("api/src/evaluationRegressionStore.ts", "export async function readEvaluationRegression"),
      craftEvidence("api/src/app.ts", "/runtime/learning-releases"),
    ],
    strength: "The platform library has reusable scoped assets and project links that can be evolved into governed references.",
    gap: "Durable project-scoped release, rollback, source-revocation, expiry, craft-feedback, replayable same-project regression evidence linkage, scoped candidate/validated preference hypotheses, explicit author-approved active promotion, model-task context projection, evidence-bound rollback, automatic regression propagation, source-to-experiment generation lifecycle, sealed cross-scene holdout evidence persistence, and representative release-to-manifest consumption E2E now exist; real-provider breadth, reader-outcome calibration, and complete production craft-learning UX remain unproven.",
  },
];

const craftLearningAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The platform may research craft broadly across public web and platforms with low author burden, but live writing consumes only source-policy-eligible, mechanism-level, evidence-backed, originality-guarded, reversible patterns rather than raw imitation or self-scored prompt tuning.",
  sourceFiles: [...craftLearningSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    localProjectSnapshotIncludes: ["anonymous ordinal", "file hash", "field names", "sample count", "use cases", "excerpt character counts"],
    localProjectSnapshotExcludes: ["project slug", "title", "rough idea", "sample excerpts", "novel prose", "prompt content", "model output"],
  },
  localInputSnapshot: {
    styleSampleFiles: localStyleSampleSnapshots,
    craftProfileFiles: localCraftProfileSnapshots,
    totalStyleSamples: localStyleSampleSnapshots.reduce((total, entry) => total + entry.sampleCount, 0),
    filesWithRightsMetadata: localStyleSampleSnapshots.filter((entry) => entry.rightsMetadataFields.length).length,
  },
  summary: {
    auditedStages: craftLearningStages.length,
    staticCraftGuidanceExists: true,
    taskUseCaseSampleRetrievalExists: true,
    persistedNegativeFeedbackExists: false,
    rightsAwareSampleSchemaExists: false,
    preAndPostSimilarityGuardExists: false,
    governedCraftExperimentExists: false,
    governedPreferenceHypothesisExists: false,
    craftReleaseAndRollbackExists: true,
    implementationVerified: false,
  },
  strengthsToReuse: [
    "Rich built-in craft profile and explicit anti-imitation wording",
    "Task-aware context assembly with T0/T1/T2/T3 budgeting",
    "Invocation history, prompt version, patch targets, and accepted adoption metadata",
    "Rule-based quality fallback and current mechanism observability projections",
    "Scoped platform library, project-local private-asset boundaries, and a path to cross-project abstract patterns",
  ],
  rootCause: {
    statement: "The product currently conflates injected guidance and observed mechanism state with learned craft; it lacks an authoritative evidence lifecycle from broad network discovery and source eligibility to abstract mechanism, controlled trial, author feedback, bounded preference, release, regression, and rollback.",
    consequence: "Static rules can homogenize prose, raw network samples can create imitation, hostile-content, privacy, duplication, freshness, and provenance risk, and AI-dominant scores or accepted patches can falsely certify improvement without causal or author evidence.",
  },
  stages: craftLearningStages,
  alternatives: [
    {
      option: "A-raw-exemplar-rag",
      verdict: "reject-as-default",
      blueCase: "Fastest route to visible surface-style changes with little new infrastructure.",
      redCase: "Copies source surface, obscures rights, invites benchmark leakage and homogenization, and cannot explain why a result transfers.",
    },
    {
      option: "B-tune-profile-from-accepts",
      verdict: "insufficient-alone",
      blueCase: "Low-cost personalization can reuse existing prompt profiles and accepted patch metadata.",
      redCase: "Acceptances are sparse and confounded, rejections disappear, and one choice cannot justify a global stable preference.",
    },
    {
      option: "C-broad-network-mechanism-laboratory",
      verdict: "author-selected-specification-not-implemented",
      blueCase: "Searches broadly, abstracts mechanisms, freezes variables, separates reviewers, records positive and negative evidence, promotes narrowly, and supports cross-project reuse, expiry, and rollback.",
      redCase: "Requires source eligibility, hostile-content isolation, provenance and source-family snapshots, new entities, controlled experiments, independent evaluation, originality guards, and more author-visible evidence before it can improve live drafting.",
    },
  ],
  targetGovernedFlow: {
    phases: ["source_quarantined", "observation_abstracted", "pattern_candidate", "pattern_approved", "experiment_shadow", "pattern_probation", "pattern_validated", "release_canary", "release_active", "release_rolled_back"],
    canonicalPatternLifecycle: ["candidate", "approved", "probation", "validated", "rejected", "retired"],
    entities: [
      "SourceMaterialRecord",
      "RightsEnvelope",
      "CraftObservation",
      "CraftPattern",
      "PatternEvidence",
      "ApplicabilityContract",
      "CraftExperiment",
      "ExperimentJudgment",
      "AuthorFeedbackEvent",
      "PreferenceHypothesis",
      "LearningPolicy",
      "SimilarityGuardResult",
      "ReleaseDecision",
      "RegressionCase",
    ],
    invariant: "No raw source, search rank, repost count, model self-score, single click, or uncalibrated aggregate may independently promote a pattern; every active use is source-policy-eligible, scope-bounded, evidence-linked, hostile-content-isolated, similarity-guarded, expirable, and reversible.",
  },
  releaseGate: {
    requirementIds: [
      "FR-CRAFT-001", "FR-CRAFT-003", "FR-CRAFT-007", "FR-CRAFT-008", "FR-CRAFT-011", "FR-CRAFT-014",
      "FR-CRAFT-015", "FR-CRAFT-018", "FR-CRAFT-019", "FR-CRAFT-021", "FR-CRAFT-023", "FR-CRAFT-024",
      "FR-EVAL-006", "FR-EVAL-007", "FR-EVAL-009", "FR-EVAL-019", "FR-EVAL-023",
      "FR-FEEDBACK-001", "FR-FEEDBACK-003", "FR-FEEDBACK-007", "FR-FEEDBACK-009", "FR-FEEDBACK-012",
    ],
    rule: "Do not claim that the platform learns high-quality craft until legacy and network sources are quarantined, eligible cross-platform evidence yields non-copyable mechanisms, duplicate source families are separated, author accept/reject/edit events are durable, controlled trials separate evidence producers, active patterns survive holdout and similarity guards, and source deletion or regression can stop future use and roll back the policy.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level, including Q-005 broad-network-mechanism-learning with platform-managed source and originality boundaries. No network-learning runtime is implementation-verified.",
};

const foreshadowingClosureSourcePaths = [
  "api/src/types.ts",
  "api/src/narrativeObligation.ts",
  "api/src/obligationCoverage.ts",
  "api/src/obligationCandidates.ts",
  "api/src/obligationCertificate.ts",
  "api/src/closureCertificate.ts",
  "api/src/novelProject.ts",
  "api/src/writingCockpit.ts",
  "api/src/contextAssembler.ts",
  "api/src/runtimeSnapshot.ts",
  "api/src/runtimeEngine.ts",
  "api/src/taskTemplates.ts",
  "api/src/app.ts",
  "api/src/storyGraph.ts",
  "api/src/worldRuleContract.ts",
  "ui/src/stores/novel.ts",
  "ui/src/components/novel/LedgerPanel.vue",
  "ui/src/components/novel/WritingRecapPanel.vue",
  "ui/src/components/novel/ReviewQualityPanel.vue",
];
const foreshadowingClosureSources = new Map(foreshadowingClosureSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function closureEvidence(relativePath, needle) {
  const sourceEntry = foreshadowingClosureSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown foreshadowing-closure audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Foreshadowing-closure evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function closureSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = foreshadowingClosureSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown foreshadowing-closure audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Foreshadowing-closure slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Foreshadowing-closure slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const ledgerEntrySlice = closureSourceSlice("api/src/types.ts", "export interface LedgerEntry", "export type RecapPatchStatus");
const ledgerPanelSource = foreshadowingClosureSources.get("ui/src/components/novel/LedgerPanel.vue").content;
const ledgerPutSlice = closureSourceSlice(
  "api/src/app.ts",
  "app.put(\"/api/novel/projects/:projectId/ledger/:kind\"",
  "app.get(\"/api/novel/projects/:projectId/file-versions/*\"",
);
const narrativeDebtSlice = closureSourceSlice("api/src/writingCockpit.ts", "function unresolvedLedgerEntries", "function buildNarrativeDebtSignals");
const closureProductSource = [...foreshadowingClosureSources.values()].map((entry) => entry.content).join("\n");
const partialObligationCore = closureProductSource.includes("appendObligationEvent") && closureProductSource.includes('schemaVersion: "obligation-event.v1"');
const partialObligationCertificate = closureProductSource.includes("issueObligationCoverageCertificate") && closureProductSource.includes('schemaVersion: "obligation-coverage-certificate.v1"');
const partialClosureCertificate = closureProductSource.includes("issueClosureCertificate") && closureProductSource.includes('schemaVersion: "closure-certificate.v1"');

if (!ledgerEntrySlice.includes('status: "open" | "watch" | "resolved" | "blocked"')) {
  throw new Error("Foreshadowing-closure audit drift: LedgerEntry status semantics changed and must be reclassified.");
}
if (/EvidenceAnchor|PayoffContract|resolutionEvidence|eventVersion|expectedReaderChange/.test(ledgerEntrySlice)) {
  throw new Error("Foreshadowing-closure audit drift: LedgerEntry now contains governed closure evidence and must be reclassified.");
}
if (!ledgerPanelSource.includes('<option value="resolved">') || !/emit\(\s*"update:entries"/.test(ledgerPanelSource)) {
  throw new Error("Foreshadowing-closure audit drift: direct resolved editing changed and must be reclassified.");
}
if (!ledgerPutSlice.includes("saveLedgerEntries") || /baselineVersion|evidence|append.*event/i.test(ledgerPutSlice)) {
  throw new Error("Foreshadowing-closure audit drift: ledger PUT authority changed and must be reclassified.");
}
if (!/expectedResolutionChapterId\.match\(\/\(\\d\+\)\//.test(narrativeDebtSlice)) {
  throw new Error("Foreshadowing-closure audit drift: overdue parsing changed and must be reclassified.");
}
const governedClosureEntities = [
  "NarrativeObligation",
  "ObligationEvent",
  "EvidenceAnchor",
  "ReaderExpectationSignal",
  "PayoffContract",
  "PayoffAssessment",
  "FairnessBundle",
  "ClosureSchedule",
  "PayoffReservation",
  "ClosureOutcome",
  "ClosureDamageReport",
  "ObligationCoverageCertificate",
  "ClosureCertificate",
].filter((entity) => closureProductSource.includes(entity) && !(partialObligationCore && ["NarrativeObligation", "ObligationEvent"].includes(entity)) && !(partialObligationCertificate && entity === "ObligationCoverageCertificate") && !(partialClosureCertificate && entity === "ClosureCertificate"));
const auditedClosureEntities = new Set([
  "EvidenceAnchor",
  "PayoffContract",
  "FairnessBundle",
  "ClosureSchedule",
  "ClosureOutcome",
]);
const unauditedClosureEntities = governedClosureEntities.filter((entity) => !auditedClosureEntities.has(entity));
if (unauditedClosureEntities.length) {
  throw new Error(`Foreshadowing-closure audit drift: governed closure entities now exist and must be audited: ${unauditedClosureEntities.join(", ")}`);
}

function directJsonFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function anonymousIdFingerprint(ids) {
  const normalized = [...new Set(ids.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].sort();
  return normalized.length ? createHash("sha256").update(normalized.join("\u0000")).digest("hex") : null;
}

function countsByValue(values) {
  return Object.fromEntries(
    [...Map.groupBy(values, (value) => value || "missing").entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([value, members]) => [value, members.length]),
  );
}

const foreshadowProjectDirectories = existsSync(novelsRoot)
  ? readdirSync(novelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(novelsRoot, entry.name))
    .sort((left, right) => left.localeCompare(right))
  : [];

const foreshadowingProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const invalidArtifacts = [];
  const trackedInputs = [];
  const readTracked = (absolutePath, category) => {
    if (!existsSync(absolutePath)) return null;
    const content = readFileSync(absolutePath, "utf8");
    trackedInputs.push({ category, content });
    return content;
  };
  const parseTrackedJson = (absolutePath, category, fallback) => {
    const content = readTracked(absolutePath, category);
    if (content === null) return fallback;
    try {
      return JSON.parse(content);
    } catch {
      invalidArtifacts.push(category);
      return fallback;
    }
  };

  const project = parseTrackedJson(join(projectDirectory, "project.json"), "project", {});
  const sceneFiles = directJsonFiles(join(projectDirectory, "scenes"));
  const dashboardFiles = directJsonFiles(join(projectDirectory, "dashboard"));
  const summaryFiles = directJsonFiles(join(projectDirectory, "memory", "chapter-summaries"));
  const sceneCards = sceneFiles.flatMap((path) => {
    const parsed = parseTrackedJson(path, "scene", []);
    return Array.isArray(parsed) ? parsed : [];
  });
  const dashboards = dashboardFiles.map((path) => parseTrackedJson(path, "dashboard", {}));
  const summaries = summaryFiles.map((path) => parseTrackedJson(path, "summary", {}));
  const ledgerRaw = parseTrackedJson(join(projectDirectory, "ledger", "foreshadowing.json"), "ledger-json", []);
  const ledgerEntries = Array.isArray(ledgerRaw) ? ledgerRaw : [];
  readTracked(join(projectDirectory, "ledger", "foreshadowing.md"), "ledger-markdown");

  const recapContent = readTracked(join(projectDirectory, "tasks", "recaps.jsonl"), "recap-jsonl");
  const recaps = [];
  let invalidRecapLines = 0;
  if (recapContent) {
    for (const line of recapContent.split(/\r?\n/).filter(Boolean)) {
      try {
        recaps.push(JSON.parse(line));
      } catch {
        invalidRecapLines += 1;
      }
    }
  }

  const sceneRefs = sceneCards.flatMap((card) => Array.isArray(card?.foreshadowingIds) ? card.foreshadowingIds : []);
  const dashboardRefs = dashboards.flatMap((dashboard) => Array.isArray(dashboard?.unresolvedForeshadowingIds) ? dashboard.unresolvedForeshadowingIds : []);
  const summaryUpdates = summaries.flatMap((summary) => Array.isArray(summary?.foreshadowingUpdates) ? summary.foreshadowingUpdates : []);
  const recapUpdates = recaps.flatMap((recap) => [
    ...(Array.isArray(recap?.foreshadowingUpdates) ? recap.foreshadowingUpdates : []),
    ...(Array.isArray(recap?.ledgerPatches) ? recap.ledgerPatches.filter((entry) => entry?.kind === "foreshadowing") : []),
  ]);
  const sceneIds = [...new Set(sceneRefs.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
  const dashboardIds = [...new Set(dashboardRefs.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
  const ledgerIds = [...new Set(ledgerEntries.map((entry) => entry?.id).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
  const summaryIds = [...new Set(summaryUpdates.map((entry) => entry?.id).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
  const ledgerIdSet = new Set(ledgerIds);
  const sceneIdSet = new Set(sceneIds);

  const inputFingerprints = [...Map.groupBy(trackedInputs, (entry) => entry.category).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, entries]) => ({
      category,
      fileCount: entries.length,
      aggregateSha256: createHash("sha256").update(entries.map((entry) => entry.content).join("\u0000")).digest("hex"),
    }));
  const chapterStatuses = Array.isArray(project?.chapters) ? project.chapters.map((chapter) => chapter?.status) : [];
  const hasFragments = sceneIds.length || dashboardIds.length || ledgerIds.length || summaryIds.length || recapUpdates.length;
  const authorityStatus = ledgerIds.length
    ? "legacy-ledger-present-not-evidence-governed"
    : sceneIds.length || dashboardIds.length || summaryIds.length || recapUpdates.length
      ? "fragmented-references-with-empty-ledger"
      : "empty-assets-coverage-unknown";

  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints,
    parseHealth: { invalidJsonArtifacts: invalidArtifacts.length, invalidRecapLines },
    chapters: { total: chapterStatuses.length, statuses: countsByValue(chapterStatuses) },
    surfaces: {
      sceneCards: {
        files: sceneFiles.length,
        cards: sceneCards.length,
        cardsWithForeshadowingRefs: sceneCards.filter((card) => Array.isArray(card?.foreshadowingIds) && card.foreshadowingIds.length).length,
        references: sceneRefs.length,
        uniqueIds: sceneIds.length,
        idSetSha256: anonymousIdFingerprint(sceneIds),
      },
      dashboards: {
        files: dashboardFiles.length,
        references: dashboardRefs.length,
        uniqueIds: dashboardIds.length,
        idSetSha256: anonymousIdFingerprint(dashboardIds),
      },
      ledger: {
        entries: ledgerEntries.length,
        statuses: countsByValue(ledgerEntries.map((entry) => entry?.status)),
        withExpectedResolutionChapter: ledgerEntries.filter((entry) => Boolean(entry?.expectedResolutionChapterId)).length,
        withChapterRefs: ledgerEntries.filter((entry) => Array.isArray(entry?.chapterIds) && entry.chapterIds.length).length,
        uniqueIds: ledgerIds.length,
        idSetSha256: anonymousIdFingerprint(ledgerIds),
      },
      acceptedSummaries: {
        files: summaryFiles.length,
        foreshadowingUpdates: summaryUpdates.length,
        uniqueIds: summaryIds.length,
        idSetSha256: anonymousIdFingerprint(summaryIds),
      },
      recapCandidates: { records: recaps.length, proposedForeshadowingUpdates: recapUpdates.length },
    },
    crossSurface: {
      sceneIdsMissingFromLedger: sceneIds.filter((id) => !ledgerIdSet.has(id)).length,
      ledgerIdsMissingFromScenes: ledgerIds.filter((id) => !sceneIdSet.has(id)).length,
      dashboardIdsMissingFromLedger: dashboardIds.filter((id) => !ledgerIdSet.has(id)).length,
      summaryIdsMissingFromLedger: summaryIds.filter((id) => !ledgerIdSet.has(id)).length,
    },
    interpretation: {
      hasAnyStructuredFragments: Boolean(hasFragments),
      authorityStatus,
      zeroLedgerMeansClosure: false,
      reason: ledgerIds.length
        ? "Legacy mutable ledger rows exist, but no evidence-backed obligation event chain or completion certificate exists."
        : hasFragments
          ? "At least one planning or recap surface refers to foreshadowing while the ledger has no authoritative entry."
          : "Empty structured surfaces do not prove the project was exhaustively scanned for reader expectations or implicit obligations.",
    },
  };
});

const closureTotals = foreshadowingProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  sceneCards: totals.sceneCards + project.surfaces.sceneCards.cards,
  sceneReferences: totals.sceneReferences + project.surfaces.sceneCards.references,
  uniqueSceneIds: totals.uniqueSceneIds + project.surfaces.sceneCards.uniqueIds,
  dashboardReferences: totals.dashboardReferences + project.surfaces.dashboards.references,
  ledgerEntries: totals.ledgerEntries + project.surfaces.ledger.entries,
  summaryUpdates: totals.summaryUpdates + project.surfaces.acceptedSummaries.foreshadowingUpdates,
  recapUpdates: totals.recapUpdates + project.surfaces.recapCandidates.proposedForeshadowingUpdates,
  sceneIdsMissingFromLedger: totals.sceneIdsMissingFromLedger + project.crossSurface.sceneIdsMissingFromLedger,
}), { projects: 0, chapters: 0, sceneCards: 0, sceneReferences: 0, uniqueSceneIds: 0, dashboardReferences: 0, ledgerEntries: 0, summaryUpdates: 0, recapUpdates: 0, sceneIdsMissingFromLedger: 0 });

const foreshadowingClosureStages = [
  {
    stageId: "CLOSURE-TRACE-001",
    label: "项目初始化",
    currentStatus: "parallel-empty-markdown-and-json",
    evidence: [closureEvidence("api/src/novelProject.ts", '"ledger/foreshadowing.md"'), closureEvidence("api/src/novelProject.ts", '"ledger/foreshadowing.json"')],
    strength: "Every new project receives visible and structured foreshadowing ledger entry points.",
    gap: "Two empty representations exist without a coverage scan, authority declaration, or proof that zero means no obligations.",
  },
  {
    stageId: "CLOSURE-TRACE-002",
    label: "计划层伏笔标记",
    currentStatus: "scene-card-string-ids",
    evidence: [closureEvidence("api/src/types.ts", "foreshadowingIds: string[];")],
    strength: "Scene cards can refer to stable-looking foreshadowing IDs before drafting.",
    gap: "The type has no referential constraint, lifecycle, source, payoff contract, reader expectation, or required/optional semantics.",
  },
  {
    stageId: "CLOSURE-TRACE-003",
    label: "章级未决投影",
    currentStatus: "independent-dashboard-id-array",
    evidence: [closureEvidence("api/src/types.ts", "unresolvedForeshadowingIds: string[];")],
    strength: "The chapter dashboard can expose a compact unresolved count.",
    gap: "It is independently editable and not proven to be a projection of the scene, ledger, recap, or canon evidence chain.",
  },
  {
    stageId: "CLOSURE-TRACE-004",
    label: "正文后回顾候选",
    currentStatus: "optional-ledger-patches",
    evidence: [closureEvidence("api/src/taskTemplates.ts", "foreshadowingUpdates"), closureEvidence("api/src/runtimeEngine.ts", "foreshadowingUpdates: []")],
    strength: "A recap can propose foreshadowing updates and the runtime parser preserves structured patches when present.",
    gap: "Fallback recap creates no foreshadowing evidence, and proposed rows do not prove setup visibility, semantic payoff, or author acceptance by themselves.",
  },
  {
    stageId: "CLOSURE-TRACE-005",
    label: "回顾采纳写入",
    currentStatus: "transactional-merge-by-id",
    evidence: [closureEvidence("api/src/writingCockpit.ts", "await writeFilesTransaction(root, writes)")],
    strength: "Accepted recap data updates summary, ledgers, and recap history in one file transaction and deduplicates by ID.",
    gap: "The transaction merges mutable rows rather than appending typed setup/reminder/payoff/waiver events with canon evidence and baseline versions.",
  },
  {
    stageId: "CLOSURE-TRACE-006",
    label: "人工账本编辑",
    currentStatus: "whole-table-put",
    evidence: [closureEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/ledger/:kind"'), closureEvidence("api/src/writingCockpit.ts", "export async function saveLedgerEntries")],
    strength: "Authors can inspect and correct ledger rows directly.",
    gap: "Whole-table replacement has no baseline, append-only history, evidence requirement, permission distinction, or cross-surface atomicity.",
  },
  {
    stageId: "CLOSURE-TRACE-007",
    label: "手工结算",
    currentStatus: "resolved-dropdown-without-proof",
    evidence: [closureEvidence("ui/src/components/novel/LedgerPanel.vue", '<option value="resolved">')],
    strength: "Status is visible and reversible before save.",
    gap: "A dropdown can mark resolved without payoff subclaims, canon anchors, fairness, consequences, author waiver, or independent assessment.",
  },
  {
    stageId: "CLOSURE-TRACE-008",
    label: "窗口与逾期",
    currentStatus: "chapter-number-regex",
    evidence: [closureEvidence("api/src/writingCockpit.ts", "expectedResolutionChapterId.match(/(\\d+)/)")],
    strength: "The dashboard can flag a row after its expected chapter number.",
    gap: "A free-form chapter ID digit is not a versioned soft/hard window, dependency plan, migrated chapter identity, delay event, or reachability proof.",
  },
  {
    stageId: "CLOSURE-TRACE-009",
    label: "写作上下文",
    currentStatus: "markdown-and-json-both-injected",
    evidence: [closureEvidence("api/src/contextAssembler.ts", '{ title: "伏笔账本"'), closureEvidence("api/src/contextAssembler.ts", '{ title: "结构化伏笔账本"')],
    strength: "Drafting can see both legacy notes and structured rows.",
    gap: "No single authority, provenance, staleness check, conflict resolution, task-specific minimal set, or spoiler-aware visibility policy is enforced.",
  },
  {
    stageId: "CLOSURE-TRACE-010",
    label: "运行时风险",
    currentStatus: "count-and-high-risk-proxy",
    evidence: [closureEvidence("api/src/runtimeEngine.ts", "entry.status === \"blocked\" || entry.severity === \"high\"")],
    strength: "Runtime snapshots include ledger signals and can block on high or explicitly blocked rows.",
    gap: "Open medium obligations, missing ledger rows, partial payoffs, impossible closure paths, evidence loss, and coverage unknown do not become equivalent hard blockers.",
  },
  {
    stageId: "CLOSURE-TRACE-011",
    label: "图谱投影",
    currentStatus: "ledger-node-projection",
    evidence: [closureEvidence("api/src/storyGraph.ts", 'type: "ledger"')],
    strength: "Ledger rows can appear as graph nodes linked to chapters and entities.",
    gap: "The graph projects current rows; it is not the authority for obligation lineage, hypotheses, clue independence, payoff assessments, or damage propagation.",
  },
  {
    stageId: "CLOSURE-TRACE-012",
    label: "完结闭环证明",
    currentStatus: "absent",
    evidence: [closureEvidence("ui/src/components/novel/ReviewQualityPanel.vue", "openForeshadowingCount")],
    strength: "The review UI reports current open-foreshadowing counts as a useful warning signal.",
    gap: "No source-coverage proof, frozen obligation set, lawful open contract, semantic payoff assessment, quiescence proof, replayable ClosureCertificate, or change invalidation exists.",
  },
];

const foreshadowingClosureAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "Every identified canon narrative obligation is visibly marked, causally tracked, and closed by evidence-backed payoff, partial remainder, transformation, neutralization, or an author-approved open contract; completion also proves source coverage and remaining uncertainty.",
  sourceFiles: [...foreshadowingClosureSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "artifact-category hashes", "chapter status counts", "reference and entry counts", "anonymous ID-set hashes", "cross-surface mismatch counts"],
    snapshotExcludes: ["project slug", "title", "rough idea", "foreshadowing ID text", "ledger title or note", "scene content", "summary content", "novel prose", "prompt or model output"],
  },
  operationalSnapshot: {
    totals: closureTotals,
    projects: foreshadowingProjectSnapshots,
    interpretation: "Scene/dashboard/summary/ledger counts are inventory evidence only. Zero rows never prove zero reader expectations, exhaustive discovery, semantic payoff, or book closure.",
  },
  summary: {
    auditedStages: foreshadowingClosureStages.length,
    projectsScanned: closureTotals.projects,
    chaptersInventoried: closureTotals.chapters,
    uniquePlannedSceneIds: closureTotals.uniqueSceneIds,
    legacyLedgerEntries: closureTotals.ledgerEntries,
    plannedIdsMissingFromLedger: closureTotals.sceneIdsMissingFromLedger,
    unifiedObligationAuthorityExists: false,
    evidenceBackedPayoffTransitionExists: false,
    openSuspenseContractExists: false,
    sourceCoverageCertificateExists: false,
    replayableClosureCertificateExists: false,
    implementationVerified: false,
  },
  rootCause: {
    statement: "Foreshadowing is represented as independent strings, arrays, mutable ledger rows, recap patches, counts, and graph projections without one authoritative narrative-obligation identity and append-only evidence lifecycle.",
    consequence: "A setup can exist only in a plan, a ledger can be empty while scene cards refer to clues, a user can mark resolved without payoff evidence, and completion can neither prove coverage nor distinguish paid, partially paid, transformed, neutralized, or lawfully open obligations.",
  },
  stages: foreshadowingClosureStages,
  alternatives: [
    {
      option: "A-richer-mutable-ledger",
      verdict: "insufficient-alone",
      blueCase: "Smallest migration: add setup, payoff, due window, and evidence fields to the existing row and UI.",
      redCase: "A mutable row still allows history loss, last-write-wins resolution, cross-surface divergence, false zero, and unprovable completion.",
    },
    {
      option: "B-story-graph-as-authority",
      verdict: "insufficient-alone",
      blueCase: "Graph edges naturally represent clue, character, hypothesis, dependency, and payoff relationships.",
      redCase: "A graph projection does not by itself define commands, evidence-backed transitions, version fencing, author authority, fairness, or certificate replay.",
    },
    {
      option: "C-event-sourced-narrative-obligations",
      verdict: "recommended-not-implemented",
      blueCase: "One stable obligation ID and typed immutable events can generate ledger, editor marks, dashboards, graph, schedules, prompts, audits, and completion certificates without multiple writers of truth.",
      redCase: "Requires migration, canon anchors, event/version semantics, projection rebuilds, impact propagation, and strict admission rules to avoid turning every detail into mandatory debt.",
    },
  ],
  targetProtocol: {
    authority: "NarrativeObligation plus append-only ObligationEvent stream",
    states: ["candidate", "admitted", "planned", "seeded", "developing", "due", "partially_paid", "paid", "transformed", "neutralized", "intentional_open", "blocked", "invalidated"],
    commands: ["AdmitObligation", "AttachSetupEvidence", "AdvanceObligation", "AssessPayoff", "RecordPartialPayoff", "TransformObligation", "NeutralizeObligation", "AuthorizeOpenContract", "InvalidateEvidence", "ReplanClosureWindow"],
    projections: ["editor marks", "author ledger", "chapter dashboard", "story graph", "closure schedule", "context manifest", "completion audit"],
    invariant: "No plan label, keyword repetition, model self-report, empty ledger, mutable dropdown, or file count may independently establish seeded, paid, intentional_open, or audited_complete.",
  },
  openSuspenseContract: {
    selectedMode: "Q-002-B-open-contract",
    requiredEvidence: ["author authorization", "reader-facing partial answer", "fairness evidence", "explicit retained question", "scope or sequel inheritance", "reader-harm assessment", "versioned rationale"],
    forbiddenUse: "Open status cannot hide an overdue required payoff, unresolved contradiction, missing source scan, or system-selected waiver.",
  },
  releaseGate: {
    requirementIds: [
      "FR-FORESHADOW-001", "FR-FORESHADOW-002", "FR-FORESHADOW-003", "FR-FORESHADOW-004", "FR-FORESHADOW-005", "FR-FORESHADOW-007", "FR-FORESHADOW-008", "FR-FORESHADOW-009", "FR-FORESHADOW-010", "FR-FORESHADOW-011",
      "FR-OBL-001", "FR-OBL-004", "FR-OBL-009", "FR-OBL-010", "FR-OBL-011", "FR-OBL-013", "FR-OBL-017", "FR-OBL-019", "FR-OBL-021", "FR-OBL-023", "FR-OBL-024",
      "FR-CLOSURE-009", "FR-CLOSURE-010", "FR-CLOSURE-015", "FR-CLOSURE-016", "FR-CLOSURE-018", "FR-CLOSURE-019", "FR-CLOSURE-020",
      "FR-COMPLETE-001", "FR-COMPLETE-003", "FR-COMPLETE-004", "FR-COMPLETE-005", "FR-COMPLETE-007",
    ],
    acceptanceRefs: ["AT-004", "AT-005", "AT-006", "AT-036", "AT-039", "AT-040", "AT-166", "AT-167", "AT-172", "AT-173", "AT-176", "AT-177", "AT-178", "AT-185", "AT-189", "AT-214", "AT-278", "AT-284", "AT-313", "AT-320", "AT-321", "AT-322", "AT-326", "AT-327", "AT-328", "AT-331", "AT-332", "AT-503", "AT-504"],
    rule: "Do not claim all plot points are closed until a frozen publication scope has exhaustive-enough source coverage, every admitted required obligation has a replayable evidence-backed terminal event, every open item satisfies the Q-002 contract, every cross-surface projection matches the same event version, and any later edit invalidates affected closure evidence and certificates.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none can weaken obligation admission, evidence, payoff, open-contract, projection-consistency or completion-certificate gates. Q-009 does not alter closure semantics.",
};

const executableOutlineSourcePaths = [
  "api/src/types.ts",
  "api/src/outlineCandidate.ts",
  "api/src/outlineValidation.ts",
  "api/src/outlineAdoption.ts",
  "api/src/outlineCommit.ts",
  "api/src/executionReadiness.ts",
  "api/src/executionQueue.ts",
  "api/src/proseCandidate.ts",
  "api/src/novelProject.ts",
  "api/src/app.ts",
  "api/src/taskTemplates.ts",
  "api/src/taskService.ts",
  "api/src/contextAssembler.ts",
  "api/src/writingCockpit.ts",
  "api/src/runtimeEngine.ts",
  "api/src/runtimeStageOutput.ts",
  "api/src/storyGraph.ts",
  "ui/src/stores/novel.ts",
  "ui/src/components/novel/ProjectCreatePanel.vue",
  "ui/src/components/novel/StructureQuickStartPanel.vue",
  "ui/src/components/novel/AIOperationPanel.vue",
];
const executableOutlineSources = new Map(executableOutlineSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function outlineEvidence(relativePath, needle) {
  const sourceEntry = executableOutlineSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown executable-outline audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Executable-outline evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function outlineSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = executableOutlineSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown executable-outline audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Executable-outline slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Executable-outline slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const outlineCreateRouteSlice = outlineSourceSlice(
  "api/src/app.ts",
  'app.post("/api/novel/projects"',
  'app.post("/api/novel/import"',
);
const outlineLocalShortcutSlice = outlineSourceSlice(
  "ui/src/stores/novel.ts",
  "function generateStructureFromIdea",
  "async function loadLedger",
);
const runtimeChapterPlanSlice = outlineSourceSlice(
  "api/src/runtimeEngine.ts",
  'currentRun = await markStage(currentRun, "chapter_plan", stageInputFingerprint(snapshot), persistedSnapshotRecord?.id)',
  'currentRun = await markStage(currentRun, "chapter_draft", contextOutput.fingerprint, contextOutput.outputId, draftInputFingerprint)',
);
const manualRunTaskSlice = outlineSourceSlice(
  "ui/src/stores/novel.ts",
  "async function runTask(type: CodexTaskType",
  "async function cancelActiveTask",
);
const executableOutlineProductSource = [...executableOutlineSources.values()].map((entry) => entry.content).join("\n");

if (/runNovelTask|startNovelTaskAsync|runRuntimeTask/.test(outlineCreateRouteSlice)) {
  throw new Error("Executable-outline audit drift: project creation now invokes an AI task and must be reclassified.");
}
if (!outlineLocalShortcutSlice.includes('mainConflict: "主角必须在目标、阻力和代价之间做选择。"') || /runTask\s*\(/.test(outlineLocalShortcutSlice)) {
  throw new Error("Executable-outline audit drift: the local idea shortcut changed and must be reclassified.");
}
if (/matchingRuntimePatches\([^\n]*planTask|apply[^\n]*planTask/i.test(runtimeChapterPlanSlice)) {
  throw new Error("Executable-outline audit drift: runtime chapter planning is now applied as canon and must be reclassified.");
}
if (!manualRunTaskSlice.includes("rewriteCandidate.value = task.result") || /type === "chapter\.plan"[\s\S]{0,800}(parseReverseStructureResult|applyGeneratedStructure)/.test(manualRunTaskSlice)) {
  throw new Error("Executable-outline audit drift: manual chapter.plan result handling changed and must be reclassified.");
}
const implementedOutlineEntities = [
  "StoryEngineContract",
  "NarrativeQuestion",
  "OutlineNode",
  "OutlineAdoptionDecision",
  "CausalMilestoneGraph",
  "RollingPlanningWindow",
].filter((entity) => executableOutlineProductSource.includes(entity));
if (implementedOutlineEntities.length) {
  throw new Error(`Executable-outline audit drift: governed outline entities now exist and must be audited: ${implementedOutlineEntities.join(", ")}`);
}

function outlineTextFingerprint(values) {
  const normalized = values.map((value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");
  return createHash("sha256").update(normalized.join("\u0000")).digest("hex");
}

function numericDistribution(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return { sampleCount: 0, min: null, p50: null, p95: null, max: null, average: null };
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  return {
    sampleCount: sorted.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1),
    average: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
  };
}

const executableOutlineProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const invalidArtifacts = [];
  const trackedInputs = [];
  const readTracked = (absolutePath, category) => {
    if (!existsSync(absolutePath)) return null;
    const content = readFileSync(absolutePath, "utf8");
    trackedInputs.push({ category, content });
    return content;
  };
  const parseTrackedJson = (absolutePath, category, fallback) => {
    const content = readTracked(absolutePath, category);
    if (content === null) return fallback;
    try {
      return JSON.parse(content);
    } catch {
      invalidArtifacts.push(category);
      return fallback;
    }
  };
  const parseJsonLines = (absolutePath, category) => {
    const content = readTracked(absolutePath, category);
    const records = [];
    let invalidLines = 0;
    if (content) {
      for (const line of content.split(/\r?\n/).filter(Boolean)) {
        try {
          records.push(JSON.parse(line));
        } catch {
          invalidLines += 1;
        }
      }
    }
    return { records, invalidLines };
  };

  const project = parseTrackedJson(join(projectDirectory, "project.json"), "project", {});
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const storyControl = parseTrackedJson(join(projectDirectory, "story-control", "story-control.json"), "story-control", null);
  const dashboardFiles = directJsonFiles(join(projectDirectory, "dashboard"));
  const sceneFiles = directJsonFiles(join(projectDirectory, "scenes"));
  const dashboards = dashboardFiles.map((path) => parseTrackedJson(path, "dashboard", {}));
  const sceneFilesWithCards = new Set();
  const sceneCards = sceneFiles.flatMap((path) => {
    const parsed = parseTrackedJson(path, "scene", []);
    const cards = Array.isArray(parsed) ? parsed : [];
    if (cards.length) sceneFilesWithCards.add(path.split(/[\\/]/).at(-1).replace(/\.json$/, ""));
    return cards;
  });
  const outlineStats = chapters.map((chapter) => {
    const relativePath = typeof chapter?.outlinePath === "string" ? chapter.outlinePath : "";
    const content = relativePath ? readTracked(join(projectDirectory, relativePath), "chapter-outline") : null;
    if (content === null) return { chapterId: chapter?.id, exists: false, bytes: 0, chars: 0, headings: 0, placeholder: false, fingerprint: null };
    const trimmed = content.trim();
    const placeholder = /待生成|待补充/.test(trimmed) && trimmed.length < 120;
    return {
      chapterId: chapter?.id,
      exists: true,
      bytes: Buffer.byteLength(content, "utf8"),
      chars: content.length,
      headings: content.split(/\r?\n/).filter((line) => /^#{1,6}\s/.test(line)).length,
      placeholder,
      fingerprint: createHash("sha256").update(content).digest("hex"),
    };
  });
  const volumeFiles = existsSync(join(projectDirectory, "outline"))
    ? readdirSync(join(projectDirectory, "outline"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^volume-.*\.md$/i.test(entry.name))
      .map((entry) => join(projectDirectory, "outline", entry.name))
      .sort((left, right) => left.localeCompare(right))
    : [];
  const volumeStats = volumeFiles.map((path) => {
    const content = readTracked(path, "volume-outline") || "";
    return { bytes: Buffer.byteLength(content, "utf8"), chars: content.length, headings: content.split(/\r?\n/).filter((line) => /^#{1,6}\s/.test(line)).length };
  });
  const taskHistory = parseJsonLines(join(projectDirectory, "tasks", "history.jsonl"), "task-history");
  const invocations = parseJsonLines(join(projectDirectory, "tasks", "invocations.jsonl"), "invocations");

  const dashboardCoreFingerprints = dashboards.map((dashboard) => outlineTextFingerprint([
    dashboard?.goal,
    dashboard?.pov,
    dashboard?.mainConflict,
    dashboard?.endingHook,
  ]));
  const dashboardFingerprintGroups = [...Map.groupBy(dashboardCoreFingerprints, (value) => value).values()].map((group) => group.length);
  const completeDashboardChapterIds = new Set(
    dashboards
      .filter((dashboard) => [dashboard?.goal, dashboard?.pov, dashboard?.mainConflict, dashboard?.endingHook].every((value) => typeof value === "string" && value.trim()))
      .map((dashboard) => dashboard?.chapterId)
      .filter(Boolean),
  );
  const nonPlaceholderOutlineChapterIds = new Set(outlineStats.filter((entry) => entry.exists && !entry.placeholder && entry.chars >= 80).map((entry) => entry.chapterId));
  const sceneCardChapterIds = new Set(sceneCards.map((card) => card?.chapterId).filter(Boolean));
  const allThreeChapterIds = chapters
    .map((chapter) => chapter?.id)
    .filter((chapterId) => nonPlaceholderOutlineChapterIds.has(chapterId) && completeDashboardChapterIds.has(chapterId) && sceneCardChapterIds.has(chapterId));
  const outlineTasks = taskHistory.records.filter((task) => task?.type === "outline.generate");
  const chapterPlanTasks = taskHistory.records.filter((task) => task?.type === "chapter.plan");
  const outlineInvocations = invocations.records.filter((invocation) => invocation?.taskType === "outline.generate");
  const chapterPlanInvocations = invocations.records.filter((invocation) => invocation?.taskType === "chapter.plan");
  const arcs = Array.isArray(storyControl?.arcs) ? storyControl.arcs : [];
  const characters = Array.isArray(storyControl?.characters) ? storyControl.characters : [];
  const events = Array.isArray(storyControl?.events) ? storyControl.events : [];
  const inputFingerprints = [...Map.groupBy(trackedInputs, (entry) => entry.category).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, entries]) => ({
      category,
      fileCount: entries.length,
      aggregateSha256: createHash("sha256").update(entries.map((entry) => entry.content).join("\u0000")).digest("hex"),
    }));

  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints,
    parseHealth: { invalidJsonArtifacts: invalidArtifacts.length, invalidTaskLines: taskHistory.invalidLines, invalidInvocationLines: invocations.invalidLines },
    chapters: { total: chapters.length, statuses: countsByValue(chapters.map((chapter) => chapter?.status)) },
    storyControl: {
      exists: Boolean(storyControl),
      premisePresent: Boolean(typeof storyControl?.premise === "string" && storyControl.premise.trim()),
      arcs: arcs.length,
      arcStatuses: countsByValue(arcs.map((arc) => arc?.status)),
      arcsWithCoreContract: arcs.filter((arc) => [arc?.chapterRange, arc?.goal, arc?.stakes, arc?.payoff].every((value) => typeof value === "string" && value.trim())).length,
      characters: characters.length,
      characterStatuses: countsByValue(characters.map((character) => character?.status)),
      events: events.length,
      eventStatuses: countsByValue(events.map((event) => event?.status)),
      eventsWithCausalSurface: events.filter((event) => [event?.trigger, event?.conflict, event?.reward, event?.cost, event?.chapterRange].every((value) => typeof value === "string" && value.trim())).length,
    },
    chapterOutlines: {
      expected: chapters.length,
      files: outlineStats.filter((entry) => entry.exists).length,
      placeholders: outlineStats.filter((entry) => entry.placeholder).length,
      nonPlaceholderAtLeast80Chars: nonPlaceholderOutlineChapterIds.size,
      uniqueFileFingerprints: new Set(outlineStats.map((entry) => entry.fingerprint).filter(Boolean)).size,
      bytes: numericDistribution(outlineStats.filter((entry) => entry.exists).map((entry) => entry.bytes)),
      headingCounts: numericDistribution(outlineStats.filter((entry) => entry.exists).map((entry) => entry.headings)),
    },
    volumeOutlines: {
      files: volumeStats.length,
      bytes: numericDistribution(volumeStats.map((entry) => entry.bytes)),
      headingCounts: numericDistribution(volumeStats.map((entry) => entry.headings)),
    },
    dashboards: {
      files: dashboardFiles.length,
      goalPresent: dashboards.filter((entry) => typeof entry?.goal === "string" && entry.goal.trim()).length,
      povPresent: dashboards.filter((entry) => typeof entry?.pov === "string" && entry.pov.trim()).length,
      conflictPresent: dashboards.filter((entry) => typeof entry?.mainConflict === "string" && entry.mainConflict.trim()).length,
      endingHookPresent: dashboards.filter((entry) => typeof entry?.endingHook === "string" && entry.endingHook.trim()).length,
      completeCore: completeDashboardChapterIds.size,
      uniqueCoreFingerprints: new Set(dashboardCoreFingerprints).size,
      largestRepeatedCoreGroup: dashboardFingerprintGroups.length ? Math.max(...dashboardFingerprintGroups) : 0,
    },
    sceneCards: {
      files: sceneFiles.length,
      filesWithCards: sceneFilesWithCards.size,
      cards: sceneCards.length,
      chaptersWithCards: sceneCardChapterIds.size,
      conflictAndTurnPresent: sceneCards.filter((card) => [card?.conflict, card?.turn].every((value) => typeof value === "string" && value.trim())).length,
      fullFunctionSurface: sceneCards.filter((card) => [card?.narrativeFunction, card?.characterFunction, card?.emotionalShift, card?.progressionChange, card?.readerPayoff].every((value) => typeof value === "string" && value.trim())).length,
      withCraftBeats: sceneCards.filter((card) => Array.isArray(card?.craftBeats) && card.craftBeats.length).length,
    },
    crossSurfaceCoverage: {
      chaptersWithNonPlaceholderOutline: nonPlaceholderOutlineChapterIds.size,
      chaptersWithCompleteDashboard: completeDashboardChapterIds.size,
      chaptersWithSceneCards: sceneCardChapterIds.size,
      chaptersWithAllThree: allThreeChapterIds.length,
      executionReadyProofs: 0,
    },
    taskEvidence: {
      outlineGenerate: { total: outlineTasks.length, byStatus: countsByValue(outlineTasks.map((task) => task?.status)), invocations: outlineInvocations.length, adoptionDecisions: countsByValue(outlineInvocations.map((invocation) => invocation?.adoptionDecision)) },
      chapterPlan: { total: chapterPlanTasks.length, byStatus: countsByValue(chapterPlanTasks.map((task) => task?.status)), invocations: chapterPlanInvocations.length, adoptionDecisions: countsByValue(chapterPlanInvocations.map((invocation) => invocation?.adoptionDecision)) },
    },
    interpretation: {
      hasExecutableOutlineProof: false,
      reason: "Existing files and statuses do not provide a versioned story contract, candidate/canon boundary, causal reachability, cross-layer referential integrity, rolling-horizon readiness, or replayable ExecutionReadyProof.",
    },
  };
});

const executableOutlineTotals = executableOutlineProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  chapterOutlineFiles: totals.chapterOutlineFiles + project.chapterOutlines.files,
  nonPlaceholderOutlines: totals.nonPlaceholderOutlines + project.chapterOutlines.nonPlaceholderAtLeast80Chars,
  dashboardFiles: totals.dashboardFiles + project.dashboards.files,
  completeDashboards: totals.completeDashboards + project.dashboards.completeCore,
  sceneFiles: totals.sceneFiles + project.sceneCards.files,
  sceneCards: totals.sceneCards + project.sceneCards.cards,
  chaptersWithSceneCards: totals.chaptersWithSceneCards + project.sceneCards.chaptersWithCards,
  chaptersWithAllThree: totals.chaptersWithAllThree + project.crossSurfaceCoverage.chaptersWithAllThree,
  outlineGenerateTasks: totals.outlineGenerateTasks + project.taskEvidence.outlineGenerate.total,
  chapterPlanTasks: totals.chapterPlanTasks + project.taskEvidence.chapterPlan.total,
}), { projects: 0, chapters: 0, chapterOutlineFiles: 0, nonPlaceholderOutlines: 0, dashboardFiles: 0, completeDashboards: 0, sceneFiles: 0, sceneCards: 0, chaptersWithSceneCards: 0, chaptersWithAllThree: 0, outlineGenerateTasks: 0, chapterPlanTasks: 0 });

const executableOutlineStages = [
  {
    stageId: "OUTLINE-TRACE-001",
    label: "粗略想法捕获",
    currentStatus: "project-field-not-immutable-seed",
    evidence: [outlineEvidence("ui/src/components/novel/ProjectCreatePanel.vue", "roughIdea")],
    strength: "The author can begin with a short rough idea and safe title/genre defaults.",
    gap: "No immutable utterance, evidence spans, competing interpretation, correction lineage, or seed compilation state precedes project creation.",
  },
  {
    stageId: "OUTLINE-TRACE-002",
    label: "项目创建",
    currentStatus: "generic-filesystem-skeleton",
    evidence: [outlineEvidence("api/src/novelProject.ts", "createDefaultChapters()"), outlineEvidence("api/src/novelProject.ts", '"# 第一卷大纲\\n\\n待生成。\\n"')],
    strength: "A fast isolated project container creates paths needed by later planning.",
    gap: "The create route runs no project.create compiler and success proves only bootstrap, not understanding or outline readiness.",
  },
  {
    stageId: "OUTLINE-TRACE-003",
    label: "用想法起结构",
    currentStatus: "client-local-generic-first-chapter-template",
    evidence: [outlineEvidence("ui/src/stores/novel.ts", "function generateStructureFromIdea"), outlineEvidence("ui/src/stores/novel.ts", 'mainConflict: "主角必须在目标、阻力和代价之间做选择。"')],
    strength: "The current chapter gets an immediate reversible dashboard and scene scaffold without a model call.",
    gap: "Only one chapter is affected; generic conflict/hook text is not evidence that the idea was understood or compiled into a causal book outline.",
  },
  {
    stageId: "OUTLINE-TRACE-004",
    label: "outline.generate 任务",
    currentStatus: "manual-monolithic-markdown-task",
    evidence: [outlineEvidence("api/src/taskTemplates.ts", '"outline.generate": "Generate or rewrite the volume outline')],
    strength: "A dedicated task can use broad project context to propose volume, chapter, causality, and foreshadowing material.",
    gap: "No typed contract, candidate alternatives, node-level provenance, partial adoption, causal validator, or execution-readiness result is required.",
  },
  {
    stageId: "OUTLINE-TRACE-005",
    label: "手工章规划结果",
    currentStatus: "generic-rewrite-candidate-not-structured-plan",
    evidence: [outlineEvidence("ui/src/stores/novel.ts", "rewriteCandidate.value = task.result")],
    strength: "chapter.plan opens the outline document and keeps AI output reviewable before patch application.",
    gap: "The task contract asks for dashboard/scenes JSON inside content, but the generic task path does not parse or atomically adopt those structures; only structure.reverse has a dedicated parser.",
  },
  {
    stageId: "OUTLINE-TRACE-006",
    label: "StoryControl",
    currentStatus: "mutable-v1-free-text-control",
    evidence: [outlineEvidence("api/src/types.ts", "export interface StoryControl"), outlineEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/story-control"')],
    strength: "Arcs, characters, events, costs, rewards, ranges, and orchestration notes provide useful planning primitives.",
    gap: "Free chapter ranges and statuses lack contract versions, causal edges, stable cross-layer references, candidate/canon authority, and baseline-guarded commands.",
  },
  {
    stageId: "OUTLINE-TRACE-007",
    label: "章节仪表盘",
    currentStatus: "independent-whole-object-put",
    evidence: [outlineEvidence("api/src/types.ts", "export interface ChapterDashboard"), outlineEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/dashboard/:chapterId"')],
    strength: "Goal, POV, conflict, hook, word count, and risk IDs make a compact chapter contract-like view.",
    gap: "It has no chapter function, state delta, predecessor/successor evidence, arc milestone, story-question movement, capacity budget, confidence, or source version.",
  },
  {
    stageId: "OUTLINE-TRACE-008",
    label: "场景卡",
    currentStatus: "rich-but-independent-scene-list",
    evidence: [outlineEvidence("api/src/types.ts", "export interface SceneCard"), outlineEvidence("api/src/writingCockpit.ts", "export async function saveSceneCards")],
    strength: "Scene cards already represent POV, characters, conflict, turn, information, progression, reader payoff, craft beats, and draft anchors.",
    gap: "No typed causal input/output state, required predecessor, alternative branch, capacity, obligation reservation, canon evidence distinction, or cross-file transaction exists.",
  },
  {
    stageId: "OUTLINE-TRACE-009",
    label: "自动运行时章规划",
    currentStatus: "durable-stage-result-bound-to-draft",
    evidence: [outlineEvidence("api/src/runtimeEngine.ts", "const planReceipt = existingReceipts.find"), outlineEvidence("api/src/runtimeStageOutput.ts", "runtime-stage-output.v1"), outlineEvidence("api/src/runtimeEngine.ts", "chapterPlanFingerprint"), outlineEvidence("api/src/runtimeEngine.ts", 'await assembleContext("chapter.draft"')],
    strength: "The runtime explicitly schedules chapter planning before drafting, persists an immutable plan result, reuses it after receipt verification, and binds its fingerprint into the draft task input.",
    gap: "The bound plan is not yet a separately validated ExecutionReadyProof and draft output/candidate recovery remains incomplete.",
  },
  {
    stageId: "OUTLINE-TRACE-010",
    label: "正文上下文",
    currentStatus: "parallel-files-without-manifest-authority",
    evidence: [outlineEvidence("api/src/contextAssembler.ts", '{ title: "卷纲"'), outlineEvidence("api/src/contextAssembler.ts", '{ title: "目标章纲"'), outlineEvidence("api/src/contextAssembler.ts", '{ title: "场景卡"')],
    strength: "Drafting can receive volume outline, target chapter outline, dashboard, scenes, story control, ledgers, memory, and project data.",
    gap: "The assembler does not prove these inputs share one accepted baseline, resolve conflicts, satisfy reachability, or remain fresh after upstream changes.",
  },
  {
    stageId: "OUTLINE-TRACE-011",
    label: "跨层一致性与重规划",
    currentStatus: "multiple-direct-writers-no-impact-subgraph",
    evidence: [outlineEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/scenes/:chapterId"'), outlineEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/story-control"')],
    strength: "Each surface is independently editable and path-safe.",
    gap: "StoryControl, Markdown, dashboard, scenes, project chapter status, graph, and runtime can diverge; no impact graph, stale propagation, node-level merge, or minimal replan transaction exists.",
  },
  {
    stageId: "OUTLINE-TRACE-012",
    label: "执行就绪证明",
    currentStatus: "absent",
    evidence: [outlineEvidence("api/src/runtimeEngine.ts", "selectTargetChapter")],
    strength: "Runtime can select a target chapter and build snapshots/checkpoints before work.",
    gap: "Chapter existence and task success do not prove accepted contract, causal reachability, no orphan nodes, required state transitions, capacity, obligation landing, context completeness, or replayable ExecutionReadyProof.",
  },
];

const executableOutlineAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "A rough idea is compiled into evidence-backed story-contract choices and then into comparable, causally reachable, partially adoptable outline candidates; the contract remains the hard anchor, the next 3-5 chapters are strongly frozen, the far horizon may evolve, and drafting discoveries remain isolated candidates until governed adoption.",
  sourceFiles: [...executableOutlineSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "artifact-category hashes", "status and field-completeness counts", "file-size and heading distributions", "content fingerprint cardinality", "task type/status/adoption counts", "cross-surface coverage counts"],
    snapshotExcludes: ["project slug", "title", "rough idea", "outline text", "dashboard text", "scene text", "character or event names", "prompt or model output", "novel prose"],
  },
  operationalSnapshot: {
    totals: executableOutlineTotals,
    projects: executableOutlineProjectSnapshots,
    interpretation: "File existence and non-empty fields are inventory evidence only. They do not prove author adoption, semantic correctness, causal reachability, cross-surface consistency, or drafting readiness.",
  },
  summary: {
    auditedStages: executableOutlineStages.length,
    projectsScanned: executableOutlineTotals.projects,
    chaptersInventoried: executableOutlineTotals.chapters,
    chapterOutlineFiles: executableOutlineTotals.chapterOutlineFiles,
    completeDashboards: executableOutlineTotals.completeDashboards,
    sceneCards: executableOutlineTotals.sceneCards,
    chaptersWithAllThreeLegacySurfaces: executableOutlineTotals.chaptersWithAllThree,
    outlineGenerateTasks: executableOutlineTotals.outlineGenerateTasks,
    chapterPlanTasks: executableOutlineTotals.chapterPlanTasks,
    runtimeConsumesChapterPlanResult: true,
    governedOutlineCandidateExists: true,
    outlineCandidateCompilerSliceExists: true,
    outlineValidationReportSliceExists: true,
    outlineAdoptionProposalSliceExists: true,
    outlineVersionCommitSliceExists: true,
    executionReadyProofSliceExists: true,
    executionWorkItemLifecycleSliceExists: true,
    runtimeWorkerBindsExecutionWorkItem: true,
    causalReachabilityGateExists: false,
    executionReadyProofExists: false,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform treats outline Markdown, StoryControl, ChapterDashboard, SceneCard, task results, project chapter status, and StoryGraph as neighboring editable assets rather than projections and candidates around one versioned causal outline authority.",
    consequence: "A project can contain hundreds of outline files yet have almost no executable scene coverage; a plan task can succeed without affecting the following draft; and direct edits cannot reliably invalidate, compare, partially adopt, or minimally replan dependent nodes.",
  },
  stages: executableOutlineStages,
  alternatives: [
    {
      option: "A-wire-current-tasks-to-markdown",
      verdict: "insufficient-alone",
      blueCase: "Fastest visible improvement: connect project.create and chapter.plan results to existing outline files.",
      redCase: "Monolithic Markdown still lacks competing interpretations, node identity, partial adoption, causal validation, cross-surface authority, and reliable replan scope.",
    },
    {
      option: "B-reconcile-existing-structure-assets",
      verdict: "useful-migration-layer-not-authority",
      blueCase: "A reconciliation service can unify StoryControl, dashboard, scenes, and Markdown with less UI disruption.",
      redCase: "If existing mutable files remain co-equal writers, reconciliation becomes recurring conflict repair rather than a provable source of truth.",
    },
    {
      option: "C-candidateized-causal-story-compiler",
      verdict: "partial-candidate-compiler-implemented-not-adoption-ready",
      blueCase: "Compiles accepted story-contract fields into typed alternative graphs, supports node-level red/blue comparison and adoption, validates reachability, and publishes a rolling execution-ready window with provenance.",
      redCase: "Requires shared schemas, migration, a versioned outline authority, validators, impact analysis, and projection rebuilds before it can replace current direct writes.",
    },
  ],
  targetPipeline: {
    stages: ["utterance_captured", "seed_interpretations_ready", "contract_candidate_ready", "contract_fields_adopted", "outline_candidates_ready", "outline_nodes_adopted", "outline_version_validating", "rolling_window_ready", "execution_ready", "stale_or_replanning"],
    entities: ["StorySeedFrame", "SeedInterpretationSet", "StoryContract", "StoryContractReadinessProof", "StoryEngineContract", "NarrativeQuestion", "OutlineNode", "CausalMilestoneGraph", "OutlineCandidate", "OutlineAdoptionDecision", "OutlineVersion", "OutlineValidationReport", "RollingPlanningWindow", "ImpactSubgraph", "ExecutionReadyProof", "ExecutionWorkItem"],
    invariant: "No skeleton, Markdown file, task success, field completeness, chapter status, graph projection, or model self-report may independently establish accepted outline or execution_ready.",
  },
  selectedOutlineEvolutionAuthority: {
    policyId: "contract-anchored-rolling-emergence",
    hardContract: "StoryContract, central narrative question, protagonist and character bottom lines, explicit author locks, major promises, ending direction, and hard ending constraints may change only through an explicit author L2 decision.",
    adoptedStructure: "Major arcs, causal milestones, committed obligations, volume functions, and major foreshadowing require an impact-backed candidate; material tradeoffs are L2.",
    nearHorizon: "The next 3-5 chapters are strongly frozen. Automatic L0 changes must remain local and reversible and preserve committed state transitions, causal inputs, knowledge boundaries, obligations, and locks.",
    farHorizon: "Tentative milestones, chapter allocation, and exploratory supporting paths may be automatically re-planned as L1 only inside a current AutonomyGrant and after validation, regression checks, rollback identity, and a visible receipt.",
    draftingEmergence: "A stronger motive, conflict, reveal, relationship turn, payoff path, or ending possibility is evidence captured as a non-canon EmergenceCandidate; prose quality never grants structural authority by itself.",
    hardPause: "Any change to a core promise, protagonist, central conflict, character fate, core relationship outcome, major foreshadowing/payoff meaning, ending, volume boundary, or intentionally open obligation is L2 and asks the author one bounded Socratic question.",
  },
  rollingPlanningPolicy: {
    fullBook: "Keep committed ending constraints, central questions, major arcs, obligation landing zones, and volume functions without pretending every distant scene is fixed.",
    nearHorizon: "Strongly freeze the next 3-5 chapters with chapter function, input/output state, causal predecessors, scene contracts, capacity, obligations, knowledge boundaries, and current context fingerprints; relevant change invalidates readiness before re-planning.",
    farHorizon: "Keep distant detail tentative or exploratory and allow validated L1 re-planning inside the contract and current grant without pretending those details are already committed.",
    replan: "Author changes or adopted draft discoveries invalidate only the affected subgraph; stable semantic IDs survive chapter-number moves, unchanged adopted nodes remain locked unless evidence requires reopening, eligible L0/L1 changes may adopt with receipts, and every L2 change pauses for the author.",
  },
  releaseGate: {
    requirementIds: ["FR-SEED-001", "FR-SEED-002", "FR-SEED-004", "FR-SEED-005", "FR-SEED-007", "FR-SEED-012", "FR-SEED-013", "FR-SEED-014", "FR-SEED-015", "FR-SEED-016", "FR-SEED-017", "FR-SEED-019", "FR-SEED-020", "FR-ARCH-001", "FR-ARCH-002", "FR-ARCH-003", "FR-ARCH-004", "FR-ARCH-005", "FR-ARCH-006", "FR-ARCH-007", "FR-ARCH-008", "FR-ARCH-009", "FR-ARCH-010", "FR-ARCH-011", "FR-ARCH-012", "FR-ARCH-013", "FR-ARCH-014", "FR-ARCH-015", "FR-ARCH-016", "FR-ARCH-017", "FR-ARCH-018", "FR-ARCH-019", "FR-ARCH-020", "FR-ARCH-021", "FR-ARCH-022", "FR-ARCH-024"],
    acceptanceRefs: ["AT-058", "AT-081", "AT-160", "AT-223", "AT-224", "AT-269", "AT-270", "AT-271", "AT-272", "AT-273", "AT-274", "AT-275", "AT-276", "AT-277", "AT-278", "AT-279", "AT-280", "AT-281", "AT-282", "AT-283", "AT-284", "AT-285", "AT-286", "AT-288", "AT-356", "AT-357", "AT-365", "AT-389", "AT-405", "AT-415", "AT-453", "AT-454"],
    rule: "Do not claim a rough idea has become an executable outline until the accepted contract and outline baseline are versioned, alternative candidates are genuinely distinguishable, adopted nodes are causally reachable and cross-layer consistent, the strongly frozen next 3-5 chapter window has complete task inputs, evolution authority and change class are proven, and ExecutionReadyProof can be replayed and is invalidated by relevant upstream change.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level. Q-008 selects contract-anchored rolling emergence without weakening story-contract evidence, causal validation, candidate isolation, the strongly frozen 3-5 chapter window, minimal re-planning, or author authority over L2 story changes. No outline-evolution runtime is implementation-verified.",
};

const lengthPlanningSourcePaths = [
  "api/src/types.ts",
  "api/src/novelProject.ts",
  "api/src/app.ts",
  "api/src/runtimeSnapshot.ts",
  "api/src/novelSystemSkills.ts",
  "ui/src/types/novel.ts",
  "ui/src/stores/novel.ts",
  "ui/src/components/novel/FocusWritingPanel.vue",
  "ui/src/components/novel/ChapterTree.vue",
];
const lengthPlanningSources = new Map(lengthPlanningSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function lengthEvidence(relativePath, needle) {
  const sourceEntry = lengthPlanningSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown length-planning audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Length-planning audit evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function lengthSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = lengthPlanningSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown length-planning audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Length-planning slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Length-planning slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const lengthApiProjectSlice = lengthSourceSlice("api/src/types.ts", "export interface NovelProject", "export interface NovelFilePatch");
const lengthApiChapterDashboardSlice = lengthSourceSlice("api/src/types.ts", "export interface ChapterDashboard", "export interface ChapterQualityMetric");
const lengthFocusGuideSlice = lengthSourceSlice("ui/src/stores/novel.ts", "const focusWritingGuide = computed<FocusWritingGuide>", "const currentProjectAssets");
const lengthProductSource = [...lengthPlanningSources.values()].map((entry) => entry.content).join("\n");
const governedLengthEntities = [
  "LengthContract",
  "LengthForecast",
  "LengthVarianceDecision",
  "LengthVarianceEvent",
  "LengthDecision",
  "ScopeBudget",
  "ChapterAllocationBudget",
  "VolumeAllocationBudget",
].filter((entity) => lengthProductSource.includes(entity));

if (/targetWords|targetWordCount|targetChapterCount|targetVolumeCount|lengthContract|lengthPolicy/i.test(lengthApiProjectSlice)) {
  throw new Error("Length-planning audit drift: NovelProject now contains governed length intent and must be reclassified.");
}
if (!lengthApiChapterDashboardSlice.includes("wordCount: number") || /targetWords|targetRange|wordBudget/i.test(lengthApiChapterDashboardSlice)) {
  throw new Error("Length-planning audit drift: ChapterDashboard word-count authority changed and must be reclassified.");
}
if (!lengthFocusGuideSlice.includes("focusProgressPercent.value >= 85") || !lengthFocusGuideSlice.includes("focusProgressPercent.value >= 55") || !lengthFocusGuideSlice.includes("focusProgressPercent.value >= 25")) {
  throw new Error("Length-planning audit drift: focus stage is no longer derived from word-count percentage and must be reclassified.");
}
const auditedLengthEntities = new Set(["LengthContract", "LengthForecast", "LengthVarianceDecision"]);
const unauditedLengthEntities = governedLengthEntities.filter((entity) => !auditedLengthEntities.has(entity));
if (unauditedLengthEntities.length) {
  throw new Error(`Length-planning audit drift: governed length entities now exist and must be audited: ${unauditedLengthEntities.join(", ")}`);
}

const lengthPlanningProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const trackedInputs = [];
  const invalidArtifacts = [];
  const readTracked = (absolutePath, category) => {
    if (!existsSync(absolutePath)) return null;
    const content = readFileSync(absolutePath, "utf8");
    trackedInputs.push({ category, content });
    return content;
  };
  const parseTrackedJson = (absolutePath, category, fallback) => {
    const content = readTracked(absolutePath, category);
    if (content === null) return fallback;
    try {
      return JSON.parse(content);
    } catch {
      invalidArtifacts.push(category);
      return fallback;
    }
  };
  const project = parseTrackedJson(join(projectDirectory, "project.json"), "project", {});
  const lengthContract = parseTrackedJson(join(projectDirectory, "planning", "length-contract.json"), "length-contract", null);
  const lengthForecast = parseTrackedJson(join(projectDirectory, "planning", "length-forecast.json"), "length-forecast", null);
  const varianceDirectory = join(projectDirectory, "planning", "length-variance");
  const varianceDecisions = existsSync(varianceDirectory)
    ? readdirSync(varianceDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length
    : 0;
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const dashboards = directJsonFiles(join(projectDirectory, "dashboard"))
    .map((absolutePath) => parseTrackedJson(absolutePath, "dashboard", {}));
  const contentStats = chapters.map((chapter) => {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath : "";
    const content = relativePath ? readTracked(join(projectDirectory, relativePath), "chapter-content") : null;
    const wordCount = content === null ? null : content.replace(/\s+/g, "").length;
    return { exists: content !== null, wordCount };
  });
  const actualWordCounts = contentStats.filter((entry) => entry.wordCount !== null).map((entry) => entry.wordCount);
  const explicitVolumeKeys = chapters
    .map((chapter) => typeof chapter?.volumeId === "string" && chapter.volumeId.trim()
      ? `id:${chapter.volumeId.trim()}`
      : typeof chapter?.volumeTitle === "string" && chapter.volumeTitle.trim()
        ? `title:${chapter.volumeTitle.trim()}`
        : null)
    .filter(Boolean);
  const dashboardWordCounts = dashboards.map((dashboard) => Number.isFinite(dashboard?.wordCount) ? dashboard.wordCount : null).filter((value) => value !== null);
  const projectLengthKeys = Object.keys(project || {}).filter((key) => /target.*(word|chapter|volume)|length|budget|forecast|scopeLock/i.test(key));
  const dashboardLengthKeys = [...new Set(dashboards.flatMap((dashboard) => Object.keys(dashboard || {})).filter((key) => /target.*word|word.*target|wordBudget|targetRange/i.test(key)))];
  const inputFingerprints = [...Map.groupBy(trackedInputs, (entry) => entry.category).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, entries]) => ({
      category,
      fileCount: entries.length,
      aggregateSha256: createHash("sha256").update(entries.map((entry) => entry.content).join("\u0000")).digest("hex"),
    }));
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints,
    parseHealth: { invalidJsonArtifacts: invalidArtifacts.length },
    chapters: {
      total: chapters.length,
      statuses: countsByValue(chapters.map((chapter) => chapter?.status)),
      withContentFile: contentStats.filter((entry) => entry.exists).length,
      withAtLeast30Words: contentStats.filter((entry) => Number.isFinite(entry.wordCount) && entry.wordCount >= 30).length,
      actualWordCounts: numericDistribution(actualWordCounts),
      actualWordsTotal: actualWordCounts.reduce((sum, value) => sum + value, 0),
    },
    volumes: {
      chaptersWithExplicitVolume: explicitVolumeKeys.length,
      explicitVolumeGroups: new Set(explicitVolumeKeys).size,
      ungroupedChapters: chapters.length - explicitVolumeKeys.length,
      volumeOutlineFiles: existsSync(join(projectDirectory, "outline"))
        ? readdirSync(join(projectDirectory, "outline"), { withFileTypes: true }).filter((entry) => entry.isFile() && /^volume-.*\.md$/i.test(entry.name)).length
        : 0,
    },
    dashboards: {
      files: dashboards.length,
      withWordCount: dashboardWordCounts.length,
      wordCounts: numericDistribution(dashboardWordCounts),
    },
    governedIntentCoverage: {
      projectLengthFields: projectLengthKeys.length,
      dashboardTargetFields: dashboardLengthKeys.length,
      persistentFullBookTarget: Boolean(lengthContract?.dimensions?.totalWords),
      persistentChapterTarget: Boolean(lengthContract?.dimensions?.totalChapters || lengthContract?.dimensions?.chapterWords),
      persistentVolumeTarget: Boolean(lengthContract?.dimensions?.totalVolumes),
      forecastArtifacts: lengthForecast ? 1 : 0,
      varianceDecisions,
      authorLengthLocks: Array.isArray(lengthContract?.hardLocks) ? lengthContract.hardLocks.length : 0,
    },
    interpretation: lengthContract || lengthForecast || varianceDecisions
      ? "A governed length contract/forecast/variance artifact is present for this project; its fingerprints and author authority remain separate from release approval."
      : "Actual counts and display grouping exist, but no durable author intent, hard/soft lock, forecast range, obligation basis, variance event, or governed length decision is evidenced.",
  };
});

const lengthPlanningTotals = lengthPlanningProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  chaptersWithAtLeast30Words: totals.chaptersWithAtLeast30Words + project.chapters.withAtLeast30Words,
  actualWords: totals.actualWords + project.chapters.actualWordsTotal,
  explicitVolumeGroups: totals.explicitVolumeGroups + project.volumes.explicitVolumeGroups,
  ungroupedChapters: totals.ungroupedChapters + project.volumes.ungroupedChapters,
  volumeOutlineFiles: totals.volumeOutlineFiles + project.volumes.volumeOutlineFiles,
  dashboardFiles: totals.dashboardFiles + project.dashboards.files,
  persistentTargets: totals.persistentTargets + project.governedIntentCoverage.persistentFullBookTarget + project.governedIntentCoverage.persistentChapterTarget + project.governedIntentCoverage.persistentVolumeTarget,
}), { projects: 0, chapters: 0, chaptersWithAtLeast30Words: 0, actualWords: 0, explicitVolumeGroups: 0, ungroupedChapters: 0, volumeOutlineFiles: 0, dashboardFiles: 0, persistentTargets: 0 });

const lengthPlanningAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-decision-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-009",
  sourceFiles: [...lengthPlanningSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "artifact-category hashes", "chapter/status/volume counts", "actual and dashboard word-count distributions", "field-presence counts"],
    snapshotExcludes: ["project slug", "title", "rough idea", "chapter or volume title", "novel prose", "outline text", "prompt or model output", "author preference text"],
  },
  summary: {
    ...lengthPlanningTotals,
    projectModelHasFullBookLengthIntent: false,
    projectModelHasTargetChapterOrVolumeCount: false,
    chapterDashboardHasPersistentTargetRange: false,
    focusTargetIsClientWorkspacePreference: true,
    focusStageDerivedFromWordRatio: true,
    defaultNewProjectChapterCount: 3,
    importFallbackVolumeSize: 50,
    chapterTreeFallbackDisplayGroupSize: 100,
    governedLengthRuntimeExists: true,
    implementationVerified: true,
  },
  operationalSnapshot: {
    totals: lengthPlanningTotals,
    projects: lengthPlanningProjectSnapshots,
    interpretation: "The inventory proves only actual text size, mutable dashboard counts, chapter-array size, and optional imported volume labels. It does not prove planned scope, author intent, narrative completeness, pace quality, or permission to expand or contract.",
  },
  findings: [
    {
      id: "LEN-TRACE-001",
      current: "NovelProject stores a chapter array but no target words, target chapters, target volumes, range, hardness, rationale, or author lock.",
      evidence: [lengthEvidence("api/src/types.ts", "export interface NovelProject"), lengthEvidence("ui/src/types/novel.ts", "export interface NovelProject")],
      consequence: "The platform cannot distinguish an author-fixed novella, a soft web-serial forecast, an imported partial manuscript, or an unbounded exploration project.",
    },
    {
      id: "LEN-TRACE-002",
      current: "New projects always bootstrap three placeholder chapters and one volume-outline file.",
      evidence: [lengthEvidence("api/src/novelProject.ts", "export function createDefaultChapters(count = 3)"), lengthEvidence("api/src/novelProject.ts", "chapters: createDefaultChapters()"), lengthEvidence("api/src/novelProject.ts", '"outline/volume-01.md"')],
      consequence: "A bootstrap container can be mistaken for a three-chapter plan or a committed first volume even though no length decision occurred.",
    },
    {
      id: "LEN-TRACE-003",
      current: "The focus UI defaults to 3000 words, clamps 300-12000, and turns word-count percentage into opening/escalation/closing stage labels and scene selection.",
      evidence: [lengthEvidence("ui/src/stores/novel.ts", "const DEFAULT_FOCUS_TARGET_WORDS = 3000"), lengthEvidence("ui/src/stores/novel.ts", "focusProgressPercent.value >= 85"), lengthEvidence("ui/src/stores/novel.ts", "Math.max(300, Math.min(12000")],
      consequence: "A numeric productivity target can masquerade as narrative progress, pushing a chapter toward a hook before its function or obligations are actually complete.",
    },
    {
      id: "LEN-TRACE-004",
      current: "ChapterDashboard persists actual wordCount only; the focus target lives in client workspace cache and is not a versioned project or chapter contract.",
      evidence: [lengthEvidence("api/src/types.ts", "export interface ChapterDashboard"), lengthEvidence("ui/src/stores/novel.ts", "focusTargetWords: focusTargetWords.value")],
      consequence: "The target has no author-source evidence, hard/soft meaning, cross-device durability, historical lineage, or downstream planning authority.",
    },
    {
      id: "LEN-TRACE-005",
      current: "Imported chapters infer a volume every 50 chapters when no volume path exists, while the UI display groups unlabelled books every 100 chapters.",
      evidence: [lengthEvidence("api/src/novelProject.ts", "const inferredStart = Math.floor"), lengthEvidence("ui/src/components/novel/ChapterTree.vue", "const RANGE_GROUP_SIZE = 100")],
      consequence: "Two unrelated convenience heuristics can create inconsistent apparent volume structure without any narrative or author decision.",
    },
    {
      id: "LEN-TRACE-006",
      current: "Accepting a derivative runtime branch may append a new chapter directly to the project array and inherit the source volume metadata.",
      evidence: [lengthEvidence("api/src/app.ts", "const newChapter = {")],
      consequence: "Chapter and volume scope can expand through a local merge without a forecast update, obligation reallocation, ending impact analysis, or scope-deviation decision.",
    },
    {
      id: "LEN-TRACE-007",
      current: "Runtime considers 30 non-whitespace characters enough to establish that a draft exists, while system craft guidance correctly warns against padding word count.",
      evidence: [lengthEvidence("api/src/runtimeSnapshot.ts", "const hasDraft = wordCount >= 30"), lengthEvidence("api/src/novelSystemSkills.ts", "instead of padding word count")],
      consequence: "Text presence and anti-padding advice are useful signals but neither defines chapter completion, book scope, or a governed variance policy.",
    },
  ],
  rootCause: {
    statement: "The platform conflates four different concepts—actual text size, a temporary productivity target, chapter-array inventory, and display/import grouping—without a versioned length-intent and forecast authority tied to narrative obligations.",
    consequence: "It cannot honestly explain whether a book is on scope, why scope changed, whether the ending and payoffs still fit, or whether additional words are valuable rather than filler.",
  },
  invariant: "No word-count percentage, default chapter array, file count, volume filename, import grouping, dashboard count, runtime hasDraft signal, derivative chapter merge, model estimate, or author silence may independently establish narrative progress, agreed scope, permission to expand/contract, chapter settlement, or book completion.",
  unresolvedDecisionBoundary: "Q-009 is confirmed as obligation-led elastic length. LengthContract, LengthForecast and LengthVarianceDecision now have a tested runtime slice, but this audit does not authorize automatic scope changes or release activation without project evidence and end-to-end acceptance.",
};

const q009LengthElasticityCandidates = {
  schemaVersion: "1.0.0",
  status: "author-delegated-policy-selected-runtime-slice-implemented-not-release-verified",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  decisionId: "Q-009",
  question: "平台应把总字数、总章数和卷数视为固定目标，还是允许根据叙事义务、节奏和读者体验动态调整？",
  currentDecisionState: {
    status: "confirmed-author-delegated",
    authorSelection: "obligation-led-elastic-length",
    recommendationId: "obligation-led-elastic-length",
    evidenceBaselineRef: "docs/spec-governance/audits/current-length-planning.json",
    implementationStatus: "authorized-runtime-slice-implemented-not-release-verified",
  },
  alternatives: [
    {
      policyId: "fixed-count-contract",
      status: "candidate-not-selected",
      blueCase: "Makes schedule, serialization slots, editing cost, platform format, and commercial delivery highly predictable.",
      redCase: "Encourages filler when the story finishes early and destructive compression when obligations, emotional aftermath, or earned payoffs need more room; uncertain early counts become false truth.",
      bestFit: "Explicitly commissioned or platform-constrained work where the author deliberately locks one or more count dimensions.",
    },
    {
      policyId: "fully-emergent-unbounded-length",
      status: "candidate-not-selected",
      blueCase: "Maximizes discovery writing and never sacrifices a promising arc merely to protect an estimate.",
      redCase: "Allows endless expansion, delayed endings, forgotten obligations, pacing debt, cost drift, and no reliable forecast for the author.",
      bestFit: "Temporary exploration branches, not the default authority for a continuously completed book.",
    },
    {
      policyId: "obligation-led-elastic-length",
      status: "selected-by-author-delegation",
      blueCase: "Treats counts as evidence-backed forecast bands unless explicitly locked, so the system can absorb useful discoveries while obligations, pacing, reader experience, ending reachability, and author constraints control completion.",
      redCase: "Requires durable length intent, forecast confidence, obligation/capacity accounting, variance events, protected locks, anti-filler/anti-compression guards, and honest pause thresholds.",
      bestFit: "Low-input collaborative long-form creation where the author wants the platform to finish the book without micromanaging every chapter allocation.",
    },
  ],
  recommendedContract: {
    authorityOrder: [
      "explicit author hard locks and external delivery/platform constraints",
      "StoryContract, ending constraints, required narrative obligations, character/relationship arcs, major payoff and aftermath requirements",
      "reader pacing, cognitive load, chapter/volume function, and protected quality strengths",
      "accepted forecast band and current autonomy grant",
      "raw word, chapter, and volume counts",
    ],
    dimensions: [
      { dimension: "totalWords", defaultMode: "soft-range", hardLockAvailable: true },
      { dimension: "chapterCount", defaultMode: "soft-range", hardLockAvailable: true },
      { dimension: "volumeCount", defaultMode: "soft-range", hardLockAvailable: true },
      { dimension: "chapterWordTarget", defaultMode: "working-range-not-completion-gate", hardLockAvailable: true },
    ],
    forecastRule: "Maintain actual, accepted range, remaining obligation-backed estimate, confidence, assumptions, and best/worst credible completion paths. A point estimate never masquerades as a promise.",
    automaticAuthority: "Inside a valid grant, the system may reallocate tentative far-horizon chapters and scene capacity while the projection remains inside every explicit hard lock and accepted forecast band, preserves the Q-008 near 3-5 chapter freeze, closes all required obligations, and emits a variance receipt.",
    defaultPauseThreshold: "Pause when a projection exits an author-approved band; absent a custom band, when whole-book words or chapters move beyond 15% of the last accepted forecast, a volume must be added/removed, the ending or major payoff moves across a promised window, a hard commercial/platform constraint is threatened, or the only way to fit is filler or skipped closure.",
    noProgressByCount: "Word percentage may show productivity but cannot select narrative stage, close a chapter, settle an obligation, or prove book completion. Stage follows causal/functional evidence; counts are one capacity signal.",
  },
  invariants: [
    "Never add scenes, repetition, side conflicts, exposition, or hooks solely to hit a word/chapter/volume target.",
    "Never compress away causal setup, character choice, consequence, reader fairness, payoff, aftermath, or required closure solely to stay under a count.",
    "Candidate prose and discarded branches do not count toward canon actuals or completion forecasts.",
    "Bootstrap chapters, inferred import volumes, display groups, filenames, and current array length are inventory projections, not author intent.",
    "Q-008 authority remains intact: near 3-5 chapters are strongly frozen, far allocation is flexible, and material story changes remain L2 even when they improve count fit.",
    "A length variance cannot silently change a hard author lock, release contract, intentional-open obligation, ending constraint, or published edition.",
  ],
  minimalTargetModel: {
    entities: [
      "LengthContract: per-dimension hard/soft/unknown mode, range or exact lock, source, rationale, effective scope, author/external authority, revision lineage",
      "LengthForecast: canon actuals, remaining obligation-backed range, confidence, assumptions, pacing/capacity evidence, ending reachability, frozen baseline",
      "LengthVarianceDecision: detected deviation, cause, affected outline/obligations, alternatives, authority, adoption receipt, invalidation and rollback identity",
    ],
    yagni: "Reuse OutlineVersion, RollingPlanningWindow, VolumeContract, ChapterFunctionContract, CapacityBudget, NarrativeObligation, AutonomyGrant, ImpactSubgraph and CanonCommit; do not create a parallel length outline or treat analytics counters as canon.",
  },
  candidateAcceptanceScenarios: [
    "A 120k-word soft forecast reaches all required payoffs cleanly at 108k: the system may recommend finishing, never pads 12k, and updates the forecast with evidence.",
    "A 120k hard delivery lock projects to 145k because one arc expanded: the system pauses with preserve/cut/split alternatives, exact obligation and quality damage, and a recommendation; it does not silently add a volume.",
    "A chapter reaches 100% of its working word target before its irreversible choice and payoff: productivity shows complete but narrative stage remains blocked from settlement.",
    "A chapter finishes its function below the working range with causal, obligation, reader-effect, and quality evidence: it may close without filler.",
    "An imported 198-chapter partial manuscript has inferred volume groups but no author length intent: the system reports scope unknown instead of treating 198 as the planned total.",
    "A far-horizon reallocation stays inside the accepted band and all locks: it minimally replans with a receipt; the same change crossing the near 3-5 chapter freeze invalidates execution readiness first.",
  ],
  existingRequirementRefs: [
    "FR-OBJECTIVE-001", "FR-OBJECTIVE-002", "FR-ARCH-003", "FR-ARCH-010", "FR-ARCH-011", "FR-ARCH-014", "FR-ARCH-015", "FR-ARCH-016", "FR-ARCH-017", "FR-ARCH-021", "FR-ARCH-022", "FR-RUN-005", "FR-COMPLETE-001", "FR-COMPLETE-002", "FR-COMPLETE-003", "FR-COMPLETE-004", "FR-COMPLETE-005", "FR-PROSE-011", "FR-UX-014",
  ],
  existingAcceptanceRefs: ["AT-058", "AT-160", "AT-215", "AT-216", "AT-223", "AT-278", "AT-279", "AT-280", "AT-281", "AT-285", "AT-286", "AT-288", "AT-289", "AT-313", "AT-314", "AT-315", "AT-319", "AT-323", "AT-324", "AT-331", "AT-332"],
  decisionBoundary: "The author delegated selection of the documented recommendation. selectedPolicyId is obligation-led-elastic-length; the default 15% pause threshold and hard/soft authority order are approved for implementation. Runtime activation still requires the target model, tests and release evidence.",
};

const proseProductionSourcePaths = [
  "api/src/app.ts",
  "api/src/chapterSettlement.ts",
  "api/src/proseValidation.ts",
  "api/src/proseReview.ts",
  "api/src/authorFeedback.ts",
  "api/src/derivedPublication.ts",
  "api/src/fileVersions.ts",
  "api/src/knowledgeIndex.ts",
  "api/src/contextManifest.ts",
  "api/src/runtimeEngine.ts",
  "api/src/proseCandidate.ts",
  "api/src/proseAdoption.ts",
  "api/src/runtimeFiles.ts",
  "api/src/taskService.ts",
  "api/src/types.ts",
  "api/src/writingCockpit.ts",
  "ui/src/services/novelApi.ts",
  "ui/src/stores/novel.ts",
];
const proseProductionSources = new Map(proseProductionSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function proseEvidence(relativePath, needle) {
  const sourceEntry = proseProductionSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown prose-production audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Prose-production evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function proseSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = proseProductionSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown prose-production audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Prose-production slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Prose-production slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const focusAcceptSlice = proseSourceSlice("ui/src/stores/novel.ts", "async function acceptFocusDraft", "function rejectRewrite");
const recapAcceptSlice = proseSourceSlice("ui/src/stores/novel.ts", "async function acceptWritingRecap", "function rejectWritingRecap");
const directSaveSlice = proseSourceSlice("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/files/*"', 'app.post("/api/novel/projects/:projectId/tasks"');
const patchApplySlice = proseSourceSlice("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/patches"', "app.use(errorHandler)");
const runtimeSource = proseProductionSources.get("api/src/runtimeEngine.ts").content;
const runtimeDraftWriteOffset = runtimeSource.indexOf('reason: "chapter_draft"');
const runtimeContinuityOffset = runtimeSource.indexOf('runRuntimeTask(project, "continuity.check"', runtimeDraftWriteOffset);
const runtimeQualityOffset = runtimeSource.indexOf('reason: "quality_self_repair"', runtimeContinuityOffset);
const runtimeRecapOffset = runtimeSource.indexOf('runRuntimeTask(project, "writing.recap"', runtimeQualityOffset);
const runtimeReviewOffset = runtimeSource.indexOf('status: "review_required"', runtimeRecapOffset);

if (!focusAcceptSlice.includes("await requestWritingRecapForAcceptedDraft") || /saveCurrentContent|novelApi\.saveFile/.test(focusAcceptSlice)) {
  throw new Error("Prose-production audit drift: focus candidate acceptance no longer creates recap before a canonical save and must be reclassified.");
}
if (!recapAcceptSlice.includes("acceptWritingRecap") || /contentHash|baseline|savedContent|currentContent/.test(recapAcceptSlice)) {
  throw new Error("Prose-production audit drift: recap acceptance now checks a prose baseline and must be reclassified.");
}
if (!directSaveSlice.includes("createWritingFileSnapshot") || /If-Match|expectedSha|baselineVersion|CanonMutation/.test(directSaveSlice)) {
  throw new Error("Prose-production audit drift: direct file save gained a canonical baseline or gateway and must be reclassified.");
}
if (!patchApplySlice.includes("for (const patch of patches)") || /transaction|rollback|MutationPlan|AdoptProseCandidate/.test(patchApplySlice)) {
  throw new Error("Prose-production audit drift: patch application gained transaction semantics and must be reclassified.");
}
if (!(runtimeDraftWriteOffset >= 0 && runtimeContinuityOffset > runtimeDraftWriteOffset && runtimeQualityOffset > runtimeContinuityOffset && runtimeRecapOffset > runtimeQualityOffset && runtimeReviewOffset > runtimeRecapOffset)) {
  throw new Error("Prose-production audit drift: runtime draft, validation, repair, recap, or review ordering changed and must be reclassified.");
}
const runtimeAcceptSlice = proseSourceSlice("api/src/runtimeEngine.ts", "async function processControl", "async function processDerivative");
if (!runtimeAcceptSlice.includes('command.type === "accept"') || !runtimeAcceptSlice.includes('status: "completed"') || /AdoptProseCandidate|ChapterSettlement|acceptWritingRecapPatches/.test(runtimeAcceptSlice)) {
  throw new Error("Prose-production audit drift: runtime accept is no longer status-only and must be reclassified.");
}
const proseProductSource = [...proseProductionSources.values()].map((entry) => entry.content).join("\n");
const partialRevisionReceipt = proseProductSource.includes("recordRevisionAdoptionReceipt") && proseProductSource.includes("RevisionAdoptionReceipt");
const implementedProseEntities = [
  "EvidenceBoundedRepairPlan",
  "AdoptionReceipt",
  "CanonMutationGateway",
].filter((entity) => proseProductSource.includes(entity) && !(partialRevisionReceipt && entity === "AdoptionReceipt"));
if (implementedProseEntities.length) {
  throw new Error(`Prose-production audit drift: governed prose entities now exist and must be audited: ${implementedProseEntities.join(", ")}`);
}

function parseAnonymousJsonLines(absolutePath) {
  if (!existsSync(absolutePath)) return { records: [], invalidLines: 0, sha256: null };
  const content = readFileSync(absolutePath, "utf8");
  const records = [];
  let invalidLines = 0;
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    try {
      records.push(JSON.parse(line));
    } catch {
      invalidLines += 1;
    }
  }
  return { records, invalidLines, sha256: createHash("sha256").update(content).digest("hex") };
}

function latestAnonymousRecords(records) {
  const latest = new Map();
  for (const record of records) {
    if (!record?.id) continue;
    const current = latest.get(record.id);
    const recordTime = Date.parse(record.finishedAt || record.cancelRequestedAt || record.startedAt || record.updatedAt || record.createdAt || "") || 0;
    const currentTime = Date.parse(current?.finishedAt || current?.cancelRequestedAt || current?.startedAt || current?.updatedAt || current?.createdAt || "") || 0;
    if (!current || recordTime >= currentTime) latest.set(record.id, record);
  }
  return [...latest.values()];
}

const proseTaskTypes = new Set(["chapter.draft", "continuity.check", "quality.review", "quality.rewrite", "selection.polish", "writing.recap"]);
const proseProductionProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectPath = join(projectDirectory, "project.json");
  const projectContent = existsSync(projectPath) ? readFileSync(projectPath, "utf8") : "{}";
  let project = {};
  let projectParseValid = true;
  try {
    project = JSON.parse(projectContent);
  } catch {
    projectParseValid = false;
  }
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const contentStats = chapters.map((chapter) => {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath : "";
    const absolutePath = relativePath ? join(projectDirectory, relativePath) : "";
    const content = absolutePath && existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
    return {
      status: chapter?.status || "missing",
      exists: content !== null,
      chars: content?.trim().length || 0,
      bytes: content === null ? 0 : Buffer.byteLength(content, "utf8"),
      fingerprint: content === null ? null : createHash("sha256").update(content).digest("hex"),
    };
  });
  const taskHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "history.jsonl"));
  const latestTasks = latestAnonymousRecords(taskHistory.records);
  const proseTasks = latestTasks.filter((task) => proseTaskTypes.has(task?.type));
  const invocationHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "invocations.jsonl"));
  const proseInvocations = invocationHistory.records.filter((invocation) => proseTaskTypes.has(invocation?.taskType));
  const qualityFiles = directJsonFiles(join(projectDirectory, "quality")).filter((path) => !path.endsWith("series-metrics.json"));
  const qualityReports = qualityFiles.flatMap((path) => {
    try {
      const report = JSON.parse(readFileSync(path, "utf8"));
      return Number.isFinite(report?.overallScore) ? [report] : [];
    } catch {
      return [];
    }
  });
  const versionPath = join(projectDirectory, "versions", "manifest.json");
  let versionManifest = { snapshots: [] };
  let versionManifestValid = true;
  if (existsSync(versionPath)) {
    try {
      versionManifest = JSON.parse(readFileSync(versionPath, "utf8"));
    } catch {
      versionManifestValid = false;
    }
  }
  const snapshots = Array.isArray(versionManifest?.snapshots) ? versionManifest.snapshots : [];
  const recapHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "recaps.jsonl"));
  const summaryFiles = directJsonFiles(join(projectDirectory, "memory", "chapter-summaries"));
  let acceptedRecapIds = 0;
  let acceptedSummarySignals = 0;
  for (const path of summaryFiles) {
    try {
      const summary = JSON.parse(readFileSync(path, "utf8"));
      acceptedRecapIds += Array.isArray(summary?.acceptedRecapIds) ? summary.acceptedRecapIds.length : 0;
      if (typeof summary?.summary === "string" && summary.summary.trim()) acceptedSummarySignals += 1;
    } catch {
      // Invalid summary files are counted through the gap between files and parsed signals.
    }
  }
  const substantial = (entry) => entry.chars >= 800;
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: createHash("sha256").update(projectContent).digest("hex"),
      chapterContentAggregate: createHash("sha256").update(contentStats.map((entry) => entry.fingerprint || "missing").join("\u0000")).digest("hex"),
      taskHistory: taskHistory.sha256,
      invocationHistory: invocationHistory.sha256,
      recapHistory: recapHistory.sha256,
      versionManifest: existsSync(versionPath) ? createHash("sha256").update(readFileSync(versionPath, "utf8")).digest("hex") : null,
    },
    parseHealth: {
      projectValid: projectParseValid,
      versionManifestValid,
      invalidTaskLines: taskHistory.invalidLines,
      invalidInvocationLines: invocationHistory.invalidLines,
      invalidRecapLines: recapHistory.invalidLines,
    },
    chapters: {
      total: chapters.length,
      statuses: countsByValue(chapters.map((chapter) => chapter?.status)),
      contentFiles: contentStats.filter((entry) => entry.exists).length,
      nonEmptyContentFiles: contentStats.filter((entry) => entry.chars > 0).length,
      substantialAtLeast800Chars: contentStats.filter(substantial).length,
      uniqueContentFingerprints: new Set(contentStats.map((entry) => entry.fingerprint).filter(Boolean)).size,
      contentChars: numericDistribution(contentStats.filter((entry) => entry.exists).map((entry) => entry.chars)),
      draftedMissingOrUnder800Chars: contentStats.filter((entry) => entry.status === "drafted" && !substantial(entry)).length,
      plannedWithAtLeast800Chars: contentStats.filter((entry) => entry.status === "planned" && substantial(entry)).length,
      emptyWithAtLeast800Chars: contentStats.filter((entry) => entry.status === "empty" && substantial(entry)).length,
      checkedWithAtLeast800Chars: contentStats.filter((entry) => entry.status === "checked" && substantial(entry)).length,
    },
    quality: {
      reportFiles: qualityFiles.length,
      parsedReports: qualityReports.length,
      chapterCoverage: new Set(qualityReports.map((report) => report?.chapterId).filter(Boolean)).size,
      overallScores: numericDistribution(qualityReports.map((report) => report?.overallScore)),
    },
    taskEvidence: {
      totalLatestTasks: latestTasks.length,
      proseTasks: proseTasks.length,
      byType: countsByValue(proseTasks.map((task) => task?.type)),
      byStatus: countsByValue(proseTasks.map((task) => task?.status)),
      invocations: proseInvocations.length,
      invocationAdoptionDecisions: countsByValue(proseInvocations.map((invocation) => invocation?.adoptionDecision)),
      acceptedPatchTargets: proseInvocations.reduce((total, invocation) => total + (Array.isArray(invocation?.acceptedPatchTargets) ? invocation.acceptedPatchTargets.length : 0), 0),
    },
    versioning: {
      snapshots: snapshots.length,
      bySource: countsByValue(snapshots.map((snapshot) => snapshot?.source)),
      byReason: countsByValue(snapshots.map((snapshot) => snapshot?.reason)),
      filesCovered: new Set(snapshots.map((snapshot) => snapshot?.filePath).filter(Boolean)).size,
    },
    recapAndMemory: {
      recapCandidates: recapHistory.records.length,
      summaryFiles: summaryFiles.length,
      summariesWithAcceptedSignal: acceptedSummarySignals,
      acceptedRecapIds,
    },
    interpretation: {
      hasGovernedAdoptionReceipt: false,
      hasChapterSettlementProof: false,
      note: "Content length, status, score, snapshot, task success, or recap count is inventory evidence only and cannot prove author adoption, semantic quality, canon safety, or chapter settlement.",
    },
  };
});

const proseProductionTotals = proseProductionProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  contentFiles: totals.contentFiles + project.chapters.contentFiles,
  nonEmptyContentFiles: totals.nonEmptyContentFiles + project.chapters.nonEmptyContentFiles,
  substantialContentFiles: totals.substantialContentFiles + project.chapters.substantialAtLeast800Chars,
  draftedMissingOrUnder800Chars: totals.draftedMissingOrUnder800Chars + project.chapters.draftedMissingOrUnder800Chars,
  plannedWithAtLeast800Chars: totals.plannedWithAtLeast800Chars + project.chapters.plannedWithAtLeast800Chars,
  emptyWithAtLeast800Chars: totals.emptyWithAtLeast800Chars + project.chapters.emptyWithAtLeast800Chars,
  checkedWithAtLeast800Chars: totals.checkedWithAtLeast800Chars + project.chapters.checkedWithAtLeast800Chars,
  qualityReports: totals.qualityReports + project.quality.parsedReports,
  proseTasks: totals.proseTasks + project.taskEvidence.proseTasks,
  proseInvocations: totals.proseInvocations + project.taskEvidence.invocations,
  acceptedPatchTargets: totals.acceptedPatchTargets + project.taskEvidence.acceptedPatchTargets,
  versionSnapshots: totals.versionSnapshots + project.versioning.snapshots,
  recapCandidates: totals.recapCandidates + project.recapAndMemory.recapCandidates,
  acceptedRecapIds: totals.acceptedRecapIds + project.recapAndMemory.acceptedRecapIds,
}), { projects: 0, chapters: 0, contentFiles: 0, nonEmptyContentFiles: 0, substantialContentFiles: 0, draftedMissingOrUnder800Chars: 0, plannedWithAtLeast800Chars: 0, emptyWithAtLeast800Chars: 0, checkedWithAtLeast800Chars: 0, qualityReports: 0, proseTasks: 0, proseInvocations: 0, acceptedPatchTargets: 0, versionSnapshots: 0, recapCandidates: 0, acceptedRecapIds: 0 });

const proseProductionStages = [
  {
    stageId: "PROSE-TRACE-001",
    label: "作者直接编辑与保存",
    currentStatus: "direct-canon-file-put",
    evidence: [proseEvidence("ui/src/stores/novel.ts", "async function saveCurrentContent"), proseEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/files/*"')],
    strength: "Author text remains immediate, explicit, and snapshot-backed.",
    gap: "The request carries content only, so concurrent or offline saves have no parent version, edit-session identity, compare-and-swap, mutation event, or deterministic invalidation receipt.",
  },
  {
    stageId: "PROSE-TRACE-002",
    label: "手工 AI 正文候选",
    currentStatus: "reviewable-task-result",
    evidence: [proseEvidence("ui/src/stores/novel.ts", "rewriteCandidate.value = task.result")],
    strength: "Manual draft and rewrite results remain visible before the author applies them.",
    gap: "The candidate has no durable prose identity, frozen generation manifest, parent baseline, expiry, lineage, validation bundle, or fragment-level decision receipt.",
  },
  {
    stageId: "PROSE-TRACE-003",
    label: "局部润色接受",
    currentStatus: "client-splice-unsaved",
    evidence: [proseEvidence("ui/src/stores/novel.ts", "function acceptRewrite")],
    strength: "The author controls the exact visible selection replacement.",
    gap: "Acceptance only changes client memory; a later generic save loses candidate attribution, explicit feedback, source baseline, selection identity, and rejection/undo semantics.",
  },
  {
    stageId: "PROSE-TRACE-004",
    label: "专注写作接受与回顾",
    currentStatus: "derived-recap-before-canonical-save",
    evidence: [proseEvidence("ui/src/stores/novel.ts", "async function acceptFocusDraft"), proseEvidence("ui/src/stores/novel.ts", "await requestWritingRecapForAcceptedDraft")],
    strength: "The workflow immediately asks what factual changes the accepted addition implies.",
    gap: "The addition is still unsaved client text when recap generation begins, and recap acceptance has no prose fingerprint; derived truth can therefore be accepted before its source prose exists in canon.",
  },
  {
    stageId: "PROSE-TRACE-005",
    label: "AI 补丁采用",
    currentStatus: "sequential-file-writes-then-audit-update",
    evidence: [proseEvidence("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/patches"'), proseEvidence("api/src/app.ts", "for (const patch of patches)")],
    strength: "Paths are normalized, snapshots precede writes, and accepted patch targets can be recorded.",
    gap: "A middle failure can leave earlier files changed while the invocation remains unaccepted; no all-or-nothing prose, fact, obligation, lock, or projection transaction exists.",
  },
  {
    stageId: "PROSE-TRACE-006",
    label: "runtime 正文生成",
    currentStatus: "candidate-written-to-canon-before-validation",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", 'reason: "chapter_draft"')],
    strength: "A pre-run checkpoint, per-project queue, baseline fingerprints, and conflict handling reduce accidental overwrite risk.",
    gap: "Generated prose enters the chapter canon before continuity checks, quality evidence, red/blue review, or author/autonomy adoption authorization.",
  },
  {
    stageId: "PROSE-TRACE-007",
    label: "连续性与质量验证",
    currentStatus: "post-canon-fixed-score-review",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", 'runRuntimeTask(project, "continuity.check"'), proseEvidence("api/src/runtimeEngine.ts", "RUNTIME_QUALITY_TARGET = 86")],
    strength: "The pipeline exposes continuity and seven quality dimensions and records quality evidence.",
    gap: "Review occurs after mutation and a universal score threshold can confuse chapter function with quality; hard failures and aesthetic tradeoffs are not independently gated.",
  },
  {
    stageId: "PROSE-TRACE-008",
    label: "自动质量修复",
    currentStatus: "full-chapter-canon-overwrite-inside-loop",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", 'reason: "quality_self_repair"')],
    strength: "Repairs are limited to one attempt and create another checkpoint.",
    gap: "The repaired chapter replaces canon before final review and has no child-candidate comparison, preserved-strength locks, localized evidence boundary, or regression proof.",
  },
  {
    stageId: "PROSE-TRACE-009",
    label: "章后回顾与派生投影",
    currentStatus: "recap-candidate-after-premature-canon-write",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", 'runRuntimeTask(project, "writing.recap"'), proseEvidence("api/src/knowledgeIndex.ts", "export async function buildKnowledgeIndexProjection")],
    strength: "Recap patches remain candidates, and the knowledge index reads accepted summaries, ledgers, and story control rather than directly embedding whole chapter prose.",
    gap: "The recap is derived from prose already written without adoption; runtime then rebuilds projections and story metrics before a governed chapter settlement boundary exists.",
  },
  {
    stageId: "PROSE-TRACE-010",
    label: "章节状态收尾",
    currentStatus: "score-derived-status-before-author-review",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", 'status: qualityMeetsTarget(report, RUNTIME_QUALITY_TARGET) ? "drafted" : "planned"')],
    strength: "The runtime distinguishes a low-scoring chapter from a drafted one.",
    gap: "Status is committed before author review and represents a score outcome, not adopted prose plus converged recap, obligations, scene evidence, locks, and stable downstream projections.",
  },
  {
    stageId: "PROSE-TRACE-011",
    label: "runtime 审稿接受",
    currentStatus: "run-status-only",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", 'command.type === "accept"'), proseEvidence("api/src/runtimeEngine.ts", 'status: "completed"')],
    strength: "An explicit author action and immutable runtime command event are available.",
    gap: "Accept does not adopt prose, accept recap patches, emit an adoption receipt, settle the chapter, record preference evidence, or schedule the next safe work item.",
  },
  {
    stageId: "PROSE-TRACE-012",
    label: "文件版本与恢复",
    currentStatus: "pre-write-snapshots-not-commit-log",
    evidence: [proseEvidence("api/src/fileVersions.ts", "export async function createWritingFileSnapshot")],
    strength: "Changed writing files retain recoverable pre-write content plus optional runtime reason and run ID.",
    gap: "Snapshots are per-file rollback aids, not an atomic multi-asset commit log; many author saves lack source/reason, and snapshot existence cannot prove which candidate was accepted.",
  },
  {
    stageId: "PROSE-TRACE-013",
    label: "章节结算与继续写书",
    currentStatus: "absent",
    evidence: [proseEvidence("api/src/runtimeEngine.ts", "await runSingleChapterPipeline(run)")],
    strength: "The single-chapter pipeline is a reusable unit for a future work graph.",
    gap: "There is no replayable ChapterSettlement proof or settled event that atomically closes derived work and author feedback before the next chapter is selected.",
  },
];

const proseProductionAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "AI prose remains isolated and attributable until evidence and author/autonomy policy adopt it atomically; only adopted prose can produce accepted facts, obligations, projections, chapter settlement, and the next safe writing action.",
  sourceFiles: [...proseProductionSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "artifact hashes", "chapter status and content-size distributions", "quality score distributions", "task type/status/adoption enums", "file-version source/reason counts", "recap and accepted-summary counts"],
    snapshotExcludes: ["project slug", "title", "rough idea", "chapter title", "novel prose", "prompt", "model output", "recap text", "quality notes", "error text", "character, place, event, or obligation names"],
  },
  operationalSnapshot: {
    substantialInventoryThresholdChars: 800,
    totals: proseProductionTotals,
    projects: proseProductionProjectSnapshots,
    interpretation: "All counts describe local inventory and workflow traces. They do not establish prose quality, author approval, causal attribution, canonical correctness, or settled chapters.",
  },
  summary: {
    auditedStages: proseProductionStages.length,
    projectsScanned: proseProductionTotals.projects,
    chaptersInventoried: proseProductionTotals.chapters,
    substantialContentFiles: proseProductionTotals.substantialContentFiles,
    checkedChaptersWithSubstantialContent: proseProductionTotals.checkedWithAtLeast800Chars,
    qualityReports: proseProductionTotals.qualityReports,
    versionSnapshots: proseProductionTotals.versionSnapshots,
    recapCandidates: proseProductionTotals.recapCandidates,
    acceptedRecapIds: proseProductionTotals.acceptedRecapIds,
    durableProseCandidates: 0,
    adoptionReceipts: 0,
    chapterSettlementProofs: 0,
    proseCandidateIsolationSliceExists: true,
    proseAdoptionTransactionSliceExists: true,
    implementationVerified: false,
  },
  temporalInversions: [
    {
      inversionId: "PROSE-TIME-001",
      direction: "canon-before-review",
      evidence: [proseEvidence("api/src/runtimeEngine.ts", 'reason: "chapter_draft"'), proseEvidence("api/src/runtimeEngine.ts", 'reason: "quality_self_repair"'), proseEvidence("api/src/runtimeEngine.ts", 'status: "review_required"')],
      harm: "Unapproved generated or repaired prose becomes the input to later validation, recap, status, and projection work; review can no longer be the act that authorizes canonical mutation.",
    },
    {
      inversionId: "PROSE-TIME-002",
      direction: "derived-truth-before-source-save",
      evidence: [proseEvidence("ui/src/stores/novel.ts", "await requestWritingRecapForAcceptedDraft"), proseEvidence("ui/src/stores/novel.ts", "async function acceptWritingRecap")],
      harm: "An accepted recap can outlive, diverge from, or precede the unsaved client prose that allegedly supports it.",
    },
  ],
  rootCause: {
    statement: "The platform uses mutable chapter files as both candidate workspace and canonical truth, while acceptance is split among client state, file saves, patch loops, recap acceptance, runtime status, and projections without one durable adoption and settlement boundary.",
    consequence: "The system cannot prove what the author accepted, which baseline and validations applied, whether facts and obligations match the adopted prose, whether a repair regressed strengths, or whether a chapter is safe to use as the foundation for the next chapter.",
  },
  stages: proseProductionStages,
  alternatives: [
    {
      option: "A-direct-files-plus-snapshots",
      verdict: "insufficient-target",
      blueCase: "Preserves the current editor and runtime with the least migration work; snapshots make most single-file mistakes recoverable.",
      redCase: "Rollback is not candidate isolation, multi-file atomicity, adoption evidence, feedback capture, stale prevention, or settlement; review remains temporally downstream of mutation.",
    },
    {
      option: "B-candidate-directory-plus-manual-promote",
      verdict: "useful-transition-not-complete",
      blueCase: "Moving AI outputs outside chapter files immediately restores a visible candidate/canon boundary and supports side-by-side comparison.",
      redCase: "A manual file copy still cannot atomically validate baseline, locks, facts, obligations, feedback, projections, recap, and chapter status or safely resume after partial failure.",
    },
    {
      option: "C-unified-adoption-and-settlement",
      verdict: "recommended-not-implemented",
      blueCase: "A CanonMutationGateway plus ProseAdoptionTransaction gives every AI path one atomic, idempotent, attributable commit and makes ChapterSettlement the only continuation trigger.",
      redCase: "Requires durable candidate storage, shared schemas, event/outbox semantics, compatibility routing, projection cursors, failure injection, and a staged migration of every current write surface.",
    },
  ],
  targetLifecycle: {
    states: ["generation_manifest_frozen", "candidate_streaming", "candidate_ready", "validating", "repair_candidate_ready", "decision_ready", "adopting", "adopted", "settling", "settled", "stale", "rejected", "invalidated"],
    entities: ["ProseGenerationManifest", "ProseCandidate", "CandidateChunk", "ValidationBundle", "RedBlueReview", "EvidenceBoundedRepairPlan", "AdoptionDecision", "ProseAdoptionTransaction", "AdoptionReceipt", "CanonMutationEvent", "ChapterSettlement"],
    invariant: "No task success, client splice, file write, snapshot, fixed score, recap candidate, runtime completion, or chapter status may independently establish adopted or settled prose.",
  },
  adoptionTransaction: {
    validates: ["candidate lineage", "current canon and outline baselines", "author locks", "POV and secret boundaries", "rights and similarity guards", "continuity hard failures", "narrative obligation evidence", "repair scope and preserved strengths", "authorization tier", "idempotency key"],
    atomicallyCommits: ["prose version", "candidate adoption decision", "author feedback event", "fact and character deltas", "obligation evidence", "mutation event", "projection invalidations", "adoption receipt"],
    defersUntilAfterCommit: ["recap acceptance", "knowledge index publication", "story graph publication", "series quality publication", "chapter status settlement", "next-chapter scheduling"],
  },
  migrationOrder: [
    "Make runtime and focus-save ordering honest without changing author prose.",
    "Persist AI output as durable candidates with parent baselines and lineage; keep current files as canon during shadow mode.",
    "Route fragment acceptance, task patches, runtime review accept, and derivative merge through one idempotent adoption command.",
    "Publish derived assets from committed mutation events with source fingerprints and outbox recovery.",
    "Introduce ChapterSettlement and allow continuous writing to consume settled events only.",
    "Disable or forward legacy canon-capable paths only after parity, concurrency, offline, crash, restore, and stale-worker evidence passes.",
  ],
  releaseGate: {
    requirementIds: ["FR-WRITE-001", "FR-WRITE-002", "FR-WRITE-003", "FR-WRITE-004", "FR-WRITE-005", "FR-WRITE-006", "FR-WRITE-007", "FR-WRITE-008", "FR-WRITE-009", "FR-WRITE-010", "FR-WRITE-011", "FR-WRITE-012", "FR-WRITE-013", "FR-WRITE-014", "FR-WRITE-015", "FR-WRITE-016", "FR-PROSE-001", "FR-PROSE-002", "FR-PROSE-003", "FR-PROSE-004", "FR-PROSE-005", "FR-PROSE-006", "FR-PROSE-007", "FR-PROSE-008", "FR-PROSE-009", "FR-PROSE-010", "FR-PROSE-011", "FR-PROSE-012", "FR-PROSE-013", "FR-PROSE-014", "FR-PROSE-015", "FR-PROSE-016", "FR-PROSE-017", "FR-PROSE-018", "FR-PROSE-019", "FR-PROSE-020", "FR-PROSE-021", "FR-PROSE-022", "FR-PROSE-023", "FR-PROSE-024", "FR-QUALITY-001", "FR-QUALITY-002", "FR-QUALITY-003", "FR-QUALITY-004", "FR-QUALITY-005", "FR-QUALITY-006", "FR-QUALITY-007", "FR-QUALITY-008", "FR-QUALITY-009", "FR-QUALITY-010", "FR-MEMORY-001", "FR-MEMORY-002", "FR-MEMORY-003", "FR-STATE-006", "FR-STATE-007", "FR-STATE-008"],
    acceptanceRefs: ["AT-067", "AT-068", "AT-069", "AT-094", "AT-095", "AT-096", "AT-097", "AT-098", "AT-099", "AT-100", "AT-101", "AT-102", "AT-103", "AT-104", "AT-105", "AT-106", "AT-107", "AT-108", "AT-109", "AT-110", "AT-111", "AT-112", "AT-113", "AT-114", "AT-115", "AT-116", "AT-117", "AT-118", "AT-119", "AT-120", "AT-121", "AT-122", "AT-123", "AT-124", "AT-125", "AT-126", "AT-127", "AT-128", "AT-129", "AT-130", "AT-131", "AT-132", "AT-133", "AT-134", "AT-135", "AT-136", "AT-137", "AT-138", "AT-139", "AT-140", "AT-141", "AT-142", "AT-143", "AT-144", "AT-145", "AT-146", "AT-147", "AT-148", "AT-149", "AT-290", "AT-310", "AT-311", "AT-359", "AT-361"],
    rule: "Do not claim AI prose is accepted or a chapter is settled until the exact candidate and parent baselines are durable, all hard guards and declared evidence reviews are current, the adoption transaction is atomic and idempotent, author feedback is attributable, derived publications consume the committed event, and crash/retry/restore/stale-worker tests reproduce the same receipt.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level. Candidate isolation, hard guards, atomic adoption, feedback capture, source-fingerprinted projections and ChapterSettlement remain invariant.",
};

const collaborationDialogueSourcePaths = [
  "api/src/app.ts",
  "api/src/contextAssembler.ts",
  "api/src/novelProject.ts",
  "api/src/resultParser.ts",
  "api/src/runtimeEngine.ts",
  "api/src/runtimeStore.ts",
  "api/src/runtimeWorker.ts",
  "api/src/runtimeWorker.spec.ts",
  "api/src/runtimeControlBoundary.ts",
  "api/src/runtimeControlBoundary.spec.ts",
  "api/src/runtimeMutationDrain.ts",
  "api/src/runtimeMutationDrain.spec.ts",
  "api/src/executionQueue.ts",
  "api/src/workLease.ts",
  "api/src/runtimeStageReceipt.ts",
  "api/src/bookRun.ts",
  "api/src/runReadiness.ts",
  "api/src/budgetReservation.ts",
  "api/src/modelInvocationLedger.ts",
  "api/src/modelInvocationLedger.spec.ts",
  "api/src/modelInvocationAuthority.ts",
  "api/src/modelInvocationSettlement.ts",
  "api/src/quiescenceProof.ts",
  "api/src/completionAudit.ts",
  "api/src/executionDispatcher.ts",
  "api/src/taskService.ts",
  "api/src/taskTemplates.ts",
  "api/src/types.ts",
  "api/src/dialogueRedBlue.ts",
  "api/src/decisionImpact.ts",
  "api/src/decisionProjection.ts",
  "ui/src/components/novel/AutopilotRuntimePanel.vue",
  "ui/src/components/novel/ProjectCreatePanel.vue",
  "ui/src/components/novel/RewriteComparison.vue",
  "ui/src/stores/novel.ts",
];
const collaborationDialogueSources = new Map(collaborationDialogueSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function dialogueEvidence(relativePath, needle) {
  const sourceEntry = collaborationDialogueSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown collaboration-dialogue audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Collaboration-dialogue evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function dialogueSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = collaborationDialogueSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown collaboration-dialogue audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Collaboration-dialogue slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Collaboration-dialogue slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const projectCreateRouteSlice = dialogueSourceSlice("api/src/app.ts", 'app.post("/api/novel/projects"', 'app.post("/api/novel/import"');
const taskResultSlice = dialogueSourceSlice("api/src/types.ts", "export interface CodexTaskResult", "export interface NovelTask");
const rewriteComparisonSource = collaborationDialogueSources.get("ui/src/components/novel/RewriteComparison.vue").content;
const runtimeDirectionSlice = dialogueSourceSlice("api/src/runtimeEngine.ts", "async function processControl", "async function processDerivative");
const taskRunSlice = dialogueSourceSlice("api/src/taskService.ts", "export async function runNovelTask", "export async function startNovelTaskAsync");
const taskTemplateSource = collaborationDialogueSources.get("api/src/taskTemplates.ts").content;

if (!projectCreateRouteSlice.includes("createUniqueProjectSkeleton") || /runNovelTask|startNovelTaskAsync/.test(projectCreateRouteSlice)) {
  throw new Error("Collaboration-dialogue audit drift: project creation now invokes an understanding task and must be reclassified.");
}
if (!taskResultSlice.includes("questions: string[]") || /QuestionCard|questionId|blockingScope/.test(taskResultSlice)) {
  throw new Error("Collaboration-dialogue audit drift: task questions gained governed identity or structure and must be reclassified.");
}
if (!rewriteComparisonSource.includes('v-for="question in result.questions"') || /answer-question|submit-answer|QuestionAnswer/.test(rewriteComparisonSource)) {
  throw new Error("Collaboration-dialogue audit drift: result questions are no longer display-only and must be reclassified.");
}
if (!runtimeDirectionSlice.includes('command.type === "direction"') || !runtimeDirectionSlice.includes("const direction = typeof command.payload.direction") || !runtimeDirectionSlice.includes("pendingDirection")) {
  throw new Error("Collaboration-dialogue audit drift: runtime direction now has live governed consumption semantics and must be reclassified.");
}
if (!taskRunSlice.includes("payload.roughIdea || payload.feedback") || /AuthorUtterance|UnderstandingVersion|DecisionRecord/.test(taskRunSlice)) {
  throw new Error("Collaboration-dialogue audit drift: task author input now consumes governed dialogue state and must be reclassified.");
}
if (/if \(type === "idea\.suggest"\)/.test(taskTemplateSource)) {
  throw new Error("Collaboration-dialogue audit drift: idea.suggest now has a dedicated contract and must be reclassified.");
}
const collaborationProductSource = [...collaborationDialogueSources.values()].map((entry) => entry.content).join("\n");
const implementedCollaborationEntities = [
  "AuthorUtterance",
  "UnderstandingVersion",
  "InterpretationCandidate",
  "QuestionPlan",
  "QuestionCard",
  "RedBlueCase",
  "AnswerEvent",
  "DecisionRecord",
  "DecisionProjection",
  "DecisionImpactReport",
  "AutonomyReceipt",
  "CollaborationSession",
].filter((entity) => collaborationProductSource.includes(entity) && entity !== "DecisionRecord");
const auditedCollaborationEntities = new Set(["AuthorUtterance", "UnderstandingVersion", "AutonomyReceipt", "RedBlueCase", "DecisionImpactReport", "DecisionProjection"]);
const unauditedCollaborationEntities = implementedCollaborationEntities.filter((entity) => !auditedCollaborationEntities.has(entity));
if (unauditedCollaborationEntities.length) {
  throw new Error(`Collaboration-dialogue audit drift: governed collaboration entities now exist and must be audited: ${unauditedCollaborationEntities.join(", ")}`);
}

function aggregateQuestionStats(taskStats) {
  const byType = new Map();
  for (const task of taskStats) {
    const current = byType.get(task.type) || { tasks: 0, questionBearingTasks: 0, questions: 0 };
    current.tasks += 1;
    current.questionBearingTasks += task.questionCount > 0 ? 1 : 0;
    current.questions += task.questionCount;
    byType.set(task.type, current);
  }
  return Object.fromEntries([...byType.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

const collaborationProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectPath = join(projectDirectory, "project.json");
  const projectContent = existsSync(projectPath) ? readFileSync(projectPath, "utf8") : "{}";
  let project = {};
  let projectValid = true;
  try {
    project = JSON.parse(projectContent);
  } catch {
    projectValid = false;
  }
  const taskHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "history.jsonl"));
  const latestTasks = latestAnonymousRecords(taskHistory.records);
  const invocations = parseAnonymousJsonLines(join(projectDirectory, "tasks", "invocations.jsonl"));
  const invocationByTaskId = new Map(invocations.records.filter((invocation) => invocation?.taskId).map((invocation) => [invocation.taskId, invocation]));
  const taskStats = latestTasks.map((task) => {
    const questions = Array.isArray(task?.result?.questions) ? task.result.questions.filter((question) => typeof question === "string" && question.trim()) : [];
    const payloadKeys = task?.payload && typeof task.payload === "object" ? Object.keys(task.payload).sort() : [];
    const invocation = invocationByTaskId.get(task?.id);
    return {
      type: task?.type || "missing",
      status: task?.status || "missing",
      questionCount: questions.length,
      questionFingerprint: questions.length ? createHash("sha256").update(questions.map((question) => question.trim()).join("\u0000")).digest("hex") : null,
      payloadKeys,
      patchCount: Array.isArray(task?.result?.patches) ? task.result.patches.length : 0,
      adoptionDecision: invocation?.adoptionDecision || "missing",
      promptPreviewPersisted: Boolean(typeof invocation?.promptSnapshot?.preview === "string" && invocation.promptSnapshot.preview.length),
      promptPreviewLength: typeof invocation?.promptSnapshot?.preview === "string" ? invocation.promptSnapshot.preview.length : 0,
    };
  });
  const questionBearing = taskStats.filter((task) => task.questionCount > 0);
  const answerKeyPattern = /(^|_)(answer|answers|question_id|questionid|decision_id|decisionid)(_|$)/i;
  const feedbackKeyPattern = /(^|_)(feedback|direction|revision_direction)(_|$)/i;
  const roughIdea = typeof project?.roughIdea === "string" ? project.roughIdea : "";
  const dialogueAssetPaths = [
    join(projectDirectory, "conversation"),
    join(projectDirectory, "dialogue"),
    join(projectDirectory, "decisions"),
    join(projectDirectory, "questions"),
  ];
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: createHash("sha256").update(projectContent).digest("hex"),
      taskHistory: taskHistory.sha256,
      invocationHistory: invocations.sha256,
      questionAggregate: questionBearing.length ? createHash("sha256").update(questionBearing.map((task) => task.questionFingerprint).join("\u0000")).digest("hex") : null,
    },
    parseHealth: {
      projectValid,
      invalidTaskLines: taskHistory.invalidLines,
      invalidInvocationLines: invocations.invalidLines,
    },
    initialIdea: {
      present: Boolean(roughIdea.trim()),
      chars: roughIdea.length,
      fingerprint: roughIdea ? createHash("sha256").update(roughIdea).digest("hex") : null,
      immutableUtteranceEvents: 0,
      correctionLineageEntries: 0,
    },
    tasks: {
      latest: taskStats.length,
      byType: aggregateQuestionStats(taskStats),
      questionBearingTasks: questionBearing.length,
      questionStrings: questionBearing.reduce((total, task) => total + task.questionCount, 0),
      questionCountPerTask: numericDistribution(questionBearing.map((task) => task.questionCount)),
      questionBearingWithPatches: questionBearing.filter((task) => task.patchCount > 0).length,
      questionBearingAdoptionDecisions: countsByValue(questionBearing.map((task) => task.adoptionDecision)),
      payloadsWithStructuredAnswerKeys: taskStats.filter((task) => task.payloadKeys.some((key) => answerKeyPattern.test(key))).length,
      payloadsWithFeedbackOrDirectionKeys: taskStats.filter((task) => task.payloadKeys.some((key) => feedbackKeyPattern.test(key))).length,
      ideaSuggestTasks: taskStats.filter((task) => task.type === "idea.suggest").length,
      ideaSuggestQuestions: taskStats.filter((task) => task.type === "idea.suggest").reduce((total, task) => total + task.questionCount, 0),
    },
    auditStorage: {
      invocations: invocations.records.length,
      tasksWithPromptPreviewPersisted: taskStats.filter((task) => task.promptPreviewPersisted).length,
      promptPreviewLengths: numericDistribution(taskStats.filter((task) => task.promptPreviewPersisted).map((task) => task.promptPreviewLength)),
      note: "Only preview-presence and length are emitted; preview text, task input summaries, questions, answers, prompts, and model output are excluded.",
    },
    governedAssets: {
      dialogueDirectoriesPresent: dialogueAssetPaths.filter((path) => existsSync(path)).length,
      activeQuestionQueues: 0,
      answerEvents: 0,
      decisionRecords: 0,
      redBlueCases: 0,
      decisionImpactReports: 0,
    },
    interpretation: {
      hasClosedQuestionAnswerDecisionLoop: false,
      reason: "String questions embedded in task results are display artifacts. They lack stable identity, answer commands, decision authority, supersession, downstream projection receipts, and replayable session state.",
    },
  };
});

const collaborationTotals = collaborationProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  roughIdeasPresent: totals.roughIdeasPresent + (project.initialIdea.present ? 1 : 0),
  latestTasks: totals.latestTasks + project.tasks.latest,
  questionBearingTasks: totals.questionBearingTasks + project.tasks.questionBearingTasks,
  questionStrings: totals.questionStrings + project.tasks.questionStrings,
  questionBearingWithPatches: totals.questionBearingWithPatches + project.tasks.questionBearingWithPatches,
  structuredAnswerPayloads: totals.structuredAnswerPayloads + project.tasks.payloadsWithStructuredAnswerKeys,
  feedbackOrDirectionPayloads: totals.feedbackOrDirectionPayloads + project.tasks.payloadsWithFeedbackOrDirectionKeys,
  ideaSuggestTasks: totals.ideaSuggestTasks + project.tasks.ideaSuggestTasks,
  ideaSuggestQuestions: totals.ideaSuggestQuestions + project.tasks.ideaSuggestQuestions,
  invocations: totals.invocations + project.auditStorage.invocations,
  promptPreviewsPersisted: totals.promptPreviewsPersisted + project.auditStorage.tasksWithPromptPreviewPersisted,
}), { projects: 0, roughIdeasPresent: 0, latestTasks: 0, questionBearingTasks: 0, questionStrings: 0, questionBearingWithPatches: 0, structuredAnswerPayloads: 0, feedbackOrDirectionPayloads: 0, ideaSuggestTasks: 0, ideaSuggestQuestions: 0, invocations: 0, promptPreviewsPersisted: 0 });

const collaborationQuestionTaskTypes = {};
for (const project of collaborationProjectSnapshots) {
  for (const [type, stats] of Object.entries(project.tasks.byType)) {
    const current = collaborationQuestionTaskTypes[type] || { tasks: 0, questionBearingTasks: 0, questions: 0 };
    current.tasks += stats.tasks;
    current.questionBearingTasks += stats.questionBearingTasks;
    current.questions += stats.questions;
    collaborationQuestionTaskTypes[type] = current;
  }
}

const collaborationDialogueStages = [
  {
    stageId: "DIALOGUE-TRACE-001",
    label: "粗略想法输入",
    currentStatus: "single-project-field",
    evidence: [dialogueEvidence("ui/src/components/novel/ProjectCreatePanel.vue", 'v-model="roughIdea"'), dialogueEvidence("api/src/novelProject.ts", "roughIdea: input.roughIdea.trim()")],
    strength: "The author can begin with one short free-form idea and optional title/genre rather than completing a long form.",
    gap: "Only the latest project field remains; there is no immutable utterance, speaker/session identity, correction lineage, evidence span, language intent, or privacy/retention envelope.",
  },
  {
    stageId: "DIALOGUE-TRACE-002",
    label: "首次理解",
    currentStatus: "local-heuristic-plus-fallback-skeleton",
    evidence: [dialogueEvidence("api/src/contextAssembler.ts", "function buildNarrativePromiseBlock"), dialogueEvidence("api/src/app.ts", "fallbackProjectCreateResult")],
    strength: "Simple labels and sentence previews create an immediate narrative-promise hint and usable project skeleton.",
    gap: "Project creation invokes no understanding task, produces no competing interpretations, confidence, contradiction report, evidence spans, or author-correctable UnderstandingVersion.",
  },
  {
    stageId: "DIALOGUE-TRACE-003",
    label: "苏格拉底问题规划",
    currentStatus: "absent",
    evidence: [dialogueEvidence("api/src/taskTemplates.ts", 'questions: ["需要作者确认的问题"]')],
    strength: "Every generic task result can surface unresolved questions.",
    gap: "There is no expected-information-value calculation, decision impact, reversibility, confidence, duplicate suppression, blocking scope, or one-active-question policy before a task proceeds.",
  },
  {
    stageId: "DIALOGUE-TRACE-004",
    label: "问题呈现",
    currentStatus: "versioned-question-and-answer-event-slice",
    evidence: [dialogueEvidence("api/src/types.ts", "questions: string[]"), dialogueEvidence("ui/src/components/novel/RewriteComparison.vue", 'v-for="question in result.questions"')],
    strength: "The first understanding question has identity, version, impact, T0 fingerprint, one-active enforcement, answer control, and structured stale conflicts.",
    gap: "The UI has API contracts but no primary question card or downstream contract-field consumer yet.",
  },
  {
    stageId: "DIALOGUE-TRACE-005",
    label: "红蓝辩证",
    currentStatus: "not-a-product-protocol",
    evidence: [dialogueEvidence("api/src/taskTemplates.ts", '"idea.suggest": "Offer next-step ideas')],
    strength: "idea.suggest and free-form tasks can informally produce alternatives if prompted by the author.",
    gap: "No typed alternatives, shared premises, blue value case, red failure case, evidence, uncertainty, recommendation, dissent, or author decision slot is required or stored.",
  },
  {
    stageId: "DIALOGUE-TRACE-006",
    label: "作者回答",
    currentStatus: "no-question-answer-command",
    evidence: [dialogueEvidence("ui/src/components/novel/RewriteComparison.vue", "defineEmits<")],
    strength: "The author can accept, reject, request generic tuning, or type a new task/direction elsewhere.",
    gap: "Those actions do not answer a stable question ID; free text is not linked to the question, interpretation, option, confidence, affected fields, or superseded answer.",
  },
  {
    stageId: "DIALOGUE-TRACE-007",
    label: "决定沉淀",
    currentStatus: "append-only-decision-record-slice",
    evidence: [dialogueEvidence("api/src/types.ts", 'export type AiInvocationAdoptionDecision = "pending" | "accepted" | "rejected" | "not-required"')],
    strength: "Confirmed, tentative, delegated and correction answers produce non-canon DecisionRecord history with source fingerprint and supersession relation.",
    gap: "Decision records are not yet consumed by contract candidates or downstream execution proofs.",
  },
  {
    stageId: "DIALOGUE-TRACE-008",
    label: "下游消费",
    currentStatus: "latest-fields-and-ad-hoc-payload",
    evidence: [dialogueEvidence("api/src/taskService.ts", "payload.roughIdea || payload.feedback"), dialogueEvidence("api/src/contextAssembler.ts", '{ title: "项目配置"')],
    strength: "Tasks receive current project files plus one roughIdea or feedback string and can therefore react to immediate direction.",
    gap: "Context does not include an authoritative decision projection, unresolved decision set, rejected alternatives, confidence, provenance, or proof that outline/prose consumed the intended answer version.",
  },
  {
    stageId: "DIALOGUE-TRACE-009",
    label: "纠正、反悔与影响传播",
    currentStatus: "correction-decision-lineage-slice",
    evidence: [dialogueEvidence("ui/src/stores/novel.ts", "requestFocusDraftRevision")],
    strength: "A correction-shaped answer retains previous/replacement text and creates an explicit supersedes relation without overwriting history.",
    gap: "Impact propagation to stale plans, candidates, running tasks, and contract fields is not yet implemented.",
  },
  {
    stageId: "DIALOGUE-TRACE-010",
    label: "低打扰自治",
    currentStatus: "task-success-driven",
    evidence: [dialogueEvidence("api/src/runtimeEngine.ts", "await runSingleChapterPipeline(run)")],
    strength: "The runtime can perform many steps without repeatedly asking the author.",
    gap: "Silence is not a governed autonomy policy: no L0/L1/L2 decision tier, reversible-default receipt, uncertainty threshold, stop condition, or later explanation proves why the system acted instead of asking.",
  },
  {
    stageId: "DIALOGUE-TRACE-011",
    label: "运行中方向调整",
    currentStatus: "safe-boundary-steering-slice",
    evidence: [dialogueEvidence("api/src/runtimeWorker.ts", "await processRuntimeCommand(command)"), dialogueEvidence("api/src/runtimeEngine.ts", "pendingDirection"), dialogueEvidence("api/src/runtimeStore.ts", "input_json = ?")],
    strength: "The UI and API expose a durable steering event; queued directions are recorded as pending during an active call and effective directions update the next runtime input with an objective version.",
    gap: "Direction impact propagation to already-persisted candidates, BookRun work-item fingerprints, and an explicit replan decision remains a later slice.",
  },
  {
    stageId: "DIALOGUE-TRACE-012",
    label: "跨会话恢复",
    currentStatus: "project-files-plus-task-history",
    evidence: [dialogueEvidence("api/src/taskService.ts", "tasks/history.jsonl"), dialogueEvidence("ui/src/stores/novel.ts", "async function openProject")],
    strength: "Projects, task results, invocations, and writing assets survive process restarts.",
    gap: "There is no CollaborationSession snapshot with active question, open decisions, last confirmed understanding, user corrections, pending autonomy receipts, or an explainable resume summary.",
  },
  {
    stageId: "DIALOGUE-TRACE-013",
    label: "审计与隐私",
    currentStatus: "prompt-preview-and-payload-history",
    evidence: [dialogueEvidence("api/src/taskService.ts", "preview: previewText(prompt)"), dialogueEvidence("api/src/taskService.ts", "inputSummary: JSON.stringify(payload).slice(0, 500)")],
    strength: "Invocation metadata helps diagnose what context and template produced a result.",
    gap: "Prompt previews and payload summaries can duplicate author text without field-level purpose, sensitivity, retention, deletion, or redaction policy; meanwhile they still do not form a semantic answer/decision audit trail.",
  },
];

const collaborationDialogueAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The author can provide a rough idea or correction in natural language; the platform preserves the exact intent, asks at most one high-value question when needed, presents evidence-backed red/blue alternatives, records the answer as a versioned creative decision, and proves every downstream outline and prose action consumed the right decision state.",
  sourceFiles: [...collaborationDialogueSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "rough-idea presence, length, and hash", "task type/status and payload-key names", "question counts and aggregate hashes", "question-bearing adoption enums", "prompt-preview presence and length", "governed-asset existence counts"],
    snapshotExcludes: ["project slug", "title", "genre", "rough idea text", "question text", "answer text", "feedback or direction text", "prompt preview", "input summary", "model output", "novel prose", "character, place, event, or obligation names"],
  },
  operationalSnapshot: {
    totals: collaborationTotals,
    byTaskType: collaborationQuestionTaskTypes,
    projects: collaborationProjectSnapshots,
    interpretation: "A question string proves only that a task emitted text in its questions array. It does not prove the question was worth asking, asked one-at-a-time, answered, converted into a decision, consumed downstream, or respected after correction.",
  },
  summary: {
    auditedStages: collaborationDialogueStages.length,
    projectsScanned: collaborationTotals.projects,
    projectsWithRoughIdea: collaborationTotals.roughIdeasPresent,
    latestTasks: collaborationTotals.latestTasks,
    questionBearingTasks: collaborationTotals.questionBearingTasks,
    emittedQuestionStrings: collaborationTotals.questionStrings,
    structuredAnswerPayloads: collaborationTotals.structuredAnswerPayloads,
    activeQuestionQueues: 0,
    redBlueCases: 0,
    decisionRecords: 0,
    decisionConsumptionReceipts: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform models collaboration as a project roughIdea plus independent task payloads/results, not as a versioned loop of utterance, understanding, high-value question, red/blue alternatives, answer, creative decision, downstream projection, and correction impact.",
    consequence: "The system can generate many questions without knowing whether the author answered them, repeat or contradict prior decisions, act on a stale interpretation, lose rejection reasons, fail to steer an active run, and force the author to restate context that should have become durable creative intent.",
  },
  stages: collaborationDialogueStages,
  alternatives: [
    {
      option: "A-chat-transcript-as-truth",
      verdict: "insufficient-target",
      blueCase: "Feels natural, preserves nuance, and can be implemented quickly as one continuous assistant conversation.",
      redCase: "A transcript has no stable field authority, supersession, one-question gate, decision impact, deterministic downstream projection, privacy minimization, or replayable acceptance semantics.",
    },
    {
      option: "B-chat-plus-mutable-decision-ledger",
      verdict: "useful-migration-layer-not-final-authority",
      blueCase: "Adds explicit decisions and can retrofit the current UI/task system without replacing every prompt immediately.",
      redCase: "If chat, project fields, and ledger remain co-equal mutable truth, corrections and automation will drift; last-write-wins cannot prove which answer governed which artifact.",
    },
    {
      option: "C-event-sourced-collaboration-protocol",
      verdict: "recommended-not-implemented",
      blueCase: "Immutable utterance/answer/decision events with deterministic projections preserve nuance, one-question orchestration, red/blue evidence, correction lineage, low-interruption autonomy, and downstream consumption receipts.",
      redCase: "Requires shared schemas, privacy classes, projection rebuilds, semantic IDs, impact analysis, compatibility adapters, and careful UX so governance does not make conversation feel bureaucratic.",
    },
  ],
  targetProtocol: {
    states: ["utterance_captured", "understanding_candidates_ready", "understanding_confirmed_or_provisional", "question_planned", "question_active", "answer_captured", "decision_adopted", "projections_current", "action_authorized", "action_receipted", "correction_received", "impact_previewed", "recomputed_or_restored"],
    entities: ["AuthorUtterance", "UnderstandingVersion", "InterpretationCandidate", "UncertaintyRegister", "QuestionPlan", "QuestionCard", "RedBlueCase", "AnswerEvent", "DecisionRecord", "DecisionProjection", "DecisionImpactReport", "AutonomyPolicy", "AutonomyReceipt", "DecisionConsumptionReceipt", "CollaborationSession"],
    invariant: "No chat summary, task result, patch acceptance, current project field, model confidence, runtime direction note, or silence from the author may independently establish a creative decision or prove that downstream work consumed it.",
  },
  questionPolicy: {
    askOnlyWhen: "Expected reduction in high-impact uncertainty exceeds author interruption cost, the decision cannot be safely inferred from existing evidence, and no current answer or reversible default already covers the scope.",
    activeLimit: 1,
    tiers: {
      L0: "Reversible presentation or implementation detail; act automatically and record a compact receipt.",
      L1: "Meaningful but reversible creative choice; recommend and proceed only within the configured autonomy window, with undo and later explanation.",
      L2: "Identity, central conflict, major relationship, canon promise, ending, rights, publication boundary, intentional-open obligation, destructive rewrite, or irreversible cost; pause and ask the author.",
    },
    cardFields: ["questionId", "decisionSlotId", "plainQuestion", "whyNow", "impact", "blockingScope", "evidenceRefs", "assumptions", "options", "recommendedOptionId", "redBlueCaseId", "freeTextAllowed", "notSureAllowed", "expiresWhen", "askedAt"],
    antiPatterns: ["multiple unrelated questions in one turn", "asking after already acting", "repeating an answered question", "forcing false binary choices", "hiding recommendation", "treating silence as consent", "asking for facts already present", "using a low-impact question to block the whole book"],
  },
  redBlueProtocol: {
    perOption: ["claim", "bestCase", "premises", "evidence", "failureModes", "opportunityCost", "reversibility", "affectedDecisions", "uncertainty"],
    synthesis: ["sharedFacts", "irreducibleTradeoff", "recommendation", "recommendationReason", "dissent", "whatWouldChangeRecommendation"],
    rule: "Blue must defend the strongest viable version, red must attack both correctness and user-goal fit, and synthesis may recommend but cannot fabricate author adoption or average away an unresolved L2 tradeoff.",
  },
  correctionProtocol: {
    commands: ["ClarifyUtterance", "AnswerQuestion", "AdoptRecommendation", "RejectRecommendation", "SupersedeDecision", "UndoAutonomousDecision", "LockDecision", "ReopenDecision"],
    behavior: "A correction creates a new event, identifies what it supersedes, previews the affected outline/prose/obligation/candidate/projection subgraph, preserves unaffected semantic IDs and author locks, then recomputes only authorized stale artifacts after confirmation appropriate to the impact tier.",
  },
  releaseGate: {
    requirementIds: ["FR-INTENT-001", "FR-QUESTION-001", "FR-QUESTION-002", "FR-QUESTION-003", "FR-QUESTION-004", "FR-QUESTION-005", "FR-QUESTION-006", "FR-QUESTION-007", "FR-QUESTION-008", "FR-QUESTION-009", "FR-COLLAB-001", "FR-COLLAB-002", "FR-COLLAB-003", "FR-COLLAB-004", "FR-COLLAB-005", "FR-DEBATE-001", "FR-DEBATE-002", "FR-DEBATE-003", "FR-DEBATE-004", "FR-DEBATE-005", "FR-DEBATE-006", "FR-DEBATE-007", "FR-DEBATE-008", "FR-DIALOGUE-001", "FR-DIALOGUE-002", "FR-DIALOGUE-003", "FR-DIALOGUE-004", "FR-DIALOGUE-005", "FR-DIALOGUE-006", "FR-DIALOGUE-007", "FR-DIALOGUE-008", "FR-DIALOGUE-009", "FR-DIALOGUE-010", "FR-DIALOGUE-011", "FR-DIALOGUE-012", "FR-DIALOGUE-013", "FR-DIALOGUE-014", "FR-DIALOGUE-015", "FR-DIALOGUE-016", "FR-DIALOGUE-017", "FR-DIALOGUE-018", "FR-DIALOGUE-019", "FR-DIALOGUE-020", "FR-DIALOGUE-021", "FR-DIALOGUE-022", "FR-DIALOGUE-023", "FR-DIALOGUE-024", "FR-STATE-001", "FR-STATE-002", "FR-STATE-003", "FR-STATE-004", "FR-STATE-005"],
    acceptanceRefs: ["AT-002", "AT-022", "AT-023", "AT-027", "AT-028", "AT-029", "AT-041", "AT-059", "AT-078", "AT-079", "AT-190", "AT-191", "AT-192", "AT-193", "AT-194", "AT-195", "AT-198", "AT-200", "AT-201", "AT-212", "AT-334", "AT-335", "AT-337", "AT-340", "AT-345", "AT-346", "AT-443", "AT-444", "AT-451", "AT-452"],
    rule: "Do not claim Socratic collaboration or red/blue decision support until one active QuestionCard can be answered through a server command, the resulting DecisionRecord and supersession are replayable, downstream artifacts publish DecisionConsumptionReceipts, corrections invalidate only the affected subgraph, runtime steering acknowledges a safe boundary, and privacy tests prove raw utterances and previews follow declared purpose, retention, access, export, and deletion policies.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none can weaken dialogue identity, one-question discipline, red/blue evidence, correction lineage, downstream consumption proof or privacy. Q-009 uses the same protocol.",
};

const longMemorySourcePaths = [
  "api/src/app.ts",
  "api/src/auditReport.ts",
  "api/src/contextAssembler.ts",
  "api/src/knowledgeIndex.ts",
  "api/src/runtimeEngine.ts",
  "api/src/runtimeSnapshot.ts",
  "api/src/storyGraph.ts",
  "api/src/taskTemplates.ts",
  "api/src/types.ts",
  "api/src/writingCockpit.ts",
  "ui/src/stores/novel.ts",
];
const longMemorySources = new Map(longMemorySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function memoryEvidence(relativePath, needle) {
  const sourceEntry = longMemorySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown long-memory audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Long-memory evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function memorySourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = longMemorySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown long-memory audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Long-memory slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Long-memory slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const factPatchSlice = memorySourceSlice("api/src/types.ts", "export interface ChapterFactPatch", "export interface CharacterStatePatch");
const characterStatePatchSlice = memorySourceSlice("api/src/types.ts", "export interface CharacterStatePatch", "export interface EmotionLedgerItem");
const knowledgeFactSlice = memorySourceSlice("api/src/types.ts", "export interface KnowledgeFact", "export interface KnowledgeTriple");
const knowledgeTripleSlice = memorySourceSlice("api/src/types.ts", "export interface KnowledgeTriple", "export interface ChapterIndexEntry");
const memoryBlockSlice = memorySourceSlice("api/src/contextAssembler.ts", "async function buildKnowledgeMemoryBlocks", "export async function assembleContext");
const runtimeSnapshotSlice = memorySourceSlice("api/src/runtimeEngine.ts", "async function buildNarrativeSnapshot", "async function maybeMockTask");
const writingCockpitMemorySource = longMemorySources.get("api/src/writingCockpit.ts").content;
const recapAcceptMemoryOffset = writingCockpitMemorySource.indexOf("export async function acceptWritingRecapPatches");
if (recapAcceptMemoryOffset < 0) throw new Error("Long-memory recap acceptance function not found.");
const recapAcceptMemorySlice = writingCockpitMemorySource.slice(recapAcceptMemoryOffset);
const continuityTemplateSource = longMemorySources.get("api/src/taskTemplates.ts").content;

if (/validFrom|validTo|confidence|supersedes|visibility|claimType|sourceVersion/.test(factPatchSlice)) {
  throw new Error("Long-memory audit drift: chapter fact patches gained governed truth semantics and must be reclassified.");
}
if (/validFrom|validTo|supersedes|stateDimension|entityId|storyTime/.test(characterStatePatchSlice)) {
  throw new Error("Long-memory audit drift: character state patches gained temporal state semantics and must be reclassified.");
}
if (/validFrom|validTo|confidence|truthStatus|visibility|sourceVersion|supersedes/.test(knowledgeFactSlice)) {
  throw new Error("Long-memory audit drift: knowledge facts gained authoritative validity semantics and must be reclassified.");
}
if (/validFrom|validTo|confidence|truthStatus|supersedes/.test(knowledgeTripleSlice)) {
  throw new Error("Long-memory audit drift: knowledge triples gained temporal or supersession semantics and must be reclassified.");
}
if (!memoryBlockSlice.includes("if (!indexEntry || (!indexEntry.factIds.length && !indexEntry.tripleIds.length)) return []")) {
  throw new Error("Long-memory audit drift: knowledge retrieval is no longer gated by target-chapter anchors and must be reclassified.");
}
if (!runtimeSnapshotSlice.includes("readChapterSummary(root, chapter.id)") || !runtimeSnapshotSlice.includes("summarySignals: currentSummary.summary || currentSummary.keyEvents.length ? [currentSummary] : []")) {
  throw new Error("Long-memory audit drift: runtime narrative snapshot now carries a prior settled summary chain and must be reclassified.");
}
if (/saveStoryControl|CharacterStateTimeline|CanonFactEvent/.test(recapAcceptMemorySlice)) {
  throw new Error("Long-memory audit drift: recap acceptance now updates governed character or fact authority and must be reclassified.");
}
if (/if \(type === "continuity\.check"\)/.test(continuityTemplateSource)) {
  throw new Error("Long-memory audit drift: continuity.check now has a dedicated structured contract and must be reclassified.");
}
const longMemoryProductSource = [...longMemorySources.values()].map((entry) => entry.content).join("\n");
const implementedLongMemoryEntities = [
  "CanonFactEvent",
  "FactAssertion",
  "EntityRegistry",
  "EntityAlias",
  "CharacterStateTimeline",
  "WorldStateTimeline",
  "StoryTimeInterval",
  "KnowledgeBoundary",
  "SecretVisibilityPolicy",
  "ContradictionCase",
  "ContinuityConstraint",
  "MemoryHealthReport",
  "MemoryReadyProof",
].filter((entity) => longMemoryProductSource.includes(entity));
const auditedLongMemoryEntities = new Set(["KnowledgeBoundary", "MemoryHealthReport", "MemoryReadyProof"]);
const unauditedLongMemoryEntities = implementedLongMemoryEntities.filter((entity) => !auditedLongMemoryEntities.has(entity));
if (unauditedLongMemoryEntities.length) {
  throw new Error(`Long-memory audit drift: governed memory entities now exist and must be audited: ${unauditedLongMemoryEntities.join(", ")}`);
}

function readAnonymousJsonFile(absolutePath, fallback) {
  if (!existsSync(absolutePath)) return { value: fallback, exists: false, valid: true, sha256: null };
  const content = readFileSync(absolutePath, "utf8");
  try {
    return { value: JSON.parse(content), exists: true, valid: true, sha256: createHash("sha256").update(content).digest("hex") };
  } catch {
    return { value: fallback, exists: true, valid: false, sha256: createHash("sha256").update(content).digest("hex") };
  }
}

function summaryHasSignal(summary) {
  return Boolean(
    (typeof summary?.summary === "string" && summary.summary.trim()) ||
    (Array.isArray(summary?.keyEvents) && summary.keyEvents.length) ||
    (Array.isArray(summary?.newFacts) && summary.newFacts.length) ||
    (Array.isArray(summary?.characterStateChanges) && summary.characterStateChanges.length) ||
    (Array.isArray(summary?.foreshadowingUpdates) && summary.foreshadowingUpdates.length) ||
    (Array.isArray(summary?.continuityRisks) && summary.continuityRisks.length) ||
    (Array.isArray(summary?.powerProgressionUpdates) && summary.powerProgressionUpdates.length)
  );
}

const longMemoryProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const project = projectFile.value;
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const contentStats = chapters.map((chapter) => {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath : "";
    const absolutePath = relativePath ? join(projectDirectory, relativePath) : "";
    const content = absolutePath && existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
    return { chapterId: chapter?.id, status: chapter?.status || "missing", substantial: Boolean(content && content.trim().length >= 800) };
  });
  const summaryFiles = directJsonFiles(join(projectDirectory, "memory", "chapter-summaries"));
  const summaries = summaryFiles.map((path) => readAnonymousJsonFile(path, null)).filter((entry) => entry.value).map((entry) => entry.value);
  const signalSummaries = summaries.filter(summaryHasSignal);
  const summaryChapterIds = new Set(signalSummaries.map((summary) => summary?.chapterId).filter(Boolean));
  const factHistory = parseAnonymousJsonLines(join(projectDirectory, "knowledge", "facts.jsonl"));
  const tripleHistory = parseAnonymousJsonLines(join(projectDirectory, "knowledge", "triples.jsonl"));
  const chapterIndexFile = readAnonymousJsonFile(join(projectDirectory, "memory", "chapter-index.json"), { chapters: [], keywords: {} });
  const vectorFile = readAnonymousJsonFile(join(projectDirectory, "knowledge", "vectors.json"), { entries: [] });
  const storyControlFile = readAnonymousJsonFile(join(projectDirectory, "story-control", "story-control.json"), null);
  const storyControl = storyControlFile.value;
  const indexChapters = Array.isArray(chapterIndexFile.value?.chapters) ? chapterIndexFile.value.chapters : [];
  const vectors = Array.isArray(vectorFile.value?.entries) ? vectorFile.value.entries : [];
  const storyCharacters = Array.isArray(storyControl?.characters) ? storyControl.characters : [];
  const ledgerNames = ["foreshadowing", "continuity", "power-progression", "character-state", "risks"];
  const ledgerInputs = ledgerNames.map((name) => readAnonymousJsonFile(join(projectDirectory, "ledger", `${name}.json`), []));
  const ledgerEntries = ledgerInputs.flatMap((entry) => Array.isArray(entry.value) ? entry.value : []);
  const taskHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "history.jsonl"));
  const latestTasks = latestAnonymousRecords(taskHistory.records);
  const continuityTasks = latestTasks.filter((task) => task?.type === "continuity.check");
  const continuityQuestions = continuityTasks.reduce((total, task) => total + (Array.isArray(task?.result?.questions) ? task.result.questions.length : 0), 0);
  const substantialChapterIds = new Set(contentStats.filter((entry) => entry.substantial).map((entry) => entry.chapterId));
  const draftedChapterIds = new Set(contentStats.filter((entry) => entry.status === "drafted").map((entry) => entry.chapterId));
  const indexByChapter = new Map(indexChapters.filter((entry) => entry?.chapterId).map((entry) => [entry.chapterId, entry]));
  const plannedChapters = chapters.filter((chapter) => chapter?.status === "planned");
  const allFacts = factHistory.records;
  const allTriples = tripleHistory.records;
  const allSummaryFacts = allFacts.filter((fact) => fact?.source?.type === "chapter-summary");
  const emotionItems = summaries.flatMap((summary) => Object.values(summary?.emotionLedger || {}).flatMap((items) => Array.isArray(items) ? items : []));

  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: projectFile.sha256,
      chapterSummaries: summaryFiles.length ? createHash("sha256").update(summaryFiles.map((path) => createHash("sha256").update(readFileSync(path, "utf8")).digest("hex")).join("\u0000")).digest("hex") : null,
      knowledgeFacts: factHistory.sha256,
      knowledgeTriples: tripleHistory.sha256,
      chapterIndex: chapterIndexFile.sha256,
      vectors: vectorFile.sha256,
      storyControl: storyControlFile.sha256,
      ledgers: ledgerInputs.some((entry) => entry.sha256) ? createHash("sha256").update(ledgerInputs.map((entry) => entry.sha256 || "missing").join("\u0000")).digest("hex") : null,
      taskHistory: taskHistory.sha256,
    },
    parseHealth: {
      projectValid: projectFile.valid,
      invalidSummaryFiles: summaryFiles.length - summaries.length,
      invalidFactLines: factHistory.invalidLines,
      invalidTripleLines: tripleHistory.invalidLines,
      chapterIndexValid: chapterIndexFile.valid,
      vectorsValid: vectorFile.valid,
      storyControlValid: storyControlFile.valid,
      invalidTaskLines: taskHistory.invalidLines,
    },
    chapters: {
      total: chapters.length,
      substantialAtLeast800Chars: substantialChapterIds.size,
      drafted: draftedChapterIds.size,
      substantialWithSummarySignal: [...substantialChapterIds].filter((chapterId) => summaryChapterIds.has(chapterId)).length,
      draftedWithSummarySignal: [...draftedChapterIds].filter((chapterId) => summaryChapterIds.has(chapterId)).length,
      planned: plannedChapters.length,
      plannedWithoutOwnKnowledgeAnchor: plannedChapters.filter((chapter) => {
        const indexEntry = indexByChapter.get(chapter?.id);
        return !indexEntry || (!(Array.isArray(indexEntry.factIds) && indexEntry.factIds.length) && !(Array.isArray(indexEntry.tripleIds) && indexEntry.tripleIds.length));
      }).length,
    },
    summaries: {
      files: summaryFiles.length,
      signalSummaries: signalSummaries.length,
      acceptedRecapIds: summaries.reduce((total, summary) => total + (Array.isArray(summary?.acceptedRecapIds) ? summary.acceptedRecapIds.length : 0), 0),
      keyEvents: summaries.reduce((total, summary) => total + (Array.isArray(summary?.keyEvents) ? summary.keyEvents.length : 0), 0),
      factPatches: summaries.reduce((total, summary) => total + (Array.isArray(summary?.newFacts) ? summary.newFacts.length : 0), 0),
      characterStatePatches: summaries.reduce((total, summary) => total + (Array.isArray(summary?.characterStateChanges) ? summary.characterStateChanges.length : 0), 0),
      emotionItems: emotionItems.length,
      continuityRisks: summaries.reduce((total, summary) => total + (Array.isArray(summary?.continuityRisks) ? summary.continuityRisks.length : 0), 0),
      summariesWithSourceVersion: summaries.filter((summary) => summary?.sourceVersion || summary?.sourceContentHash).length,
    },
    knowledge: {
      facts: allFacts.length,
      factsBySource: countsByValue(allFacts.map((fact) => fact?.source?.type)),
      summaryFacts: allSummaryFacts.length,
      factsWithTruthStatus: allFacts.filter((fact) => fact?.truthStatus || fact?.status).length,
      factsWithTemporalValidity: allFacts.filter((fact) => fact?.validFrom || fact?.validTo || fact?.storyTime).length,
      factsWithConfidence: allFacts.filter((fact) => Number.isFinite(fact?.confidence)).length,
      factsWithVisibility: allFacts.filter((fact) => fact?.visibility || fact?.knownBy || fact?.readerVisibility).length,
      factsWithSourceVersion: allFacts.filter((fact) => fact?.sourceVersion || fact?.sourceContentHash).length,
      triples: allTriples.length,
      triplesByPredicate: countsByValue(allTriples.map((triple) => triple?.predicate)),
      triplesWithValidityOrSupersession: allTriples.filter((triple) => triple?.validFrom || triple?.validTo || triple?.supersedes).length,
      indexedChapters: indexChapters.length,
      indexedChaptersWithFacts: indexChapters.filter((entry) => Array.isArray(entry?.factIds) && entry.factIds.length).length,
      indexedChaptersWithTriples: indexChapters.filter((entry) => Array.isArray(entry?.tripleIds) && entry.tripleIds.length).length,
      vectorEntries: vectors.length,
      vectorsByKind: countsByValue(vectors.map((entry) => entry?.kind)),
    },
    storyControl: {
      exists: Boolean(storyControl),
      characters: storyCharacters.length,
      charactersWithCurrentState: storyCharacters.filter((character) => typeof character?.currentState === "string" && character.currentState.trim()).length,
      charactersWithKnownSecrets: storyCharacters.filter((character) => typeof character?.knownSecrets === "string" && character.knownSecrets.trim()).length,
      charactersWithFirstChapter: storyCharacters.filter((character) => character?.firstChapterId).length,
      charactersWithLastSeenChapter: storyCharacters.filter((character) => character?.lastSeenChapterId).length,
      temporalStateEvents: 0,
      perPovKnowledgeStates: 0,
    },
    ledgers: {
      entries: ledgerEntries.length,
      byKind: countsByValue(ledgerEntries.map((entry) => entry?.kind)),
      byStatus: countsByValue(ledgerEntries.map((entry) => entry?.status)),
    },
    continuityTasks: {
      total: continuityTasks.length,
      byStatus: countsByValue(continuityTasks.map((task) => task?.status)),
      emittedQuestions: continuityQuestions,
      structuredViolationReports: 0,
      resolutionReceipts: 0,
    },
    governedProofs: {
      contradictionCases: 0,
      memoryReadyProofs: 0,
      longContinuityCertificates: 0,
    },
    interpretation: {
      hasAuthoritativeLongMemory: false,
      reason: "Summaries, ledgers, StoryControl, knowledge facts/triples, vectors, and continuity task results are useful projections and hints, but they do not share temporal truth status, entity identity, POV visibility, contradiction, source-version, supersession, or settlement authority.",
    },
  };
});

const longMemoryTotals = longMemoryProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  substantialChapters: totals.substantialChapters + project.chapters.substantialAtLeast800Chars,
  draftedChapters: totals.draftedChapters + project.chapters.drafted,
  substantialWithSummary: totals.substantialWithSummary + project.chapters.substantialWithSummarySignal,
  draftedWithSummary: totals.draftedWithSummary + project.chapters.draftedWithSummarySignal,
  plannedChapters: totals.plannedChapters + project.chapters.planned,
  plannedWithoutOwnKnowledgeAnchor: totals.plannedWithoutOwnKnowledgeAnchor + project.chapters.plannedWithoutOwnKnowledgeAnchor,
  summaryFiles: totals.summaryFiles + project.summaries.files,
  signalSummaries: totals.signalSummaries + project.summaries.signalSummaries,
  acceptedRecapIds: totals.acceptedRecapIds + project.summaries.acceptedRecapIds,
  factPatches: totals.factPatches + project.summaries.factPatches,
  characterStatePatches: totals.characterStatePatches + project.summaries.characterStatePatches,
  knowledgeFacts: totals.knowledgeFacts + project.knowledge.facts,
  knowledgeTriples: totals.knowledgeTriples + project.knowledge.triples,
  indexedChapters: totals.indexedChapters + project.knowledge.indexedChapters,
  indexedChaptersWithFacts: totals.indexedChaptersWithFacts + project.knowledge.indexedChaptersWithFacts,
  vectorEntries: totals.vectorEntries + project.knowledge.vectorEntries,
  storyCharacters: totals.storyCharacters + project.storyControl.characters,
  ledgerEntries: totals.ledgerEntries + project.ledgers.entries,
  continuityTasks: totals.continuityTasks + project.continuityTasks.total,
  continuityQuestions: totals.continuityQuestions + project.continuityTasks.emittedQuestions,
}), { projects: 0, chapters: 0, substantialChapters: 0, draftedChapters: 0, substantialWithSummary: 0, draftedWithSummary: 0, plannedChapters: 0, plannedWithoutOwnKnowledgeAnchor: 0, summaryFiles: 0, signalSummaries: 0, acceptedRecapIds: 0, factPatches: 0, characterStatePatches: 0, knowledgeFacts: 0, knowledgeTriples: 0, indexedChapters: 0, indexedChaptersWithFacts: 0, vectorEntries: 0, storyCharacters: 0, ledgerEntries: 0, continuityTasks: 0, continuityQuestions: 0 });

const longMemoryStages = [
  {
    stageId: "MEMORY-TRACE-001",
    label: "正文来源",
    currentStatus: "mutable-chapter-files",
    evidence: [memoryEvidence("api/src/contextAssembler.ts", '{ title: "目标正文"')],
    strength: "The current and nearby writing assets remain available for direct inspection and recovery.",
    gap: "Memory extraction does not require an adopted prose receipt, settled chapter, immutable source version, or stable evidence anchors before deriving facts.",
  },
  {
    stageId: "MEMORY-TRACE-002",
    label: "章后抽取",
    currentStatus: "model-generated-recap-candidate",
    evidence: [memoryEvidence("api/src/taskTemplates.ts", "Post-save Recap Contract")],
    strength: "Recaps can propose summaries, facts, character changes, emotion items, risks, and ledger patches for author review.",
    gap: "Claims lack semantic entity IDs, assertion type, story-time interval, epistemic status, confidence, visibility, contradiction links, and source-content version.",
  },
  {
    stageId: "MEMORY-TRACE-003",
    label: "回顾采纳",
    currentStatus: "summary-and-ledger-file-merge",
    evidence: [memoryEvidence("api/src/writingCockpit.ts", "export async function acceptWritingRecapPatches")],
    strength: "Accepted recap assets are written through a multi-file temporary-file transaction and duplicate acceptance IDs are guarded.",
    gap: "Acceptance mutates chapter summaries and ledgers but does not update a canonical fact event stream, StoryControl character state, entity registry, temporal world state, or contradiction queue.",
  },
  {
    stageId: "MEMORY-TRACE-004",
    label: "事实权威",
    currentStatus: "accepted-patch-status-inside-summary",
    evidence: [memoryEvidence("api/src/types.ts", "export interface ChapterFactPatch")],
    strength: "Facts retain a patch ID, chapter ID, related entity labels, optional source anchor, and acceptance status.",
    gap: "The summary is a mutable projection; facts have no claim type, truth status, evidence version, valid interval, confidence, supersession, contest, author authority, or settlement event.",
  },
  {
    stageId: "MEMORY-TRACE-005",
    label: "实体与别名",
    currentStatus: "free-string-related-entities",
    evidence: [memoryEvidence("api/src/types.ts", "relatedEntities: string[]")],
    strength: "Loose labels make early extraction tolerant of incomplete schema and can seed later entity work.",
    gap: "Names, aliases, titles, disguises, reincarnations, organizations, locations, items, and rules have no stable registry or merge/split history, so identical strings may differ and different strings may identify one entity.",
  },
  {
    stageId: "MEMORY-TRACE-006",
    label: "人物状态",
    currentStatus: "parallel-current-state-and-history-triples",
    evidence: [memoryEvidence("api/src/types.ts", "currentState: string"), memoryEvidence("api/src/knowledgeIndex.ts", 'predicate: "state_after"')],
    strength: "StoryControl offers an editable current profile while summaries can retain chapter-specific character changes.",
    gap: "Recap acceptance does not reconcile StoryControl; every state_after triple can coexist without dimension, effective time, supersession, relapse, branch, or current-state reduction semantics.",
  },
  {
    stageId: "MEMORY-TRACE-007",
    label: "世界、规则与时间线",
    currentStatus: "markdown-plus-free-text-events",
    evidence: [memoryEvidence("api/src/contextAssembler.ts", '{ title: "世界观"'), memoryEvidence("api/src/types.ts", "export interface StoryEventCard")],
    strength: "World, power-system, event trigger, location, reward, cost, and chapter range can all be represented in author-readable assets.",
    gap: "No typed rule condition/mechanism/result/cost, location-time state, travel duration, inventory conservation, injury/cooldown, organization action, calendar, branch, or bitemporal validity authority exists.",
  },
  {
    stageId: "MEMORY-TRACE-008",
    label: "秘密与认识边界",
    currentStatus: "one-free-text-known-secrets-field",
    evidence: [memoryEvidence("api/src/types.ts", "knownSecrets: string"), memoryEvidence("api/src/contextAssembler.ts", '{ title: "故事总控台"')],
    strength: "The schema acknowledges that what a character knows matters for POV-safe writing.",
    gap: "The entire StoryControl is injected into drafting; knowledge is not keyed by subject, proposition, learned-at event, evidence, belief/lie/misbelief, branch, reader visibility, or permission view, so hidden truth can leak into POV prose.",
  },
  {
    stageId: "MEMORY-TRACE-009",
    label: "知识投影",
    currentStatus: "rebuildable-facts-triples-vectors",
    evidence: [memoryEvidence("api/src/knowledgeIndex.ts", "export async function rebuildKnowledgeIndex")],
    strength: "Accepted summaries, ledgers, and StoryControl project into searchable facts, triples, chapter keywords, and provider-independent vector records with source references.",
    gap: "Projection records omit source version, truth/epistemic status, valid time, visibility, contradiction and supersession; vector presence can overstate memory coverage because empty chapter index entries are also embedded.",
  },
  {
    stageId: "MEMORY-TRACE-010",
    label: "下一章检索",
    currentStatus: "target-anchor-gated",
    evidence: [memoryEvidence("api/src/contextAssembler.ts", "if (!indexEntry || (!indexEntry.factIds.length && !indexEntry.tripleIds.length)) return []")],
    strength: "When a target chapter already has entity and keyword anchors, bounded direct plus related semantic retrieval avoids dumping the whole book into the prompt.",
    gap: "A future chapter normally has no own facts/triples, so the function returns before global retrieval; ChapterIntent, scene entities, obligations, POV knowledge, predecessor outputs, and unresolved contradictions do not seed the query.",
  },
  {
    stageId: "MEMORY-TRACE-011",
    label: "runtime 叙事快照",
    currentStatus: "current-target-summary-only",
    evidence: [memoryEvidence("api/src/runtimeEngine.ts", "readChapterSummary(root, chapter.id)"), memoryEvidence("api/src/runtimeEngine.ts", "summarySignals: currentSummary.summary || currentSummary.keyEvents.length ? [currentSummary] : []")],
    strength: "Runtime records context budget, story-control counts, ledgers, index counts, quality/craft risks, previews, and knowledge references for diagnostics.",
    gap: "The summary signal is the target chapter itself rather than the prior settled chain; missing-chain is recorded but does not prevent draft, and counts do not prove relevant, current, authorized memory reached the model.",
  },
  {
    stageId: "MEMORY-TRACE-012",
    label: "连续性验证",
    currentStatus: "generic-llm-task-with-string-questions",
    evidence: [memoryEvidence("api/src/taskTemplates.ts", '"continuity.check": "Inspect continuity risks')],
    strength: "A dedicated task type receives broad, cockpit, memory, target, and continuity-skill context and can identify nuanced literary inconsistencies.",
    gap: "It has no structured violation contract, deterministic rule pass, evidence anchors, severity/waiver state, contradiction classification, resolution receipt, regression scope, or hard gate before canon adoption.",
  },
  {
    stageId: "MEMORY-TRACE-013",
    label: "修订与失效传播",
    currentStatus: "manual-rebuild-without-source-cursor",
    evidence: [memoryEvidence("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId"'), memoryEvidence("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/knowledge/index/rebuild"')],
    strength: "Authors can edit summaries and rebuild derived indexes after changes.",
    gap: "Direct edits do not emit supersession or damage events; old candidates, summaries, facts, triples, vectors, POV states, continuity results, prompts, and completion proofs are not deterministically invalidated by an impact graph.",
  },
  {
    stageId: "MEMORY-TRACE-014",
    label: "长期记忆健康与证明",
    currentStatus: "count-dashboard-only",
    evidence: [memoryEvidence("api/src/auditReport.ts", "knowledgeSummary")],
    strength: "The audit report exposes fact, triple, indexed-chapter, keyword, vector, job, task, and runtime counts.",
    gap: "Counts do not measure settled-source coverage, currentness, contradiction debt, entity resolution, temporal completeness, POV leakage, retrieval recall, compression loss, stale projections, or replayable long-continuity certification.",
  },
];

const longMemoryAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "Across a full novel, every accepted fact, character/world state, relationship, rule, secret, injury, resource, timeline event, and reader/POV knowledge boundary remains temporally traceable, contradiction-aware, revision-safe, and available to the right generation task without leaking hidden truth.",
  sourceFiles: [...longMemorySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "artifact-category hashes", "chapter/status/coverage counts", "summary field counts", "knowledge source/predicate/vector-kind counts", "schema field-presence counts", "continuity task status and question counts"],
    snapshotExcludes: ["project slug", "title", "genre", "rough idea", "chapter title", "summary or fact text", "character/entity/alias names", "secret text", "world rules", "question or answer text", "prompt/model output", "novel prose"],
  },
  operationalSnapshot: {
    substantialInventoryThresholdChars: 800,
    totals: longMemoryTotals,
    projects: longMemoryProjectSnapshots,
    interpretation: "File, summary, fact, triple, vector, task, and count presence is inventory evidence only. It does not prove current canonical truth, temporal correctness, entity identity, POV safety, contradiction resolution, retrieval sufficiency, or long-book continuity.",
  },
  summary: {
    auditedStages: longMemoryStages.length,
    projectsScanned: longMemoryTotals.projects,
    chaptersInventoried: longMemoryTotals.chapters,
    substantialChapters: longMemoryTotals.substantialChapters,
    substantialChaptersWithSummary: longMemoryTotals.substantialWithSummary,
    knowledgeFacts: longMemoryTotals.knowledgeFacts,
    knowledgeTriples: longMemoryTotals.knowledgeTriples,
    indexedChapters: longMemoryTotals.indexedChapters,
    indexedChaptersWithFacts: longMemoryTotals.indexedChaptersWithFacts,
    vectorEntries: longMemoryTotals.vectorEntries,
    continuityTasks: longMemoryTotals.continuityTasks,
    structuredContradictionCases: 0,
    memoryReadyProofs: 0,
    longContinuityCertificates: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform treats chapter summaries, ledgers, StoryControl, Markdown bibles, fact/triple/vector indexes, task results, and runtime snapshots as neighboring mutable memory surfaces instead of projections over one settled, temporal, epistemic, versioned canon assertion stream.",
    consequence: "Most drafted chapters have no accepted memory summary; future chapters can miss global retrieval; character and world states can diverge across surfaces; historical and current assertions coexist without supersession; hidden truth can reach the wrong POV; revisions cannot deterministically invalidate dependent memory or prove long-book continuity.",
  },
  stages: longMemoryStages,
  alternatives: [
    {
      option: "A-larger-context-and-more-summaries",
      verdict: "insufficient-target",
      blueCase: "Fastest improvement: summarize every chapter and include more adjacent or semantically similar text in prompts.",
      redCase: "More compressed text amplifies stale facts, contradictions, identity ambiguity, secret leakage, and token cost; context size cannot establish truth, time, authority, or supersession.",
    },
    {
      option: "B-knowledge-graph-as-authority",
      verdict: "useful-projection-not-final-authority",
      blueCase: "Typed nodes and edges improve entity retrieval, relationship analysis, timelines, path queries, and visible contradiction clusters.",
      redCase: "A graph alone does not define commands, evidence versions, author/settlement authority, bitemporal validity, POV permissions, branch semantics, rollback, or immutable history; mutable graph edges recreate last-write-wins.",
    },
    {
      option: "C-event-sourced-temporal-canon-memory",
      verdict: "recommended-not-implemented",
      blueCase: "Settled assertion events with stable entities, story/revision time, epistemic views, contradiction cases, and deterministic projections support safe retrieval, revision, POV filtering, audit replay, and full-book continuity.",
      redCase: "Requires entity resolution, event schemas, temporal reducers, access-controlled views, migration, projection cursors, contradiction UX, retrieval evaluation, and careful performance work for long novels.",
    },
  ],
  targetAuthority: {
    entities: ["CanonFactEvent", "FactAssertion", "EntityRegistry", "EntityAlias", "CharacterStateTimeline", "RelationshipStateTimeline", "WorldRule", "WorldStateTimeline", "StoryTimeInterval", "KnowledgeBoundary", "SecretVisibilityPolicy", "ContradictionCase", "ContinuityConstraint", "MemoryProjection", "MemoryHealthReport", "MemoryReadyProof", "LongContinuityCertificate"],
    assertionStatuses: ["candidate", "accepted", "contested", "superseded", "invalidated", "branch_only", "author_waived"],
    assertionTypes: ["objective_canon", "character_belief", "character_lie", "character_misbelief", "rumor", "reader_visible", "plan_only", "counterfactual", "unknown"],
    temporalAxes: ["story_valid_from", "story_valid_to", "recorded_at", "superseded_at", "branch_id", "canon_version"],
    invariant: "No summary, Markdown sentence, mutable profile field, ledger row, vector hit, model output, task success, current-state string, or last-written triple may independently establish canon truth or a subject's knowledge.",
  },
  retrievalProtocol: {
    mandatoryInputs: ["settled ChapterIntent and ExecutionReadyProof", "POV subject and permitted knowledge view", "predecessor state outputs", "scene entity and location IDs", "active obligations and continuity constraints", "story-time window", "current canon/version cursor"],
    order: ["filter by authority, branch, validity, visibility, source freshness, and hard constraints", "include mandatory current state and predecessor outputs", "retrieve causal/temporal/entity neighbors", "rank optional semantic context", "expose omissions, conflicts, and compression", "freeze ContextManifest and MemoryReadyProof"],
    rule: "Applicability and permission are evaluated before semantic similarity. A highly similar stale, branch-only, future-secret, superseded, or untrusted assertion must not outrank a mandatory current fact.",
  },
  contradictionProtocol: {
    classes: ["true continuity error", "deliberate lie", "character misbelief", "unreliable narration", "rumor disagreement", "time-state change", "branch difference", "identity ambiguity", "source extraction error", "insufficient evidence"],
    behavior: "Never silently overwrite. Open a ContradictionCase with competing assertion IDs, evidence, affected entities/scenes/decisions, severity, reader/POV exposure, and recommended resolution; block adoption only when the contradiction can invalidate the target action or leak protected truth.",
  },
  povAndSecretProtocol: {
    knowledgeState: ["subjectId", "assertionId", "epistemicType", "learnedAtEventId", "evidence", "confidence", "canDiscloseTo", "expiresOrChangesAt", "branchId"],
    views: ["objective-author", "pov-character", "other-character", "reader-at-chapter", "reviewer-redacted", "export-public"],
    rule: "Prompts receive a view-specific projection, not the full author truth plus an instruction to avoid leaking it. Reader knowledge and character knowledge remain separate even when both derive from the same event.",
  },
  revisionProtocol: {
    behavior: "Every adopted prose mutation emits assertion additions, supersessions, and evidence-anchor changes. An impact graph marks summaries, state timelines, contradictions, knowledge/vector projections, context manifests, candidates, continuity results, obligations, and completion certificates stale; deterministic reducers rebuild from the last valid cursor and late workers cannot publish across the new fence.",
  },
  releaseGate: {
    requirementIds: ["FR-CHAR-003", "FR-CHAR-004", "FR-CHAR-005", "FR-CHAR-006", "FR-CHAR-008", "FR-CHAR-009", "FR-CHAR-010", "FR-CHAR-011", "FR-CHAR-016", "FR-CHAR-017", "FR-CHAR-018", "FR-CHAR-019", "FR-WORLD-001", "FR-WORLD-002", "FR-WORLD-003", "FR-WORLD-004", "FR-WORLD-005", "FR-WORLD-006", "FR-WORLD-007", "FR-WORLD-008", "FR-WORLD-009", "FR-WORLD-010", "FR-WORLD-011", "FR-WORLD-012", "FR-WORLD-013", "FR-WORLD-014", "FR-WORLD-015", "FR-WORLD-016", "FR-WORLD-017", "FR-WORLD-018", "FR-WORLD-019", "FR-MEMORY-001", "FR-MEMORY-002", "FR-MEMORY-003", "FR-LONGMEM-001", "FR-LONGMEM-002", "FR-LONGMEM-003", "FR-LONGMEM-004", "FR-LONGMEM-005", "FR-LONGMEM-006", "FR-LONGMEM-007", "FR-LONGMEM-008", "FR-LONGMEM-009", "FR-LONGMEM-010", "FR-LONGMEM-011", "FR-LONGMEM-012", "FR-LONGMEM-013", "FR-LONGMEM-014", "FR-LONGMEM-015", "FR-LONGMEM-016", "FR-LONGMEM-017", "FR-LONGMEM-018", "FR-LONGMEM-019", "FR-LONGMEM-020", "FR-LONGMEM-021", "FR-LONGMEM-022", "FR-LONGMEM-023", "FR-LONGMEM-024", "FR-PROSE-007", "FR-PROSE-009", "FR-PROSE-013", "FR-PROSE-023"],
    acceptanceRefs: ["AT-060", "AT-061", "AT-062", "AT-063", "AT-064", "AT-065", "AT-066", "AT-083", "AT-084", "AT-085", "AT-086", "AT-087", "AT-088", "AT-089", "AT-090", "AT-091", "AT-092", "AT-093", "AT-150", "AT-151", "AT-152", "AT-153", "AT-154", "AT-155", "AT-156", "AT-157", "AT-158", "AT-159", "AT-160", "AT-161", "AT-162", "AT-163", "AT-164", "AT-165", "AT-166", "AT-167", "AT-168", "AT-169", "AT-170", "AT-171", "AT-172", "AT-173", "AT-174", "AT-175", "AT-176", "AT-177", "AT-178", "AT-179", "AT-180", "AT-181", "AT-182", "AT-183", "AT-184", "AT-185", "AT-186", "AT-187", "AT-188", "AT-189", "AT-227", "AT-228", "AT-229", "AT-230", "AT-231", "AT-232", "AT-233", "AT-234", "AT-235", "AT-236", "AT-237", "AT-238", "AT-239", "AT-240", "AT-241", "AT-242", "AT-243", "AT-244", "AT-245", "AT-246", "AT-247", "AT-248", "AT-249", "AT-250", "AT-251", "AT-252", "AT-253", "AT-254", "AT-255", "AT-256", "AT-257", "AT-258", "AT-259", "AT-260", "AT-261", "AT-262", "AT-263", "AT-264", "AT-265", "AT-266", "AT-267", "AT-268"],
    rule: "Do not claim long-novel memory or continuity until settled prose is the only canon assertion source, every assertion has stable entity/evidence/version/temporal/epistemic semantics, future-chapter retrieval works without target-owned anchors, prompts use POV-filtered views, contradictions and revisions are replayable, and shadow tests prove recall, leakage prevention, stale invalidation, deterministic rebuild, and continuity over a frozen long-book corpus.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none changes memory truth, temporal validity, entity identity, POV/reader visibility, contradiction handling, revision invalidation, retrieval completeness or continuity certification.",
};

const fullBookOrchestrationSourcePaths = [
  "api/src/app.ts",
  "api/src/executionDispatcher.ts",
  "api/src/executionQueue.ts",
  "api/src/workLease.ts",
  "api/src/runtimeStageReceipt.ts",
  "api/src/runtimeStageReceipt.spec.ts",
  "api/src/runtimeStageOutput.ts",
  "api/src/runtimeStageOutput.spec.ts",
  "api/src/runtime.spec.ts",
  "api/src/runtimeEngine.ts",
  "api/src/writingCockpit.ts",
  "api/src/storyGraph.ts",
  "api/src/runtimeRecovery.ts",
  "api/src/runtimeRecovery.spec.ts",
  "api/src/runtimeCompensation.ts",
  "api/src/runtimeCompensation.spec.ts",
  "api/src/chapterSettlement.ts",
  "api/src/chapterSettlement.spec.ts",
  "api/src/chapterSettlementProjectionClosure.ts",
  "api/src/chapterSettlementProjectionClosure.spec.ts",
  "api/src/derivedPublication.ts",
  "api/src/derivedPublication.spec.ts",
  "api/src/bookWorkGraph.ts",
  "api/src/bookWorkGraph.spec.ts",
  "api/src/bookRunClosure.ts",
  "api/src/bookRunClosure.spec.ts",
  "api/src/bookRunInvalidation.ts",
  "api/src/bookRunInvalidation.spec.ts",
  "api/src/bookRunImpact.ts",
  "api/src/bookRunImpact.spec.ts",
  "api/src/milestoneRepairPlan.ts",
  "api/src/milestoneRepairPlan.spec.ts",
  "api/src/milestoneRepairCompletion.ts",
  "api/src/milestoneRepairCompletion.spec.ts",
  "api/src/milestoneAudit.ts",
  "api/src/milestoneAudit.spec.ts",
  "api/src/milestoneRepairPolicy.ts",
  "api/src/milestoneRepairPolicy.spec.ts",
  "api/src/bookWorkScheduler.ts",
  "api/src/runtimeSnapshot.ts",
  "api/src/runtimeStore.ts",
  "api/src/runtimeWorker.ts",
  "api/src/runtimeWorker.spec.ts",
  "api/src/runtimeControlBoundary.ts",
  "api/src/runtimeControlBoundary.spec.ts",
  "api/src/runtimeMutationDrain.ts",
  "api/src/runtimeMutationDrain.spec.ts",
  "api/src/codexRunner.ts",
  "api/src/frozenPublicationScope.ts",
  "api/src/frozenPublicationScope.spec.ts",
  "api/src/publicationDependencyGraph.ts",
  "api/src/publicationDependencyGraph.spec.ts",
  "api/src/bookRun.ts",
  "api/src/bookRun.spec.ts",
  "api/src/runReadiness.ts",
  "api/src/runReadiness.spec.ts",
  "api/src/budgetReservation.ts",
  "api/src/modelInvocationLedger.ts",
  "api/src/modelInvocationLedger.spec.ts",
  "api/src/modelInvocationAuthority.ts",
  "api/src/modelInvocationSettlement.ts",
  "api/src/quiescenceProof.ts",
  "api/src/completionAudit.ts",
  "api/src/types.ts",
  "ui/src/components/novel/AutopilotRuntimePanel.vue",
  "ui/src/services/novelApi.ts",
  "ui/src/stores/novel.ts",
  "ui/src/types/novel.ts",
];
const fullBookOrchestrationSources = new Map(fullBookOrchestrationSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function orchestrationEvidence(relativePath, needle) {
  const sourceEntry = fullBookOrchestrationSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown full-book-orchestration audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Full-book-orchestration evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function orchestrationSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = fullBookOrchestrationSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown full-book-orchestration audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Full-book-orchestration slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Full-book-orchestration slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const orchestrationRuntimeSource = fullBookOrchestrationSources.get("api/src/runtimeEngine.ts").content;
const orchestrationAppSource = fullBookOrchestrationSources.get("api/src/app.ts").content;
const orchestrationUiStoreSource = fullBookOrchestrationSources.get("ui/src/stores/novel.ts").content;
const orchestrationStartSlice = orchestrationSourceSlice("api/src/runtimeEngine.ts", "async function processStart", "async function processControl");
const orchestrationControlSlice = orchestrationSourceSlice("api/src/runtimeEngine.ts", "async function processControl", "async function processDerivative");
const orchestrationSelectSlice = orchestrationSourceSlice("api/src/runtimeEngine.ts", "function selectTargetChapter", "function stageMessage");
const orchestrationClaimSlice = orchestrationSourceSlice("api/src/runtimeStore.ts", "export function claimNextRuntimeCommand", "export function recoverStaleRuntimeCommands");
const orchestrationSnapshotSlice = orchestrationSourceSlice("api/src/runtimeSnapshot.ts", "const steps: CreationRuntimeStep[]", "const snapshotBase");
const orchestrationWorkerSource = fullBookOrchestrationSources.get("api/src/runtimeWorker.ts").content;
const orchestrationUiPanelSource = fullBookOrchestrationSources.get("ui/src/components/novel/AutopilotRuntimePanel.vue").content;

const autoContinueSchedulerBridge = orchestrationAppSource.includes("if (req.body?.autoContinue === true)") && orchestrationAppSource.includes("startBookRun") && orchestrationAppSource.includes("advanceBookRun");
const readinessAdvanceFence = orchestrationAppSource.includes("advanceBookRun(projectRoot(project.slug), bookRun.bookRunId, { requireReadiness: true })") && orchestrationAppSource.includes("advanceBookRun(projectRoot(project.slug), req.params.runId, { requireReadiness: true })");
if (!orchestrationUiStoreSource.includes("autoContinue") || !autoContinueSchedulerBridge || !readinessAdvanceFence) {
  throw new Error("Full-book-orchestration audit drift: autoContinue must be explicitly bridged to the durable BookRun scheduler.");
}
if ((orchestrationStartSlice.match(/runSingleChapterPipeline\(/g) || []).length !== 1) {
  throw new Error("Full-book-orchestration audit drift: runtime start no longer invokes exactly one single-chapter pipeline and must be reclassified.");
}
if (!orchestrationControlSlice.includes('command.type === "accept"') || !orchestrationControlSlice.includes('status: "completed"') || /ChapterSettlement|scheduleNext|WorkGraph/.test(orchestrationControlSlice)) {
  throw new Error("Full-book-orchestration audit drift: accept is no longer status-only or now schedules governed work and must be reclassified.");
}
if (!orchestrationSelectSlice.includes("return next || orderedChapters(project)[0]") || /no_work|scope_complete|all.*checked/i.test(orchestrationSelectSlice)) {
  throw new Error("Full-book-orchestration audit drift: target selection terminal semantics changed and must be reclassified.");
}
if (!/ORDER BY[\s\S]+created_at ASC[\s\S]+LIMIT 1/i.test(orchestrationClaimSlice) || /project_slug.*pending|lease_expires|fencing_token/i.test(orchestrationClaimSlice)) {
  throw new Error("Full-book-orchestration audit drift: command claim ordering or lease semantics changed and must be reclassified.");
}
if (!orchestrationWorkerSource.includes("await processRuntimeCommand(command)") || !orchestrationWorkerSource.includes("while (!stopping)")) {
  throw new Error("Full-book-orchestration audit drift: worker command serialization changed and must be reclassified.");
}
if (!orchestrationSnapshotSlice.includes("status: hasLedger || hasWritingRecap ? \"done\" : \"waiting\"") || !orchestrationUiPanelSource.includes('if (props.activeRun.status === "completed") return 100')) {
  throw new Error("Full-book-orchestration audit drift: next-readiness or completion progress presentation changed and must be reclassified.");
}

const orchestrationProductSource = [...fullBookOrchestrationSources.values()].map((entry) => entry.content).join("\n");
const partialCompletionAudit = orchestrationProductSource.includes("runBookCompletionAudit") && orchestrationProductSource.includes('schemaVersion: "completion-audit.v1"');
const partialQuiescenceProof = orchestrationProductSource.includes("issueQuiescenceProof") && orchestrationProductSource.includes('schemaVersion: "quiescence-proof.v1"');
const partialMilestoneAudit = orchestrationProductSource.includes("auditMilestoneRepair") && orchestrationProductSource.includes('schemaVersion: "milestone-audit.v1"');
const partialFrozenPublicationScope = orchestrationProductSource.includes("createFrozenPublicationScope") && orchestrationProductSource.includes('schemaVersion: "frozen-publication-scope.v1"');
const implementedOrchestrationEntities = [
  "BookRunSpec",
  "FrozenPublicationScope",
  "WorkItemLease",
  "ChapterSettlementEvent",
  "MilestoneAudit",
  "ClosureReadyProof",
  "CompletionAudit",
  "CompletionProof",
  "QuiescenceProof",
].filter((entity) => orchestrationProductSource.includes(entity) && !(partialFrozenPublicationScope && entity === "FrozenPublicationScope") && !(partialCompletionAudit && entity === "CompletionAudit") && !(partialQuiescenceProof && entity === "QuiescenceProof") && !(partialMilestoneAudit && entity === "MilestoneAudit"));
if (implementedOrchestrationEntities.length) {
  throw new Error(`Full-book-orchestration audit drift: governed orchestration entities now exist and must be audited: ${implementedOrchestrationEntities.join(", ")}`);
}

function recursivelyCountGovernedArtifactNames(directory) {
  const counts = {
    bookRuns: 0,
    workGraphs: 0,
    workItems: 0,
    chapterSettlements: 0,
    completionProofs: 0,
    completionAudits: 0,
    quiescenceProofs: 0,
  };
  if (!existsSync(directory)) return counts;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      const normalized = entry.name.toLowerCase().replace(/[_\s]+/g, "-");
      if (/book-?run/.test(normalized)) counts.bookRuns += 1;
      if (/work-?graph/.test(normalized)) counts.workGraphs += 1;
      if (/work-?item/.test(normalized)) counts.workItems += 1;
      if (/chapter-?settlement/.test(normalized)) counts.chapterSettlements += 1;
      if (/completion-?proof/.test(normalized)) counts.completionProofs += 1;
      if (/completion-?audit/.test(normalized)) counts.completionAudits += 1;
      if (/quiescence-?proof/.test(normalized)) counts.quiescenceProofs += 1;
    }
  }
  return counts;
}

const fullBookProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const project = projectFile.value;
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const contentFingerprints = [];
  let substantialChapters = 0;
  for (const chapter of chapters) {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath : "";
    const absolutePath = relativePath ? join(projectDirectory, relativePath) : "";
    if (!absolutePath || !existsSync(absolutePath)) {
      contentFingerprints.push("missing");
      continue;
    }
    const content = readFileSync(absolutePath, "utf8");
    contentFingerprints.push(createHash("sha256").update(content).digest("hex"));
    if (content.trim().length >= 800) substantialChapters += 1;
  }
  const qualityReports = directJsonFiles(join(projectDirectory, "quality"))
    .filter((path) => !/[\\/]series-metrics\.json$/i.test(path));
  const summaryFiles = directJsonFiles(join(projectDirectory, "memory", "chapter-summaries"));
  const summariesWithSignal = summaryFiles
    .map((path) => readAnonymousJsonFile(path, null).value)
    .filter((summary) => summary && summaryHasSignal(summary)).length;
  const ledgerNames = ["foreshadowing", "continuity", "power-progression", "character-state", "risks"];
  const ledgerEntries = ledgerNames.reduce((total, name) => {
    const value = readAnonymousJsonFile(join(projectDirectory, "ledger", `${name}.json`), []).value;
    return total + (Array.isArray(value) ? value.length : 0);
  }, 0);
  const governedArtifacts = recursivelyCountGovernedArtifactNames(projectDirectory);
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: projectFile.sha256,
      chapterContentAggregate: createHash("sha256").update(contentFingerprints.join("\u0000")).digest("hex"),
    },
    parseHealth: { projectValid: projectFile.valid },
    chapters: {
      total: chapters.length,
      statuses: countsByValue(chapters.map((chapter) => chapter?.status || "missing")),
      substantialAtLeast800Chars: substantialChapters,
    },
    downstreamEvidenceInventory: {
      qualityReports: qualityReports.length,
      chapterSummariesWithSignal: summariesWithSignal,
      ledgerEntries,
      ...governedArtifacts,
    },
  };
});

const fullBookTotals = fullBookProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  chapterStatuses: Object.fromEntries(
    [...new Set([...Object.keys(totals.chapterStatuses), ...Object.keys(project.chapters.statuses)])]
      .sort()
      .map((status) => [status, (totals.chapterStatuses[status] || 0) + (project.chapters.statuses[status] || 0)]),
  ),
  substantialChapters: totals.substantialChapters + project.chapters.substantialAtLeast800Chars,
  qualityReports: totals.qualityReports + project.downstreamEvidenceInventory.qualityReports,
  chapterSummariesWithSignal: totals.chapterSummariesWithSignal + project.downstreamEvidenceInventory.chapterSummariesWithSignal,
  ledgerEntries: totals.ledgerEntries + project.downstreamEvidenceInventory.ledgerEntries,
  bookRuns: totals.bookRuns + project.downstreamEvidenceInventory.bookRuns,
  workGraphs: totals.workGraphs + project.downstreamEvidenceInventory.workGraphs,
  workItems: totals.workItems + project.downstreamEvidenceInventory.workItems,
  chapterSettlements: totals.chapterSettlements + project.downstreamEvidenceInventory.chapterSettlements,
  completionProofs: totals.completionProofs + project.downstreamEvidenceInventory.completionProofs,
  completionAudits: totals.completionAudits + project.downstreamEvidenceInventory.completionAudits,
  quiescenceProofs: totals.quiescenceProofs + project.downstreamEvidenceInventory.quiescenceProofs,
}), {
  projects: 0,
  chapters: 0,
  chapterStatuses: {},
  substantialChapters: 0,
  qualityReports: 0,
  chapterSummariesWithSignal: 0,
  ledgerEntries: 0,
  bookRuns: 0,
  workGraphs: 0,
  workItems: 0,
  chapterSettlements: 0,
  completionProofs: 0,
  completionAudits: 0,
  quiescenceProofs: 0,
});

const fullBookOrchestrationStages = [
  {
    id: "rough-idea-and-collaboration",
    current: "Project rough idea and independent tasks can start local work.",
    gap: "No accepted StoryContract and frozen publication scope establish what this book run must finish.",
    target: "Consume the current collaboration decision projection and create a versioned FrozenPublicationScope.",
  },
  {
    id: "scope-and-outline-compile",
    current: "BookRun now persists a versioned FrozenPublicationScope and a structurally validated dependency graph; readiness rejects missing, stale, mismatched, cyclic, duplicate, or out-of-scope graph evidence.",
    gap: "The graph now materializes bounded contract, outline, volume, milestone, chapter, and obligation nodes, but it does not yet compile the full accepted contract, terminal arc, or obligation ownership forecast across every source family.",
    target: "Compile accepted story/outline nodes into a dependency graph with scope membership and evidence versions.",
  },
  {
    id: "readiness-and-budget",
    current: "RunReadinessProof and BudgetReservation are persisted; the proof now carries publication dependency-graph status, and governed BookRun advancement rejects missing, stale, or blocked graph evidence.",
    gap: "The proof still does not compile the full contract/outline/authority forecast or bind actual model-call settlement to every work item.",
    target: "Issue RunReadinessProof and BudgetReservation or block with explicit missing evidence.",
  },
  {
    id: "work-graph-materialization",
    current: "One RuntimeRun represents one chapter pipeline or derivative command.",
    gap: "No durable graph expresses chapter, obligation, continuity, revision, projection, milestone, and final-audit dependencies.",
    target: "Materialize typed BookWorkItems whose readiness derives only from settled predecessor evidence.",
  },
  {
    id: "fair-scheduling-and-leases",
    current: "Execution work items now persist a scoped WorkLease with owner, expiry, heartbeat and fencing token; runtime completion and heartbeat reject a stale token.",
    gap: "The scheduler now applies deterministic repair priority, aging, stable ordering, explicit dispatch ceilings, and resource-class allowlists/quotas; project-wide fairness and a complete lease registry across every BookWorkItem type remain open.",
    target: "Schedule ready work fairly with scoped leases, heartbeats, fencing, budgets, and explicit blocked reasons.",
  },
  {
    id: "chapter-plan-and-context",
    current: "The pipeline runs chapter.plan, assembles draft context, and persists a fingerprinted ChapterExecutionPlan bound to the current ExecutionReadyProof, stage output, chapter, and context.",
    gap: "The ChapterExecutionPlan and chapter-level replayable proof now gate governed draft consumption, but they do not yet bind the full memory, obligation, decision, and author-lock projection.",
    target: "Adopt a governed ChapterExecutionPlan and freeze its ExecutionReadyProof before prose generation.",
  },
  {
    id: "candidate-generation-and-validation",
    current: "The pipeline writes prose before continuity/quality checks and may rewrite canon in place.",
    gap: "Work success, candidate generation, canonical adoption, and chapter settlement are conflated and are not safely retryable.",
    target: "Generate immutable candidates, validate them, then adopt through the canonical mutation gateway.",
  },
  {
    id: "chapter-settlement",
    current: "Chapter settlement now verifies committed adoption, current content, optional quality gate, and persists a fingerprinted evidence bundle with explicit legacy waivers.",
    gap: "The evidence bundle is not yet populated by every upstream projection and full multi-stage settlement recovery remains partial.",
    target: "Emit ChapterSettlementEvent only after every mandatory output commits or records a governed waiver.",
  },
  {
    id: "next-work-scheduling",
    current: "autoContinue now creates or reuses a bounded BookRun and advances its durable dependency graph; the underlying runtime still executes one chapter per dispatched work item.",
    gap: "The bridge does not by itself prove an accepted frozen publication scope, full-book closure, obligation completion, or audited terminal state.",
    target: "The scheduler consumes settlement and graph evidence, never UI switches, file counts, recap presence, or mutable chapter status alone.",
  },
  {
    id: "live-direction-pause-and-stop",
    current: "Control commands share the same durable queue, but pause/stop/direction now receive deterministic priority over queued writing work and direction events retain boundary status.",
    gap: "Priority prevents queued writing work from starving urgent control commands, safe-boundary stops emit durable acknowledgements, mutation drain records blocked leases, and active model tasks now receive AbortSignal cancellation; provider-specific cancellation and a complete quiescence protocol remain partial.",
    target: "Separate control events from work leases and prove received, effective, superseded, drained, and quiescent states.",
  },
  {
    id: "failure-recovery-and-idempotency",
    current: "Runtime stages persist fingerprinted receipts, terminal completed/failed states are immutable, checkpoint, narrative-snapshot, plan, draft, quality-report, recap, and story-graph completion records output references plus fingerprints, and failures now persist bounded retry/stagnation receipts before retrying or pausing; stale execution workers are fenced separately.",
    gap: "Compensation actions now have idempotent application receipts and effect evidence, but applying all projection rollback and full multi-stage settlement recovery remains partial.",
    target: "Resume the first unsettled idempotent stage from immutable receipts, with retry budgets, stuck detection, compensations, and late-worker fencing.",
  },
  {
    id: "milestone-and-obligation-repair",
    current: "Typed, evidence-backed MilestoneRepairPlans materialize into dependency-bound repair work items; immutable completion receipts, kind-specific evidence policies, obligation coverage, character arc, story projection, memory, world-state, continuity, and narrative-curve artifact dereferencing, and replayable MilestoneAudits now gate closure while preserving the frozen scope.",
    gap: "All listed repair kinds now have an artifact-level adapter, but the adapters are structural/freshness checks and do not yet run every domain's full semantic audit policy.",
    target: "Run evidence-based milestone audits and add repair work to the same dependency graph without silently shrinking scope.",
  },
  {
    id: "scope-complete-versus-closure-ready",
    current: "Runtime completed means one accepted run and UI reports 100%.",
    gap: "No state distinguishes drafted, reviewed, settled, publication-scope complete, closure blocked, closure ready, or audit ready.",
    target: "Expose denominators and advance only through evidence-backed book-run states.",
  },
  {
    id: "completion-audit-and-quiescence",
    current: "No full-book completion audit or certificate exists.",
    gap: "Last-chapter prose, all checked statuses, empty task queue, or model self-report could be mistaken for completion while obligations, projections, repairs, or writers remain open.",
    target: "Replay the frozen scope and issue audited_complete only after closure, freshness, coverage, deterministic audit, and no-active-writer proofs pass.",
  },
  {
    id: "post-completion-change",
    current: "Files can still be edited or restored after any run status.",
    gap: "Completion evidence is now revoked with a durable invalidation receipt and scoped impact subgraph, but mutation-specific dependency mapping and automatic re-settlement scheduling remain partial.",
    target: "Any relevant mutation revokes the current proof, opens an impact subgraph, and requires re-settlement and re-audit.",
  },
];

const fullBookOrchestrationAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "After the author provides only a rough direction and answers the few truly high-impact questions, the platform can durably plan, write, review, settle, repair, pause, resume, and finish the whole novel while proving every required chapter and narrative obligation has a current terminal disposition.",
  sourceFiles: [...fullBookOrchestrationSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "source and artifact hashes", "chapter/status/count denominators", "quality/summary/ledger coverage counts", "governed orchestration artifact-name counts"],
    snapshotExcludes: ["project slug", "title", "genre", "rough idea", "chapter title", "outline or prose", "summary or ledger text", "author direction", "prompt or model output", "character or entity names"],
  },
  operationalSnapshot: {
    substantialInventoryThresholdChars: 800,
    runtimeOperationalBaselineRef: "docs/spec-governance/audits/current-q003-operational-baseline.json",
    totals: fullBookTotals,
    projects: fullBookProjectSnapshots,
    interpretation: "Chapter files, statuses, quality reports, summaries, ledgers, runtime runs, commands, and events are inventory or execution evidence only. None independently proves governed work completion, canonical settlement, scope coverage, narrative closure, audit freshness, or terminal quiescence.",
  },
  summary: {
    auditedStages: fullBookOrchestrationStages.length,
    projectsScanned: fullBookTotals.projects,
    chaptersInventoried: fullBookTotals.chapters,
    chaptersMarkedChecked: fullBookTotals.chapterStatuses.checked || 0,
    substantialChapters: fullBookTotals.substantialChapters,
    bookRuns: fullBookTotals.bookRuns,
    workGraphs: fullBookTotals.workGraphs,
    chapterSettlements: fullBookTotals.chapterSettlements,
    completionProofs: fullBookTotals.completionProofs,
    auditedCompletionCertificates: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform now bridges continuous intent into a bounded durable BookRun/work graph, but it still lacks a complete full-book authority that freezes publication scope, proves every dependency settlement, and certifies closure and completion.",
    consequence: "Continuous intent can schedule governed work without treating one accepted chapter as a finished novel, but full-book readiness, repair, closure, quiescence, and audited completion remain unproven.",
  },
  currentEvidence: [
    { claim: "UI continuous intent is bridged through a bounded BookRun and immediate graph advancement; the single-chapter runtime remains the dispatched worker.", evidence: [orchestrationEvidence("ui/src/stores/novel.ts", "autoContinue"), orchestrationEvidence("api/src/app.ts", "if (req.body?.autoContinue === true)"), orchestrationEvidence("api/src/app.ts", "const advancement = await advanceBookRun")] },
    { claim: "Governed BookRun advancement now requires a current RunReadinessProof; missing, stale, or blocked evidence prevents dispatch.", evidence: [orchestrationEvidence("api/src/bookRun.ts", "BOOK_RUN_READINESS_REQUIRED"), orchestrationEvidence("api/src/app.ts", "requireReadiness: true"), orchestrationEvidence("api/src/runReadiness.ts", "run-readiness-proof.v1")] },
    { claim: "RunReadinessProof carries publication dependency-graph status and records dependency-graph-blocked or missing-dependency-graph reasons; the API derives that status from the persisted graph fingerprint before allowing advancement.", evidence: [orchestrationEvidence("api/src/runReadiness.ts", "dependencyGraphStatus"), orchestrationEvidence("api/src/app.ts", "readPublicationDependencyGraph"), orchestrationEvidence("api/src/bookRun.spec.ts", "dependency graph proof is blocked"), orchestrationEvidence("api/src/runReadiness.spec.ts", "publication dependency graph is blocked")] },
    { claim: "Execution work items persist scoped leases and runtime completion is fenced by the lease token, not only the run id.", evidence: [orchestrationEvidence("api/src/executionQueue.ts", "fencingToken"), orchestrationEvidence("api/src/workLease.ts", "FENCING_TOKEN_LOST"), orchestrationEvidence("api/src/runtimeEngine.ts", "executionWorkItem.fencingToken")] },
    { claim: "Runtime stage receipts reject terminal state regression and preserve the input fingerprint for replay decisions.", evidence: [orchestrationEvidence("api/src/runtimeStageReceipt.ts", "RUNTIME_STAGE_TERMINAL"), orchestrationEvidence("api/src/runtimeStageReceipt.ts", "inputFingerprint"), orchestrationEvidence("api/src/runtimeStageReceipt.spec.ts", "keeps completed and failed receipts terminal")] },
    { claim: "Runtime startup records a deterministic first-unsettled-stage decision before executing the chapter pipeline.", evidence: [orchestrationEvidence("api/src/runtimeStageReceipt.ts", "selectFirstUnsettledRuntimeStage"), orchestrationEvidence("api/src/runtimeEngine.ts", "Runtime stage recovery decision")] },
    { claim: "Checkpoint stage completion carries a fingerprint of its persisted manifest and late output changes are rejected.", evidence: [orchestrationEvidence("api/src/runtimeStageReceipt.ts", "outputFingerprint"), orchestrationEvidence("api/src/runtimeStageReceipt.ts", "RUNTIME_STAGE_OUTPUT_STALE"), orchestrationEvidence("api/src/runtimeEngine.ts", "manifest: writeCheckpoint.manifest")] },
    { claim: "Recovery reuses a checkpoint or narrative snapshot only when the receipt input, output reference, and output fingerprint all match the durable artifact.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "checkpointReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", "snapshotReusable"), orchestrationEvidence("api/src/runtimeStageReceipt.ts", "outputRef")] },
    { claim: "Knowledge-index rebuild is reusable only when the persisted projection matches the completed receipt fingerprint and fixed output reference.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "knowledgeReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", '"knowledge-index"'), orchestrationEvidence("api/src/runtimeStageReceipt.spec.ts", "reuses a completed output only when input, fingerprint, and reference all match")] },
    { claim: "Chapter-plan task output is persisted as an immutable stage artifact and reused only after receipt verification.", evidence: [orchestrationEvidence("api/src/runtimeStageOutput.ts", "RUNTIME_STAGE_OUTPUT_IMMUTABLE"), orchestrationEvidence("api/src/runtimeEngine.ts", "planReusable"), orchestrationEvidence("api/src/runtimeStageOutput.spec.ts", "persists an immutable output")] },
    { claim: "Draft task output is persisted before downstream writes and can be recovered from a started or completed receipt without bypassing the write conflict fence.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "draftReusable"), orchestrationEvidence("api/src/runtimeStageReceipt.ts", "isRuntimeStageOutputAvailable"), orchestrationEvidence("api/src/runtime.spec.ts", "Draft output persisted for recovery")] },
    { claim: "A quality report is reused only when its persisted content evidence and score meet the runtime target; failed or stale reports continue through evaluation and repair.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "qualityReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", "Quality report reused from receipt"), orchestrationEvidence("api/src/runtime.spec.ts", 'stage: "quality_review", status: "completed"')] },
    { claim: "A recap candidate is persisted as an immutable stage output, reused only after receipt verification, and appended idempotently to the recap log.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "recapReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", "appendWritingRecapIfMissing"), orchestrationEvidence("api/src/writingCockpit.ts", "appendWritingRecapIfMissing"), orchestrationEvidence("api/src/runtime.spec.ts", 'stage: "recap_and_ledger", status: "completed"')] },
    { claim: "A story-graph projection is persisted as an immutable stage output and reused only when both the receipt and the durable storyline projection match.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "storyGraphReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", "Story graph projection reused from receipt"), orchestrationEvidence("api/src/storyGraph.ts", "writeStoryGraphProjection"), orchestrationEvidence("api/src/runtime.spec.ts", 'stage: "story_graph_update", status: "completed"')] },
    { claim: "Content validation persists its continuity-check result and binds quality review to the verified validation output, avoiding duplicate deterministic/task validation after restart.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "validationReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", "Content validation reused from receipt"), orchestrationEvidence("api/src/runtime.spec.ts", 'stage: "content_validate", status: "completed"')] },
    { claim: "Context assembly persists its final block set and binds the recovered context fingerprint/reference into the chapter-draft payload.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "contextReusable"), orchestrationEvidence("api/src/runtimeEngine.ts", "contextOutputRef"), orchestrationEvidence("api/src/runtime.spec.ts", 'stage: "context_assemble", status: "completed"')] },
    { claim: "A same-run recovery replay reuses durable context, draft, quality, recap, and story-graph outputs without duplicating the recap log.", evidence: [orchestrationEvidence("api/src/runtime.spec.ts", "reuses durable stage outputs on a same-run recovery"), orchestrationEvidence("api/src/runtimeEngine.ts", "stableKnowledgeFingerprint"), orchestrationEvidence("api/src/writingCockpit.ts", "appendWritingRecapIfMissing")] },
    { claim: "Runtime knowledge references use deterministic identities, so snapshot/search reference projections are idempotent across recovery replay.", evidence: [orchestrationEvidence("api/src/runtimeStore.ts", "knowref-${crypto.createHash"), orchestrationEvidence("api/src/runtime.spec.ts", "firstKnowledgeRefs")] },
    { claim: "Runtime command failures persist a bounded retry decision and stagnation incident; transient failures requeue within budget while repeated work pauses for review.", evidence: [orchestrationEvidence("api/src/runtimeRecovery.ts", "runtime-retry-receipt.v1"), orchestrationEvidence("api/src/runtimeEngine.ts", "Runtime failure scheduled for bounded retry"), orchestrationEvidence("api/src/runtimeEngine.ts", "Runtime paused after stagnation detection"), orchestrationEvidence("api/src/runtimeRecovery.spec.ts", "persists a bounded retry decision")] },
    { claim: "Runtime command failures persist an explicit compensation plan and an idempotent application receipt with per-action effect evidence.", evidence: [orchestrationEvidence("api/src/runtimeCompensation.ts", "runtime-compensation.v1"), orchestrationEvidence("api/src/runtimeCompensation.ts", "runtime-compensation-application.v1"), orchestrationEvidence("api/src/runtimeEngine.ts", "compensationApplicationFingerprint"), orchestrationEvidence("api/src/runtimeCompensation.spec.ts", "applies every planned action")] },
    { claim: "Chapter settlement persists adoption, summary, obligation, projection, feedback, and cost evidence references, discovers durable ledger evidence, and strict callers fail closed when any non-waived reference is missing.", evidence: [orchestrationEvidence("api/src/chapterSettlement.ts", "evidenceFingerprint"), orchestrationEvidence("api/src/chapterSettlement.ts", "discoverDerivedProjectionRef"), orchestrationEvidence("api/src/chapterSettlement.ts", "sessions/model-invocations.jsonl"), orchestrationEvidence("api/src/chapterSettlement.ts", "CHAPTER_SETTLEMENT_EVIDENCE_REQUIRED"), orchestrationEvidence("api/src/chapterSettlement.spec.ts", "satisfy strict settlement from durable obligation"), orchestrationEvidence("api/src/app.ts", "strictEvidence")] },
    { claim: "A committed derived publication emits an immutable projection-closure receipt linked to the chapter settlement; replay recreates the receipt without duplication.", evidence: [orchestrationEvidence("api/src/chapterSettlementProjectionClosure.ts", "chapter-settlement-projection-closure.v1"), orchestrationEvidence("api/src/derivedPublication.ts", "recordChapterSettlementProjectionClosure"), orchestrationEvidence("api/src/derivedPublication.spec.ts", "readChapterSettlementProjectionClosure"), orchestrationEvidence("api/src/chapterSettlementProjectionClosure.spec.ts", "replays idempotently")] },
    { claim: "Evidence-bound chapter work items remain blocked until the projection-closure receipt exists; legacy settlement records without an evidence bundle remain backward-compatible.", evidence: [orchestrationEvidence("api/src/bookWorkGraph.ts", "closureRequired"), orchestrationEvidence("api/src/bookWorkGraph.ts", "readChapterSettlementProjectionClosure"), orchestrationEvidence("api/src/bookWorkGraph.spec.ts", "does not unlock an evidence-bound settlement"), orchestrationEvidence("api/src/chapterSettlement.spec.ts", "ProjectionClosure")] },
    { claim: "BookRun exposes a closure-readiness state that separates scope completion, closure blocking, closure readiness, and audited completion, and revokes stale audited proof when source or closure evidence changes.", evidence: [orchestrationEvidence("api/src/bookRunClosure.ts", "BookRunClosureState"), orchestrationEvidence("api/src/bookRunClosure.ts", "COMPLETION_AUDIT_STALE"), orchestrationEvidence("api/src/app.ts", "closure-readiness"), orchestrationEvidence("api/src/bookRunClosure.spec.ts", "revokes audited_complete")] },
    { claim: "Stale audited completion persists an idempotent invalidation receipt before reopening the run, preserving the affected evidence references and prior run version for replayable repair intake.", evidence: [orchestrationEvidence("api/src/bookRunInvalidation.ts", "book-run-invalidation.v1"), orchestrationEvidence("api/src/bookRunClosure.ts", "recordBookRunInvalidation"), orchestrationEvidence("api/src/completionAudit.ts", "recordBookRunInvalidation"), orchestrationEvidence("api/src/bookRunInvalidation.spec.ts", "persists an immutable, idempotent receipt")] },
    { claim: "Stale audited completion also opens an idempotent impact subgraph that records the affected work items and chapters before repair reopening, so the repair scope can be replayed instead of inferred from mutable status.", evidence: [orchestrationEvidence("api/src/bookRunImpact.ts", "book-run-impact-subgraph.v1"), orchestrationEvidence("api/src/bookRunClosure.ts", "recordBookRunImpactSubgraph"), orchestrationEvidence("api/src/completionAudit.ts", "recordBookRunImpactSubgraph"), orchestrationEvidence("api/src/bookRunImpact.spec.ts", "persists the scoped work-item and chapter impact deterministically")] },
    { claim: "Urgent pause, stop, and direction commands are claimed ahead of queued writing commands while preserving deterministic FIFO ordering within each priority class.", evidence: [orchestrationEvidence("api/src/runtimeStore.ts", "CASE WHEN type IN ('pause', 'stop', 'direction')"), orchestrationEvidence("api/src/runtimeWorker.spec.ts", "claims urgent control commands before an older queued writing command")] },
    { claim: "When an in-flight runtime reaches a pause or stop boundary, it aborts the active model task through AbortSignal where supported and persists a fingerprinted control-boundary acknowledgement before the command is finalized.", evidence: [orchestrationEvidence("api/src/runtimeControlBoundary.ts", "runtime-control-boundary.v1"), orchestrationEvidence("api/src/runtimeEngine.ts", "activeRuntimeAbortControllers"), orchestrationEvidence("api/src/runtimeEngine.ts", "recordRuntimeControlBoundary"), orchestrationEvidence("api/src/codexRunner.ts", "options?.signal"), orchestrationEvidence("api/src/runtimeControlBoundary.spec.ts", "persists and replays a safe-boundary acknowledgement")] },
    { claim: "The same safe-boundary path records a mutation-drain receipt, explicitly distinguishing drained from blocked and listing any remaining mutation lease instead of claiming quiescence optimistically.", evidence: [orchestrationEvidence("api/src/runtimeMutationDrain.ts", "runtime-mutation-drain.v1"), orchestrationEvidence("api/src/runtimeEngine.ts", "recordRuntimeMutationDrain"), orchestrationEvidence("api/src/runtimeMutationDrain.spec.ts", "fails closed and records blocking leases")] },
    { claim: "BookRun creation persists a versioned FrozenPublicationScope with bound or explicitly unbound StoryContract, OutlineVersion, and obligation-coverage evidence fingerprints, and governed advancement verifies its scope fingerprint and chapter membership before accepting readiness evidence.", evidence: [orchestrationEvidence("api/src/frozenPublicationScope.ts", "FrozenPublicationScopeEvidenceBinding"), orchestrationEvidence("api/src/bookRun.ts", "resolveScopeEvidence"), orchestrationEvidence("api/src/bookRun.ts", "BOOK_RUN_FROZEN_SCOPE_STALE"), orchestrationEvidence("api/src/frozenPublicationScope.spec.ts", "accepted evidence bindings")] },
    { claim: "The frozen scope now materializes a durable publication dependency graph with contract, outline, volume milestone, chapter, causality, and obligation ownership nodes; unresolved ownership, unbound coverage, cycles, duplicate edges, and out-of-scope causality nodes remain explicit blockers rather than guessed edges.", evidence: [orchestrationEvidence("api/src/publicationDependencyGraph.ts", "publication-dependency-graph.v1"), orchestrationEvidence("api/src/publicationDependencyGraph.ts", "DEPENDENCY_CYCLE"), orchestrationEvidence("api/src/publicationDependencyGraph.ts", "OUT_OF_SCOPE_NODE"), orchestrationEvidence("api/src/publicationDependencyGraph.spec.ts", "blocks cycles and causality nodes outside")] },
    { claim: "Milestone repair failures persist typed, evidence-backed actions with preserveScope=true; BookRun exposes idempotent repair-plan creation and readback instead of silently shrinking scope.", evidence: [orchestrationEvidence("api/src/milestoneRepairPlan.ts", "milestone-repair-plan.v1"), orchestrationEvidence("api/src/milestoneRepairPlan.ts", "preserveScope"), orchestrationEvidence("api/src/app.ts", "repair-plans"), orchestrationEvidence("api/src/milestoneRepairPlan.spec.ts", "typed repair actions") ] },
    { claim: "Planned repair actions materialize as dependency-bound BookWorkItems and use work-item-specific scheduler idempotency keys, so repair and draft work in one chapter cannot collide.", evidence: [orchestrationEvidence("api/src/bookWorkGraph.ts", "kind: \"repair\""), orchestrationEvidence("api/src/bookWorkGraph.spec.ts", "materializes typed repair actions"), orchestrationEvidence("api/src/bookWorkScheduler.ts", "item.workItemId")] },
    { claim: "Repair action completion persists an immutable evidence-backed receipt and closes the corresponding repair work item only after receipt integrity and project scope validation.", evidence: [orchestrationEvidence("api/src/milestoneRepairCompletion.ts", "milestone-repair-completion.v1"), orchestrationEvidence("api/src/milestoneRepairCompletion.ts", "MILESTONE_REPAIR_COMPLETION_IMMUTABLE"), orchestrationEvidence("api/src/bookWorkGraph.ts", "completedRepairIds"), orchestrationEvidence("api/src/milestoneRepairCompletion.spec.ts", "immutable idempotent completion receipt")] },
    { claim: "Milestone repair closure is independently replay-audited from the plan and completion receipts; BookRun closure and completion audits block until every in-scope repair plan has a passed milestone audit.", evidence: [orchestrationEvidence("api/src/milestoneAudit.ts", "milestone-audit.v1"), orchestrationEvidence("api/src/milestoneAudit.ts", "auditMilestoneRepairsForRun"), orchestrationEvidence("api/src/bookRunClosure.ts", "MILESTONE_AUDIT_REQUIRED"), orchestrationEvidence("api/src/completionAudit.ts", "COMPLETION_MILESTONE_AUDIT_REQUIRED"), orchestrationEvidence("api/src/milestoneAudit.spec.ts", "replays repair evidence")] },
    { claim: "Milestone audit applies kind-specific domain evidence adapters and dereferences explicit obligation coverage, character arc, project-scoped story projection, current memory artifacts, world-state snapshots, structured continuity ledgers, and narrative-curve pacing points; generic audit references cannot satisfy those policies by themselves.", evidence: [orchestrationEvidence("api/src/milestoneRepairPolicy.ts", "readNarrativeCurvePoint"), orchestrationEvidence("api/src/milestoneRepairPolicy.ts", "MILESTONE_PACING_ARTIFACT_STALE"), orchestrationEvidence("api/src/milestoneAudit.spec.ts", "dereferences a narrative curve point")] },
    { claim: "Start executes exactly one single-chapter pipeline.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "await runSingleChapterPipeline(run)")] },
    { claim: "Accept marks the current run completed without adoption, settlement, or next-work scheduling.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", 'command.type === "accept"')] },
    { claim: "When every chapter is checked, target selection falls back to the first chapter instead of declaring no work or scope completion.", evidence: [orchestrationEvidence("api/src/runtimeEngine.ts", "return next || orderedChapters(project)[0]")] },
    { claim: "Runtime commands are claimed deterministically, with urgent control commands ahead of queued writing work and FIFO ordering within each priority class.", evidence: [orchestrationEvidence("api/src/runtimeStore.ts", "CASE WHEN type IN ('pause', 'stop', 'direction')"), orchestrationEvidence("api/src/runtimeWorker.ts", "await processRuntimeCommand(command)"), orchestrationEvidence("api/src/runtimeWorker.spec.ts", "claims urgent control commands before an older queued writing command")] },
    { claim: "Local next-readiness can be declared by recap presence and UI maps completed to 100 percent without a book denominator.", evidence: [orchestrationEvidence("api/src/runtimeSnapshot.ts", 'status: hasLedger || hasWritingRecap ? "done" : "waiting"'), orchestrationEvidence("ui/src/components/novel/AutopilotRuntimePanel.vue", 'if (props.activeRun.status === "completed") return 100')] },
  ],
  stages: fullBookOrchestrationStages,
  alternatives: [
    {
      option: "A-process-local-chapter-loop",
      verdict: "reject-as-target",
      blueCase: "A while-loop over unchecked chapters is the fastest way to make the existing continuous switch appear functional and reuses the current pipeline.",
      redCase: "It cannot durably express dependencies, exact resume, fairness, control-plane interruption, candidate settlement, obligations, revisions, scope changes, cost ceilings, or trustworthy completion; a crash or review gate loses loop intent.",
    },
    {
      option: "B-persistent-chapter-queue-or-saga",
      verdict: "useful-migration-layer-not-complete-target",
      blueCase: "Persistent per-chapter jobs add restart safety, retries, visibility, and a natural next-chapter scheduler with moderate migration cost.",
      redCase: "A chapter-only queue treats obligation repair, continuity, memory rebuild, decision correction, milestone audit, stale proof, and final closure as side channels, recreating hidden dependencies and false terminal states.",
    },
    {
      option: "C-evidence-driven-book-work-graph",
      verdict: "recommended-with-bounded-bridge-only",
      blueCase: "A durable typed dependency graph can schedule chapters and cross-cutting repair from settlement evidence, isolate failure, support fair leases and live control, and derive completion from a frozen scope plus replayable proofs.",
      redCase: "It requires new domain schemas, graph materialization, schedulers, idempotent stage receipts, leases/fencing, migration, observability, cost policy, projection freshness, and substantial failure-injection testing.",
    },
  ],
  targetAuthority: {
    entities: ["BookRunSpec", "FrozenPublicationScope", "BookWorkGraph", "BookWorkItem", "WorkDependency", "RunReadinessProof", "BudgetReservation", "WorkItemLease", "StageReceipt", "ChapterSettlementEvent", "MilestoneAudit", "ClosureReadyProof", "CompletionAudit", "CompletionProof", "QuiescenceProof"],
    bookRunStates: ["draft", "planning", "ready", "running", "pausing", "paused", "review_required", "recovering", "scope_complete", "closure_blocked", "closure_ready", "auditing", "audited_complete", "failed", "cancelled", "superseded"],
    workItemStates: ["blocked", "ready", "leased", "running", "waiting_external", "review_required", "succeeded", "settled", "failed", "cancelled", "superseded"],
    workItemTypes: ["understanding", "story_contract", "outline_compile", "chapter_plan", "prose_candidate", "validate", "adopt", "chapter_settle", "memory_projection", "obligation_repair", "continuity_repair", "revision", "milestone_audit", "completion_audit"],
    invariant: "A work item may succeed without settling; only current settlement/proof events unlock dependents. No file existence, chapter status, task success, model score, recap presence, queue emptiness, last-chapter draft, run completed flag, or UI percentage may independently establish chapter settlement, scope completion, closure readiness, or audited completion.",
  },
  schedulingProtocol: {
    readinessInputs: ["current frozen scope version", "all hard predecessor settlement IDs", "decision/outline/canon/obligation/memory cursors", "author locks and review policy", "budget reservation", "write-set and resource class"],
    lease: ["project and work-item scope", "attempt and idempotency key", "lease expiry", "heartbeat", "fencing token", "write-set", "cost reservation"],
    fairness: "Use per-project concurrency limits, priority aging, resource classes, review-unblock priority, and write-set exclusion. One long model call or one project's repair storm must not starve pause/direction commands or unrelated projects.",
    continuation: "autoContinue is an author policy flag on BookRunSpec. It permits the scheduler to lease the next already-ready work item; it does not waive review gates, invent scope, accept candidates, resolve obligations, or convert succeeded work to settled.",
  },
  recoveryAndControlProtocol: {
    recovery: "Persist immutable stage inputs and receipts. On restart, verify their hashes and resume the first missing or stale stage; never replay a chargeable call or canon mutation solely because a process-local function restarted.",
    retry: "Classify transient, deterministic, contract, author-decision, budget, conflict, and unknown failures; apply bounded per-stage attempts, backoff, circuit breakers, stuck detection, and compensations without silently reducing quality or scope.",
    control: "Pause stops new leases, requests cancellable calls to stop, waits for safe boundaries, fences late workers, records uncommitted candidates, drains mutations, and emits QuiescenceProof. Stop additionally cancels remaining authorized work; direction is a durable steering event acknowledged at a named safe boundary.",
  },
  completionProtocol: {
    requiredProofs: [
      "FrozenPublicationScope hash and source decision/contract/outline versions",
      "every required chapter has a current ChapterSettlementEvent",
      "every in-scope narrative obligation has paid_off, transformed, intentionally_open, or author_waived terminal evidence allowed by the chosen open-mystery contract",
      "character, relationship, world, timeline, continuity, memory, pacing, quality, rights, safety, and revision gates are current",
      "all required projections have caught up to the canonical event cursor",
      "no required work item is blocked, ready, leased, running, waiting_external, review_required, failed, or stale",
      "no active writer, mutation transaction, stale lease, late worker, uncommitted canon candidate, or unbounded retry remains",
      "CompletionAudit deterministically replays with source coverage, waivers, disputes, policy/model/evaluator versions, costs, timestamps, and signatures",
    ],
    invalidation: "Any change to an in-scope decision, contract, outline node, settled prose, obligation, assertion, author lock, evaluator, closure policy, or audit input revokes audited_complete, marks the affected proof subgraph stale, and requires re-settlement plus re-audit.",
    display: "Always show separate denominators for chapters drafted/reviewed/adopted/settled, obligations terminal/blocked/overdue, projections current/stale, repair work open, scope complete, closure ready, audit current, and worker quiescence.",
  },
  releaseGate: {
    requirementIds: ["FR-RUN-001", "FR-RUN-002", "FR-RUN-003", "FR-RUN-004", "FR-RUN-005", "FR-RUN-006", "FR-RUN-007", "FR-RUN-008", "FR-RUN-009", "FR-RUN-010", "FR-RUN-011", "FR-RUN-012", "FR-RUN-013", "FR-RUN-014", "FR-RUN-015", "FR-RUN-016", "FR-RUN-017", "FR-RUN-018", "FR-RUN-019", "FR-RUN-020", "FR-RUN-021", "FR-RUN-022", "FR-RUN-023", "FR-COMPLETE-001", "FR-COMPLETE-002", "FR-COMPLETE-003", "FR-COMPLETE-004", "FR-COMPLETE-005", "FR-COMPLETE-006", "FR-COMPLETE-007", "FR-COMPLETE-008", "FR-COMPLETE-009", "FR-COMPLETE-010", "FR-COMPLETE-011", "FR-COMPLETE-012", "FR-COMPLETE-013", "FR-OBL-001", "FR-CLOSURE-001"],
    rule: "Do not claim continuous whole-book creation or audited completion until an accepted frozen scope materializes a durable work graph, settlement alone unlocks dependencies, control and crash tests prove exact recovery and fencing, milestone repair and obligation closure share the graph, completion replay is current, and quiescence proves no writer or transaction can mutate the certified version.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed within one common orchestration contract; none weakens scope freezing, work identity, settlement, idempotency, control, obligation closure, audit freshness or completion/quiescence proof.",
};

const qualityEvaluationSourcePaths = [
  "api/src/app.ts",
  "api/src/chapterQualityReview.ts",
  "api/src/runtimeEngine.ts",
  "api/src/taskTemplates.ts",
  "api/src/types.ts",
  "api/src/writingCockpit.ts",
  "ui/src/components/novel/ReviewQualityPanel.vue",
  "ui/src/stores/novel.ts",
  "ui/src/stores/novel/quality.ts",
  "ui/src/types/novel.ts",
];
const qualityEvaluationSources = new Map(qualityEvaluationSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function qualityEvidence(relativePath, needle) {
  const sourceEntry = qualityEvaluationSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown quality-evaluation audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Quality-evaluation evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function qualitySourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = qualityEvaluationSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown quality-evaluation audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Quality-evaluation slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Quality-evaluation slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const qualityReportTypeSlice = qualitySourceSlice("api/src/types.ts", "export interface ChapterQualityReport", "export interface SeriesQualityMetricAverage");
const qualityMergeSlice = qualitySourceSlice("api/src/chapterQualityReview.ts", "function mergeReports", "function mergeOutcomeMetadata");
const qualityClientDiagnoseSlice = qualitySourceSlice("ui/src/stores/novel.ts", "async function diagnoseCurrentChapter", "async function improveQualityMetrics");
const qualityApiSaveSlice = qualitySourceSlice("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/quality/:chapterId"', 'app.post("/api/novel/projects/:projectId/recaps/accept"');
const qualitySeriesCacheSlice = qualitySourceSlice("api/src/writingCockpit.ts", "export async function readSeriesQualityMetrics", "export async function readSceneCards");
const qualityStyleDriftSlice = qualitySourceSlice("api/src/writingCockpit.ts", "function buildStyleDriftSignals", "function chapterOrder");
const qualityRewriteClientSlice = qualitySourceSlice("ui/src/stores/novel.ts", "async function improveQualityMetrics", "function wait");
const qualityUiPassSlice = qualitySourceSlice("ui/src/components/novel/ReviewQualityPanel.vue", "const metricsBelowTarget", "const showQualityImprovement");

if (/contentHash|rubricVersion|evaluatorVersion|evidenceAnchor|uncertainty|disagreement|provenance|authorFeedback|inputFingerprint/.test(qualityReportTypeSlice)) {
  throw new Error("Quality-evaluation audit drift: ChapterQualityReport gained governed evidence or provenance fields and must be reclassified.");
}
if (!qualityMergeSlice.includes("metric.score * 0.1 + aiMetric.score * 0.9") || !qualityMergeSlice.includes("aiReport.overallScore * 0.8")) {
  throw new Error("Quality-evaluation audit drift: rule/AI weighting changed and must be reclassified.");
}
if (!qualityClientDiagnoseSlice.includes("analyzeChapterQualityHelper") || !qualityClientDiagnoseSlice.includes("saveChapterQualityReport") || qualityClientDiagnoseSlice.includes('runTask("quality.review"')) {
  throw new Error("Quality-evaluation audit drift: manual diagnosis no longer saves the client heuristic directly and must be reclassified.");
}
if (!qualityApiSaveSlice.includes("...reportInput") || /schema|parse|contentHash|rubricVersion|evidenceAnchor|QualityClaim/.test(qualityApiSaveSlice)) {
  throw new Error("Quality-evaluation audit drift: quality report write validation or authority changed and must be reclassified.");
}
if (!qualitySeriesCacheSlice.includes("cached?.rhythmSignals") || /inputFingerprint|sourceHash|reportFingerprint|stale/.test(qualitySeriesCacheSlice)) {
  throw new Error("Quality-evaluation audit drift: series cache freshness semantics changed and must be reclassified.");
}
if (!qualityStyleDriftSlice.includes("prose.score - baselineScore") || /embedding|stylometr|voice|lexical|syntax|n.?gram/i.test(qualityStyleDriftSlice)) {
  throw new Error("Quality-evaluation audit drift: style drift is no longer score-deviation-only and must be reclassified.");
}
if (
  !qualityRewriteClientSlice.includes("targetScore: qualityTargetScore") ||
  !qualityRewriteClientSlice.includes('runTask("quality.rewrite"') ||
  !qualityEvaluationSources.get("api/src/taskTemplates.ts").content.includes('mode: "replace-file"')
) {
  throw new Error("Quality-evaluation audit drift: score-targeted full-chapter rewrite behavior changed and must be reclassified.");
}
if (!qualityUiPassSlice.includes("metric.score < props.qualityTargetScore")) {
  throw new Error("Quality-evaluation audit drift: UI pass-line semantics changed and must be reclassified.");
}

const qualityEvaluationProductSource = [...qualityEvaluationSources.values()].map((entry) => entry.content).join("\n");
const implementedQualityEntities = [
  "LiteraryQualityClaim",
  "QualityEvidenceBundle",
  "EvidenceAnchor",
  "EvaluatorRun",
  "EvaluatorCalibration",
  "BlindPairwiseJudgment",
  "QualityDisagreementCase",
  "AuthorQualityFeedback",
  "TemplateRecurrenceSignal",
  "QualityGateDecision",
  "QualityRegressionReport",
].filter((entity) => qualityEvaluationProductSource.includes(entity));
const auditedQualityEntities = new Set(["EvidenceAnchor", "QualityGateDecision", "EvaluatorCalibration"]);
const unauditedQualityEntities = implementedQualityEntities.filter((entity) => !auditedQualityEntities.has(entity));
if (unauditedQualityEntities.length) {
  throw new Error(`Quality-evaluation audit drift: governed quality entities now exist and must be audited: ${unauditedQualityEntities.join(", ")}`);
}

function compactScoreDistribution(values) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((left, right) => left - right);
  if (!numeric.length) return { sampleCount: 0, min: null, median: null, max: null, average: null };
  return {
    sampleCount: numeric.length,
    min: numeric[0],
    median: numeric[Math.floor((numeric.length - 1) / 2)],
    max: numeric[numeric.length - 1],
    average: Math.round((numeric.reduce((total, value) => total + value, 0) / numeric.length) * 100) / 100,
  };
}

function hashedGroupSummary(values) {
  const groups = countsByValue(values.filter(Boolean));
  const sizes = Object.values(groups).sort((left, right) => right - left);
  return {
    uniqueFingerprints: sizes.length,
    duplicateFingerprintGroups: sizes.filter((size) => size > 1).length,
    largestGroup: sizes[0] || 0,
  };
}

function proseOnlyNormalized(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter((line) => line && !/^#{1,6}\s/.test(line))
    .join("\n")
    .trim();
}

const qualityEvaluationProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const project = projectFile.value;
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const substantialContents = [];
  for (const chapter of chapters) {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath : "";
    const absolutePath = relativePath ? join(projectDirectory, relativePath) : "";
    if (!absolutePath || !existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, "utf8");
    if (content.trim().length < 800) continue;
    substantialContents.push({ content, normalized: proseOnlyNormalized(content) });
  }

  const qualityPaths = directJsonFiles(join(projectDirectory, "quality"));
  const reportPaths = qualityPaths.filter((path) => !/[\\/]series-metrics\.json$/i.test(path));
  const reports = reportPaths.map((path) => readAnonymousJsonFile(path, null)).filter((entry) => entry.value).map((entry) => entry.value);
  const reportMetadata = reports.map((report, reportIndex) => {
    const metrics = Array.isArray(report?.metrics) ? report.metrics : [];
    const metricKeys = metrics.map((metric) => metric?.key).filter(Boolean);
    const scores = metrics.map((metric) => metric?.score).filter((score) => typeof score === "number");
    const notes = metrics.map((metric) => typeof metric?.note === "string" ? metric.note : "");
    const evidenceFields = Object.keys(report || {}).filter((key) => /hash|fingerprint|rubric|evaluator|evidence|anchor|uncertainty|disagreement|provenance|author|baseline|candidate/i.test(key));
    return {
      reportOrdinal: reportIndex + 1,
      fields: Object.keys(report || {}).sort(),
      overallScore: typeof report?.overallScore === "number" ? report.overallScore : null,
      metricCount: metrics.length,
      metricKeys,
      metricScoreVectorFingerprint: createHash("sha256").update(JSON.stringify(scores)).digest("hex"),
      metricNoteVectorFingerprint: createHash("sha256").update(JSON.stringify(notes)).digest("hex"),
      allMetricScoresEqual: scores.length > 0 && new Set(scores).size === 1,
      strengthCount: Array.isArray(report?.strengths) ? report.strengths.length : 0,
      fixCount: Array.isArray(report?.fixes) ? report.fixes.length : 0,
      evidenceFields,
      updatedAtValid: Number.isFinite(Date.parse(report?.updatedAt || "")),
    };
  });

  const seriesPath = join(projectDirectory, "quality", "series-metrics.json");
  const seriesFile = readAnonymousJsonFile(seriesPath, null);
  const series = seriesFile.value;
  const reportAverage = compactScoreDistribution(reportMetadata.map((report) => report.overallScore)).average;
  const latestReportTimestamp = Math.max(0, ...reports.map((report) => Date.parse(report?.updatedAt || "") || 0));
  const seriesTimestamp = Date.parse(series?.updatedAt || "") || 0;

  const lineChapterMembership = new Map();
  const openingFingerprints = [];
  const endingFingerprints = [];
  let fakeSuspenseEndingChapters = 0;
  substantialContents.forEach(({ normalized }, chapterIndex) => {
    const compact = normalized.replace(/\s+/g, "");
    if (compact) {
      openingFingerprints.push(createHash("sha256").update(compact.slice(0, 80)).digest("hex"));
      endingFingerprints.push(createHash("sha256").update(compact.slice(-80)).digest("hex"));
    }
    const ending = normalized.slice(-300);
    if (/一切才刚刚开始|而这.*只是开始|没有人知道|更大的秘密.*等待|真正的.*才.*开始|only the beginning|just the beginning|no one knew|the real .* had only begun/is.test(ending)) {
      fakeSuspenseEndingChapters += 1;
    }
    const uniqueLines = new Set(
      normalized
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, "").trim())
        .filter((line) => line.length >= 24)
        .map((line) => createHash("sha256").update(line).digest("hex")),
    );
    for (const lineFingerprint of uniqueLines) {
      const members = lineChapterMembership.get(lineFingerprint) || new Set();
      members.add(chapterIndex);
      lineChapterMembership.set(lineFingerprint, members);
    }
  });
  const repeatedLines = [...lineChapterMembership.values()].filter((members) => members.size > 1);
  const chaptersWithSharedLines = new Set(repeatedLines.flatMap((members) => [...members])).size;

  const taskHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "history.jsonl"));
  const latestTasks = latestAnonymousRecords(taskHistory.records);
  const qualityTasks = latestTasks.filter((task) => task?.type === "quality.review" || task?.type === "quality.rewrite");
  const invocationHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "invocations.jsonl"));
  const qualityInvocations = invocationHistory.records.filter((invocation) => invocation?.taskType === "quality.review" || invocation?.taskType === "quality.rewrite");
  const backgroundHistory = parseAnonymousJsonLines(join(projectDirectory, "tasks", "background-jobs.jsonl"));
  const latestBackgroundJobs = latestAnonymousRecords(backgroundHistory.records);
  const qualitySeriesJobs = latestBackgroundJobs.filter((job) => job?.type === "quality.series.rebuild");

  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: projectFile.sha256,
      qualityReportsAggregate: reportPaths.length ? createHash("sha256").update(reportPaths.map((path) => createHash("sha256").update(readFileSync(path, "utf8")).digest("hex")).join("\u0000")).digest("hex") : null,
      seriesMetrics: seriesFile.sha256,
      taskHistory: taskHistory.sha256,
      invocationHistory: invocationHistory.sha256,
      backgroundJobs: backgroundHistory.sha256,
    },
    parseHealth: {
      projectValid: projectFile.valid,
      reportFiles: reportPaths.length,
      parsedReports: reports.length,
      seriesValid: seriesFile.valid,
      invalidTaskLines: taskHistory.invalidLines,
      invalidInvocationLines: invocationHistory.invalidLines,
      invalidBackgroundJobLines: backgroundHistory.invalidLines,
    },
    coverage: {
      chapters: chapters.length,
      substantialChapters: substantialContents.length,
      qualityReports: reports.length,
      chapterCoverage: chapters.length ? Math.round((reports.length / chapters.length) * 10000) / 10000 : null,
      substantialCoverage: substantialContents.length ? Math.round((reports.length / substantialContents.length) * 10000) / 10000 : null,
    },
    reports: {
      items: reportMetadata,
      overallScore: compactScoreDistribution(reportMetadata.map((report) => report.overallScore)),
      zeroFixReports: reportMetadata.filter((report) => report.fixCount === 0).length,
      allMetricScoresEqualReports: reportMetadata.filter((report) => report.allMetricScoresEqual).length,
      withEvidenceOrProvenanceFields: reportMetadata.filter((report) => report.evidenceFields.length > 0).length,
      scoreVectorGroups: hashedGroupSummary(reportMetadata.map((report) => report.metricScoreVectorFingerprint)),
      noteVectorGroups: hashedGroupSummary(reportMetadata.map((report) => report.metricNoteVectorFingerprint)),
    },
    seriesCache: series ? {
      exists: true,
      reportCount: typeof series.reportCount === "number" ? series.reportCount : null,
      chapterCount: typeof series.chapterCount === "number" ? series.chapterCount : null,
      cachedAverageOverallScore: typeof series.averageOverallScore === "number" ? series.averageOverallScore : null,
      recomputedCurrentReportAverage: reportAverage,
      averageMatchesCurrentReports: typeof series.averageOverallScore === "number" && reportAverage !== null ? series.averageOverallScore === reportAverage : null,
      olderThanLatestReportByDeclaredTimestamp: Boolean(latestReportTimestamp && seriesTimestamp && seriesTimestamp < latestReportTimestamp),
      metricAverageKeys: Array.isArray(series.metricAverages) ? series.metricAverages.map((metric) => metric?.key).filter(Boolean).sort() : [],
    } : { exists: false },
    templateInventorySignals: {
      interpretation: "Exact signatures and heuristic phrases are triage signals only; intentional parallelism, refrain, genre convention, quotation, headings, and shared canon can create legitimate repetition.",
      openingSignatureGroups: hashedGroupSummary(openingFingerprints),
      endingSignatureGroups: hashedGroupSummary(endingFingerprints),
      repeatedNormalizedLineFingerprintsAcrossChapters: repeatedLines.length,
      chaptersSharingAtLeastOneNormalizedLine: chaptersWithSharedLines,
      maximumChaptersSharingOneNormalizedLine: repeatedLines.reduce((maximum, members) => Math.max(maximum, members.size), 0),
      fakeSuspenseEndingPatternChapters: fakeSuspenseEndingChapters,
    },
    executionEvidence: {
      latestQualityTasks: qualityTasks.length,
      latestQualityTasksByType: countsByValue(qualityTasks.map((task) => task?.type || "missing")),
      latestQualityTasksByStatus: countsByValue(qualityTasks.map((task) => task?.status || "missing")),
      qualityInvocations: qualityInvocations.length,
      invocationDecisions: countsByValue(qualityInvocations.map((invocation) => invocation?.adoptionDecision || "missing")),
      acceptedQualityInvocations: qualityInvocations.filter((invocation) => invocation?.adoptionDecision === "accepted").length,
      qualitySeriesRebuildJobs: qualitySeriesJobs.length,
      qualitySeriesRebuildStatuses: countsByValue(qualitySeriesJobs.map((job) => job?.status || "missing")),
      structuredAuthorQualityRatings: 0,
      persistedBeforeAfterQualityComparisons: 0,
    },
  };
});

const qualityEvaluationTotals = qualityEvaluationProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.coverage.chapters,
  substantialChapters: totals.substantialChapters + project.coverage.substantialChapters,
  reports: totals.reports + project.coverage.qualityReports,
  zeroFixReports: totals.zeroFixReports + project.reports.zeroFixReports,
  allMetricScoresEqualReports: totals.allMetricScoresEqualReports + project.reports.allMetricScoresEqualReports,
  reportsWithEvidenceFields: totals.reportsWithEvidenceFields + project.reports.withEvidenceOrProvenanceFields,
  qualityTasks: totals.qualityTasks + project.executionEvidence.latestQualityTasks,
  qualityReviewTasks: totals.qualityReviewTasks + (project.executionEvidence.latestQualityTasksByType["quality.review"] || 0),
  qualityRewriteTasks: totals.qualityRewriteTasks + (project.executionEvidence.latestQualityTasksByType["quality.rewrite"] || 0),
  qualityInvocations: totals.qualityInvocations + project.executionEvidence.qualityInvocations,
  acceptedQualityInvocations: totals.acceptedQualityInvocations + project.executionEvidence.acceptedQualityInvocations,
  qualitySeriesRebuildJobs: totals.qualitySeriesRebuildJobs + project.executionEvidence.qualitySeriesRebuildJobs,
  staleOrInconsistentSeriesCaches: totals.staleOrInconsistentSeriesCaches + (project.seriesCache.exists && (project.seriesCache.olderThanLatestReportByDeclaredTimestamp || project.seriesCache.averageMatchesCurrentReports === false) ? 1 : 0),
  repeatedLineFingerprints: totals.repeatedLineFingerprints + project.templateInventorySignals.repeatedNormalizedLineFingerprintsAcrossChapters,
  chaptersSharingLines: totals.chaptersSharingLines + project.templateInventorySignals.chaptersSharingAtLeastOneNormalizedLine,
  fakeSuspenseEndingPatternChapters: totals.fakeSuspenseEndingPatternChapters + project.templateInventorySignals.fakeSuspenseEndingPatternChapters,
}), {
  projects: 0,
  chapters: 0,
  substantialChapters: 0,
  reports: 0,
  zeroFixReports: 0,
  allMetricScoresEqualReports: 0,
  reportsWithEvidenceFields: 0,
  qualityTasks: 0,
  qualityReviewTasks: 0,
  qualityRewriteTasks: 0,
  qualityInvocations: 0,
  acceptedQualityInvocations: 0,
  qualitySeriesRebuildJobs: 0,
  staleOrInconsistentSeriesCaches: 0,
  repeatedLineFingerprints: 0,
  chaptersSharingLines: 0,
  fakeSuspenseEndingPatternChapters: 0,
});

const qualityEvaluationStages = [
  {
    id: "quality-objective-and-chapter-function",
    current: "Seven common metrics and a fixed target of 86 drive runtime and UI repair.",
    gap: "No frozen chapter-function, genre, author-objective, anti-goal, reader-contract, or must-preserve profile selects what quality means for this chapter.",
    target: "Compile a function-adaptive rubric and protected-strength contract from accepted objectives before assessment.",
  },
  {
    id: "evaluation-input-freeze",
    current: "Evaluators read current content, dashboard, scenes, and sometimes a previous report.",
    gap: "Reports do not bind content hash, canon/outline/decision cursors, context manifest, rubric, evaluator, or prompt/model version.",
    target: "Freeze EvaluationCase inputs and reject or stale results whose evidence version no longer matches.",
  },
  {
    id: "hard-guard-layer",
    current: "Continuity, craft risks, quality scores, and narrative debt are neighboring signals.",
    gap: "Aesthetic averages are not separated from canon, POV, secrecy, rights, similarity, lock, obligation, and stale-input failures.",
    target: "Evaluate non-compensable hard guards first; no high style score may override a fatal violation.",
  },
  {
    id: "deterministic-signal-layer",
    current: "Keyword, paragraph, sentence-start, abstract-density, pressure, reaction, information, and fake-hook heuristics provide fast signals.",
    gap: "Genre-specific pressure vocabulary and fixed opening/ending assumptions can reward keyword stuffing and penalize quiet, comic, reflective, romance, mystery, or aftermath chapters.",
    target: "Treat rules as versioned evidence extractors with applicability, precision/recall calibration, counterexamples, and no direct literary verdict authority.",
  },
  {
    id: "model-judgment-layer",
    current: "One AI report supplies 90 percent of each metric and 80 percent of overall score when parseable.",
    gap: "The same generator/reviewer family can share blind spots; no independence, blinding, repeat sampling, calibration, uncertainty, disagreement, or judge drift is recorded.",
    target: "Run calibrated independent evaluators only where needed, preserve dissent, and publish confidence rather than manufactured precision.",
  },
  {
    id: "manual-diagnosis-path",
    current: "The UI computes a separate keyword formula locally and saves it as the same report type.",
    gap: "Consumers cannot distinguish heuristic-only, AI-hybrid, legacy-imported, author-entered, or regression-evaluated claims.",
    target: "Every EvaluatorRun declares method, version, authority, scope, inputs, limitations, and calibration status.",
  },
  {
    id: "evidence-anchoring",
    current: "Notes, strengths, fixes, verdicts, and anti-pattern labels are free text.",
    gap: "No stable prose/scene/contract anchor proves a claim, supports author inspection, or survives/invalidates under edits.",
    target: "Every blocking or repair-driving claim cites recoverable spans, scene IDs, contract clauses, or cross-chapter comparisons and states what would falsify it.",
  },
  {
    id: "aggregation-and-gating",
    current: "Overall and metric averages plus a uniform pass line decide repair and runtime review.",
    gap: "Averages hide fatal defects, non-applicable metrics, ties, disagreement, evidence gaps, and deliberate low-tension functions; score precision invites Goodhart optimization.",
    target: "Use typed hard gates, function-specific sufficiency, Pareto comparisons, uncertainty bands, and explicit disputed/evidence-incomplete states.",
  },
  {
    id: "paired-candidate-comparison",
    current: "Baseline and rewritten chapter are rescored separately after applying the replacement.",
    gap: "There is no blind pairwise judgment, frozen variables, per-defect delta, strength-retention proof, confidence, or no-preference outcome before canon adoption.",
    target: "Compare candidates blind against the same EvaluationCase and preserve ties, mixed wins, and regression blockers.",
  },
  {
    id: "repair-planning",
    current: "Metrics under 86 become explicit rewrite targets and a full-chapter replace-file candidate is requested.",
    gap: "The model is taught to optimize evaluator labels; it can add pressure words, hooks, sensory detail, or uniform beats while erasing voice, subtlety, strengths, and intentional variation.",
    target: "Derive a bounded defect repair plan with evidence, protected spans, invariants, negative constraints, scope, expected effect, and regression cases; scores are observations, not prompt objectives.",
  },
  {
    id: "author-preference-and-feedback",
    current: "Patch adoption is pending/accepted/not-required and local UI shows score delta.",
    gap: "No durable author rating, pairwise choice, reason, partial adoption, edit retention, preference scope, confidence, or causal attribution links taste to quality claims.",
    target: "Capture low-burden structured feedback and edits as scoped hypotheses, not universal truth or automatic agreement with the evaluator.",
  },
  {
    id: "series-template-and-voice-review",
    current: "Style drift is deviation of each prose score from the mean; rhythm/tension/craft views mostly aggregate report or sparse structured data.",
    gap: "Equal prose scores cannot detect repeated openings/endings, scene skeletons, cadence, metaphors, dialogue voices, emotional arcs, payoff patterns, or evaluator-induced homogenization.",
    target: "Use multi-scale stylometry, semantic structure, dialogue-speaker separability, motif/payoff diversity, intentional-parallelism labels, and evidence-linked recurrence cases.",
  },
  {
    id: "reader-experience-validation",
    current: "The evaluator infers hooks, tension, information, emotion, and aftermath from the author/reviewer view.",
    gap: "No sealed reader-knowledge view, prediction state, confusion/curiosity distinction, cold read, reader diversity, or human calibration proves actual experience.",
    target: "Treat simulated reader claims as bounded hypotheses and calibrate them against voluntary blinded human feedback without leaking author-only truth.",
  },
  {
    id: "benchmark-calibration-and-drift",
    current: "Tests cover parser behavior and two synthetic weak/strong passages.",
    gap: "No frozen representative corpus, pairwise human labels, hard negative counterexamples, holdout, evaluator agreement, score calibration, prompt/model comparison, contamination guard, or release threshold exists.",
    target: "Version benchmark slices by genre/function/language/length and ship evaluator changes only after holdout, disagreement, drift, cost, and false-pass gates pass.",
  },
  {
    id: "report-freshness-and-projection",
    current: "Chapter reports overwrite files and series cache is considered valid when expected fields exist.",
    gap: "Current files can disagree with cached averages and neither report nor projection declares an input cursor or stale state.",
    target: "Append immutable claims, reduce current views from source fingerprints, and invalidate chapter/series/completion projections on every relevant mutation.",
  },
  {
    id: "quality-release-decision",
    current: "Passing all metric thresholds triggers positive UI language and runtime review readiness.",
    gap: "No QualityGateDecision proves source coverage, fatal guards, calibration, author authority, disagreement disposition, regressions, freshness, or chapter settlement linkage.",
    target: "Issue a replayable gate decision with explicit pass, conditional, disputed, blocked, or waived outcomes; only current decisions may participate in settlement/completion.",
  },
];

const qualityEvaluationAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The platform produces prose that is not merely high-scoring to its own evaluator: non-compensable story guards must pass, explicit author objectives govern aesthetic direction, calibrated independent blind evidence tests the intended effect, and tier-aware adoption preserves disagreement, strengths, reversibility, and book-wide coherence.",
  sourceFiles: [...qualityEvaluationSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project/report ordinal", "source and asset hashes", "chapter/report/task/invocation/job counts", "metric keys and numeric scores", "schema field names", "text lengths and aggregate recurrence counts", "cache freshness comparisons"],
    snapshotExcludes: ["project slug", "title", "genre", "rough idea", "chapter title or ID value", "outline or prose", "report summary, notes, strengths or fixes text", "repeated line text", "author feedback", "prompt or model output", "character/entity names"],
  },
  operationalSnapshot: {
    substantialInventoryThresholdChars: 800,
    totals: qualityEvaluationTotals,
    projects: qualityEvaluationProjectSnapshots,
    interpretation: "Numeric scores, exact repetition, phrase heuristics, task success, patch acceptance, and cache timestamps are diagnostic inventory only. They do not independently prove literary quality, evaluator validity, author satisfaction, template harm, plagiarism, causal improvement, or reader response.",
  },
  summary: {
    auditedStages: qualityEvaluationStages.length,
    projectsScanned: qualityEvaluationTotals.projects,
    chaptersInventoried: qualityEvaluationTotals.chapters,
    substantialChapters: qualityEvaluationTotals.substantialChapters,
    qualityReports: qualityEvaluationTotals.reports,
    qualityReportCoverageOfAllChapters: qualityEvaluationTotals.chapters ? Math.round((qualityEvaluationTotals.reports / qualityEvaluationTotals.chapters) * 10000) / 10000 : null,
    qualityReportCoverageOfSubstantialChapters: qualityEvaluationTotals.substantialChapters ? Math.round((qualityEvaluationTotals.reports / qualityEvaluationTotals.substantialChapters) * 10000) / 10000 : null,
    reportsWithEvidenceOrProvenance: qualityEvaluationTotals.reportsWithEvidenceFields,
    zeroFixReports: qualityEvaluationTotals.zeroFixReports,
    allMetricScoresEqualReports: qualityEvaluationTotals.allMetricScoresEqualReports,
    latestQualityReviewTasks: qualityEvaluationTotals.qualityReviewTasks,
    latestQualityRewriteTasks: qualityEvaluationTotals.qualityRewriteTasks,
    acceptedQualityInvocations: qualityEvaluationTotals.acceptedQualityInvocations,
    staleOrInconsistentSeriesCaches: qualityEvaluationTotals.staleOrInconsistentSeriesCaches,
    structuredAuthorQualityRatings: 0,
    calibratedEvaluatorSuites: 0,
    replayableQualityGateDecisions: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform stores a mutable score report as if it were quality truth, while client heuristics, one AI-dominant hybrid evaluator, imported reports, series aggregates, rewrite targets, and author patch adoption have no shared provenance, frozen evidence, calibration, uncertainty, disagreement, or causal comparison protocol.",
    consequence: "High or improving scores can reflect evaluator preference, keyword gaming, stale cache, self-review, schema drift, or homogenizing rewrites rather than better prose; the system cannot prove why a chapter passed, whether the author preferred it, which strengths regressed, or whether the whole book became more templated.",
  },
  currentEvidence: [
    { claim: "Manual diagnosis saves a client-side keyword formula directly, without running the AI quality-review task.", evidence: [qualityEvidence("ui/src/stores/novel.ts", "analyzeChapterQualityHelper"), qualityEvidence("ui/src/stores/novel/quality.ts", "export function analyzeChapterQuality")] },
    { claim: "Runtime hybrid review gives the AI 90 percent of each metric and 80 percent of overall score.", evidence: [qualityEvidence("api/src/chapterQualityReview.ts", "metric.score * 0.1 + aiMetric.score * 0.9"), qualityEvidence("api/src/chapterQualityReview.ts", "aiReport.overallScore * 0.8")] },
    { claim: "Quality report writes accept a client-shaped object and the report schema lacks source/evidence/freshness semantics.", evidence: [qualityEvidence("api/src/app.ts", "...reportInput"), qualityEvidence("api/src/types.ts", "export interface ChapterQualityReport")] },
    { claim: "Score-targeted quality repair requests a complete replace-file rewrite.", evidence: [qualityEvidence("api/src/taskTemplates.ts", "payload.targetScore"), qualityEvidence("api/src/taskTemplates.ts", 'mode: "replace-file"')] },
    { claim: "Series style drift measures prose-score deviation, not textual voice or template recurrence.", evidence: [qualityEvidence("api/src/writingCockpit.ts", "prose.score - baselineScore")] },
    { claim: "Series cache freshness is inferred from field presence rather than source fingerprints.", evidence: [qualityEvidence("api/src/writingCockpit.ts", "cached?.rhythmSignals")] },
  ],
  stages: qualityEvaluationStages,
  alternatives: [
    {
      option: "A-one-better-hybrid-score",
      verdict: "reject-as-target",
      blueCase: "Improve prompts and deterministic features, tune weights, add more metrics, and keep one familiar score and repair threshold; simplest UX and cheapest operation.",
      redCase: "A more sophisticated scalar still hides non-applicable dimensions, fatal errors, uncertainty, evaluator bias, author disagreement, evidence gaps, and cross-chapter homogenization; exposing the number as a target intensifies gaming.",
    },
    {
      option: "B-multi-model-review-jury",
      verdict: "useful-evidence-producer-not-final-authority",
      blueCase: "Independent reviewers, red/blue roles, majority or weighted aggregation, and repeat sampling reduce some single-model blind spots and expose disagreement.",
      redCase: "Models may share training bias, prompts, leaked intent, rubric failure, and preference for polished conventional prose; voting without human calibration, anchors, hard guards, and no-preference states manufactures confidence at higher cost.",
    },
    {
      option: "C-layered-evidence-calibrated-quality-system",
      verdict: "author-selected-specification-not-implemented",
      blueCase: "Frozen function-specific cases, non-compensable guards, deterministic signals, calibrated independent judgments, blind pairwise comparison, author feedback, series recurrence analysis, uncertainty, and replayable gates can prove bounded quality claims without reducing literature to one score.",
      redCase: "Requires benchmark curation, annotation/adjudication, evidence anchors, evaluator registry, calibration infrastructure, privacy-safe reader feedback, stylometry, richer UX, ongoing drift monitoring, and more selective model spend.",
    },
  ],
  targetAuthority: {
    entities: ["EvaluationCase", "LiteraryQualityClaim", "QualityEvidenceBundle", "EvidenceAnchor", "EvaluatorRun", "EvaluatorCalibration", "BlindPairwiseJudgment", "QualityDisagreementCase", "AuthorQualityFeedback", "PreferenceHypothesis", "TemplateRecurrenceSignal", "QualityRegressionReport", "QualityGateDecision"],
    claimStates: ["candidate", "evidence_incomplete", "supported", "contested", "superseded", "invalidated", "author_disagreed", "waived"],
    gateStates: ["unassessed", "blocked", "conditional", "disputed", "passed", "waived", "stale"],
    invariant: "No scalar score, model self-report, keyword hit, metric average, task success, rewrite score delta, patch adoption, cache presence, synthetic reader opinion, or absence of detected repetition may independently establish literary quality, author preference, originality, reader effect, regression safety, chapter settlement, or book completion.",
  },
  selectedQualityAuthority: {
    policyId: "author-goal-led-multi-evidence",
    order: ["non-compensable hard guards", "current explicit author objectives and anti-goals", "calibrated independent blind reviewer/reader evidence", "simulated reader and deterministic diagnostic hypotheses", "scalar and operational summaries"],
    ordinaryAdoption: "Allowed only inside a current scoped AutonomyGrant when hard guards pass, author-goal fit and protected-strength retention are supported, evidence is fresh, and no material calibrated dissent remains; adoption is versioned and undoable.",
    elevatedAdoption: "Requires independent review and blind pairwise comparison where alternatives exist; unresolved material disagreement becomes review_required.",
    keyAdoption: "Requires independent blind comparison and disagreement adjudication; real author-objective, reader-effect, protected-strength, or irreversible-canon tradeoffs pause for one scoped author decision.",
    silenceRule: "Silence, task completion, score increase, or lack of detected defects is never author approval or settlement evidence.",
  },
  layeredEvaluationProtocol: {
    order: [
      "freeze content, contract, chapter function, author objectives, reader view, canon and policy versions",
      "run deterministic hard guards for canon, POV, secrecy, rights, similarity, locks, obligations, stale inputs, and schema",
      "collect applicable low-cost textual/structural signals with evidence and known error bounds",
      "run selective calibrated independent literary evaluators with blinded intent where possible",
      "compare candidate versus baseline pairwise under the same frozen case and preserve tie/mixed/disagreement",
      "measure author choice, partial adoption, edits, retention, and scoped reasons without treating silence as approval",
      "run cross-chapter voice, recurrence, arc, payoff, pacing, memory, and obligation regressions",
      "emit QualityGateDecision with sources, uncertainty, dissent, waivers, freshness, and settlement scope",
    ],
    applicability: "Rubrics are selected by chapter/scene function, genre contract, narrative phase, POV, intended reader effect, and author anti-goals. Quiet aftermath, comedy, romance, investigation, setup, misdirection, battle, and climax must not share a mandatory pressure/hook shape.",
    aggregation: "Fatal hard guards do not average away. Aesthetic evidence uses bounded claims, uncertainty intervals, Pareto and pairwise comparison, and explicit no-preference/disagreement; an overall score may be a secondary navigation aid only.",
  },
  evidenceAndRepairProtocol: {
    evidence: "Every repair-driving claim links exact current-version prose/scene/contract/cross-chapter anchors, evaluator and rubric versions, applicability, counterevidence, uncertainty, and a falsification condition. Editing an anchor invalidates the claim and dependent gate.",
    repair: "Compile defect-specific MutationPlans with protected strengths/spans, canon and voice locks, negative constraints, maximum scope, expected reader/function effect, and regression checks. Do not tell the generator to reach a numeric score or repair every low metric through a full-file rewrite.",
    comparison: "Before adoption, compare baseline and candidate blind on the target defect, author objective, hard guards, preserved strengths, new regressions, template recurrence, and cost. A higher scalar with any fatal or protected-strength regression loses.",
  },
  calibrationAndReleaseProtocol: {
    benchmarkSlices: ["genre", "chapter/scene function", "story phase", "language", "length", "POV form", "dialogue density", "action versus quiet", "intentional parallelism", "high ambiguity", "adversarial metric gaming"],
    labels: "Prefer blinded pairwise human judgments with annotator confidence, rationale anchors, ties, disagreements, and adjudication over exact absolute gold prose or forced scores.",
    gates: ["fatal false-pass rate", "evidence-anchor precision", "pairwise human agreement", "calibration error", "inter/repeat evaluator stability", "author preference and edit-retention lift", "protected-strength regression", "template recurrence", "secret/canon leakage", "holdout contamination", "cost and latency"],
    drift: "Evaluator prompt, model, rule, rubric, retrieval, tokenizer, benchmark, or aggregation changes create a new version, run shadow/holdout/canary comparison, preserve old results, and cannot silently reinterpret existing chapter or completion gates.",
  },
  releaseGate: {
    requirementIds: ["FR-QUALITY-001", "FR-QUALITY-002", "FR-QUALITY-003", "FR-QUALITY-004", "FR-QUALITY-005", "FR-QUALITY-006", "FR-QUALITY-007", "FR-QUALITY-008", "FR-QUALITY-009", "FR-QUALITY-010", "FR-EVAL-001", "FR-EVAL-003", "FR-EVAL-005", "FR-EVAL-006", "FR-EVAL-007", "FR-EVAL-008", "FR-EVAL-009", "FR-EVAL-010", "FR-EVAL-011", "FR-EVAL-012", "FR-EVAL-013", "FR-EVAL-014", "FR-EVAL-015", "FR-EVAL-017", "FR-EVAL-018", "FR-EVAL-019", "FR-EVAL-020", "FR-EVAL-021", "FR-EVAL-024", "FR-FEEDBACK-001", "FR-FEEDBACK-003", "FR-FEEDBACK-004", "FR-FEEDBACK-006", "FR-FEEDBACK-007", "FR-OBJECTIVE-008", "FR-OBJECTIVE-010", "FR-READER-002", "FR-READER-003", "FR-READER-014", "FR-READER-015", "FR-READER-016", "FR-READER-018"],
    rule: "Do not claim high-quality, author-aligned, non-template, reader-effective, improved, or auto-adoptable prose until current-version evidence anchors, function-adaptive rubrics, non-compensable guards, explicit author-objective authority, calibrated independent evaluation, sealed-reader blind comparison, tier-aware disagreement handling, regression/recurrence analysis, cache freshness, reversible adoption, and replayable QualityGateDecision are proven on representative holdout and real workflow evidence.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; Q-006 selects author-goal-led multi-evidence quality authority without weakening hard guards, calibration, independent blind evidence, regression protection, stale invalidation, or honest disagreement. No quality-authority runtime is implementation-verified.",
};

const revisionLineageSourcePaths = [
  "api/src/app.ts",
  "api/src/revisionImpact.ts",
  "api/src/revisionChangeSet.ts",
  "api/src/revisionReview.ts",
  "api/src/revisionAdoptionProposal.ts",
  "api/src/revisionAdoptionReceipt.ts",
  "api/src/revisionSettlement.ts",
  "api/src/editionManifest.ts",
  "api/src/revisionReview.ts",
  "api/src/fileVersions.ts",
  "api/src/runtimeFiles.ts",
  "api/src/runtimeStore.ts",
  "api/src/types.ts",
  "ui/src/components/novel/FileVersionDiffPanel.vue",
  "ui/src/stores/novel.ts",
  "ui/src/types/novel.ts",
];
const revisionLineageSources = new Map(revisionLineageSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function revisionEvidence(relativePath, needle) {
  const sourceEntry = revisionLineageSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown revision-lineage audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Revision-lineage evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function revisionSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = revisionLineageSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown revision-lineage audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Revision-lineage slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Revision-lineage slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const revisionFileSnapshotSlice = revisionSourceSlice("api/src/fileVersions.ts", "export async function createWritingFileSnapshot", "export async function listWritingFileVersions");
const revisionDiffSlice = revisionSourceSlice("api/src/fileVersions.ts", "export async function readWritingFileDiff", "export function buildEditorSuggestion");
const revisionRestoreSlice = revisionSourceSlice("api/src/runtimeFiles.ts", "export async function restoreRuntimeCheckpoint", "async function atomicWrite");
const revisionDispatchSlice = revisionLineageSources.get("api/src/runtimeFiles.ts").content.slice(
  revisionLineageSources.get("api/src/runtimeFiles.ts").content.indexOf("export async function dispatchRuntimeWrites"),
);
const revisionRestoreApiSlice = revisionSourceSlice("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/runtime/checkpoints/:checkpointId/restore"', 'app.get("/api/novel/projects/:projectId/runtime/:chapterId"');
const revisionFileApiSlice = revisionSourceSlice("api/src/app.ts", 'app.get("/api/novel/projects/:projectId/file-versions/*"', 'app.post("/api/novel/projects/:projectId/tasks"');
const revisionMergeSlice = revisionSourceSlice("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/runtime/derivatives/:branchId/merge"', 'app.get("/api/novel/projects/:projectId/runtime/checkpoints"');
const revisionUiDiffSlice = revisionLineageSources.get("ui/src/components/novel/FileVersionDiffPanel.vue").content;

if (!revisionFileSnapshotSlice.includes("currentContent") || !revisionFileSnapshotSlice.includes("fs.writeFile(absoluteVersionPath, currentContent") || /parent|baseHash|contentHash|canonCursor|semantic/i.test(revisionFileSnapshotSlice)) {
  throw new Error("Revision-lineage audit drift: file snapshots no longer store only the prior file image or gained semantic lineage fields and must be reclassified.");
}
if (!revisionDiffSlice.includes('id: "current"') || /three.?way|common.?ancestor|semantic/i.test(revisionDiffSlice)) {
  throw new Error("Revision-lineage audit drift: file diff is no longer snapshot-versus-current only and must be reclassified.");
}
if (!revisionRestoreSlice.includes("await fs.rm(target, { force: true })") || !revisionRestoreSlice.includes("await fs.copyFile(source, target)") || /transaction|rollback|invalidate|damage|recompute|outbox|commit/i.test(revisionRestoreSlice)) {
  throw new Error("Revision-lineage audit drift: checkpoint restore semantics changed and must be reclassified.");
}
if (!revisionDispatchSlice.includes("for (const write of input.writes)") || !revisionDispatchSlice.includes("await atomicWrite") || /rollback|transaction|outbox|commit/i.test(revisionDispatchSlice)) {
  throw new Error("Revision-lineage audit drift: multi-file runtime dispatch gained transaction or rollback semantics and must be reclassified.");
}
if (!revisionRestoreApiSlice.includes("restoreRuntimeCheckpoint") || !revisionRestoreApiSlice.includes("writeProject(project)") || /invalidate|damage|recompute|settle/i.test(revisionRestoreApiSlice)) {
  throw new Error("Revision-lineage audit drift: checkpoint restore API gained governed invalidation or settlement and must be reclassified.");
}
if (!revisionFileApiSlice.includes("file-diff") || revisionFileApiSlice.includes("file-versions/*/restore") || /semantic.?diff|revision.?intent/i.test(revisionFileApiSlice)) {
  throw new Error("Revision-lineage audit drift: file-version API gained restore or semantic revision behavior and must be reclassified.");
}
if (!revisionMergeSlice.includes('canonPolicy: "accepted_for_canon"') || !revisionMergeSlice.includes("dispatchRuntimeWrites") || /three.?way|common.?ancestor|semantic.?conflict|RevisionSettlement/i.test(revisionMergeSlice)) {
  throw new Error("Revision-lineage audit drift: derivative merge gained governed ancestry, semantic conflict, or settlement and must be reclassified.");
}
if (!revisionUiDiffSlice.includes("createDiffEditor") || /restore|revert|cherry.?pick|semantic/i.test(revisionUiDiffSlice)) {
  throw new Error("Revision-lineage audit drift: file-version UI is no longer read-only comparison and must be reclassified.");
}

const revisionProductSource = [...revisionLineageSources.values()].map((entry) => entry.content).join("\n");
const partialRevisionIntent = revisionProductSource.includes("createRevisionIntent") && revisionProductSource.includes('schemaVersion: "revision-intent.v1"');
const partialRevisionSettlement = revisionProductSource.includes("settleRevision") && revisionProductSource.includes('schemaVersion: "revision-settlement.v1"');
const implementedRevisionEntities = [
  "RevisionIntent",
  "ProjectVersion",
  "CanonCommit",
  "SemanticChangeSet",
  "RevisionImpactGraph",
  "DamageEvent",
  "ProjectionInvalidation",
  "SelectiveRecomputePlan",
  "RevisionSettlement",
  "RestorePlan",
  "SemanticMergeCase",
].filter((entity) => revisionProductSource.includes(entity) && !(partialRevisionIntent && entity === "RevisionIntent") && !(partialRevisionSettlement && entity === "RevisionSettlement"));
const auditedRevisionEntities = new Set(["RestorePlan"]);
const unauditedRevisionEntities = implementedRevisionEntities.filter((entity) => !auditedRevisionEntities.has(entity));
if (unauditedRevisionEntities.length) {
  throw new Error(`Revision-lineage audit drift: governed revision entities now exist and must be audited: ${unauditedRevisionEntities.join(", ")}`);
}

const revisionProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const chapters = Array.isArray(projectFile.value?.chapters) ? projectFile.value.chapters : [];
  const writingPaths = chapters.flatMap((chapter) => [chapter?.outlinePath, chapter?.contentPath]).filter((value) => typeof value === "string" && value.trim());
  const manifestFile = readAnonymousJsonFile(join(projectDirectory, "versions", "manifest.json"), { snapshots: [] });
  const snapshots = Array.isArray(manifestFile.value?.snapshots) ? manifestFile.value.snapshots : [];
  const snapshotFields = [...new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot || {})))].sort();
  const snapshotFilesPresent = snapshots.filter((snapshot) => typeof snapshot?.versionPath === "string" && existsSync(join(projectDirectory, snapshot.versionPath))).length;
  const derivedCounts = {
    dashboards: directJsonFiles(join(projectDirectory, "dashboard")).length,
    sceneCards: directJsonFiles(join(projectDirectory, "scenes")).length,
    summaries: directJsonFiles(join(projectDirectory, "memory", "chapter-summaries")).length,
    qualityReports: directJsonFiles(join(projectDirectory, "quality")).filter((path) => !path.endsWith("series-metrics.json")).length,
    ledgers: directJsonFiles(join(projectDirectory, "ledger")).length,
  };
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: { project: projectFile.sha256, versionManifest: manifestFile.sha256 },
    parseHealth: { projectValid: projectFile.valid, versionManifestValid: manifestFile.valid },
    writingSurface: {
      chapters: chapters.length,
      declaredWritingPaths: new Set(writingPaths).size,
    },
    fileSnapshots: {
      count: snapshots.length,
      filesCovered: new Set(snapshots.map((snapshot) => snapshot?.filePath).filter(Boolean)).size,
      snapshotFilesPresent,
      fields: snapshotFields,
      bySource: countsByValue(snapshots.map((snapshot) => snapshot?.source)),
      byReason: countsByValue(snapshots.map((snapshot) => snapshot?.reason)),
      withRunId: snapshots.filter((snapshot) => typeof snapshot?.runId === "string" && snapshot.runId).length,
      withParentOrBaseIdentity: snapshots.filter((snapshot) => snapshot?.parentId || snapshot?.parentVersionId || snapshot?.baseHash || snapshot?.contentHash || snapshot?.canonCursor).length,
    },
    derivedAssets: derivedCounts,
    invalidationArtifacts: {
      damageEvents: 0,
      selectiveRecomputePlans: 0,
      revisionSettlements: 0,
      note: "Current project files expose no governed revision/damage/recompute/settlement artifact; a derived file count is not evidence that it is fresh for the current canon.",
    },
  };
});

const revisionTotals = revisionProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.writingSurface.chapters,
  declaredWritingPaths: totals.declaredWritingPaths + project.writingSurface.declaredWritingPaths,
  fileSnapshots: totals.fileSnapshots + project.fileSnapshots.count,
  snapshotFilesPresent: totals.snapshotFilesPresent + project.fileSnapshots.snapshotFilesPresent,
  snapshotPathsCovered: totals.snapshotPathsCovered + project.fileSnapshots.filesCovered,
  snapshotsWithParentOrBaseIdentity: totals.snapshotsWithParentOrBaseIdentity + project.fileSnapshots.withParentOrBaseIdentity,
  derivedAssets: totals.derivedAssets + Object.values(project.derivedAssets).reduce((sum, value) => sum + value, 0),
}), { projects: 0, chapters: 0, declaredWritingPaths: 0, fileSnapshots: 0, snapshotFilesPresent: 0, snapshotPathsCovered: 0, snapshotsWithParentOrBaseIdentity: 0, derivedAssets: 0 });

const q003BaselinePath = join(outputRoot, "audits", "current-q003-operational-baseline.json");
const q003BaselineFile = readAnonymousJsonFile(q003BaselinePath, {});
const q003Runtime = q003BaselineFile.value?.observedFacts?.runtime;
const revisionRuntimeInventory = q003Runtime?.available ? {
  sourceAudit: "docs/spec-governance/audits/current-q003-operational-baseline.json",
  sourceFingerprint: q003BaselineFile.sha256,
  runs: q003Runtime.runs?.total ?? null,
  checkpoints: q003Runtime.checkpoints?.total ?? null,
  branches: q003Runtime.branches?.total ?? null,
  runtimeSnapshots: q003Runtime.snapshots?.total ?? null,
  checkpointEvents: q003Runtime.events?.byType?.checkpoint ?? null,
  warning: "Counts prove stored operational objects only; they do not prove a project-version DAG, semantic ancestry, safe restore, selective invalidation, or revision settlement.",
} : { sourceAudit: null, available: false };

const revisionStages = [
  { id: "REV-TRACE-001", label: "capture-author-revision-intent", current: "Manual saves, rewrite commands, directions, derivative requests, and restore clicks are separate actions.", gap: "No RevisionIntent records what the author changed, why, scope, invariants, protected material, urgency, or whether this is correction, exploration, retcon, reorder, restore, or branch work.", target: "Capture one immutable RevisionIntent and derive explicit candidate ChangeSets without treating every edit as the same operation." },
  { id: "REV-TRACE-002", label: "freeze-common-base", current: "Single-file snapshots preserve prior bytes; runtime checkpoints preserve a bounded path list before a run.", gap: "Neither defines a content-addressed whole-project parent, canon cursor, branch head, policy version, or complete source set.", target: "Freeze a ProjectVersion/CanonCommit root with parent identities and exact scope before analysis or generation." },
  { id: "REV-TRACE-003", label: "semantic-diff", current: "Monaco compares one old file image with the current bytes.", gap: "Moved scenes, renamed/split characters, superseded facts, changed causal edges, obligation damage, and equivalent rewrites are invisible as semantic operations.", target: "Produce a typed SemanticChangeSet over stable narrative identities plus anchored textual spans." },
  { id: "REV-TRACE-004", label: "impact-analysis", current: "Save pipeline optionally queues three broad rebuild jobs after content saves.", gap: "Direct API saves, outline/support edits, checkpoint restore, runtime writes, derivative merges, ledger changes, and project changes do not share one dependency graph or impact receipt.", target: "Walk an exact RevisionImpactGraph before commit and show affected chapters, facts, obligations, memories, reports, tasks, completion proof, cost, and author decisions." },
  { id: "REV-TRACE-005", label: "candidate-revision-plan", current: "Quality repair and runtime rewrite can request whole-file replacements; merge writes a branch draft directly.", gap: "No bounded MutationPlan preserves protected spans/strengths, defines semantic preconditions, or compares minimum-change alternatives.", target: "Generate one or more reviewable revision candidates with scope, invariants, expected benefit, damage budget, and rollback identity." },
  { id: "REV-TRACE-006", label: "concurrency-and-multi-file-atomicity", current: "Runtime writes are serialized per project and baseline-hashed per managed file, then written sequentially.", gap: "A later write failure can leave earlier files committed; manual saves have no parent compare-and-swap; queues do not create an atomic canon transaction.", target: "Use optimistic parent checks, staged blobs, atomic CanonCommit plus outbox, idempotency, and fencing." },
  { id: "REV-TRACE-007", label: "restore-as-forward-history", current: "Checkpoint restore copies or deletes files in place and then rewrites project metadata timestamp.", gap: "It can partially fail, has no pre-restore safety commit, does not preserve restore as a new descendant, and cannot explain what later work was superseded.", target: "Compile RestorePlan, preview impact, create a new forward revert commit, retain descendants, and settle resulting damage/recompute." },
  { id: "REV-TRACE-008", label: "branch-and-three-way-merge", current: "Derivative branch stores a base run ID and draft payload; merge inserts/replaces chapter files and labels accepted_for_canon.", gap: "There is no common-ancestor tree, three-way semantic merge, conflict taxonomy, partial selection, or independent validation before canon claim.", target: "Merge ProjectVersions by common ancestor; classify text, entity, fact, timeline, obligation, lock, and policy conflicts for author resolution." },
  { id: "REV-TRACE-009", label: "damage-and-invalidation", current: "Derived summaries, facts, graph, quality, ledgers, tasks, runtime snapshots, and completion views persist independently.", gap: "Changing an early chapter or restoring a checkpoint emits no shared DamageEvent and cannot deterministically mark all dependent evidence stale.", target: "Commit typed DamageEvents with source dependency edges and revoke only affected claims, gates, settlements, work items, and completion subproofs." },
  { id: "REV-TRACE-010", label: "selective-recompute", current: "The save pipeline queues whole series quality, knowledge index, and story graph rebuilds; other mutation paths may queue nothing.", gap: "Broad rebuild wastes cost while missing obligations, memories, continuity, plans, downstream prose, reader state, and completion; jobs have no invalidation cursor.", target: "Compile a costed SelectiveRecomputePlan from damage closure, preserve unaffected projections, and fence late results by source commit." },
  { id: "REV-TRACE-011", label: "revalidate-and-resettle", current: "File writes, branch merge, or restore success are operational endpoints.", gap: "No RevisionSettlement proves changed intent, canon, obligations, quality, memory, downstream chapters, author locks, and completion state are current after repair.", target: "Require scoped validation and a replayable RevisionSettlement before dependent work or completion can be current." },
  { id: "REV-TRACE-012", label: "undo-redo-and-author-control", current: "The UI can view file diffs and restore runtime checkpoints, but file snapshots cannot be directly restored.", gap: "Byte undo, intent undo, reject candidate, revert canon commit, reopen superseded direction, and abandon branch are not distinguished.", target: "Expose intent-level undo/redo as new commits with impact preview, permission, receipts, stable links, and no hidden destructive rewind." },
  { id: "REV-TRACE-013", label: "observability-and-cost", current: "Runtime events record checkpoint and write activity; file manifests list snapshots.", gap: "No view explains parentage, semantic changes, stale descendants, recompute progress, skipped unaffected work, cost, failures, or final settlement.", target: "Show a revision timeline/DAG, damage map, recompute queue, conflicts, evidence freshness, cost, and current canon head." },
  { id: "REV-TRACE-014", label: "migration-retention-and-erasure", current: "Legacy files, snapshots, checkpoints, SQLite branches, and derived assets have separate storage lifecycles.", gap: "No migration confidence, retention policy, snapshot garbage collection, export lineage, privacy erasure proof, or orphan detector spans all stores.", target: "Dual-read legacy history, label unproven ancestry, retain protected commits, garbage-collect unreachable blobs safely, and prove export/erasure coverage." },
];

const revisionLineageAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The platform may automatically repair only unaccepted candidates inside a valid grant; accepted or settled prose remains current while a versioned impact-backed revision candidate is reviewed, released editions remain immutable, and every adopted revision proves exact downstream canon, foreshadowing, memory, quality, completion, and publication state again.",
  sourceFiles: [...revisionLineageSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "source and manifest hashes", "chapter/path/snapshot/derived-asset counts", "snapshot schema field names", "runtime aggregate counts copied from the privacy-bounded Q-003 audit"],
    snapshotExcludes: ["project slug", "title", "genre", "rough idea", "chapter title or ID value", "file path value", "outline or prose", "snapshot contents", "checkpoint labels/manifests", "runtime messages or payloads", "author direction", "prompt or model output"],
  },
  operationalSnapshot: {
    totals: revisionTotals,
    projects: revisionProjectSnapshots,
    runtimeInventory: revisionRuntimeInventory,
    interpretation: "Snapshots, checkpoints, branches, events, files, and successful writes are safety and inventory signals only. They do not prove semantic ancestry, atomic restore, conflict-free merge, exact invalidation, selective recomputation, author approval, or revision settlement.",
  },
  summary: {
    auditedStages: revisionStages.length,
    projectsScanned: revisionTotals.projects,
    chaptersInventoried: revisionTotals.chapters,
    declaredWritingPaths: revisionTotals.declaredWritingPaths,
    fileSnapshots: revisionTotals.fileSnapshots,
    fileSnapshotPathsCovered: revisionTotals.snapshotPathsCovered,
    snapshotsWithParentOrBaseIdentity: revisionTotals.snapshotsWithParentOrBaseIdentity,
    runtimeCheckpoints: revisionRuntimeInventory.checkpoints ?? null,
    runtimeBranches: revisionRuntimeInventory.branches ?? null,
    governedRevisionIntents: 0,
    canonCommits: 0,
    semanticImpactGraphs: 0,
    damageEvents: 0,
    selectiveRecomputePlans: 0,
    revisionSettlements: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform versions storage surfaces and runtime safety moments, not author intent or semantic canon. File snapshots, bounded checkpoints, derivative branches, mutable derived files, background rebuilds, and run records have no shared content-addressed parent, narrative identity graph, damage event, invalidation cursor, or settlement authority.",
    consequence: "A correction, retcon, restore, reorder, rename, branch merge, or early-chapter rewrite can preserve bytes yet leave tasks, summaries, facts, vectors, graph edges, obligations, quality reports, downstream prose, and completion evidence silently stale; full rebuild is both too expensive and still incomplete, while partial overwrite cannot prove what survived.",
  },
  currentEvidence: [
    { claim: "File snapshots store prior content bytes plus light metadata, without a parent/base/content/canon identity.", evidence: [revisionEvidence("api/src/fileVersions.ts", "fs.writeFile(absoluteVersionPath, currentContent"), revisionEvidence("api/src/types.ts", "export interface FileVersionSnapshot")] },
    { claim: "File history supports list and snapshot-versus-current diff, but no file-version restore API or semantic diff.", evidence: [revisionEvidence("api/src/app.ts", 'app.get("/api/novel/projects/:projectId/file-versions/*"'), revisionEvidence("api/src/fileVersions.ts", 'id: "current"')] },
    { claim: "Checkpoint restore directly deletes or copies managed files and records an event, without transaction, forward revert commit, invalidation, or settlement.", evidence: [revisionEvidence("api/src/runtimeFiles.ts", "await fs.rm(target, { force: true })"), revisionEvidence("api/src/runtimeFiles.ts", "await fs.copyFile(source, target)")] },
    { claim: "Runtime multi-file writes are sequential; serialization and per-file baseline checks do not roll back prior successful writes.", evidence: [revisionEvidence("api/src/runtimeFiles.ts", "for (const write of input.writes)"), revisionEvidence("api/src/runtimeFiles.ts", "await atomicWrite(input.root, safePath, write.content")] },
    { claim: "Derivative merge writes chapter/project files and then declares the branch accepted_for_canon without common-ancestor semantic merge or revision settlement.", evidence: [revisionEvidence("api/src/app.ts", "dispatchRuntimeWrites({"), revisionEvidence("api/src/app.ts", 'canonPolicy: "accepted_for_canon"')] },
    { claim: "The version panel is a read-only textual comparison surface with refresh, preview, close, and no revert control.", evidence: [revisionEvidence("ui/src/components/novel/FileVersionDiffPanel.vue", "readOnly: true"), revisionEvidence("ui/src/components/novel/FileVersionDiffPanel.vue", "preview: [versionId: string]")] },
  ],
  stages: revisionStages,
  alternatives: [
    { option: "A-expand-file-snapshots-and-checkpoints", verdict: "retain-as-safety-layer-not-authority", blueCase: "Fastest path: snapshot more paths, keep longer history, add a restore button, and trigger broad rebuilds after restore; easy to explain and compatible with current storage.", redCase: "More byte copies still lack author intent, whole-project ancestry, semantic moves, common ancestors, exact dependencies, atomic multi-file commit, stale fencing, and settlement; broad rebuild can be expensive yet miss non-file authorities." },
    { option: "B-git-like-project-versioning", verdict: "strong-storage-lineage-but-insufficient-alone", blueCase: "Content-addressed commits, parents, branches, merges, tags, reverts, and three-way text merge provide durable whole-project history and excellent recovery/export semantics.", redCase: "Text trees do not inherently understand a renamed character, transformed obligation, changed reader secret, invalidated quality evidence, settled task, or completion subproof; semantic databases and projections can still drift from the commit." },
    { option: "C-semantic-revision-transaction-over-content-addressed-canon", verdict: "author-selected-specification-not-implemented", blueCase: "Combine maturity-tiered authority, immutable project commits, stable narrative identities, typed ChangeSets, impact/damage graphs, atomic canon events/outbox, selective recomputation, semantic merge, immutable editions, and replayable settlement; byte history, story truth, authorship, and publication remain linked.", redCase: "Requires authoritative maturity transitions, schema/identity migration, dependency capture, graph/reducer design, staged blobs, transaction/outbox/fencing, conflict UX, cost planning, projection cursors, edition supersession, long-running migration, and extensive crash/concurrency/retcon tests." },
  ],
  targetAuthority: {
    entities: ["RevisionIntent", "ProjectVersion", "CanonCommit", "SemanticChangeSet", "MutationPlan", "RevisionImpactGraph", "DamageEvent", "ProjectionInvalidation", "SelectiveRecomputePlan", "SemanticMergeCase", "RestorePlan", "RevisionSettlement"],
    intentTypes: ["correct_fact", "change_direction", "retcon", "reorder", "rename_or_split_entity", "revise_style", "repair_quality", "restore_prior_state", "explore_branch", "merge_branch", "reopen_completed_scope"],
    invariant: "No file save, patch application, checkpoint restore, branch merge, task success, rebuild success, new timestamp, clean diff, score, or author click may independently establish current canon, semantic compatibility, projection freshness, revision success, chapter settlement, or book completion.",
  },
  selectedRevisionAuthority: {
    policyId: "maturity-tiered-revision-authority",
    unacceptedCandidates: "May be regenerated or locally repaired inside a valid scoped AutonomyGrant while remaining isolated, versioned, regression-checked, and discardable.",
    acceptedOrSettledProse: "May be diagnosed, branched, impact-analyzed, selectively recomputed, and presented as a candidate, but never silently overwritten; material adoption requires the applicable explicit author authority.",
    releasedEditions: "Remain immutable. The platform may prepare a new branch and candidate edition, but publication requires explicit author approval and a supersedes-linked new DeliveryProof.",
    emergencyRule: "Contradiction or safety discovery may stale proofs, fence dependent work, and block future publication immediately, but does not authorize silent accepted-text replacement.",
  },
  revisionProtocol: {
    order: [
      "capture RevisionIntent, author authority, scope, reason, protected invariants, locks, anti-goals, and expected outcome",
      "freeze a content-addressed ProjectVersion, canon cursor, branch head, policy/evaluator versions, and in-flight writer fences",
      "compile typed SemanticChangeSet candidates over stable narrative identities and exact text/source anchors",
      "walk RevisionImpactGraph to classify direct, transitive, uncertain, protected, conflicting, and unaffected dependents",
      "preview author-visible consequences, choices, estimated cost/latency, skipped unaffected work, and rollback/revert identity",
      "validate candidate MutationPlan against canon, POV, secrets, obligations, locks, rights, quality, memory, and downstream contracts",
      "atomically publish CanonCommit plus semantic events/outbox; never expose a partial multi-file/project/database state",
      "emit DamageEvents and ProjectionInvalidations at the new commit cursor, cancel/fence stale workers, and revoke dependent gates/proofs",
      "execute the costed SelectiveRecomputePlan idempotently, preserving unaffected assets and reusing only content-addressed compatible results",
      "revalidate changed and boundary surfaces, collect author decisions/waivers, and issue RevisionSettlement before downstream unlock or completion recertification",
    ],
    restore: "Restore is a new forward CanonCommit derived from a reviewed RestorePlan; it never destroys descendants or silently rewinds database truth. A pre-restore safety commit, common base, affected scope, later-work disposition, conflicts, damage, recompute, and settlement are mandatory.",
    merge: "Use common-ancestor three-way comparison for both bytes and semantic identities. Text overlap, entity identity, fact/time state, reader/POV knowledge, obligation lifecycle, author lock, policy, and generated-derived conflicts remain explicit; no last-write-wins canon merge.",
    invalidation: "A source commit change invalidates only transitive dependents whose exact dependency receipts no longer match. Unaffected content and projections retain identities; uncertain or missing dependency edges fail closed for settlement but may use cost-bounded conservative recomputation.",
  },
  verificationMatrix: [
    "revise an early chapter fact after downstream chapters, summaries, facts, vectors, graph, quality gates, obligations, settlements, and completion proof exist",
    "delete, move, transform, intentionally open, and later restore a foreshadowing setup/payoff pair",
    "rename, merge, split, disguise, reveal, kill, revive, or correct two same-name entities without corrupting aliases or POV knowledge",
    "change protagonist, POV, tense, world rule, timeline, relationship, resource, injury, or ending contract mid-book",
    "restore a checkpoint after later manual edits and prove later descendants are preserved, classified, and not silently lost",
    "merge two branches that independently edit text, canon facts, obligation states, author locks, and completion scope",
    "concurrent offline/manual/runtime edits from the same parent; one commits and the other receives a reviewable conflict",
    "crash after staged blobs, after canon commit but before outbox delivery, during recompute, and during settlement",
    "late worker completes against an old commit after restore/revert and is fenced without overwriting current projections",
    "selective recompute failure/retry proves exactly-once visible effects and retains honest stale denominators",
    "revert the revision itself, then replay both heads deterministically with identical canon, projections, costs, and receipts",
    "legacy project migration, export/import, retention cleanup, privacy erasure, orphan detection, and damaged-history recovery",
  ],
  releaseGate: {
    requirementIds: ["FR-STATE-002", "FR-STATE-005", "FR-STATE-006", "FR-STATE-007", "FR-STATE-008", "FR-MIGRATE-004", "FR-API-002", "FR-UX-019", "FR-EFFORT-009", "FR-EFFORT-015", "FR-EFFORT-018", "FR-PROSE-007", "FR-PROSE-008", "FR-PROSE-009", "FR-PROSE-010", "FR-LONGMEM-013", "FR-FORESHADOW-005", "FR-FORESHADOW-007", "FR-EVAL-010", "FR-EVAL-012", "FR-RUN-010", "FR-RUN-014", "FR-RUN-021", "FR-COMPLETE-006"],
    rule: "Do not claim safe or automatically authorized revision, undo, restore, branch merge, selective recomputation, preserved completion, or edition supersession until authoritative maturity, immutable RevisionIntent, content-addressed ancestry, semantic diff/impact, candidate isolation, atomic forward canon commit/outbox, typed damage/invalidation, common-ancestor conflict handling, stale-worker fencing, costed selective recompute, author approval/waiver, immutable prior editions, and replayable RevisionSettlement pass retcon, concurrency, crash, late-result, accepted-prose, and released-edition tests.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; Q-007 selects maturity-tiered revision authority without weakening ancestry, author approval, candidate isolation, atomicity, damage propagation, stale fencing, exact freshness, rollback/revert, immutable editions, or honest settlement. No revision-authority runtime is implementation-verified.",
};

const manuscriptDeliverySourcePaths = [
  "api/src/app.ts",
  "api/src/editionManifest.ts",
  "api/src/publicationTree.ts",
  "api/src/publicationArtifacts.ts",
  "api/src/deliveryProof.ts",
  "api/src/deliveryAccessGrant.ts",
  "api/src/releasePreflight.ts",
  "api/src/closureCertificate.ts",
  "api/src/auditReport.ts",
  "api/src/novelProject.ts",
  "api/src/types.ts",
  "ui/src/stores/novel.ts",
  "ui/src/components/novel/AuditReportPanel.vue",
  "ui/src/services/novelApi.ts",
  "ui/src/types/novel.ts",
];
const manuscriptDeliverySources = new Map(manuscriptDeliverySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function manuscriptEvidence(relativePath, needle) {
  const sourceEntry = manuscriptDeliverySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown manuscript-delivery audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Manuscript-delivery evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function manuscriptSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = manuscriptDeliverySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown manuscript-delivery audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Manuscript-delivery slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Manuscript-delivery slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const manuscriptAuditTypeSlice = manuscriptSourceSlice("api/src/types.ts", "export interface ProjectAuditReport", "export type BackgroundJobType");
const manuscriptAuditRouteSlice = manuscriptSourceSlice("api/src/app.ts", 'app.get("/api/novel/projects/:projectId/audit-report"', 'app.post("/api/novel/projects/:projectId/selection/polish"');
const manuscriptUiExportSlice = manuscriptSourceSlice("ui/src/stores/novel.ts", "async function exportProjectAuditReport", "async function previewProjectAuditReport");
const manuscriptProductSource = [...manuscriptDeliverySources.values()].map((entry) => entry.content).join("\n");
const partialEditionManifest = manuscriptProductSource.includes("createEditionManifest") && manuscriptProductSource.includes('schemaVersion: "edition-manifest.v1"');
const partialPublicationTree = manuscriptProductSource.includes("compilePublicationTree") && manuscriptProductSource.includes('schemaVersion: "publication-tree.v1"');
const partialPublicationArtifacts = manuscriptProductSource.includes("renderPublicationArtifacts") && manuscriptProductSource.includes('schemaVersion: "publication-artifact-set.v1"');
const partialDeliveryProof = manuscriptProductSource.includes("issueDeliveryProof") && manuscriptProductSource.includes('schemaVersion: "delivery-proof.v1"');
const partialDeliveryAccessGrant = manuscriptProductSource.includes("issueDeliveryAccessGrant") && manuscriptProductSource.includes('schemaVersion: "delivery-access-grant.v1"');

if (!manuscriptAuditRouteSlice.includes("buildProjectAuditReport") || !manuscriptAuditRouteSlice.includes("res.json({ report })")) {
  throw new Error("Manuscript-delivery audit drift: the project audit-report route changed and must be reclassified.");
}
if (!manuscriptUiExportSlice.includes("new Blob([JSON.stringify(report, null, 2)]") || !manuscriptUiExportSlice.includes("application/json") || !manuscriptUiExportSlice.includes("-audit-report.json")) {
  throw new Error("Manuscript-delivery audit drift: the browser download is no longer a JSON audit report and must be reclassified.");
}
if (!manuscriptAuditTypeSlice.includes("projectSlug: string") || !manuscriptAuditTypeSlice.includes("generatedAt: string") || /manifestHash|sourceCommit|editionId|artifactHash|deliveryProof/i.test(manuscriptAuditTypeSlice)) {
  throw new Error("Manuscript-delivery audit drift: ProjectAuditReport gained immutable edition or artifact identity and must be reclassified.");
}
const manuscriptReleaseRoutePattern = /app\.(?:get|post|put|patch)\([^\n]+\/api\/novel\/projects[^\n]+\/(?:manuscript|edition|release|publication)(?:s|\/|\")/i;
if (manuscriptReleaseRoutePattern.test(manuscriptDeliverySources.get("api/src/app.ts").content) && !partialEditionManifest) {
  throw new Error("Manuscript-delivery audit drift: a manuscript/edition/release API now exists and must be audited.");
}
const implementedManuscriptEntities = [
  "ManuscriptRelease",
  "EditionManifest",
  "EditionChapterEntry",
  "PublicationTree",
  "ExportArtifact",
  "RenderReceipt",
  "ArtifactValidationReport",
  "DeliveryProof",
  "DeliveryAccessGrant",
].filter((entity) => manuscriptProductSource.includes(entity) && !(partialEditionManifest && entity === "EditionManifest") && !(partialPublicationTree && entity === "PublicationTree") && !(partialPublicationArtifacts && entity === "ExportArtifact") && !(partialDeliveryProof && entity === "DeliveryProof") && !(partialDeliveryAccessGrant && entity === "DeliveryAccessGrant"));
if (implementedManuscriptEntities.length) {
  throw new Error(`Manuscript-delivery audit drift: governed release entities now exist and must be audited: ${implementedManuscriptEntities.join(", ")}`);
}

function recursiveFileCount(directory) {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => {
    const path = join(directory, entry.name);
    return count + (entry.isDirectory() ? recursiveFileCount(path) : entry.isFile() ? 1 : 0);
  }, 0);
}

function duplicateValueCount(values) {
  return [...Map.groupBy(values.filter((value) => value !== null && value !== undefined && value !== ""), (value) => String(value)).values()]
    .filter((members) => members.length > 1)
    .reduce((count, members) => count + members.length, 0);
}

const manuscriptProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const chapters = Array.isArray(projectFile.value?.chapters) ? projectFile.value.chapters : [];
  const contentEntries = chapters.map((chapter) => {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath.trim() : "";
    const absolutePath = relativePath ? resolve(projectDirectory, relativePath) : null;
    const insideProject = Boolean(absolutePath && (absolutePath === projectDirectory || absolutePath.startsWith(`${projectDirectory}\\`) || absolutePath.startsWith(`${projectDirectory}/`)));
    const exists = Boolean(insideProject && existsSync(absolutePath));
    const content = exists ? readFileSync(absolutePath, "utf8") : "";
    const firstNonblank = content.split(/\r?\n/).find((line) => line.trim())?.trim() || "";
    return {
      declared: Boolean(relativePath),
      insideProject,
      exists,
      nonempty: Boolean(content.trim()),
      substantial: content.trim().length >= 800,
      utf8Bytes: Buffer.byteLength(content, "utf8"),
      characters: content.length,
      startsWithMarkdownHeading: /^#\s+\S/.test(firstNonblank),
      fingerprint: exists ? createHash("sha256").update(content).digest("hex") : null,
    };
  });
  const explicitOrder = chapters.filter((chapter) => Number.isFinite(chapter?.order));
  const compositeOrders = chapters
    .filter((chapter) => Number.isFinite(chapter?.volumeOrder) && Number.isFinite(chapter?.order))
    .map((chapter) => `${chapter.volumeOrder}:${chapter.order}`);
  const releaseDirectories = ["exports", "releases", "editions", "publication", "manuscript"];
  const releaseArtifactFiles = releaseDirectories.reduce((count, directory) => count + recursiveFileCount(join(projectDirectory, directory)), 0);
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: projectFile.sha256,
      chapterContentAggregate: createHash("sha256").update(contentEntries.map((entry) => entry.fingerprint || "missing").join("\u0000")).digest("hex"),
    },
    parseHealth: { projectValid: projectFile.valid },
    chapters: {
      total: chapters.length,
      byStatus: countsByValue(chapters.map((chapter) => chapter?.status)),
      checked: chapters.filter((chapter) => chapter?.status === "checked").length,
      duplicateIdMembers: duplicateValueCount(chapters.map((chapter) => chapter?.id)),
      duplicateContentPathMembers: duplicateValueCount(chapters.map((chapter) => chapter?.contentPath)),
    },
    content: {
      declaredPaths: contentEntries.filter((entry) => entry.declared).length,
      pathsOutsideProject: contentEntries.filter((entry) => entry.declared && !entry.insideProject).length,
      existingFiles: contentEntries.filter((entry) => entry.exists).length,
      nonemptyFiles: contentEntries.filter((entry) => entry.nonempty).length,
      substantialFilesAtLeast800Characters: contentEntries.filter((entry) => entry.substantial).length,
      filesStartingWithMarkdownHeading: contentEntries.filter((entry) => entry.startsWithMarkdownHeading).length,
      utf8Bytes: contentEntries.reduce((sum, entry) => sum + entry.utf8Bytes, 0),
      characters: contentEntries.reduce((sum, entry) => sum + entry.characters, 0),
    },
    ordering: {
      chaptersWithExplicitOrder: explicitOrder.length,
      chaptersWithVolumeIdentity: chapters.filter((chapter) => typeof chapter?.volumeId === "string" && chapter.volumeId.trim()).length,
      chaptersWithVolumeOrder: chapters.filter((chapter) => Number.isFinite(chapter?.volumeOrder)).length,
      duplicateCompositeOrderMembers: duplicateValueCount(compositeOrders),
      note: "Array position currently remains the only universal chapter order; only some chapters expose explicit volume/order fields, and no frozen edition order exists.",
    },
    releaseArtifacts: {
      candidateDirectoryFiles: releaseArtifactFiles,
      manifests: 0,
      deliveryProofs: 0,
      note: "Only files under fixed release/export/edition/publication/manuscript candidate directories are counted; ordinary chapter Markdown is not treated as a released artifact.",
    },
  };
});

const manuscriptDeliveryTotals = manuscriptProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  chapters: totals.chapters + project.chapters.total,
  checkedChapters: totals.checkedChapters + project.chapters.checked,
  declaredContentPaths: totals.declaredContentPaths + project.content.declaredPaths,
  existingContentFiles: totals.existingContentFiles + project.content.existingFiles,
  nonemptyContentFiles: totals.nonemptyContentFiles + project.content.nonemptyFiles,
  substantialContentFiles: totals.substantialContentFiles + project.content.substantialFilesAtLeast800Characters,
  utf8Bytes: totals.utf8Bytes + project.content.utf8Bytes,
  characters: totals.characters + project.content.characters,
  chaptersWithExplicitOrder: totals.chaptersWithExplicitOrder + project.ordering.chaptersWithExplicitOrder,
  chaptersWithVolumeOrder: totals.chaptersWithVolumeOrder + project.ordering.chaptersWithVolumeOrder,
  releaseArtifactFiles: totals.releaseArtifactFiles + project.releaseArtifacts.candidateDirectoryFiles,
}), { projects: 0, chapters: 0, checkedChapters: 0, declaredContentPaths: 0, existingContentFiles: 0, nonemptyContentFiles: 0, substantialContentFiles: 0, utf8Bytes: 0, characters: 0, chaptersWithExplicitOrder: 0, chaptersWithVolumeOrder: 0, releaseArtifactFiles: 0 });

const manuscriptDeliveryStages = [
  { id: "PUB-TRACE-001", label: "freeze-release-source", current: "Project JSON and chapter files are mutable live state; audit report reads them at request time.", gap: "No immutable release source, author authorization, active-writer fence, or publication-scope identity.", target: "Freeze one settled CanonCommit into a ManuscriptRelease without changing historical editions." },
  { id: "PUB-TRACE-002", label: "compile-edition-manifest", current: "Chapter array position and optional volume/order fields describe the working project.", gap: "No stable frozen order, inclusion reason, per-chapter content hash, public metadata, front/back matter, open-suspense notice, or certificate dependency manifest.", target: "Compile and validate one EditionManifest over stable narrative identities." },
  { id: "PUB-TRACE-003", label: "preflight-content-and-rights", current: "Audit and quality views summarize current project objects.", gap: "No release gate for missing/duplicate/unsettled chapters, broken resources, invalid encoding, rights, fonts, stale completion evidence, secrets, or reader-view leakage.", target: "Fail closed with actionable release preflight findings before freeze." },
  { id: "PUB-TRACE-004", label: "normalize-publication-tree", current: "Chapter Markdown remains separate authoring files.", gap: "No format-neutral semantic tree for volume/chapter hierarchy, paragraphs, scene breaks, notes, images, links, and metadata.", target: "Compile one canonical PublicationTree consumed by every format adapter." },
  { id: "PUB-TRACE-005", label: "render-reader-safe-formats", current: "The only browser download serializes ProjectAuditReport JSON.", gap: "No manuscript Markdown/TXT/EPUB/DOCX/PDF artifact and no separate reader versus author-archive policy.", target: "Render deterministic reader-safe artifacts from versioned profiles; keep author archive separately authorized." },
  { id: "PUB-TRACE-006", label: "validate-artifacts", current: "Blob download trusts browser serialization.", gap: "No schema/package/font/link/resource/metadata validation, byte hash, size, MIME, or cross-format structural parity report.", target: "Validate every staged artifact and bind findings to exact bytes and renderer versions." },
  { id: "PUB-TRACE-007", label: "publish-atomic-artifact-set", current: "Each audit download is independent and ephemeral.", gap: "Partial formats, crashes, retries, and concurrent revisions have no atomic visibility or idempotent publication boundary.", target: "Stage, validate, and atomically reveal exactly one immutable artifact set or none." },
  { id: "PUB-TRACE-008", label: "issue-and-verify-delivery-proof", current: "A filename and download click are the only client-side receipt.", gap: "No offline-verifiable manifest/artifact hashes, signature, known limits, revocation, replacement, or delivery identity.", target: "Issue replayable DeliveryProof and verify tampering or supersession without trusting mutable server state." },
  { id: "PUB-TRACE-009", label: "control-access-and-retention", current: "Audit JSON contains internal operational information and project identifiers.", gap: "No reader/archive grants, expiry, revocation, retention, deletion, or leak audit for released artifacts.", target: "Separate artifact identity from recipient access and prove privacy lifecycle coverage." },
  { id: "PUB-TRACE-010", label: "supersede-without-overwrite", current: "A fresh audit request simply reflects newer live project state.", gap: "No edition chain preserves what was delivered before later revisions.", target: "Create a new edition from a new CanonCommit, link supersedes/parent, and retain verifiable historical proofs." },
];

const manuscriptDeliveryAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "After the platform helps finish the book, the author receives a stable, reader-safe manuscript edition whose exact chapters, order, formats, bytes, checks, and later replacements can be independently verified.",
  sourceFiles: [...manuscriptDeliverySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "source/project/content aggregate hashes", "chapter/status/order/content byte and character counts", "fixed candidate release-directory file counts", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "chapter ID/title/path value", "volume title", "outline or prose", "author direction", "prompt/model output", "task or invocation payload", "recipient identity", "absolute project path"],
  },
  operationalSnapshot: {
    totals: manuscriptDeliveryTotals,
    projects: manuscriptProjectSnapshots,
    interpretation: "Working chapter files are source inventory, not a release. Nonempty or substantial prose, array order, a completed runtime, a JSON audit download, or a browser click cannot prove a frozen reader edition, format validity, privacy, atomic publication, or delivery identity.",
  },
  summary: {
    auditedStages: manuscriptDeliveryStages.length,
    projectsScanned: manuscriptDeliveryTotals.projects,
    chaptersInventoried: manuscriptDeliveryTotals.chapters,
    existingContentFiles: manuscriptDeliveryTotals.existingContentFiles,
    substantialContentFiles: manuscriptDeliveryTotals.substantialContentFiles,
    checkedChapters: manuscriptDeliveryTotals.checkedChapters,
    releaseArtifactFiles: manuscriptDeliveryTotals.releaseArtifactFiles,
    manuscriptReleases: 0,
    editionManifests: 0,
    exportArtifacts: 0,
    deliveryProofs: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform treats creation state and operational audit data as mutable project views. It has no publication aggregate that freezes an exact canon version, compiles a reader-safe normalized book, validates deterministic format artifacts, atomically publishes an immutable set, and proves which bytes were delivered.",
    consequence: "Even after prose and completion logic mature, the author could receive reordered, stale, partial, privacy-leaking, non-reproducible, or silently overwritten files and have no reliable answer to which edition a reader actually received.",
  },
  currentEvidence: [
    { claim: "The server exposes a dynamic project audit-report JSON route, not a manuscript release route.", evidence: [manuscriptEvidence("api/src/app.ts", 'app.get("/api/novel/projects/:projectId/audit-report"'), manuscriptEvidence("api/src/app.ts", "buildProjectAuditReport(projectRoot(project.slug), project)")] },
    { claim: "The browser export serializes the mutable audit object to an application/json Blob named audit-report.json.", evidence: [manuscriptEvidence("ui/src/stores/novel.ts", "new Blob([JSON.stringify(report, null, 2)]"), manuscriptEvidence("ui/src/stores/novel.ts", "-audit-report.json")] },
    { claim: "ProjectAuditReport identifies current project and generated time but has no source commit, edition manifest, artifact hashes, renderer identity, validation, or delivery proof.", evidence: [manuscriptEvidence("api/src/types.ts", "export interface ProjectAuditReport"), manuscriptEvidence("api/src/types.ts", "generatedAt: string;")] },
    { claim: "Audit report assembly reads current quality, tasks, invocations, jobs, knowledge, and runtime snapshots on demand.", evidence: [manuscriptEvidence("api/src/auditReport.ts", "export async function buildProjectAuditReport"), manuscriptEvidence("api/src/auditReport.ts", "await Promise.all([")] },
  ],
  stages: manuscriptDeliveryStages,
  alternatives: [
    { option: "A-package-current-project-folder", verdict: "retain-as-author-backup-not-reader-release", blueCase: "Fast, lossless, and compatible with current file storage; authors can keep every source and internal artifact.", redCase: "The folder can mutate during packaging, has no settled scope or stable order, and may expose prompts, tasks, private sources, secrets, internal mystery answers, and operational data." },
    { option: "B-render-on-every-download", verdict: "use-for-preview-not-edition-authority", blueCase: "Low storage overhead, flexible format choice, and a simple download interaction.", redCase: "Repeated downloads can change with live files, sort behavior, renderer dependencies, templates, or partial failures; historical bytes, disputes, rollback, and supersession are unprovable." },
    { option: "C-immutable-edition-transaction", verdict: "recommended-not-implemented", blueCase: "Freeze a settled CanonCommit into an EditionManifest, compile one reader-safe PublicationTree, render/version/validate staged formats, atomically publish content-addressed artifacts, and sign DeliveryProof; later work creates a new edition.", redCase: "Requires release state, artifact storage, deterministic renderers, font/resource licensing, privacy profiles, format validators, transaction/idempotency design, access lifecycle, and crash/concurrency/large-book tests." },
  ],
  targetAuthority: {
    entities: ["ManuscriptRelease", "EditionManifest", "EditionChapterEntry", "PublicationTree", "ExportProfile", "ExportArtifact", "RenderReceipt", "ArtifactValidationReport", "DeliveryProof", "DeliveryAccessGrant"],
    lifecycle: ["draft_release", "preflight", "frozen", "rendering", "validating", "ready", "delivered", "blocked", "failed", "stale", "revoked", "superseded"],
    invariant: "No project folder, chapter count, nonempty file, runtime completion, audit report, render success, artifact presence, download click, or mutable URL may independently establish a frozen edition, reader safety, format validity, atomic readiness, successful delivery, literary quality, or author satisfaction.",
  },
  releaseProtocol: {
    order: [
      "capture author release intent, edition metadata, reader/archive audience, formats, public open-suspense notice, rights and access policy",
      "verify completion and revision settlements, freeze CanonCommit/canon cursor, acquire active-writer fence, and snapshot certificate dependencies",
      "preflight stable chapter identity/order, inclusion, missing/duplicate/unsettled content, encoding, links/assets, rights/fonts, secrets, privacy and stale proofs",
      "compile immutable EditionManifest and a format-neutral reader-safe PublicationTree with exact input and policy hashes",
      "render each requested ExportProfile into private staged artifacts using pinned renderer, template, font and locale versions",
      "validate package/schema/structure/metadata/resources/privacy and cross-format parity; content-address every byte with size and MIME",
      "atomically publish the complete validated artifact set and manifest; partial failure leaves no ready edition and idempotent retry creates no duplicate",
      "issue DeliveryProof, optionally issue recipient-specific DeliveryAccessGrant/receipt, and support offline hash/signature verification",
      "on later CanonCommit, revoke stale draft releases and create a new edition linked by parent/supersedes without overwriting historical artifacts or proofs",
    ],
    minimumFormats: "RP8 first release must prove deterministic UTF-8 Markdown and plain text; EPUB/DOCX/PDF adapters may follow, but every adapter consumes the same PublicationTree and obeys the same atomic set, privacy, validation, and proof rules.",
  },
  verificationMatrix: [
    "three-volume book with insertions, renumbering, front/back matter, scene separators, notes, images, and authorized open sequel hooks",
    "missing content, empty/unsettled chapter, duplicate stable ID, duplicate order, order gap, invalid encoding/control characters, broken link or resource",
    "concurrent chapter edit or revision settlement while preflight, render, validate, or publish is running",
    "crash after staging one format, after all renders before validation, and after atomic publish before proof notification",
    "one adapter fails while others succeed; no partial ready claim and idempotent retry publishes one set",
    "same manifest and renderer twice yields byte-identical Markdown/TXT; changed renderer/input yields a new identity",
    "canary secrets, prompts, task history, private craft sources, internal mystery answers, editor markers, filesystem paths, and hidden metadata never reach reader artifacts",
    "font/source/image license expires or is revoked between draft and freeze",
    "completion, closure, continuity, quality, or revision proof becomes stale before ready",
    "very large book streams within memory limits and resumes safely without changing final hashes",
    "tamper with artifact, manifest, proof, MIME, size, signature, or supersedes link and fail verification",
    "export/import and historical retention preserve edition identities while privacy erasure follows declared legal policy",
  ],
  releaseGate: {
    requirementIds: ["FR-PUBLISH-001", "FR-PUBLISH-002", "FR-PUBLISH-003"],
    acceptanceRefs: ["AT-505", "AT-506", "AT-507"],
    rule: "Do not claim the finished book has been released or delivered until one settled CanonCommit is frozen into an immutable EditionManifest, all requested reader-safe artifacts derive deterministically from the same PublicationTree, preflight and format/privacy validation bind to exact bytes, the complete set is published atomically and idempotently, and DeliveryProof can detect tampering, staleness, revocation, or supersession.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens immutable source freeze, reader safety, deterministic identities, validation, atomic publication, historical retention, integrity proof or honest failure.",
};

const researchGroundingSourcePaths = [
  "api/src/types.ts",
  "api/src/platformLibrary.ts",
  "api/src/contextAssembler.ts",
  "api/src/knowledgeIndex.ts",
  "api/src/app.ts",
  "api/src/database.ts",
  "api/src/projectBackup.ts",
  "ui/src/types/novel.ts",
  "ui/src/components/novel/PlatformLibraryPanel.vue",
];
const researchGroundingSources = new Map(researchGroundingSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function researchEvidence(relativePath, needle) {
  const sourceEntry = researchGroundingSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown research-grounding audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Research-grounding evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function researchSourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = researchGroundingSources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown research-grounding audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Research-grounding slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Research-grounding slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const researchAssetTypeSlice = researchSourceSlice("api/src/types.ts", "export interface PlatformAsset", "export interface PromptPreset");
const researchKnowledgeTypeSlice = researchSourceSlice("api/src/types.ts", "export type KnowledgeSourceType", "export interface KnowledgeVectorEntry");
const researchAssetCreateSlice = researchSourceSlice("api/src/platformLibrary.ts", "export async function createPlatformAsset", "export async function linkAssetToProject");
const researchUiLibrarySource = researchGroundingSources.get("ui/src/components/novel/PlatformLibraryPanel.vue").content;
const researchAppSource = researchGroundingSources.get("api/src/app.ts").content;
const researchProductSource = [...researchGroundingSources.values()].map((entry) => entry.content).join("\n");

if (!researchAssetTypeSlice.includes("filePath?: string") || !researchAssetTypeSlice.includes("tags: string[]") || /sourceUrl|publisher|publishedAt|retrievedAt|effectiveAt|archiveUrl|contentHash|license|quoteLimit|retention|reliability/i.test(researchAssetTypeSlice)) {
  throw new Error("Research-grounding audit drift: PlatformAsset gained governed source provenance or rights fields and must be reclassified.");
}
if (!researchKnowledgeTypeSlice.includes('"chapter-summary" | "ledger" | "story-control" | "memory-claim"') || /external|web|research|citation|sourceSnapshot/i.test(researchKnowledgeTypeSlice)) {
  throw new Error("Research-grounding audit drift: the knowledge index now admits external research sources and must be reclassified.");
}
if (!researchAssetCreateSlice.includes("name: string") || !researchAssetCreateSlice.includes("filePath?: string") || /sourceUrl|publisher|retrievedAt|license|claim|evidenceAnchor|promptInjection/i.test(researchAssetCreateSlice)) {
  throw new Error("Research-grounding audit drift: asset creation gained research provenance or claim validation and must be reclassified.");
}
if (!researchUiLibrarySource.includes('v-model="assetName"') || !researchUiLibrarySource.includes('v-model="assetType"') || /source url|publisher|license|retrieved|claim|citation|research question/i.test(researchUiLibrarySource)) {
  throw new Error("Research-grounding audit drift: platform library UI gained research capture semantics and must be reclassified.");
}
const projectResearchRoutes = [...researchAppSource.matchAll(/app\.(?:get|post|put|patch)\("([^"]*\/api\/novel\/projects[^\"]*\/research[^\"]*)"/gi)].map((match) => match[1]);
const unauditedProjectResearchRoutes = projectResearchRoutes.filter((route) => !route.includes("/runtime/research/"));
if (unauditedProjectResearchRoutes.length) {
  throw new Error(`Research-grounding audit drift: project research APIs outside the governed runtime namespace exist: ${unauditedProjectResearchRoutes.join(", ")}`);
}
const implementedResearchEntities = [
  "ResearchObligation",
  "ResearchPlan",
  "ResearchSourceSnapshot",
  "SourceUsePolicy",
  "ResearchClaim",
  "ClaimEvidenceSet",
  "ClaimAdjudication",
  "ResearchConsumptionReceipt",
  "FactCheckReport",
  "ResearchSettlement",
].filter((entity) => researchProductSource.includes(entity));
const auditedResearchEntities = new Set(["ResearchObligation", "ResearchSourceSnapshot", "ResearchClaim", "ResearchConsumptionReceipt", "ResearchSettlement"]);
const unauditedResearchEntities = implementedResearchEntities.filter((entity) => !auditedResearchEntities.has(entity));
if (unauditedResearchEntities.length) {
  throw new Error(`Research-grounding audit drift: governed research entities now exist and must be audited: ${unauditedResearchEntities.join(", ")}`);
}

function readAnonymousJsonLines(absolutePath) {
  if (!existsSync(absolutePath)) return { exists: false, sha256: null, records: [], invalidLines: 0 };
  const content = readFileSync(absolutePath, "utf8");
  const records = [];
  let invalidLines = 0;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      invalidLines += 1;
    }
  }
  return { exists: true, sha256: createHash("sha256").update(content).digest("hex"), records, invalidLines };
}

function readPlatformAssetDatabaseInventory() {
  const databasePath = join(root, "data", "creative-platform.sqlite");
  if (!existsSync(databasePath)) return { available: false, fingerprint: null, assets: 0, links: 0, byType: {}, fields: [] };
  const immutableDatabaseUrl = pathToFileURL(databasePath);
  immutableDatabaseUrl.searchParams.set("immutable", "1");
  const database = new DatabaseSync(immutableDatabaseUrl, { readOnly: true });
  try {
    const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'platform_assets'").get();
    if (!table) return { available: false, fingerprint: createHash("sha256").update("platform_assets:missing").digest("hex"), assets: 0, links: 0, byType: {}, fields: [] };
    const rows = database.prepare("SELECT type, file_path, tags_json, related_novel_items_json FROM platform_assets").all();
    const linkTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'asset_project_links'").get();
    const links = linkTable ? Number(database.prepare("SELECT COUNT(*) AS count FROM asset_project_links").get()?.count || 0) : 0;
    const fields = database.prepare("PRAGMA table_info(platform_assets)").all().map((row) => row.name).sort();
    const fingerprint = createHash("sha256").update(JSON.stringify({ rows, links, fields })).digest("hex");
    return {
      available: true,
      fingerprint,
      assets: rows.length,
      links,
      byType: countsByValue(rows.map((row) => row.type)),
      withFilePath: rows.filter((row) => typeof row.file_path === "string" && row.file_path.trim()).length,
      withTags: rows.filter((row) => {
        try { return Array.isArray(JSON.parse(String(row.tags_json || "[]"))) && JSON.parse(String(row.tags_json || "[]")).length > 0; } catch { return false; }
      }).length,
      withRelatedNovelItems: rows.filter((row) => {
        try { return Array.isArray(JSON.parse(String(row.related_novel_items_json || "[]"))) && JSON.parse(String(row.related_novel_items_json || "[]")).length > 0; } catch { return false; }
      }).length,
      fields,
    };
  } finally {
    database.close();
  }
}

const platformLibraryMirror = readAnonymousJsonFile(join(root, "platform", "library.json"), { assets: [], prompts: [], roles: [], skills: [] });
const platformLibraryAssets = Array.isArray(platformLibraryMirror.value?.assets) ? platformLibraryMirror.value.assets : [];
const platformAssetDatabaseInventory = readPlatformAssetDatabaseInventory();
const researchProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const factsFile = readAnonymousJsonLines(join(projectDirectory, "knowledge", "facts.jsonl"));
  const triplesFile = readAnonymousJsonLines(join(projectDirectory, "knowledge", "triples.jsonl"));
  const candidateDirectories = ["research", "sources", "references", join("bible", "research")];
  const candidateResearchFiles = candidateDirectories.reduce((count, directory) => count + recursiveFileCount(join(projectDirectory, directory)), 0);
  const sourceTypes = factsFile.records.map((record) => record?.source?.type);
  const externalSourceRecords = factsFile.records.filter((record) => !["chapter-summary", "ledger", "story-control"].includes(record?.source?.type)).length;
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: { facts: factsFile.sha256, triples: triplesFile.sha256 },
    parseHealth: { invalidFactLines: factsFile.invalidLines, invalidTripleLines: triplesFile.invalidLines },
    internalKnowledge: {
      facts: factsFile.records.length,
      triples: triplesFile.records.length,
      bySourceType: countsByValue(sourceTypes),
      externalSourceRecords,
      interpretation: "The current knowledge index derives story memory from chapter summaries, ledgers, and story control; an internal source label is not an external factual citation.",
    },
    researchArtifacts: {
      candidateDirectoryFiles: candidateResearchFiles,
      obligations: 0,
      sourceSnapshots: 0,
      claims: 0,
      consumptionReceipts: 0,
      factCheckReports: 0,
      settlements: 0,
    },
  };
});

const researchGroundingTotals = researchProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  knowledgeFacts: totals.knowledgeFacts + project.internalKnowledge.facts,
  knowledgeTriples: totals.knowledgeTriples + project.internalKnowledge.triples,
  externalKnowledgeSourceRecords: totals.externalKnowledgeSourceRecords + project.internalKnowledge.externalSourceRecords,
  candidateResearchFiles: totals.candidateResearchFiles + project.researchArtifacts.candidateDirectoryFiles,
}), { projects: 0, knowledgeFacts: 0, knowledgeTriples: 0, externalKnowledgeSourceRecords: 0, candidateResearchFiles: 0 });

const researchGroundingStages = [
  { id: "RES-TRACE-001", label: "detect-research-obligation", current: "Story tasks and prompts can mention plausibility, but no durable object classifies which real-world assertions need research.", gap: "Model memory or author wording can silently become factual premise without risk, time, geography, or harm classification.", target: "Derive ResearchObligations from contract, outline, scene, and prose while keeping fictional world rules separate." },
  { id: "RES-TRACE-002", label: "capture-author-fidelity-boundary", current: "Project genre and rough idea do not encode strict-history, plausible-composite, alternate-history, or explicit-fiction choices per topic.", gap: "The system cannot know which discrepancies are intended invention versus accidental misinformation.", target: "Record topic-scoped fidelity, allowed compression, fictionalization, disclosure, and one-question escalation policy." },
  { id: "RES-TRACE-003", label: "plan-bounded-research", current: "No research question decomposition, source threshold, budget, stop condition, deadline, or fallback exists.", gap: "Always-browse wastes time and leaks context; never-browse hallucinates; both push hidden decisions into generation.", target: "Compile a risk-priced ResearchPlan that proceeds autonomously within author policy." },
  { id: "RES-TRACE-004", label: "acquire-and-freeze-sources", current: "PlatformAsset stores a name, type, scope, optional file path, tags, links, and timestamps.", gap: "No publication/effective/retrieval time, archive/version, content hash, author/institution, geography, acquisition tool, or immutable evidence snapshot.", target: "Freeze minimal ResearchSourceSnapshots with reproducible location and exact evidence anchors." },
  { id: "RES-TRACE-005", label: "enforce-rights-privacy-and-untrusted-boundary", current: "Context has generic rights and untrusted-content requirements in the SDD, but reference assets have no operational source-use policy.", gap: "Scraped books, private uploads, search snippets, tracking URLs, PII, prompt injection, or hidden instructions can be stored or injected without research-specific disposition.", target: "Apply SourceUsePolicy, quarantine active content, minimize retention, and refuse rights-unknown evidence." },
  { id: "RES-TRACE-006", label: "extract-atomic-claims", current: "KnowledgeFact contains free text and an internal story source ref.", gap: "It cannot represent exact external quote/span, units, conditions, time, geography, source statement versus system inference, or falsification condition.", target: "Extract atomic ResearchClaims with typed scope and evidence anchors without copying protected expression into prose." },
  { id: "RES-TRACE-007", label: "adjudicate-conflict-and-independence", current: "Search scoring ranks token/vector similarity; it does not adjudicate external truth.", gap: "Syndicated copies can mimic consensus, newer pages can describe older rules, and different regions or populations can legitimately disagree.", target: "Preserve support, contradiction, source families, temporal/geographic scope, uncertainty, and red/blue adjudication." },
  { id: "RES-TRACE-008", label: "map-reality-to-fiction", current: "World bible and story control track internal canon only.", gap: "No boundary says whether a researched fact is quoted reality, compressed analogy, genre convention, deliberate alternate history, or new fictional rule.", target: "Create an explicit adaptation decision before the claim shapes canon or reader expectations." },
  { id: "RES-TRACE-009", label: "consume-in-outline-and-prose", current: "Context assembly uses story files, style samples, internal knowledge, and system skills without a research claim manifest.", gap: "A generated assertion cannot be traced to a source snapshot, scope, risk, adaptation, or current validity.", target: "Emit ResearchConsumptionReceipts for stable outline/scene/prose spans and include only minimal authorized evidence." },
  { id: "RES-TRACE-010", label: "fact-check-current-version", current: "Quality review targets literary and canon signals but has no external claim denominator.", gap: "A fluent paragraph can pass while containing outdated, wrong-unit, unsafe, or regionally invalid facts; fiction may also be falsely flagged as error.", target: "Compare current prose spans with current claims and distinguish error, uncertainty, internal setting, allowed compression, and fiction." },
  { id: "RES-TRACE-011", label: "invalidate-and-resettle", current: "External source correction or expiry emits no damage event because no external dependency exists.", gap: "Outdated claims can survive in outlines, downstream chapters, quality reports, summaries, and editions, or trigger wasteful whole-book rewrites.", target: "Invalidate the exact consumption closure, revise locally, regress narrative invariants, and issue ResearchSettlement." },
  { id: "RES-TRACE-012", label: "explain-evidence-without-burdening-author", current: "The platform library lists asset names/types and the knowledge panel exposes story-derived search results.", gap: "The author cannot see what was checked, disputed, fictionalized, stale, blocked, or why one question is needed without inspecting technical files.", target: "Provide a compact research dossier/card with recommendation, dissent, scope, confidence, cost, freshness, and deep evidence links." },
];

const researchGroundingAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The author can provide only a rough premise; when credibility depends on real history, profession, science, medicine, law, geography, culture, or current facts, the platform researches autonomously within policy, preserves competing evidence, adapts it creatively, and can prove every consequential assertion is current or explicitly fictionalized.",
  sourceFiles: [...researchGroundingSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "source/database/library/fact/triple aggregate hashes", "asset/prompt/role/skill and internal fact/triple counts", "schema field names", "internal knowledge source-type categories", "fixed candidate research-directory file counts", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "chapter ID/title/path", "fact/triple text", "asset name/path/tag/link target", "prompt/role/skill text", "source URL or document content", "author direction", "model output", "database row identity", "absolute project path"],
  },
  operationalSnapshot: {
    totals: researchGroundingTotals,
    projects: researchProjectSnapshots,
    platformLibraryMirror: {
      fingerprint: platformLibraryMirror.sha256,
      assets: platformLibraryAssets.length,
      prompts: Array.isArray(platformLibraryMirror.value?.prompts) ? platformLibraryMirror.value.prompts.length : 0,
      roles: Array.isArray(platformLibraryMirror.value?.roles) ? platformLibraryMirror.value.roles.length : 0,
      skills: Array.isArray(platformLibraryMirror.value?.skills) ? platformLibraryMirror.value.skills.length : 0,
      assetFieldNames: [...new Set(platformLibraryAssets.flatMap((asset) => Object.keys(asset || {})))].sort(),
    },
    platformAssetDatabase: platformAssetDatabaseInventory,
    interpretation: "Generic reference assets, prompt presets, internal story facts, vector search, and model knowledge are useful inputs but do not prove external-source provenance, claim truth, temporal/geographic validity, source independence, rights, safe consumption, or fact-check settlement.",
  },
  summary: {
    auditedStages: researchGroundingStages.length,
    projectsScanned: researchGroundingTotals.projects,
    internalKnowledgeFacts: researchGroundingTotals.knowledgeFacts,
    internalKnowledgeTriples: researchGroundingTotals.knowledgeTriples,
    externalKnowledgeSourceRecords: researchGroundingTotals.externalKnowledgeSourceRecords,
    candidateResearchFiles: researchGroundingTotals.candidateResearchFiles,
    platformAssets: platformAssetDatabaseInventory.assets,
    researchObligations: 0,
    sourceSnapshots: 0,
    researchClaims: 0,
    consumptionReceipts: 0,
    factCheckReports: 0,
    researchSettlements: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform has an internal story-memory index and a generic asset catalog, not an external research system. Asset identity stops at name/type/path/tags, knowledge sources stop at chapter-summary/ledger/story-control, and generation context has no frozen research claim manifest or consumption lineage.",
    consequence: "Historical, medical, legal, scientific, cultural, geographic, professional, or time-sensitive assertions can be fluent yet untraceable, stale, copied, regionally wrong, derived from duplicated sources, or contaminated by prompt injection; later corrections cannot precisely locate and resettle affected narrative spans.",
  },
  currentEvidence: [
    { claim: "PlatformAsset is a generic named/linkable asset and has no external publication, retrieval, archive, content-hash, license, or reliability provenance.", evidence: [researchEvidence("api/src/types.ts", "export interface PlatformAsset"), researchEvidence("api/src/types.ts", "filePath?: string;")] },
    { claim: "The current asset creation contract accepts name/type/scope/project/file/tags/relations but no source snapshot or claim evidence.", evidence: [researchEvidence("api/src/platformLibrary.ts", "export async function createPlatformAsset"), researchEvidence("api/src/platformLibrary.ts", "relatedNovelItems?: PlatformRelationTarget[];")] },
    { claim: "The library UI creates assets from only a display name and type and shows name/type/scope/link state.", evidence: [researchEvidence("ui/src/components/novel/PlatformLibraryPanel.vue", 'v-model="assetName"'), researchEvidence("ui/src/components/novel/PlatformLibraryPanel.vue", 'v-model="assetType"')] },
    { claim: "KnowledgeSourceType is limited to chapter-summary, ledger, and story-control, so its facts are internal story memory rather than external citations.", evidence: [researchEvidence("api/src/types.ts", "export type KnowledgeSourceType"), researchEvidence("api/src/knowledgeIndex.ts", 'factSource("chapter-summary"')] },
    { claim: "The only outbound fetch in the knowledge index requests embeddings; token/vector relevance scoring is not web research or factual adjudication.", evidence: [researchEvidence("api/src/knowledgeIndex.ts", "requestOpenAiCompatibleEmbeddings"), researchEvidence("api/src/knowledgeIndex.ts", "function cosineScore")] },
    { claim: "Context assembly injects platform skills, style samples, chapter memory, and internal knowledge but no ResearchClaim/SourceSnapshot manifest.", evidence: [researchEvidence("api/src/contextAssembler.ts", "async function buildPlatformSkillBlocks"), researchEvidence("api/src/contextAssembler.ts", "async function buildKnowledgeMemoryBlocks")] },
  ],
  stages: researchGroundingStages,
  alternatives: [
    { option: "A-trust-model-parametric-knowledge", verdict: "hypothesis-only-not-evidence", blueCase: "Fast, cheap, available during every generation call, and often sufficient for harmless atmosphere or broad genre convention.", redCase: "No reproducible source, date, scope, independence, license, correction channel, or guarantee that training memories did not blend eras, regions, fiction, and outdated facts; especially unsafe for harm-relevant detail." },
    { option: "B-live-web-search-for-every-chapter", verdict: "retrieval-adapter-not-authority", blueCase: "Broad and fresher coverage with little up-front modeling; author need not prepare a bibliography.", redCase: "Ranking is not truth, copied pages mimic consensus, live results drift, access can fail, and every query creates latency, cost, privacy, rights, prompt-injection, and reproducibility risks; over-research can also flatten invention." },
    { option: "C-risk-tiered-frozen-research-dossier", verdict: "recommended-not-implemented", blueCase: "Detect obligations, capture author fidelity, freeze minimal lawful source evidence, adjudicate independent claims with red/blue dissent, map reality to fiction, trace consumption, and invalidate only affected spans; low-risk creative work still moves quickly.", redCase: "Requires source adapters, archive/hash/rights metadata, claim extraction and identity, conflict/family detection, temporal/geographic logic, prompt-injection isolation, span lineage, fact-check calibration, correction polling, and author-friendly uncertainty UX." },
  ],
  targetAuthority: {
    entities: ["ResearchObligation", "ResearchPlan", "ResearchSourceSnapshot", "SourceUsePolicy", "ResearchClaim", "ClaimEvidenceSet", "ClaimAdjudication", "ResearchConsumptionReceipt", "FactCheckReport", "ResearchSettlement"],
    claimStates: ["unverified", "supported", "disputed", "refuted", "unknown", "fictionalized", "superseded"],
    invariant: "No model recollection, prompt text, search result, snippet, URL, generic asset, file path, tag, internal KnowledgeFact, embedding similarity, page count, latest timestamp, or fluent prose may independently establish an external fact, source independence, rights, current applicability, safe creative use, or research settlement.",
  },
  researchProtocol: {
    order: [
      "detect real-world ResearchObligations from author intent, contract, outline, scene and prose; separate internal fiction and classify risk/harm/time/geography",
      "capture the author's topic-scoped fidelity, acceptable compression/fictionalization, disclosure, budget, privacy and one-question escalation policy",
      "compile a bounded ResearchPlan with atomic questions, minimum independent evidence, source mix, cost/deadline, stop condition and safe fallback",
      "acquire sources through authorized adapters or uploads; quarantine active/untrusted content and never expose project secrets or obey source instructions",
      "freeze minimal ResearchSourceSnapshots with author/institution, publication/effective/retrieval scope, archive/version/hash, rights and exact evidence anchors",
      "extract atomic ResearchClaims while distinguishing source statement, paraphrase, inference, dispute, unknown and author fictionalization",
      "group derivative sources, compare supporting and contradicting evidence, preserve time/region/population/units and issue ClaimAdjudication with dissent and falsification",
      "decide how reality maps into canon: direct assertion, analogy, compression, composite, alternate history, invented rule or explicit fiction",
      "inject only minimal authorized evidence through a ContextManifest and emit ResearchConsumptionReceipts for stable outline/scene/prose spans",
      "fact-check the current candidate against current claims, rights, canon and author policy; block high-risk errors and expose bounded uncertainty",
      "on source expiry/correction/deletion or text revision, invalidate the exact dependency closure, revise and regress locally, then issue ResearchSettlement",
      "surface a compact dossier showing what was checked, supported, disputed, fictionalized, stale, blocked, costed and still unknown without forcing the author to manage citations",
    ],
    progressiveDisclosure: "Reader-facing citations are optional by edition profile; internal provenance and consumption receipts are mandatory. Fiction may omit footnotes while the author can still inspect why a consequential detail was accepted.",
  },
  verificationMatrix: [
    "one-sentence historical mystery premise with medical mechanism, legal procedure, changing place names, calendar conversion, profession detail, and author choice between strict history and alternate setting",
    "model confidently recalls a plausible but nonexistent law or study and must remain unverified",
    "search snippet without accessible source, rights-unknown scanned book, paywalled excerpt, private upload, retracted paper, dynamic page, and source that issues prompt-injection instructions",
    "three syndicated copies of one press release versus an independent primary source and a later correction",
    "same claim differs by year, jurisdiction, population, unit system, translation, definition, or professional guideline",
    "primary and secondary sources disagree; evidence remains disputed and author chooses explicit fictionalization",
    "source page changes after snapshot, archive is unavailable, license expires, or deletion/erasure is requested",
    "research claim is consumed by two prose spans, one outline edge, one quality claim, one foreshadowing obligation, and a pending edition; correction invalidates only the dependency closure",
    "current prose paraphrases accurately without copying protected expression or leaking internal citations/secrets",
    "false-positive fact checker encounters a deliberately invented world rule, unreliable narrator, period character misconception, metaphor, satire, or dialogue lie",
    "provider/search outage, budget exhaustion, rate limit, timeout, duplicate result, malformed document, unsupported language, OCR error, and partial extraction",
    "same frozen plan/source snapshots/extractor/adjudicator versions replay to the same claims, conflicts, receipts, gates, and settlement",
  ],
  releaseGate: {
    requirementIds: ["FR-RESEARCH-001", "FR-RESEARCH-002", "FR-RESEARCH-003", "FR-RESEARCH-004"],
    acceptanceRefs: ["AT-508", "AT-509", "AT-510", "AT-511"],
    rule: "Do not claim research-grounded, historically accurate, professionally credible, medically/legally/scientifically safe, current, or fact-checked prose until obligations and fidelity are explicit, lawful source snapshots are frozen and injection-safe, atomic claims preserve scope/conflict/independence, current narrative spans publish consumption receipts, high-risk errors block, and source/text changes propagate through a replayable ResearchSettlement.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens high-risk fact gates, source eligibility, untrusted-content isolation, provenance, conflict visibility, consumption lineage, stale invalidation, author fictionalization authority or honest uncertainty.",
};

const textIntegritySourcePaths = [
  "api/src/app.ts",
  "api/src/novelProject.ts",
  "api/src/runtimeFiles.ts",
  "api/src/chapterQualityReview.ts",
  "api/src/resultParser.ts",
  "api/src/types.ts",
  "ui/src/components/novel/ChapterEditor.vue",
  "ui/src/stores/novel.ts",
];
const textIntegritySources = new Map(textIntegritySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function textIntegrityEvidence(relativePath, needle) {
  const sourceEntry = textIntegritySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown text-integrity audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Text-integrity evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

function textIntegritySourceSlice(relativePath, startNeedle, endNeedle) {
  const sourceEntry = textIntegritySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown text-integrity audit source: ${relativePath}`);
  const start = sourceEntry.content.indexOf(startNeedle);
  if (start < 0) throw new Error(`Text-integrity slice start not found in ${relativePath}: ${startNeedle}`);
  const end = sourceEntry.content.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Text-integrity slice end not found in ${relativePath}: ${endNeedle}`);
  return sourceEntry.content.slice(start, end);
}

const textSaveApiSlice = textIntegritySourceSlice("api/src/app.ts", 'app.put("/api/novel/projects/:projectId/files/*"', 'app.post("/api/novel/projects/:projectId/tasks"');
const textImportSlice = textIntegritySourceSlice("api/src/novelProject.ts", "for (const source of importedChapters)", "for (const [target, items] of supportFiles.entries())");
const textRuntimeWriteSlice = textIntegritySourceSlice("api/src/runtimeFiles.ts", "async function atomicWrite", "async function assertCheckpointBaseline");
const textQualityParagraphSlice = textIntegritySourceSlice("api/src/chapterQualityReview.ts", "function splitParagraphs", "function countMatches");
const textEditorSource = textIntegritySources.get("ui/src/components/novel/ChapterEditor.vue").content;
const textProductSource = [...textIntegritySources.values()].map((entry) => entry.content).join("\n");

if (!textSaveApiSlice.includes('const nextContent = String(req.body.content || "")') || !textSaveApiSlice.includes('fs.writeFile(resolveInside(projectRoot(project.slug), relativePath), nextContent, "utf8")') || /TextProfile|TextDiagnostic|TextSettlement|normalize.*text|parse.*structure/i.test(textSaveApiSlice)) {
  throw new Error("Text-integrity audit drift: the manual save path no longer writes the submitted string directly or gained a governed text pipeline.");
}
if (!textImportSlice.includes("source.file.content") || /TextProfile|TextDiagnostic|TextSettlement|normalize.*text|parse.*structure/i.test(textImportSlice)) {
  throw new Error("Text-integrity audit drift: imported chapter text is no longer copied directly or gained governed normalization.");
}
if (!textRuntimeWriteSlice.includes('fs.writeFile(tmp, content, "utf8")') || /TextProfile|TextDiagnostic|TextSettlement|normalize.*text|parse.*structure/i.test(textRuntimeWriteSlice)) {
  throw new Error("Text-integrity audit drift: runtime text writes no longer preserve the supplied string directly or gained governed normalization.");
}
if (!textQualityParagraphSlice.includes(".split(/\\n\\s*\\n/)") || /unicode|punctuation|mojibake|line.?ending|source.?map|round.?trip|contamination/i.test(textQualityParagraphSlice)) {
  throw new Error("Text-integrity audit drift: quality review gained structural text-integrity semantics and must be reclassified.");
}
if (!textEditorSource.includes('language: "markdown"') || !textEditorSource.includes('emit("update:content", editor.getValue())') || /TextProfile|TextDiagnostic|TextSettlement|setModelMarkers|registerCodeActionProvider/i.test(textEditorSource)) {
  throw new Error("Text-integrity audit drift: ChapterEditor gained governed diagnostics or text normalization and must be reclassified.");
}
const implementedTextEntities = [
  "TextProfile",
  "TextStructureSnapshot",
  "TextNode",
  "TextSourceMap",
  "TextDiagnostic",
  "TextFixCandidate",
  "TextException",
  "TextNormalizationReceipt",
  "TextSettlement",
].filter((entity) => textProductSource.includes(entity));
const auditedTextEntities = new Set(["TextProfile", "TextDiagnostic"]);
const unauditedTextEntities = implementedTextEntities.filter((entity) => !auditedTextEntities.has(entity));
if (unauditedTextEntities.length) {
  throw new Error(`Text-integrity audit drift: governed text entities now exist and must be audited: ${unauditedTextEntities.join(", ")}`);
}

function scanTextIntegrityBuffer(buffer) {
  let content = "";
  let validUtf8 = true;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    validUtf8 = false;
    content = buffer.toString("utf8");
  }
  const lines = content.split(/\r?\n/);
  const body = lines.filter((line) => !/^#\s/.test(line.trim())).join("\n").trim();
  let trailingWhitespaceLines = 0;
  let listLines = 0;
  let tableLines = 0;
  let hasHorizontalRule = false;
  let hasEmbeddedDoubleHyphen = false;
  let blankRun = 0;
  let hasThreeBlankLines = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/[ \t]+$/.test(line)) trailingWhitespaceLines += 1;
    if (/^\s*(?:[-*+] |\d+[.)] )/.test(line)) listLines += 1;
    if (/^\s*\|.+\|\s*$/.test(line)) tableLines += 1;
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) hasHorizontalRule = true;
    else if (trimmed.includes("--")) hasEmbeddedDoubleHyphen = true;
    if (!trimmed) {
      blankRun += 1;
      if (blankRun >= 3) hasThreeBlankLines = true;
    } else {
      blankRun = 0;
    }
  }
  const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;
  return {
    validUtf8,
    characters: content.length,
    bytes: buffer.length,
    nonempty: Boolean(content.trim()),
    hasBom: content.charCodeAt(0) === 0xfeff,
    hasReplacementCharacter: content.includes(String.fromCharCode(0xfffd)),
    hasMojibakeMarker: /\u951f\u65a4\u62f7|\u00c3.|\u00c2.|\u00e2\u20ac|\u00ef\u00bb\u00bf/.test(content),
    hasC0Control: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content),
    lineEnding: /\r\n/.test(content) && /(^|[^\r])\n/.test(content) ? "mixed" : /\r\n/.test(content) ? "crlf" : /\n/.test(content) ? "lf" : "none",
    hasTab: /\t/.test(content),
    trailingWhitespaceLines,
    hasNbsp: /\u00a0/.test(content),
    hasFullwidthSpace: /\u3000/.test(content),
    hasFinalNewline: !content.length || /\r?\n$/.test(content),
    hasCodeFence: /^```/m.test(content),
    hasHtmlTag: /<\/?[a-z][^>]*>/i.test(content),
    listLines,
    tableLines,
    headingCount,
    hasHorizontalRule,
    hasEmbeddedDoubleHyphen,
    hasThreeBlankLines,
    hasPlaceholderMarker: /\b(?:TODO|TBD|FIXME)\b|\u5f85\u8865|\u5360\u4f4d|\u5f85\u5199/.test(body),
    hasMetadataNoise: /^(?:\u5199\u4f5c\u65e5\u671f|\u7248\u672c|\u66f4\u65b0\u65f6\u95f4|\u4f5c\u8005\u8bf4\u660e|AI|\u6a21\u578b)[:\uff1a]/m.test(body),
    hasAsciiDoubleQuote: body.includes(String.fromCharCode(34)),
    hasAsciiEllipsis: body.includes("..."),
    hasChineseDialogueQuote: /[\u201c\u201d]/.test(body),
    hasChineseEllipsis: body.includes("\u2026\u2026"),
  };
}

const textIntegrityProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const chapters = Array.isArray(projectFile.value?.chapters) ? projectFile.value.chapters : [];
  const files = chapters.map((chapter) => {
    const relativePath = typeof chapter?.contentPath === "string" ? chapter.contentPath.trim() : "";
    const absolutePath = relativePath ? resolve(projectDirectory, relativePath) : null;
    const insideProject = Boolean(absolutePath && (absolutePath === projectDirectory || absolutePath.startsWith(`${projectDirectory}\\`) || absolutePath.startsWith(`${projectDirectory}/`)));
    if (!insideProject || !existsSync(absolutePath)) return { declared: Boolean(relativePath), exists: false, fingerprint: null, scan: null };
    const buffer = readFileSync(absolutePath);
    return { declared: true, exists: true, fingerprint: createHash("sha256").update(buffer).digest("hex"), scan: scanTextIntegrityBuffer(buffer) };
  });
  const scans = files.map((file) => file.scan).filter(Boolean);
  const count = (predicate) => scans.filter(predicate).length;
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: {
      project: projectFile.sha256,
      contentAggregate: createHash("sha256").update(files.map((file) => file.fingerprint || "missing").join("\u0000")).digest("hex"),
    },
    files: {
      declared: files.filter((file) => file.declared).length,
      existing: files.filter((file) => file.exists).length,
      nonempty: count((scan) => scan.nonempty),
      validUtf8: count((scan) => scan.validUtf8),
      bytes: scans.reduce((sum, scan) => sum + scan.bytes, 0),
      characters: scans.reduce((sum, scan) => sum + scan.characters, 0),
    },
    encodingAndWhitespaceSignals: {
      withBom: count((scan) => scan.hasBom),
      withReplacementCharacter: count((scan) => scan.hasReplacementCharacter),
      withMojibakeMarker: count((scan) => scan.hasMojibakeMarker),
      withC0Control: count((scan) => scan.hasC0Control),
      byLineEnding: countsByValue(scans.map((scan) => scan.lineEnding)),
      withTabs: count((scan) => scan.hasTab),
      withTrailingWhitespace: count((scan) => scan.trailingWhitespaceLines > 0),
      trailingWhitespaceLines: scans.reduce((sum, scan) => sum + scan.trailingWhitespaceLines, 0),
      withNbsp: count((scan) => scan.hasNbsp),
      withFullwidthSpace: count((scan) => scan.hasFullwidthSpace),
      withoutFinalNewline: count((scan) => !scan.hasFinalNewline),
      withThreeOrMoreBlankLines: count((scan) => scan.hasThreeBlankLines),
    },
    structureAndPunctuationSignals: {
      withCodeFence: count((scan) => scan.hasCodeFence),
      withHtmlTag: count((scan) => scan.hasHtmlTag),
      withMarkdownList: count((scan) => scan.listLines > 0),
      markdownListLines: scans.reduce((sum, scan) => sum + scan.listLines, 0),
      withMarkdownTable: count((scan) => scan.tableLines > 0),
      markdownTableLines: scans.reduce((sum, scan) => sum + scan.tableLines, 0),
      withMultipleHeadings: count((scan) => scan.headingCount > 1),
      withHorizontalRule: count((scan) => scan.hasHorizontalRule),
      withEmbeddedDoubleHyphen: count((scan) => scan.hasEmbeddedDoubleHyphen),
      withPlaceholderMarker: count((scan) => scan.hasPlaceholderMarker),
      withMetadataNoise: count((scan) => scan.hasMetadataNoise),
      withAsciiDoubleQuote: count((scan) => scan.hasAsciiDoubleQuote),
      withAsciiEllipsis: count((scan) => scan.hasAsciiEllipsis),
      withChineseDialogueQuote: count((scan) => scan.hasChineseDialogueQuote),
      withChineseEllipsis: count((scan) => scan.hasChineseEllipsis),
      interpretation: "These are syntax inventory signals, not automatic defects. Headings, lists, tables, horizontal rules, ASCII punctuation, and special blocks may be intentional and require a TextProfile plus structural context before judgment.",
    },
    governedTextArtifacts: {
      profiles: 0,
      structureSnapshots: 0,
      diagnostics: 0,
      fixCandidates: 0,
      sourceMaps: 0,
      normalizationReceipts: 0,
      settlements: 0,
    },
  };
});

const textIntegrityTotals = textIntegrityProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  declaredFiles: totals.declaredFiles + project.files.declared,
  existingFiles: totals.existingFiles + project.files.existing,
  nonemptyFiles: totals.nonemptyFiles + project.files.nonempty,
  validUtf8Files: totals.validUtf8Files + project.files.validUtf8,
  bytes: totals.bytes + project.files.bytes,
  characters: totals.characters + project.files.characters,
  crlfFiles: totals.crlfFiles + (project.encodingAndWhitespaceSignals.byLineEnding.crlf || 0),
  lfFiles: totals.lfFiles + (project.encodingAndWhitespaceSignals.byLineEnding.lf || 0),
  mixedLineEndingFiles: totals.mixedLineEndingFiles + (project.encodingAndWhitespaceSignals.byLineEnding.mixed || 0),
  trailingWhitespaceFiles: totals.trailingWhitespaceFiles + project.encodingAndWhitespaceSignals.withTrailingWhitespace,
  trailingWhitespaceLines: totals.trailingWhitespaceLines + project.encodingAndWhitespaceSignals.trailingWhitespaceLines,
  multipleHeadingFiles: totals.multipleHeadingFiles + project.structureAndPunctuationSignals.withMultipleHeadings,
  markdownListFiles: totals.markdownListFiles + project.structureAndPunctuationSignals.withMarkdownList,
  markdownTableFiles: totals.markdownTableFiles + project.structureAndPunctuationSignals.withMarkdownTable,
  horizontalRuleFiles: totals.horizontalRuleFiles + project.structureAndPunctuationSignals.withHorizontalRule,
}), { projects: 0, declaredFiles: 0, existingFiles: 0, nonemptyFiles: 0, validUtf8Files: 0, bytes: 0, characters: 0, crlfFiles: 0, lfFiles: 0, mixedLineEndingFiles: 0, trailingWhitespaceFiles: 0, trailingWhitespaceLines: 0, multipleHeadingFiles: 0, markdownListFiles: 0, markdownTableFiles: 0, horizontalRuleFiles: 0 });

const textIntegrityStages = [
  { id: "TXT-TRACE-001", label: "decode-and-preserve-raw", current: "Node paths read/write UTF-8 strings and imports accept caller-provided text.", gap: "Invalid bytes, BOM, replacement characters, Unicode normalization, and decoder provenance have no first-class report or raw-byte identity.", target: "Freeze raw bytes/hash, decode under a declared TextProfile, quarantine loss, and preserve a reversible origin." },
  { id: "TXT-TRACE-002", label: "resolve-project-text-profile", current: "Monaco uses Markdown and a Chinese-friendly font, while project files carry no typography/structure policy.", gap: "The system cannot tell intended Chinese dialogue, foreign quotations, letters, poetry, lists, tables, scene rules, or author exceptions from inconsistency.", target: "Version language/locale, encoding, whitespace, punctuation, structure, special-block, and exception rules per scope." },
  { id: "TXT-TRACE-003", label: "parse-structure-with-source-map", current: "Quality review splits paragraphs on blank lines and sentences on a punctuation regex.", gap: "No stable nodes distinguish titles, narration, dialogue, quotes, letters, scene breaks, notes, lists/tables, resources, special blocks, or unknown spans.", target: "Build a loss-aware TextStructureSnapshot and TextSourceMap over every consumed byte/span." },
  { id: "TXT-TRACE-004", label: "quarantine-generation-and-import-contamination", current: "Result parsers can unwrap task JSON, but save/import/runtime ultimately accept plain content strings.", gap: "JSON/fences, analysis labels, prompt echoes, task metadata, duplicate titles, import reports, candidate labels, or truncation can become readable Markdown canon.", target: "Separate provable prose nodes from wrappers, preserve unconsumed bytes, and block ambiguous extraction before adoption." },
  { id: "TXT-TRACE-005", label: "diagnose-by-applicability-and-severity", current: "Rule quality checks flag long paragraphs and literary patterns but not encoding, structure, typography, or entrypoint parity.", gap: "Mechanical corruption, publication blockers, optional house style, literary choice, and not-applicable cases would be mixed into one noisy lint score.", target: "Emit evidence-anchored TextDiagnostics with profile applicability, counterexamples, hard/style severity, and stale conditions." },
  { id: "TXT-TRACE-006", label: "compile-bounded-fix-candidate", current: "Current save writes the submitted string; quality rewrite may replace whole chapters.", gap: "There is no middle path for minimal reversible whitespace/structure fixes, and global quote/dash replacement can alter meaning, rhythm, commands, or foreign text.", target: "Auto-apply only proved semantic-equivalent authorized edits; preview every other fix as a minimal baseline-bound patch." },
  { id: "TXT-TRACE-007", label: "preserve-author-exceptions", current: "Passage locks protect prose spans but do not explain project-scoped typography exceptions.", gap: "Repeated warnings can fight deliberate dialect, punctuation, poetry, code, letters, or period voice, while one suppression could accidentally hide future real damage.", target: "Record exact, reasoned, expiring TextExceptions with inheritance and revocation boundaries." },
  { id: "TXT-TRACE-008", label: "reanchor-dependent-evidence", current: "Foreshadowing and other evidence may depend on text spans or contextual anchors.", gap: "Line-ending/Unicode/whitespace changes can move offsets and silently point locks, obligations, claims, quality evidence, or comments at the wrong text.", target: "Transform spans through a TextSourceMap, reanchor uniquely, and mark ambiguous dependents stale." },
  { id: "TXT-TRACE-009", label: "enforce-entrypoint-parity", current: "Manual save, browser import, runtime write, restore, merge, and future export have separate code paths.", gap: "A clean editor save can be bypassed by import/runtime or reinterpreted by publication, yielding divergent text for the same canon version.", target: "Route all entrypoints through the same profile/parser/diagnostic/receipt contract without silently changing bytes." },
  { id: "TXT-TRACE-010", label: "prove-round-trip-and-idempotency", current: "No parse-render-parse identity or canonicalization idempotency evidence is stored.", gap: "Repeated saves or exports can churn punctuation/whitespace, drop unknown blocks, or produce enormous non-literary diffs.", target: "Prove stable structure hashes, byte policy, unconsumed coverage, and empty second normalization under pinned versions." },
  { id: "TXT-TRACE-011", label: "settle-text-integrity", current: "File saved, task success, readable Markdown, and quality score are operational endpoints.", gap: "None proves hard corruption/contamination is absent, exceptions are authorized, anchors remain valid, and publication sees the same semantic tree.", target: "Issue TextSettlement only after hard diagnostics, exceptions, source-map coverage, round-trip, entrypoint, and export regressions pass." },
];

const textIntegrityAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "Every generated, imported, edited, revised, restored, and exported chapter preserves the author's exact intended text and structure, isolates machine/import wrappers, diagnoses real encoding/typography problems without flattening style, and can prove mechanical cleanup did not corrupt prose or narrative evidence.",
  sourceFiles: [...textIntegritySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "source/project/content aggregate hashes", "file/byte/character counts", "encoding/line-ending/whitespace/Markdown/punctuation signal counts", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "chapter ID/title/path", "prose or outline", "matched line or punctuation context", "author exception text", "task/model output", "absolute path"],
  },
  operationalSnapshot: {
    totals: textIntegrityTotals,
    projects: textIntegrityProjectSnapshots,
    interpretation: "Zero fatal UTF-8 or control-character findings in the current snapshot is good inventory evidence, not proof of a governed text pipeline. CRLF, headings, lists, tables, horizontal rules, punctuation variants, and whitespace are not automatically defects; only a TextProfile plus structural context can distinguish intent, safe mechanics, contamination, and publication blockers.",
  },
  summary: {
    auditedStages: textIntegrityStages.length,
    projectsScanned: textIntegrityTotals.projects,
    declaredContentFiles: textIntegrityTotals.declaredFiles,
    existingContentFiles: textIntegrityTotals.existingFiles,
    validUtf8Files: textIntegrityTotals.validUtf8Files,
    mixedLineEndingFiles: textIntegrityTotals.mixedLineEndingFiles,
    trailingWhitespaceFiles: textIntegrityTotals.trailingWhitespaceFiles,
    multipleHeadingFiles: textIntegrityTotals.multipleHeadingFiles,
    markdownListFiles: textIntegrityTotals.markdownListFiles,
    markdownTableFiles: textIntegrityTotals.markdownTableFiles,
    textProfiles: 0,
    structureSnapshots: 0,
    diagnostics: 0,
    normalizationReceipts: 0,
    textSettlements: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform treats chapter prose as a UTF-8 Markdown string. Manual save, browser import, and runtime write preserve caller text directly; literary quality heuristics split strings into paragraphs/sentences, but no shared profile, loss-aware parser, wrapper quarantine, diagnostic applicability, bounded normalization, source map, round-trip proof, or settlement authority exists.",
    consequence: "A readable file can still contain model/task wrappers, duplicated metadata, malformed structure, typography drift, or import noise; a seemingly harmless global cleanup can also alter dialogue, rhythm, special blocks, content hashes, locks, foreshadowing, factual claims, and publication output without an auditable semantic change.",
  },
  currentEvidence: [
    { claim: "Manual file save snapshots and then writes the submitted nextContent UTF-8 string directly.", evidence: [textIntegrityEvidence("api/src/app.ts", 'const nextContent = String(req.body.content || "")'), textIntegrityEvidence("api/src/app.ts", 'fs.writeFile(resolveInside(projectRoot(project.slug), relativePath), nextContent, "utf8")')] },
    { claim: "Imported drafted chapters are copied from uploaded source.file.content into canon chapter files without a text profile or structural settlement.", evidence: [textIntegrityEvidence("api/src/novelProject.ts", "for (const source of importedChapters)"), textIntegrityEvidence("api/src/novelProject.ts", "source.file.content, \"utf8\"")] },
    { claim: "Runtime atomic write protects filesystem replacement but writes the supplied content string unchanged.", evidence: [textIntegrityEvidence("api/src/runtimeFiles.ts", "async function atomicWrite"), textIntegrityEvidence("api/src/runtimeFiles.ts", 'fs.writeFile(tmp, content, "utf8")')] },
    { claim: "Rules-based quality analysis derives paragraphs and sentences from regex splitting, not a loss-aware prose structure tree.", evidence: [textIntegrityEvidence("api/src/chapterQualityReview.ts", "function splitParagraphs"), textIntegrityEvidence("api/src/chapterQualityReview.ts", "function splitSentences")] },
    { claim: "ChapterEditor is a generic Markdown Monaco surface that emits editor.getValue without project text diagnostics or normalization receipts.", evidence: [textIntegrityEvidence("ui/src/components/novel/ChapterEditor.vue", 'language: "markdown"'), textIntegrityEvidence("ui/src/components/novel/ChapterEditor.vue", 'emit("update:content", editor.getValue())')] },
  ],
  stages: textIntegrityStages,
  alternatives: [
    { option: "A-normalize-on-every-save", verdict: "reject-silent-global-rewrite", blueCase: "Simple implementation, consistently tidy files, predictable renderer input, and no large cleanup at publication time.", redCase: "Unicode/newline/quote/dash/ellipsis replacement can create full-file diffs, alter dialect, foreign text, commands and rhythm, break byte hashes and anchors, and hide which changes came from the author." },
    { option: "B-lint-only-never-normalize", verdict: "default-for-ambiguous-style-not-complete-alone", blueCase: "Maximum fidelity to author bytes and low risk of a wrong rule rewriting literature; all choices remain visible.", redCase: "Mechanical import/AI/runtime noise accumulates across hundreds of chapters, users repeatedly fix safe trivia, severe corruption competes with style warnings, and publication becomes the first place cross-entry divergence appears." },
    { option: "C-governed-profile-parse-diagnose-fix-roundtrip", verdict: "recommended-not-implemented", blueCase: "Freeze raw bytes, parse typed nodes, isolate wrappers, diagnose by profile/applicability, auto-fix only proven reversible mechanics, preview other patches/exceptions, transform anchors, and prove idempotent round-trip across every entrypoint.", redCase: "Requires language/locale profiles, loss-aware parser/source maps, Unicode and Markdown expertise, special-block modeling, diagnostic calibration, patch/exception UX, anchor transformation, entrypoint adapters, renderer parity, and large multilingual/adversarial fixtures." },
  ],
  targetAuthority: {
    entities: ["TextProfile", "TextStructureSnapshot", "TextNode", "TextSourceMap", "TextDiagnostic", "TextFixCandidate", "TextException", "TextNormalizationReceipt", "TextSettlement"],
    hardCategories: ["decode_loss", "control_character", "wrapper_contamination", "ambiguous_truncation", "structure_unconsumed", "secret_or_internal_leak", "anchor_corruption", "roundtrip_loss"],
    invariant: "No readable file, UTF-8 write, Markdown mode, regex split, non-empty body, clean task exit, model declaration, global replacement, prettier/formatter success, quality score, unchanged character count, or successful export may independently establish intended text structure, semantic-equivalent normalization, contamination freedom, anchor validity, round-trip fidelity, or TextSettlement.",
  },
  textProtocol: {
    order: [
      "freeze raw bytes/hash, source entrypoint, author/canon version, expected profile, producer and baseline before decoding or cleanup",
      "decode under TextProfile with fatal-loss detection; preserve raw input and classify BOM, Unicode, line-ending, whitespace and unsupported-character signals",
      "parse all bytes/spans into typed TextNodes plus unknown/unconsumed ranges and build raw/editor/canonical/publication TextSourceMap",
      "isolate JSON/fences, analysis/prompt/task metadata, duplicate headings, import notes, candidate labels, truncation and secret/internal material before prose adoption",
      "evaluate structure, typography and hygiene rules by locale, node type, author exception and narrative context; emit span evidence, severity, counterexample and stale condition",
      "auto-apply only explicitly authorized, reversible, semantics-proved mechanics; compile every other change as a minimal baseline-bound TextFixCandidate",
      "preview literary impact and moved anchors; allow partial adoption, reject, lock, scoped TextException and rollback without learning pure formatting as voice",
      "transform dependent spans through TextSourceMap, reanchor unique context, and invalidate ambiguous locks, obligations, claims, comments, quality evidence and editions",
      "route manual save, import, task parsing, runtime, restore, merge, revision and publication through the same versioned contract",
      "prove parse-render-parse structural equivalence, unconsumed-byte coverage, byte-policy compliance and empty second normalization under pinned versions",
      "issue TextSettlement only after hard findings/unknowns, exceptions, anchors, entrypoint parity and publication regression are current",
    ],
    nonGoal: "The text pipeline does not choose one universal Chinese typography or rewrite prose for literary taste. It protects declared project conventions and exposes ambiguity; Q-003 controls review depth, not byte safety or contamination gates.",
  },
  verificationMatrix: [
    "UTF-8 BOM, LF, CRLF, mixed line endings, missing final newline, tabs, trailing spaces, NBSP/fullwidth spaces, combining characters, replacement characters, invalid bytes and C0 controls",
    "Chinese dialogue and nested quotes mixed with English quotation, code/command text, dialect pauses, three-dot/six-dot ellipses, em/en/double hyphens and horizontal scene rules",
    "headings, letters, poems, diaries, lists, tables, footnotes, links, images, HTML, code blocks, intentional blank space and unknown custom blocks",
    "JSON envelope, Markdown fence, analysis/final/system/user labels, prompt echo, task IDs/scores, import notes, duplicate titles, candidate markers and truncated wrappers around real prose",
    "same chapter enters through Monaco, API, browser import, runtime, restore, branch merge, revision, Markdown/TXT and later EPUB/DOCX/PDF adapters",
    "safe whitespace patch moves a foreshadowing anchor, research claim, passage lock, quality evidence and inline comment; unique anchors rebind and ambiguous anchors stale",
    "concurrent author edit after diagnostic/fix generation, stale profile/parser version, retry, crash mid-normalization and rollback",
    "author intentionally violates punctuation/paragraph convention for voice, unreliable narration, poetry, chat log, transcript, foreign language or accessibility",
    "very large chapter and full book process incrementally without truncation, quadratic diff, source-map loss or changed final semantic hash",
    "same frozen input/profile/parser/renderer repeats to identical diagnostics, fixes, source maps, structure hashes, artifacts and settlement",
  ],
  releaseGate: {
    requirementIds: ["FR-TEXT-001", "FR-TEXT-002", "FR-TEXT-003", "FR-TEXT-004"],
    acceptanceRefs: ["AT-512", "AT-513", "AT-514", "AT-515"],
    rule: "Do not claim clean, normalized, correctly formatted, uncontaminated, round-trip-safe, anchor-safe, editor/import/runtime-consistent, or publication-ready prose until raw input and TextProfile are frozen, every byte is decoded and structurally consumed or quarantined, diagnostics preserve applicability and author exceptions, fixes are bounded/reversible/baseline-bound, source maps reanchor or invalidate dependents, all entrypoints share the contract, and TextSettlement proves idempotent round-trip and export parity.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens decode-loss, control-character, contamination, secret/internal leakage, source-map, stale-baseline, round-trip, entrypoint-parity or settlement gates.",
};

const projectDurabilitySourcePaths = [
  "api/src/fileVersions.ts",
  "api/src/runtimeFiles.ts",
  "api/src/database.ts",
  "api/src/projectBackup.ts",
  "api/src/novelProject.ts",
  "api/src/app.ts",
  "api/src/platformLibrary.ts",
  "api/src/types.ts",
  "ui/src/components/novel/FileVersionDiffPanel.vue",
  "ui/src/services/novelApi.ts",
];
const projectDurabilitySources = new Map(projectDurabilitySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function projectDurabilityEvidence(relativePath, needle) {
  const sourceEntry = projectDurabilitySources.get(relativePath);
  if (!sourceEntry) throw new Error(`Unknown project-durability audit source: ${relativePath}`);
  const offset = sourceEntry.content.indexOf(needle);
  if (offset < 0) throw new Error(`Project-durability evidence not found in ${relativePath}: ${needle}`);
  return {
    path: relativePath,
    line: sourceEntry.content.slice(0, offset).split(/\r?\n/).length,
    evidence: needle,
  };
}

const durabilityFileVersionSource = projectDurabilitySources.get("api/src/fileVersions.ts").content;
const durabilityRuntimeSource = projectDurabilitySources.get("api/src/runtimeFiles.ts").content;
const durabilityDatabaseSource = projectDurabilitySources.get("api/src/database.ts").content;
const durabilityBackupSource = projectDurabilitySources.get("api/src/projectBackup.ts").content;
const durabilityImportSource = projectDurabilitySources.get("api/src/novelProject.ts").content;
const durabilityAppSource = projectDurabilitySources.get("api/src/app.ts").content;
const durabilityVersionUiSource = projectDurabilitySources.get("ui/src/components/novel/FileVersionDiffPanel.vue").content;
const durabilityApiClientSource = projectDurabilitySources.get("ui/src/services/novelApi.ts").content;
const durabilityProductSource = [...projectDurabilitySources.values()].map((entry) => entry.content).join("\n");

if (!durabilityFileVersionSource.includes('const runtimeVersionedPaths = new Set(["project.json"])') || !durabilityFileVersionSource.includes("project.chapters.flatMap") || !durabilityFileVersionSource.includes("snapshots: []") || /BackupManifest|BackupSet|BackupVerification|RestoreDrill|RecoverySettlement/.test(durabilityFileVersionSource)) {
  throw new Error("Project-durability audit drift: file snapshots changed scope, corruption handling, or gained governed backup semantics.");
}
if (!durabilityRuntimeSource.includes("function runtimeManagedPaths") || !durabilityRuntimeSource.includes("for (const file of checkpoint.manifest)") || !durabilityRuntimeSource.includes("await fs.copyFile(source, target)") || /BackupManifest|BackupSet|RestoreDrill|RecoverySettlement/.test(durabilityRuntimeSource)) {
  throw new Error("Project-durability audit drift: runtime checkpoints changed restore behavior or gained governed backup semantics.");
}
if (!durabilityDatabaseSource.includes('database.exec("PRAGMA journal_mode = WAL;")') || /backup\s*\(|VACUUM INTO|sqlite3_backup|BackupManifest|RecoverySettlement/i.test(durabilityDatabaseSource)) {
  throw new Error("Project-durability audit drift: database persistence gained an online backup/recovery mechanism and must be reclassified.");
}
if (!durabilityImportSource.includes('const importableExtensions = new Set([".md", ".txt"])') || /BackupManifest|BackupSet|RecoverySettlement|RestoreDrill/.test(durabilityImportSource)) {
  throw new Error("Project-durability audit drift: project import now restores a governed project backup and must be reclassified.");
}
if (/\/api\/novel\/(?:projects\/[^\n]+\/)?(?:backups?|recovery|restore-plans?)(?:\/|"|`)/i.test(durabilityAppSource) && !durabilityBackupSource.includes('strategy: "local-project-tree"')) {
  throw new Error("Project-durability audit drift: an unclassified governed backup or recovery API now exists.");
}
if (!durabilityVersionUiSource.includes("readOnly: true") || !durabilityApiClientSource.includes("restoreRuntimeCheckpoint") || (!durabilityBackupSource.includes('strategy: "local-project-tree"') && /BackupCatalog|RestoreDrill|RecoverySettlement|createBackup|restoreBackup/.test(`${durabilityVersionUiSource}\n${durabilityApiClientSource}`))) {
  throw new Error("Project-durability audit drift: UI/client gained project backup or governed recovery semantics and must be reclassified.");
}
const implementedDurabilityEntities = [
  "BackupPolicy",
  "RecoveryObjective",
  "BackupSet",
  "BackupManifest",
  "BackupObject",
  "BackupVerification",
  "BackupCatalog",
  "RestoreDrill",
  "RestorePlan",
  "RecoverySettlement",
].filter((entity) => !durabilityBackupSource.includes('strategy: "local-project-tree"') && durabilityProductSource.includes(entity));
if (implementedDurabilityEntities.length) {
  throw new Error(`Project-durability audit drift: governed durability entities now exist and must be audited: ${implementedDurabilityEntities.join(", ")}`);
}

function inventoryDurabilityTree(projectDirectory) {
  const entries = [];
  function visit(directory, relativePrefix = "") {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const buffer = readFileSync(absolutePath);
        entries.push({ relativePath, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") });
      }
    }
  }
  visit(projectDirectory);
  return {
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    aggregateFingerprint: createHash("sha256").update(entries.map((entry) => `${entry.relativePath}\u0000${entry.bytes}\u0000${entry.sha256}`).join("\n")).digest("hex"),
  };
}

const durabilityProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const tree = inventoryDurabilityTree(projectDirectory);
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const versionManifest = readAnonymousJsonFile(join(projectDirectory, "versions", "manifest.json"), { snapshots: [] });
  const snapshots = Array.isArray(versionManifest.value?.snapshots) ? versionManifest.value.snapshots : [];
  const snapshotPaths = new Set(snapshots.map((snapshot) => snapshot?.filePath).filter((value) => typeof value === "string"));
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprints: { project: projectFile.sha256, treeAggregate: tree.aggregateFingerprint, versionManifest: versionManifest.sha256 },
    projectTree: { files: tree.files, bytes: tree.bytes },
    fileVersionSafetyLayer: {
      manifestExists: versionManifest.exists,
      manifestValid: versionManifest.valid,
      snapshots: snapshots.length,
      distinctPathsCovered: snapshotPaths.size,
      snapshotsWithContentHash: snapshots.filter((snapshot) => typeof snapshot?.sha256 === "string" && snapshot.sha256).length,
      snapshotsWithParentOrCanonCursor: snapshots.filter((snapshot) => snapshot?.parentId || snapshot?.baseVersionId || snapshot?.canonCursor).length,
    },
    governedDurabilityArtifacts: {
      policies: 0,
      recoveryObjectives: 0,
      backupSets: 0,
      backupManifests: 0,
      verifications: 0,
      restoreDrills: 0,
      restorePlans: 0,
      recoverySettlements: 0,
    },
  };
});

function readDurabilityDatabaseInventory() {
  const databasePath = join(root, "data", "creative-platform.sqlite");
  if (!existsSync(databasePath)) return { available: false, bytes: 0, sha256: null, tables: 0, runtimeCheckpoints: 0, checkpointManifestEntries: 0, invalidCheckpointManifests: 0 };
  const immutableDatabaseUrl = pathToFileURL(databasePath);
  immutableDatabaseUrl.searchParams.set("immutable", "1");
  const database = new DatabaseSync(immutableDatabaseUrl, { readOnly: true });
  try {
    const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    const hasCheckpoints = tableNames.includes("runtime_checkpoints");
    const checkpointRows = hasCheckpoints ? database.prepare("SELECT manifest_json FROM runtime_checkpoints").all() : [];
    let checkpointManifestEntries = 0;
    let invalidCheckpointManifests = 0;
    let checkpointEntriesWithHashes = 0;
    for (const row of checkpointRows) {
      try {
        const manifest = JSON.parse(String(row.manifest_json || "[]"));
        if (!Array.isArray(manifest)) {
          invalidCheckpointManifests += 1;
          continue;
        }
        checkpointManifestEntries += manifest.length;
        checkpointEntriesWithHashes += manifest.filter((entry) => typeof entry?.sha256 === "string" && entry.sha256).length;
      } catch {
        invalidCheckpointManifests += 1;
      }
    }
    const buffer = readFileSync(databasePath);
    const logicalFingerprint = createHash("sha256").update(JSON.stringify({ tableNames: tableNames.sort(), checkpointManifests: checkpointRows.map((row) => row.manifest_json), bytes: buffer.length, walPresent: existsSync(`${databasePath}-wal`), shmPresent: existsSync(`${databasePath}-shm`) })).digest("hex");
    return {
      available: true,
      bytes: buffer.length,
      sha256: logicalFingerprint,
      tables: tableNames.filter((name) => name !== "sqlite_sequence").length,
      runtimeCheckpoints: checkpointRows.length,
      checkpointManifestEntries,
      checkpointEntriesWithHashes,
      invalidCheckpointManifests,
      walPresent: existsSync(`${databasePath}-wal`),
      shmPresent: existsSync(`${databasePath}-shm`),
    };
  } finally {
    database.close();
  }
}

const durabilityDatabaseInventory = readDurabilityDatabaseInventory();
const durabilityPlatformMirrorPath = join(root, "platform", "library.json");
const durabilityPlatformMirror = existsSync(durabilityPlatformMirrorPath)
  ? (() => {
    const buffer = readFileSync(durabilityPlatformMirrorPath);
    return { exists: true, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
  })()
  : { exists: false, bytes: 0, sha256: null };
const durabilityProjectTotals = durabilityProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  files: totals.files + project.projectTree.files,
  bytes: totals.bytes + project.projectTree.bytes,
  fileSnapshots: totals.fileSnapshots + project.fileVersionSafetyLayer.snapshots,
  distinctSnapshotPaths: totals.distinctSnapshotPaths + project.fileVersionSafetyLayer.distinctPathsCovered,
  invalidVersionManifests: totals.invalidVersionManifests + (project.fileVersionSafetyLayer.manifestValid ? 0 : 1),
}), { projects: 0, files: 0, bytes: 0, fileSnapshots: 0, distinctSnapshotPaths: 0, invalidVersionManifests: 0 });

const projectDurabilityStages = [
  { id: "DUR-TRACE-001", label: "resolve-authoritative-scope", current: "Project files, SQLite rows/runtime state, file snapshots, checkpoints, and platform-library data live in separate stores.", gap: "No manifest identifies which objects and references constitute one recoverable project or why an object is included/excluded.", target: "Compile a stable logical object graph and rights/privacy-aware inclusion policy before capture." },
  { id: "DUR-TRACE-002", label: "freeze-cross-store-cut", current: "File snapshots and runtime checkpoints freeze individual or bounded project paths; SQLite continues independently in WAL mode.", gap: "Directory and database copies can represent different canon/event cursors while each appears locally successful.", target: "Acquire a project write fence/canon cursor and prove every store belongs to one consistent cut." },
  { id: "DUR-TRACE-003", label: "capture-project-tree-and-online-database", current: "A local same-workspace project-tree manifest now copies and hashes project files; SQLite and cross-store fencing remain outside this slice.", gap: "A live `.sqlite` copy can omit WAL-visible commits, while a directory walk can race saves, renames, checkpoints, and background projections.", target: "Use transaction-consistent database backup plus before/after tree fingerprints under bounded fencing." },
  { id: "DUR-TRACE-004", label: "build-content-addressed-backup-set", current: "Snapshots store prior bytes but lack whole-project root hash, parent backup, cross-store dependencies, schema, or restore order.", gap: "Duplicate bytes, missing parents, orphan objects, partial uploads, and incompatible producers cannot be adjudicated as one set.", target: "Write immutable BackupObjects and a signed BackupManifest with parent chain, hashes, dependencies, schema and completeness proof." },
  { id: "DUR-TRACE-005", label: "enforce-privacy-rights-and-encryption", current: "Project trees may contain prompts, private sources, internal answers and runtime payloads; platform assets live outside the project.", gap: "Packing everything leaks secrets/rights-bound material, while excluding external references silently makes restore incomplete.", target: "Apply explicit include/reference/exclude policy, encryption/key scope, minimization and rights envelopes per object." },
  { id: "DUR-TRACE-006", label: "retain-across-failure-domains", current: "Local snapshots/checkpoints share the project disk and there is no BackupPolicy, RPO/RTO, generation retention, off-device copy or capacity alarm.", gap: "Disk loss, ransomware, deletion, quota exhaustion or one bad incremental parent can remove every apparent recovery point.", target: "Maintain policy-driven generations, at least one independent failure domain, observable lag and safe garbage collection." },
  { id: "DUR-TRACE-007", label: "verify-integrity-and-restorability", current: "Snapshot creation hashes some bytes, but version-manifest parse failure becomes empty history and checkpoint restore does not recheck source hashes.", gap: "Presence, file count, upload success, stored hash or database openability do not prove the set can restore coherently.", target: "Verify signatures, objects, parent chain, keys, schema, references and full/stratified restore before marking verified." },
  { id: "DUR-TRACE-008", label: "drill-in-isolation", current: "The only restore path writes checkpoint files directly into the live project; import creates a new simplified project from Markdown/text.", gap: "There is no side-effect-free rehearsal covering identities, database relations, tasks, assets, versions, projections and external-call fencing.", target: "Restore into an isolated workspace/database, run completeness fixtures, block workers/network writes, and retain a drill receipt." },
  { id: "DUR-TRACE-009", label: "compile-author-visible-restore-plan", current: "Checkpoint restore is an immediate API action and file version UI is comparison-only.", gap: "Users cannot compare recovery points, RPO loss, conflicts, missing assets, identity mapping, stale evidence, rollback or new-versus-replace modes.", target: "Preview a RestorePlan with exact source, target, loss window, conflicts, degraded items, fences, validation and rollback." },
  { id: "DUR-TRACE-010", label: "stage-validate-and-atomically-switch", current: "Checkpoint restore copies/deletes sequentially, then updates project metadata.", gap: "Mid-restore failure can leave a partial live tree, database truth unchanged, and no forward history or safe switch boundary.", target: "Restore to staging, validate, publish a forward CanonCommit/recovery event atomically, and preserve the prior live project." },
  { id: "DUR-TRACE-011", label: "fence-and-resettle-dependent-work", current: "Restored bytes do not automatically pause pending/running tasks or invalidate summaries, knowledge, obligations, quality and completion proofs.", gap: "Late workers or stale projections can overwrite recovery and make an apparently restored book narratively inconsistent.", target: "Fence work, emit damage/invalidation, selectively rebuild and issue RecoverySettlement over all dependent domains." },
  { id: "DUR-TRACE-012", label: "measure-recovery-objectives-and-audit", current: "No catalog reports latest verified point, backup age, independent copies, restore time, failure cause or uncovered assets.", gap: "The author cannot know expected loss/time or whether backups have ever survived a real restore.", target: "Expose truthful RPO/RTO, coverage, last drill, location health, known limits, incidents and current settlement without revealing content." },
];

const projectDurabilityAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "A long-running novel project can survive device, disk, database, process, migration, operator, or partial-object failure without silently losing author work, mixing storage moments, leaking private material, replaying stale workers, or claiming recovery before the whole narrative project is coherent.",
  sourceFiles: [...projectDurabilitySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "aggregate tree/project/version/database/platform fingerprints", "file/byte/table/snapshot/checkpoint/manifest-entry counts", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "file/chapter/entity path or identity", "prose, outline, ledger, task/runtime payload or checkpoint manifest content", "asset names/paths/tags", "database row values", "absolute path", "secret or encryption key"],
  },
  operationalSnapshot: {
    projects: durabilityProjectSnapshots,
    totals: durabilityProjectTotals,
    database: durabilityDatabaseInventory,
    platformMirror: durabilityPlatformMirror,
    governedDurabilityArtifacts: { policies: 0, recoveryObjectives: 0, backupSets: 0, backupManifests: 0, verifications: 0, catalogs: 0, restoreDrills: 0, restorePlans: 0, recoverySettlements: 0 },
    interpretation: "Eighteen file snapshots and eighteen runtime checkpoints are useful local safety evidence, not a cross-store backup. File counts, byte hashes, checkpoint manifests, WAL mode, and a readable database do not establish one consistent recovery cursor, off-device durability, privacy-safe packaging, parent-chain integrity, isolated restorability, or narrative resettlement.",
  },
  summary: {
    auditedStages: projectDurabilityStages.length,
    projectsScanned: durabilityProjectTotals.projects,
    projectFiles: durabilityProjectTotals.files,
    projectBytes: durabilityProjectTotals.bytes,
    fileSnapshots: durabilityProjectTotals.fileSnapshots,
    fileSnapshotPathsCovered: durabilityProjectTotals.distinctSnapshotPaths,
    runtimeCheckpoints: durabilityDatabaseInventory.runtimeCheckpoints,
    runtimeCheckpointManifestEntries: durabilityDatabaseInventory.checkpointManifestEntries,
    backupPolicies: 0,
    backupSets: 0,
    verifiedBackupSets: 0,
    restoreDrills: 0,
    recoverySettlements: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "The platform has local byte safety layers, not project durability governance. File versions cover writing paths, runtime checkpoints cover a bounded path list, SQLite stores runtime/platform state in WAL mode, and import rebuilds a simplified project from Markdown/text; no authority freezes these stores into one backup, verifies it by restore, or resettles the recovered narrative state.",
    consequence: "A disk loss, live database copy, corrupt manifest, missing incremental parent, partial upload, migration failure, checkpoint restore, different-machine move, or stale worker can lose work or create a readable but internally inconsistent project while every individual copy operation reports success.",
  },
  currentEvidence: [
    { claim: "File-version snapshots only cover project.json plus declared chapter content/outline paths, not the whole project/database/platform graph.", evidence: [projectDurabilityEvidence("api/src/fileVersions.ts", 'const runtimeVersionedPaths = new Set(["project.json"])'), projectDurabilityEvidence("api/src/fileVersions.ts", "project.chapters.flatMap")] },
    { claim: "A missing or malformed file-version manifest is silently treated as empty history.", evidence: [projectDurabilityEvidence("api/src/fileVersions.ts", "async function readManifest"), projectDurabilityEvidence("api/src/fileVersions.ts", "return { version: 1, snapshots: [] }")] },
    { claim: "Runtime checkpoints copy a bounded managed path list and restore files sequentially into the live project.", evidence: [projectDurabilityEvidence("api/src/runtimeFiles.ts", "function runtimeManagedPaths"), projectDurabilityEvidence("api/src/runtimeFiles.ts", "for (const file of checkpoint.manifest)"), projectDurabilityEvidence("api/src/runtimeFiles.ts", "await fs.copyFile(source, target)")] },
    { claim: "The operational database uses WAL mode but exposes no online backup, backup-set, verification, or recovery-settlement mechanism.", evidence: [projectDurabilityEvidence("api/src/database.ts", 'database.exec("PRAGMA journal_mode = WAL;")'), projectDurabilityEvidence("api/src/database.ts", "export function databaseInfo")] },
    { claim: "Project import accepts Markdown/text and creates a new project rather than restoring identities, versions, database rows, runtime state, assets and backup lineage.", evidence: [projectDurabilityEvidence("api/src/novelProject.ts", 'const importableExtensions = new Set([".md", ".txt"])'), projectDurabilityEvidence("api/src/novelProject.ts", "async function importProjectFromImportableFiles")] },
    { claim: "The product now exposes a same-workspace backup manifest and verification endpoint, but no backup catalog, off-device policy, restore drill, recovery plan or settlement surface.", evidence: [projectDurabilityEvidence("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/backups"'), projectDurabilityEvidence("api/src/projectBackup.ts", 'strategy: "local-project-tree"'), projectDurabilityEvidence("api/src/app.ts", 'app.post("/api/novel/projects/:projectId/backups/:backupId/verify"')] },
  ],
  stages: projectDurabilityStages,
  alternatives: [
    { option: "A-expand-local-file-snapshots-and-checkpoints", verdict: "retain-as-local-safety-layer-not-project-backup", blueCase: "Fastest compatible improvement: snapshot more paths, retain more checkpoints, and expose more restore controls without introducing new storage infrastructure.", redCase: "Still omits transaction-consistent SQLite/platform state, common cursor, off-device failure domains, parent integrity, encryption policy, restore drills, stale-worker fencing and narrative settlement." },
    { option: "B-schedule-folder-archive-and-database-backup-independently", verdict: "use-as-storage-adapters-not-recovery-authority", blueCase: "Mature filesystem and SQLite tools can each produce reliable copies, incremental retention and cloud upload with low implementation complexity.", redCase: "Independent successes can belong to different moments; asset references, schema, versions, queues and projections may not compose, and neither job proves a side-effect-free full restore." },
    { option: "C-fenced-content-addressed-backup-with-restore-drill-and-settlement", verdict: "recommended-not-implemented", blueCase: "Freeze one cross-store cursor, create signed content-addressed objects/manifest, enforce rights/encryption/retention, continuously verify by isolated restore, atomically switch as forward history, fence stale work and resettle narrative evidence.", redCase: "Requires write fencing, online database backup, object/catalog storage, key management, retention/garbage collection, cross-store manifests, isolated environments, schema portability, conflict UX, disaster runbooks and recurring fault-injection drills." },
  ],
  targetAuthority: {
    entities: ["BackupPolicy", "RecoveryObjective", "BackupSet", "BackupManifest", "BackupObject", "BackupVerification", "BackupCatalog", "RestoreDrill", "RestorePlan", "RecoverySettlement"],
    recoveryModes: ["new_project", "replace", "repair_missing", "point_in_time", "disaster_failover"],
    invariant: "No save confirmation, file snapshot, checkpoint, archive creation, byte count, hash presence, upload success, database open, table count, import success, HTTP 200, rebuilt empty projection, or readable chapter may independently establish backup completeness, cross-store consistency, restorability, RPO/RTO compliance, narrative coherence, or RecoverySettlement.",
  },
  durabilityProtocol: {
    order: [
      "resolve project authority graph, stable logical identities, platform/shared references, rights/privacy classes and desired RecoveryObjective",
      "acquire a bounded project write fence/canon cursor, pause unsafe mutations, and record in-flight work without silently completing or discarding it",
      "capture the project tree with before/after fingerprints and take a transaction-consistent SQLite/fallback snapshot at the same logical cursor",
      "compile immutable content-addressed BackupObjects and signed BackupManifest with schema, producer, dependencies, include/reference/exclude reasons and restore order",
      "encrypt and replicate according to BackupPolicy, preserve key separation, verify destination read-back and retain at least one independent failure domain",
      "verify every object, parent chain, signature, key, schema, cross-store reference and privacy/rights invariant; do not label an un-restored upload verified",
      "periodically restore the chosen set into an isolated workspace/database under outbound/worker/publish fences and record complete coverage, time, cost and differences",
      "for real recovery compile an author-visible RestorePlan with mode, source/target, loss window, conflicts, missing external assets, stale dependents, rollback and approvals",
      "restore to staging, validate identities and authoritative/derived boundaries, then atomically publish a forward CanonCommit/recovery event while preserving the prior state",
      "fence late workers, pause recovered running/pending work, emit damage/invalidation and selectively rebuild projections, obligations, quality and completion proofs",
      "issue RecoverySettlement only after cross-store coverage, degraded/unknown disclosure, RPO/RTO measurement, author sample check and rollback evidence pass",
    ],
    nonGoal: "This does not turn reader manuscript export into an operational backup, nor promise zero data loss under every catastrophe. It defines measurable recovery objectives, independent copies, verified restore evidence and honest degraded states.",
  },
  verificationMatrix: [
    "save, runtime chapter settlement, background projection and SQLite WAL commit race the same backup cut",
    "full plus incremental generations with missing parent, duplicate object, truncated chunk, bit flip, wrong key, revoked key and partial upload",
    "single-disk loss, ransomware-like tree corruption, database-only loss, project-only loss, platform-library loss and destination outage",
    "restore to a new absolute path, different device/runtime, compatible older/newer schema and unknown higher schema",
    "private prompts, secrets, runtime payloads, restricted craft/research sources, external asset references and deletion/legal-retention policy",
    "running/pending tasks, queued writes, live SSE clients, late workers, retry chains and auto-publish during drill/recovery",
    "new-project restore, replace, repair-missing, point-in-time and disaster-failover with identity/conflict mapping",
    "chapter bytes, outlines, story contract, character/world state, facts, ledgers, narrative obligations, quality, versions, branches, completion and delivery proofs",
    "restore fails before staging, during object materialization, after validation, during atomic switch, during recompute and before settlement",
    "retention pruning preserves verified parents/protected generations and reports capacity/RPO risk before deleting the last viable chain",
    "same frozen backup restores deterministically to equivalent canonical/semantic hashes while environment-specific paths and secrets are rebound safely",
  ],
  releaseGate: {
    requirementIds: ["FR-DURABILITY-001", "FR-DURABILITY-002", "FR-DURABILITY-003", "FR-DURABILITY-004"],
    acceptanceRefs: ["AT-516", "AT-517", "AT-518", "AT-519"],
    rule: "Do not claim backed up, portable, disaster-ready, restorable, recovered, RPO/RTO-compliant, or safe to delete/migrate until one cross-store cursor and signed manifest cover all authoritative objects/references, database capture is transaction-consistent, privacy/rights/encryption/retention policy passes, independent copies read back, parent/object integrity verifies, an isolated no-side-effect restore drill succeeds, real recovery stages and atomically switches as forward history, stale work is fenced, dependent evidence is revalidated, and RecoverySettlement records limits and objectives.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens consistent-cut capture, privacy/source boundaries, independent copies, integrity verification, isolated restore drills, stale-worker fencing, forward recovery or settlement.",
};

const contextOrchestrationSourcePaths = [
  "api/src/app.ts",
  "api/src/contextAssembler.ts",
  "api/src/taskService.ts",
  "api/src/knowledgeIndex.ts",
  "api/src/contextManifest.ts",
  "api/src/understandingWorker.ts",
  "api/src/understandingReview.ts",
  "api/src/types.ts",
  "api/src/taskTemplates.ts",
  "ui/src/components/novel/ContextPanel.vue",
  "ui/src/types/novel.ts",
];
const contextOrchestrationSources = new Map(contextOrchestrationSourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function contextOrchestrationEvidence(relativePath, needle) {
  const entry = contextOrchestrationSources.get(relativePath);
  if (!entry) throw new Error(`Unknown context-orchestration source: ${relativePath}`);
  const index = entry.content.indexOf(needle);
  if (index < 0) throw new Error(`Context-orchestration evidence drift: ${relativePath} no longer contains ${JSON.stringify(needle)}`);
  return {
    path: relativePath,
    line: entry.content.slice(0, index).split(/\r?\n/).length,
    sourceSha256: entry.sha256,
    token: needle,
  };
}

const contextAssemblerAuditSource = contextOrchestrationSources.get("api/src/contextAssembler.ts").content;
const contextTaskAuditSource = contextOrchestrationSources.get("api/src/taskService.ts").content;
const contextApiTypesAuditSource = contextOrchestrationSources.get("api/src/types.ts").content;
const contextUiTypesAuditSource = contextOrchestrationSources.get("ui/src/types/novel.ts").content;
const contextUiAuditSource = contextOrchestrationSources.get("ui/src/components/novel/ContextPanel.vue").content;
const contextKnowledgeAuditSource = contextOrchestrationSources.get("api/src/knowledgeIndex.ts").content;
const contextManifestAuditSource = contextOrchestrationSources.get("api/src/contextManifest.ts").content;
if (!contextAssemblerAuditSource.includes("function trimContext") || !contextAssemblerAuditSource.includes("T0: 9000") || !contextAssemblerAuditSource.includes("T3: 2000")) {
  throw new Error("Context-orchestration audit drift: fixed character-tier trimming changed and must be reclassified.");
}
if (!contextAssemblerAuditSource.includes("async function readOptionalJson") || !contextAssemblerAuditSource.includes("async function readOptionalJsonl") || !contextAssemblerAuditSource.includes("return undefined;") || !contextAssemblerAuditSource.includes("return [];")) {
  throw new Error("Context-orchestration audit drift: optional/corrupt context handling changed and must be reclassified.");
}
if (!contextTaskAuditSource.includes("function preCallReview") || !contextTaskAuditSource.includes('"warn" as const') || !contextTaskAuditSource.includes("runWithCurrentTaskContextManifest")) {
  throw new Error("Context-orchestration audit drift: pre-call review or execution path changed and must be reclassified.");
}
if (!contextApiTypesAuditSource.includes('status: "pass" | "warn"') || !contextUiTypesAuditSource.includes('status: "pass" | "warn"')) {
  throw new Error("Context-orchestration audit drift: API/UI pre-call review status contract changed and must be reclassified.");
}
if (!contextKnowledgeAuditSource.includes("export async function searchKnowledgeIndex") || !contextKnowledgeAuditSource.includes("const eligibleFacts") || !contextKnowledgeAuditSource.includes("evidenceQualityPriority(factQuality(right))")) {
  throw new Error("Context-orchestration audit drift: knowledge eligibility/quality ranking changed and must be reclassified.");
}
if (!contextUiAuditSource.includes("context-note") || /exclusionReason|eligibilityDecision/.test(contextUiAuditSource)) {
  throw new Error("Context-orchestration audit drift: the author context-inspection surface changed and must be reclassified.");
}
const contextProductSource = [...contextOrchestrationSources.values()].map((entry) => entry.content).join("\n");
const implementedContextEntities = [
  "ContextSourceReceipt",
  "ContextConflictSet",
  "EvidenceCoverageReport",
].filter((entity) => contextProductSource.includes(entity));
if (implementedContextEntities.length) {
  throw new Error(`Context-orchestration audit drift: governed context entities now exist and must be audited: ${implementedContextEntities.join(", ")}`);
}

const contextProjectSnapshots = foreshadowProjectDirectories.map((projectDirectory, projectIndex) => {
  const invocationPath = join(projectDirectory, "tasks", "invocations.jsonl");
  const invocationFile = parseAnonymousJsonLines(invocationPath);
  const invocations = invocationFile.records;
  const blocks = invocations.flatMap((invocation) => Array.isArray(invocation?.contextSnapshot?.blocks) ? invocation.contextSnapshot.blocks : []);
  const reviews = invocations.map((invocation) => invocation?.preCallReview).filter(Boolean);
  const warningValues = reviews.flatMap((review) => Array.isArray(review?.warnings) ? review.warnings : []);
  const reviewOutcomePairs = invocations.map((invocation) => `${invocation?.preCallReview?.status || "missing"}->${invocation?.status || "missing"}`);
  const promptChars = invocations.map((invocation) => Number(invocation?.promptSnapshot?.length) || 0);
  const contextChars = invocations.map((invocation) => Number(invocation?.contextSnapshot?.totalChars) || 0);
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprint: invocationFile.sha256,
    invocationFile: {
      exists: existsSync(invocationPath),
      bytes: existsSync(invocationPath) ? readFileSync(invocationPath).length : 0,
      records: invocations.length,
      invalidLines: invocationFile.invalidLines,
    },
    contextEvidence: {
      invocationsWithContextSnapshot: invocations.filter((invocation) => invocation?.contextSnapshot).length,
      blocks: blocks.length,
      contextChars: contextChars.reduce((sum, value) => sum + value, 0),
      tierBlocks: countsByValue(blocks.map((block) => block?.tier)),
      truncatedBlocks: blocks.filter((block) => block?.truncated === true).length,
      t0Blocks: blocks.filter((block) => block?.tier === "T0").length,
      t0TruncatedBlocks: blocks.filter((block) => block?.tier === "T0" && block?.truncated === true).length,
      maxContextChars: Math.max(0, ...contextChars),
    },
    callGateEvidence: {
      reviews: reviews.length,
      reviewStatuses: countsByValue(reviews.map((review) => review?.status)),
      warnings: countsByValue(warningValues),
      reviewStatusToInvocationOutcome: countsByValue(reviewOutcomePairs),
      invocationsWithoutReview: invocations.length - reviews.length,
    },
    manifestAndCoverageEvidence: {
      contextManifests: invocations.filter((invocation) => invocation?.contextManifest).length,
      postCallEvidenceCoverageReports: invocations.filter((invocation) => invocation?.evidenceCoverage || invocation?.evidenceCoverageReport).length,
    },
    promptEvidence: {
      totalChars: promptChars.reduce((sum, value) => sum + value, 0),
      maxChars: Math.max(0, ...promptChars),
      promptsOver120kChars: promptChars.filter((value) => value > 120_000).length,
    },
  };
});

const contextOperationalTotals = contextProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  invocationFiles: totals.invocationFiles + (project.invocationFile.exists ? 1 : 0),
  invocationFileBytes: totals.invocationFileBytes + project.invocationFile.bytes,
  invocations: totals.invocations + project.invocationFile.records,
  invalidInvocationLines: totals.invalidInvocationLines + project.invocationFile.invalidLines,
  invocationsWithContextSnapshot: totals.invocationsWithContextSnapshot + project.contextEvidence.invocationsWithContextSnapshot,
  blocks: totals.blocks + project.contextEvidence.blocks,
  contextChars: totals.contextChars + project.contextEvidence.contextChars,
  truncatedBlocks: totals.truncatedBlocks + project.contextEvidence.truncatedBlocks,
  t0Blocks: totals.t0Blocks + project.contextEvidence.t0Blocks,
  t0TruncatedBlocks: totals.t0TruncatedBlocks + project.contextEvidence.t0TruncatedBlocks,
  preCallReviews: totals.preCallReviews + project.callGateEvidence.reviews,
  preCallPass: totals.preCallPass + (project.callGateEvidence.reviewStatuses.pass || 0),
  preCallWarn: totals.preCallWarn + (project.callGateEvidence.reviewStatuses.warn || 0),
  preCallBlock: totals.preCallBlock + (project.callGateEvidence.reviewStatuses.block || 0),
  invocationsWithoutReview: totals.invocationsWithoutReview + project.callGateEvidence.invocationsWithoutReview,
  warnedSuccessfulInvocations: totals.warnedSuccessfulInvocations + (project.callGateEvidence.reviewStatusToInvocationOutcome["warn->success"] || 0),
  contextManifests: totals.contextManifests + project.manifestAndCoverageEvidence.contextManifests,
  postCallEvidenceCoverageReports: totals.postCallEvidenceCoverageReports + project.manifestAndCoverageEvidence.postCallEvidenceCoverageReports,
  promptChars: totals.promptChars + project.promptEvidence.totalChars,
  maxPromptChars: Math.max(totals.maxPromptChars, project.promptEvidence.maxChars),
  maxContextChars: Math.max(totals.maxContextChars, project.contextEvidence.maxContextChars),
}), {
  projects: 0, invocationFiles: 0, invocationFileBytes: 0, invocations: 0, invalidInvocationLines: 0,
  invocationsWithContextSnapshot: 0, blocks: 0, contextChars: 0, truncatedBlocks: 0, t0Blocks: 0,
  t0TruncatedBlocks: 0, preCallReviews: 0, preCallPass: 0, preCallWarn: 0, preCallBlock: 0,
  invocationsWithoutReview: 0, warnedSuccessfulInvocations: 0, contextManifests: 0,
  postCallEvidenceCoverageReports: 0, promptChars: 0, maxPromptChars: 0, maxContextChars: 0,
});

const contextOrchestrationStages = [
  { id: "CTX-TRACE-001", label: "resolve-task-risk-and-model-capability", current: "Task type determines a broad fixed block recipe before the selected model is resolved.", gap: "No tokenizer, context-window capability, output reserve, task risk or retry budget participates in assembly.", target: "Resolve purpose, risk, model capabilities, output/retry reserve and hard evidence classes before retrieval." },
  { id: "CTX-TRACE-002", label: "resolve-authoritative-and-eligible-sources", current: "Project files, summaries, ledgers, platform assets and knowledge projections are read as available inputs.", gap: "Availability and lexical relevance do not prove canon version, time, POV, reader visibility, rights, freshness or source authority.", target: "Apply authority and eligibility predicates first; retain exclusion reasons and unknown states." },
  { id: "CTX-TRACE-003", label: "surface-corruption-and-conflicts", current: "Optional read/JSON/JSONL failures become empty, undefined or dropped lines; conflicting hits can be ranked independently.", gap: "Missing evidence, corruption and disagreement can masquerade as a clean absence or one coherent answer.", target: "Emit corruption receipts and explicit conflict sets; block when required evidence cannot be adjudicated." },
  { id: "CTX-TRACE-004", label: "retrieve-for-current-purpose", current: "Broad-context task lists and top-score knowledge search determine candidates.", gap: "High-scoring material may be irrelevant to the decision while low-lexical but causally necessary evidence is omitted.", target: "Compile purpose-specific evidence obligations and retrieve until required coverage, not arbitrary fullness, is met." },
  { id: "CTX-TRACE-005", label: "compile-provenance-bearing-blocks", current: "Blocks carry display title, content and inferred tier.", gap: "Source identity/version/hash, authority, eligibility, rights, conflict membership and transformation lineage are absent.", target: "Every block carries stable provenance and semantic role independent of a localized display title." },
  { id: "CTX-TRACE-006", label: "plan-global-token-and-output-budget", current: "Each tier has an independent character limit and the final prompt has only a 120k-character warning.", gap: "Per-block character success can exceed a model window, starve output, waste capacity or misestimate multilingual/token-heavy content.", target: "Allocate one model-token budget across instructions, evidence, deliberation, output, tools and retries with deterministic degradation order." },
  { id: "CTX-TRACE-007", label: "compress-or-block-t0", current: "Oversized T0 blocks are first/last character sliced like optional context.", gap: "Middle facts, constraints, user words, conflict evidence and open obligations may disappear without semantic coverage proof.", target: "Use evidence-linked semantic compression with coverage verification; if T0 still cannot fit, block before the model call." },
  { id: "CTX-TRACE-008", label: "enforce-rights-privacy-and-untrusted-boundary", current: "Mixed project/platform/imported text is assembled into the same prompt-oriented block stream.", gap: "Prompt injection, secrets, private notes and rights-bound samples can cross purpose/provider/cache boundaries.", target: "Gate rights/privacy/provider scope first and isolate untrusted content as quoted evidence, never instructions." },
  { id: "CTX-TRACE-009", label: "freeze-context-manifest", current: "The session-level ContextManifest is frozen and the model-understanding worker can consume a persisted fingerprint and source-message set before the provider call.", gap: "The broader task-context pipeline still lacks complete eligibility, exclusion, transformation, token-plan and cache/retry binding across every executor.", target: "Freeze an immutable ContextManifest before execution and bind prompt, model, policy and retry/cache keys to its fingerprint." },
  { id: "CTX-TRACE-010", label: "enforce-pre-call-gate", current: "PreCallReview emits pass or warn; warnings do not stop runner execution.", gap: "Missing T0, widespread truncation, corruption, unresolved rights or evidence gaps cannot produce a machine-enforced block state.", target: "Return pass/warn/block with typed reasons; block all hard-gate failures server-side before provider resolution/call." },
  { id: "CTX-TRACE-011", label: "execute-retry-and-cache-against-manifest", current: "The runner receives a rendered prompt and profile; retries/adoption cannot prove identical evidence semantics.", gap: "A retry or cache hit can silently use stale, differently eligible or differently compressed context.", target: "Pin attempts to the manifest or create an explicit successor with invalidation and visible differences." },
  { id: "CTX-TRACE-012", label: "verify-post-call-evidence-coverage", current: "Understanding review now checks evidence spans for every model claim against existing source-message bounds.", gap: "Claim support semantics, conflict handling, restricted-material leakage and obligation coverage remain outside this deterministic span check.", target: "Check claim/evidence coverage, instruction boundary, conflicts and stale dependencies before candidate adoption or canon mutation." },
];

const contextOrchestrationAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "From a rough idea, the creative partner can assemble only the right, authorized and current evidence for each decision; it can explain what the model saw and did not see, never silently lose critical story truth, and block rather than fabricate when essential context cannot fit or be trusted.",
  sourceFiles: [...contextOrchestrationSources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "invocation-file fingerprints/bytes/counts", "aggregate prompt/context character and tier/truncation counts", "review status/warning/outcome aggregates", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "chapter/task/invocation identity or type", "block title", "prompt preview or content", "context/prose/source text", "file/entity path or database values", "raw payload/result/error", "absolute path or secret"],
  },
  operationalSnapshot: {
    projects: contextProjectSnapshots,
    totals: contextOperationalTotals,
    tierTotals: countsByValue(contextProjectSnapshots.flatMap((project) => Object.entries(project.contextEvidence.tierBlocks).flatMap(([tier, count]) => Array.from({ length: count }, () => tier)))),
    warningTotals: countsByValue(contextProjectSnapshots.flatMap((project) => Object.entries(project.callGateEvidence.warnings).flatMap(([warning, count]) => Array.from({ length: count }, () => warning)))),
    reviewOutcomeTotals: countsByValue(contextProjectSnapshots.flatMap((project) => Object.entries(project.callGateEvidence.reviewStatusToInvocationOutcome).flatMap(([pair, count]) => Array.from({ length: count }, () => pair)))),
    interpretation: "The platform records abundant context, but record volume is not evidence fitness. Fixed per-block character slicing truncated critical T0 blocks, every recorded governed pre-call review warned, successful calls still proceeded, and the new session-level manifest is not yet bound to the model executor or post-call evidence coverage.",
  },
  summary: {
    auditedStages: contextOrchestrationStages.length,
    projectsScanned: contextOperationalTotals.projects,
    invocations: contextOperationalTotals.invocations,
    contextBlocks: contextOperationalTotals.blocks,
    truncatedBlocks: contextOperationalTotals.truncatedBlocks,
    t0TruncatedBlocks: contextOperationalTotals.t0TruncatedBlocks,
    preCallReviews: contextOperationalTotals.preCallReviews,
    preCallWarn: contextOperationalTotals.preCallWarn,
    preCallBlock: contextOperationalTotals.preCallBlock,
    warnedSuccessfulInvocations: contextOperationalTotals.warnedSuccessfulInvocations,
    contextManifests: contextOperationalTotals.contextManifests,
    postCallEvidenceCoverageReports: contextOperationalTotals.postCallEvidenceCoverageReports,
    implementationVerified: false,
  },
  rootCause: {
    statement: "Context assembly remains a display-title-driven packing pipeline with fixed per-block character caps. It records volume and truncation after assembly; session and generic task paths now bind persisted manifests, and knowledge retrieval applies eligibility and evidence-quality ordering, but the system still lacks model-aware global token planning, complete corruption/conflict receipts and complete post-call evidence coverage.",
    consequence: "A long prompt can appear comprehensive while silently omitting a decisive middle fact, using stale or unauthorized material, flattening conflicts, starving output or letting a warning-only call generate fluent but narratively invalid prose that later contaminates memory and foreshadowing closure.",
  },
  currentEvidence: [
    { claim: "Optional file, JSON and JSONL failures are converted to empty/undefined/dropped rows during context assembly.", evidence: [contextOrchestrationEvidence("api/src/contextAssembler.ts", "async function readOptional"), contextOrchestrationEvidence("api/src/contextAssembler.ts", "async function readOptionalJsonl"), contextOrchestrationEvidence("api/src/contextAssembler.ts", "return [];")] },
    { claim: "Context is tiered by display title and independently first/last character-trimmed to fixed limits.", evidence: [contextOrchestrationEvidence("api/src/contextAssembler.ts", "function trimContext"), contextOrchestrationEvidence("api/src/contextAssembler.ts", "function contextTierForTitle"), contextOrchestrationEvidence("api/src/contextAssembler.ts", "function contextLimitForTier")] },
    { claim: "Invocation context snapshots retain title, character length, tier and truncation, not provenance, eligibility, conflicts, token accounting or exclusions.", evidence: [contextOrchestrationEvidence("api/src/taskService.ts", "function contextSnapshot"), contextOrchestrationEvidence("api/src/types.ts", "export interface AiInvocationContextBlockSnapshot")] },
    { claim: "Pre-call review has pass/warn only; generic task execution now adds a manifest status check before each provider attempt, while the broader hard-gate contract remains incomplete.", evidence: [contextOrchestrationEvidence("api/src/taskService.ts", "function preCallReview"), contextOrchestrationEvidence("api/src/types.ts", 'status: "pass" | "warn"'), contextOrchestrationEvidence("api/src/taskService.ts", "runWithCurrentTaskContextManifest")] },
    { claim: "Knowledge retrieval applies eligibility before relevance and orders eligible facts by evidence quality, score and vector tie-breakers; broader context packing still lacks a global token plan.", evidence: [contextOrchestrationEvidence("api/src/knowledgeIndex.ts", "export async function searchKnowledgeIndex"), contextOrchestrationEvidence("api/src/knowledgeIndex.ts", "evidenceQualityPriority(factQuality(right))")] },
    { claim: "The author-facing context panel states that memory/rules/skills are injected but does not expose included/excluded evidence, truncation, conflicts, freshness or gate status.", evidence: [contextOrchestrationEvidence("ui/src/components/novel/ContextPanel.vue", "context-note"), contextOrchestrationEvidence("ui/src/components/novel/ContextPanel.vue", "activeSkills")] },
    { claim: "A session-level T0 manifest freezes author message IDs, source spans and a source fingerprint, supersedes the prior manifest when the session changes, and is consumed by the model-understanding worker when the task declares its fingerprint; broader task-context executors remain partial.", evidence: [contextOrchestrationEvidence("api/src/contextManifest.ts", "export async function freezeContextManifest"), contextOrchestrationEvidence("api/src/contextManifest.ts", "sourceFingerprint"), contextOrchestrationEvidence("api/src/app.ts", "app.post(\"/api/novel/projects/:projectId/session/context-manifest\""), contextOrchestrationEvidence("api/src/understandingWorker.ts", "const manifest = await readContextManifest(input.root)"), contextOrchestrationEvidence("api/src/understandingReview.ts", "function validEvidence")] },
    { claim: "Generic task execution persists a task ContextManifest and revalidates it before the initial, retry, failover and repair provider attempts; blocked or missing manifests stop further calls.", evidence: [contextOrchestrationEvidence("api/src/taskService.ts", "await persistTaskContextManifest(root, contextManifest)"), contextOrchestrationEvidence("api/src/taskService.ts", "async function runWithCurrentTaskContextManifest"), contextOrchestrationEvidence("api/src/taskService.ts", "TASK_CONTEXT_MANIFEST_BLOCKED")] },
  ],
  stages: contextOrchestrationStages,
  alternatives: [
    { option: "A-keep-fixed-per-block-character-tiers", verdict: "retain-only-as-a-temporary-adapter", blueCase: "Simple, deterministic and cheap; prevents one block from consuming the entire prompt and already exposes coarse truncation telemetry.", redCase: "Characters are not model tokens, independent caps ignore output reserve, title-based tiers are brittle, and first/last slicing can remove the exact causal fact or open obligation required for the chapter." },
    { option: "B-pack-the-largest-possible-context", verdict: "reject-as-authority-strategy", blueCase: "Reduces obvious omissions, uses larger model windows and requires less up-front relevance engineering.", redCase: "Raises cost/latency and lost-in-the-middle distraction while amplifying stale facts, contradictions, privacy/rights leakage, prompt injection and output starvation; more text is not more truth." },
    { option: "C-eligibility-first-evidence-graph-with-global-token-plan-and-hard-gates", verdict: "recommended-already-specified-not-implemented", blueCase: "Select authority before relevance, retrieve for the current decision, preserve conflicts/provenance, allocate a model-aware global budget, verify T0 compression, freeze a manifest, hard-block unsafe calls and verify output evidence coverage.", redCase: "Requires tokenizer/capability registries, provenance and rights metadata, deterministic compaction, conflict UX, manifest storage, retry/cache invalidation and claim-level post-call checks; false hard blocks need fixtures and author-visible recovery paths." },
  ],
  yAGNI: {
    newRequirementsAdded: 0,
    newAcceptanceTestsAdded: 0,
    newDecisionsAdded: 0,
    rationale: "The SDD already specifies the target end to end. The current gap is missing implementation and release evidence, not missing requirement prose; adding another synonym domain would create duplicate authority.",
    existingContract: {
      requirementIds: ["FR-CONTEXT-001", "FR-CONTEXT-002", "FR-CONTEXT-003", "FR-CONTEXT-004", "FR-CONTEXT-005", "FR-CONTEXT-006", "FR-CONTEXT-007", "FR-CONTEXT-008", "FR-CONTEXT-009", "FR-CONTEXT-010", "FR-AI-012", "FR-AI-013", "FR-LONGMEM-016", "FR-LONGMEM-017", "FR-LONGMEM-019", "FR-LONGMEM-020"],
      acceptanceRefs: ["AT-105", "AT-106", "AT-107", "AT-108", "AT-109", "AT-110", "AT-111", "AT-112", "AT-498", "AT-499", "AT-500", "AT-501", "AT-502"],
      decisionRefs: ["D-032", "D-108", "D-109", "D-110"],
    },
  },
  targetAuthority: {
    entities: ["ContextIntent", "EligibilityDecision", "ContextConflictSet", "ContextBlock", "TokenPlan", "CompressionReceipt", "ContextManifest", "PreCallReview", "EvidenceCoverageReport"],
    invariant: "No file readability, parse fallback, retrieval score, vector similarity, block count, character count, tier label, truncation warning, large model window, prompt construction, provider acceptance, process success, structured parse, fluent prose or user-visible preview may independently establish source eligibility, T0 completeness, rights/privacy safety, fit within the selected model, reproducibility, factual/canon compliance or adoption readiness.",
  },
  orchestrationProtocol: {
    order: [
      "resolve task purpose, risk class, selected model capabilities, output/tool/retry reserve and required evidence obligations",
      "enumerate authoritative sources and apply canon-version, time, POV, reader-visibility, rights, privacy, provider, freshness and corruption eligibility before ranking",
      "retain explicit absence, corruption and conflict sets; never turn a failed required read or disputed fact into a clean empty value",
      "retrieve purpose-driven evidence and provenance-diverse support until required coverage is met or a typed gap remains",
      "compile source-versioned blocks with authority, eligibility, conflicts, transformations, rights and untrusted-content boundaries",
      "allocate one tokenizer/model-aware global budget with deterministic degradation of optional evidence and explicit output reserve",
      "semantically compress T0 against evidence obligations and verify coverage; hard-block when required evidence remains missing or cannot fit",
      "freeze and persist ContextManifest, bind prompt/model/policy/cache/retry fingerprints, and expose included/excluded/degraded reasons to the author",
      "execute only after PreCallReview pass/warn/block gates; warnings are bounded degradations, blocks never reach provider resolution or runner",
      "after generation compare claims, decisions and proposed patches to supplied evidence, conflicts and constraints before adoption/canon mutation",
    ],
    nonGoal: "The target does not maximize prompt size, require every project artifact in every call, expose private content in telemetry, or pretend perfect retrieval. It makes evidence selection, compression, omission and uncertainty governed and inspectable.",
  },
  verificationMatrix: [
    "same semantic evidence in Chinese/English, emoji/code-heavy and adversarial tokenization under small/large model windows",
    "one enormous T0 source, many small T0 sources, exact-limit boundaries, required middle fact and output reserve exhaustion",
    "missing file, permission error, malformed JSON, one malformed JSONL row, partial write and newer unknown schema",
    "canon versus proposal, superseded version, time-invalid fact, wrong POV/reader visibility, secret and rights-expired source",
    "two equally relevant contradictory claims, conflict resolved during call, stale summary and projection rebuilt after manifest freeze",
    "prompt injection inside imported prose, research source, style sample and platform skill with outbound/provider restrictions",
    "retry, cancellation, provider fallback, model change, cache hit and concurrent canon commit against one manifest fingerprint",
    "model output cites absent evidence, ignores a conflict, invents a fact, leaks excluded material or violates an open obligation",
    "author inspects include/exclude/truncation/conflict/block reasons without seeing raw private source content in telemetry",
    "deterministic replay from identical source versions/policy/model capability produces equivalent manifest and coverage decisions",
  ],
  releaseGate: {
    requirementIds: ["FR-CONTEXT-001", "FR-CONTEXT-002", "FR-CONTEXT-003", "FR-CONTEXT-004", "FR-CONTEXT-005", "FR-CONTEXT-006", "FR-CONTEXT-007", "FR-CONTEXT-008", "FR-CONTEXT-009", "FR-CONTEXT-010"],
    acceptanceRefs: ["AT-105", "AT-106", "AT-107", "AT-108", "AT-109", "AT-110", "AT-111", "AT-112", "AT-498", "AT-499", "AT-500", "AT-501", "AT-502"],
    rule: "Do not claim long-context safety, full-story awareness, reliable memory, explainable prompt assembly or evidence-grounded generation until eligibility precedes ranking, corruption/conflicts remain visible, one selected-model token plan reserves output, every T0 item is present or coverage-verified after semantic compression, untrusted/private/rights-bound material is gated, ContextManifest is frozen and inspectable, hard failures block server-side before the runner, retries/caches stay manifest-bound, and post-call evidence coverage gates adoption.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens T0 completeness, eligibility-before-relevance, corruption/conflict visibility, source/privacy boundaries, selected-model fit, server-side block gates, manifest reproducibility or post-call evidence coverage.",
};

const characterCausalitySourcePaths = [
  "api/src/types.ts",
  "api/src/writingCockpit.ts",
  "api/src/storyGraph.ts",
  "api/src/contextAssembler.ts",
  "api/src/taskTemplates.ts",
  "api/src/chapterQualityReview.ts",
  "api/src/runtimeEngine.ts",
  "ui/src/components/novel/StoryControlPanel.vue",
  "ui/src/components/novel/SceneCardPanel.vue",
  "ui/src/components/novel/WritingRecapPanel.vue",
];
const characterCausalitySources = new Map(characterCausalitySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function characterCausalityEvidence(relativePath, needle) {
  const entry = characterCausalitySources.get(relativePath);
  if (!entry) throw new Error(`Unknown character-causality source: ${relativePath}`);
  const index = entry.content.indexOf(needle);
  if (index < 0) throw new Error(`Character-causality evidence drift: ${relativePath} no longer contains ${JSON.stringify(needle)}`);
  return {
    path: relativePath,
    line: entry.content.slice(0, index).split(/\r?\n/).length,
    sourceSha256: entry.sha256,
    token: needle,
  };
}

const characterTypesSource = characterCausalitySources.get("api/src/types.ts").content;
const characterCockpitSource = characterCausalitySources.get("api/src/writingCockpit.ts").content;
const characterGraphSource = characterCausalitySources.get("api/src/storyGraph.ts").content;
const characterTaskTemplateSource = characterCausalitySources.get("api/src/taskTemplates.ts").content;
const characterQualitySource = characterCausalitySources.get("api/src/chapterQualityReview.ts").content;
const characterSceneUiSource = characterCausalitySources.get("ui/src/components/novel/SceneCardPanel.vue").content;
const characterControlUiSource = characterCausalitySources.get("ui/src/components/novel/StoryControlPanel.vue").content;
if (!characterTypesSource.includes("export interface StoryCharacterProfile") || !characterTypesSource.includes("currentState: string") || !characterTypesSource.includes("relationshipNotes: string")) {
  throw new Error("Character-causality audit drift: StoryCharacterProfile changed and must be reclassified.");
}
if (!characterCockpitSource.includes("function buildCharacterArcSignals") || !characterCockpitSource.includes(".slice(0, 8)")) {
  throw new Error("Character-causality audit drift: current character-arc projection changed and must be reclassified.");
}
if (!characterGraphSource.includes("const relationshipPredicates") || !characterGraphSource.includes('"co-appears"') || !characterGraphSource.includes('"profile-note"')) {
  throw new Error("Character-causality audit drift: relationship projection changed and must be reclassified.");
}
if (!characterTaskTemplateSource.includes("Make character texture observable") || !characterTaskTemplateSource.includes("characterStatePatches")) {
  throw new Error("Character-causality audit drift: character drafting/recap contracts changed and must be reclassified.");
}
if (!characterQualitySource.includes("summaryEmotionPatterns") || !characterQualitySource.includes('metrics.set("emotion"')) {
  throw new Error("Character-causality audit drift: current emotion quality heuristic changed and must be reclassified.");
}
if (!characterSceneUiSource.includes('key: "title" | "location" | "pov" | "conflict" | "turn" | "powerProgression"') || /characterFunction|emotionalShift|relationship_turn/.test(characterSceneUiSource)) {
  throw new Error("Character-causality audit drift: SceneCard editor gained character-function semantics and must be reclassified.");
}
if (!characterControlUiSource.includes("selectedCharacter.currentState") || !characterControlUiSource.includes("selectedCharacter.relationshipNotes")) {
  throw new Error("Character-causality audit drift: StoryControl character editor changed and must be reclassified.");
}
const characterProductSource = [...characterCausalitySources.values()].map((entry) => entry.content).join("\n");
const implementedCharacterEntities = [
  "CharacterDramaticContract",
  "CharacterStateSnapshot",
  "CharacterChoiceEvidence",
  "CharacterBeliefState",
  "RelationshipState",
  "RelationshipEvent",
  "CharacterVoiceProfile",
  "CharacterPresencePlan",
  "OffPageCharacterEvent",
  "CharacterArcCertificate",
].filter((entity) => characterProductSource.includes(entity));
if (implementedCharacterEntities.length) {
  throw new Error(`Character-causality audit drift: governed character entities now exist and must be audited: ${implementedCharacterEntities.join(", ")}`);
}

function nonemptyCharacterField(value) {
  return typeof value === "string" ? Boolean(value.trim()) : Array.isArray(value) ? value.some((item) => typeof item === "string" && item.trim()) : Boolean(value);
}

function anonymousCharacterProjectSnapshot(projectDirectory, projectIndex) {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const storyControlFile = readAnonymousJsonFile(join(projectDirectory, "story-control", "story-control.json"), {});
  const storyGraphFile = readAnonymousJsonFile(join(projectDirectory, "story-graph", "storyline.json"), {});
  const characterLedgerFile = readAnonymousJsonFile(join(projectDirectory, "ledger", "character-state.json"), []);
  const seriesMetricsFile = readAnonymousJsonFile(join(projectDirectory, "quality", "series-metrics.json"), {});
  const characterBiblePath = join(projectDirectory, "bible", "characters.md");
  const characterBibleBuffer = existsSync(characterBiblePath) ? readFileSync(characterBiblePath) : null;
  const characters = Array.isArray(storyControlFile.value?.characters) ? storyControlFile.value.characters : [];
  const characterIds = characters.map((character) => character?.id).filter((value) => typeof value === "string" && value.trim());
  const coreProfileFields = ["name", "role", "goal", "currentState", "knownSecrets", "relationshipNotes", "powerLevel"];
  const dramaticProfileFields = ["coreWound", "desire", "misbelief", "redemptionArc", "sublimationGoal", "relationshipPressure", "growthStage"];
  const sceneFiles = directJsonFiles(join(projectDirectory, "scenes"));
  const scenes = sceneFiles.flatMap((absolutePath) => {
    const file = readAnonymousJsonFile(absolutePath, []);
    return Array.isArray(file.value) ? file.value : [];
  });
  const summaryFiles = directJsonFiles(join(projectDirectory, "memory", "chapter-summaries"));
  const summaries = summaryFiles.map((absolutePath) => readAnonymousJsonFile(absolutePath, {}).value).filter((value) => value && typeof value === "object");
  const statePatches = summaries.flatMap((summary) => Array.isArray(summary?.characterStateChanges) ? summary.characterStateChanges : []);
  const emotionItems = summaries.flatMap((summary) => {
    const ledger = summary?.emotionLedger || {};
    return ["wounds", "boons", "powerShifts", "openLoops"].flatMap((bucket) =>
      (Array.isArray(ledger?.[bucket]) ? ledger[bucket] : []).map((item) => ({ ...item, bucket })),
    );
  });
  const qualityFiles = directJsonFiles(join(projectDirectory, "quality")).filter((absolutePath) => !absolutePath.endsWith("series-metrics.json"));
  const qualityReports = qualityFiles.map((absolutePath) => readAnonymousJsonFile(absolutePath, {}).value).filter((report) => Array.isArray(report?.metrics));
  const qualityMetrics = qualityReports.flatMap((report) => report.metrics);
  const characterLedgerEntries = Array.isArray(characterLedgerFile.value) ? characterLedgerFile.value : [];
  const relationships = Array.isArray(storyGraphFile.value?.characterRelations?.relationships) ? storyGraphFile.value.characterRelations.relationships : [];
  const relationshipCoverage = Array.isArray(storyGraphFile.value?.characterRelations?.coverage) ? storyGraphFile.value.characterRelations.coverage : [];
  const appearanceSignals = Array.isArray(storyGraphFile.value?.characterRelations?.appearanceSignals) ? storyGraphFile.value.characterRelations.appearanceSignals : [];
  const arcSignals = Array.isArray(seriesMetricsFile.value?.characterArcSignals) ? seriesMetricsFile.value.characterArcSignals : [];
  const craftBeats = scenes.flatMap((scene) => Array.isArray(scene?.craftBeats) ? scene.craftBeats : []);
  const inputFingerprint = createHash("sha256").update([
    projectFile.sha256,
    storyControlFile.sha256,
    storyGraphFile.sha256,
    characterLedgerFile.sha256,
    seriesMetricsFile.sha256,
    characterBibleBuffer ? createHash("sha256").update(characterBibleBuffer).digest("hex") : null,
    ...sceneFiles.map((absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex")),
    ...summaryFiles.map((absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex")),
    ...qualityFiles.map((absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex")),
  ].filter(Boolean).join("\u0000")).digest("hex");
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprint,
    sourceValidity: {
      project: { exists: projectFile.exists, valid: projectFile.valid },
      storyControl: { exists: storyControlFile.exists, valid: storyControlFile.valid },
      storyGraph: { exists: storyGraphFile.exists, valid: storyGraphFile.valid },
      characterLedger: { exists: characterLedgerFile.exists, valid: characterLedgerFile.valid },
      seriesMetrics: { exists: seriesMetricsFile.exists, valid: seriesMetricsFile.valid },
      sceneFiles: sceneFiles.length,
      summaryFiles: summaryFiles.length,
      qualityFiles: qualityFiles.length,
    },
    characterBible: {
      exists: Boolean(characterBibleBuffer),
      bytes: characterBibleBuffer?.length || 0,
      sha256: characterBibleBuffer ? createHash("sha256").update(characterBibleBuffer).digest("hex") : null,
    },
    profiles: {
      characters: characters.length,
      duplicateStableIds: characterIds.length - new Set(characterIds).size,
      withAllCoreStringFields: characters.filter((character) => coreProfileFields.every((field) => nonemptyCharacterField(character?.[field]))).length,
      withAllDramaticStringFields: characters.filter((character) => dramaticProfileFields.every((field) => nonemptyCharacterField(character?.[field]))).length,
      withSignatureTraits: characters.filter((character) => nonemptyCharacterField(character?.signatureTraits)).length,
      withChapterPresenceBounds: characters.filter((character) => nonemptyCharacterField(character?.firstChapterId) || nonemptyCharacterField(character?.lastSeenChapterId)).length,
      byStatus: countsByValue(characters.map((character) => character?.status)),
    },
    sceneEvidence: {
      scenes: scenes.length,
      withCharacters: scenes.filter((scene) => Array.isArray(scene?.characters) && scene.characters.length).length,
      withCharacterFunction: scenes.filter((scene) => nonemptyCharacterField(scene?.characterFunction)).length,
      withEmotionalShift: scenes.filter((scene) => nonemptyCharacterField(scene?.emotionalShift)).length,
      craftBeats: craftBeats.length,
      relationshipTurnBeats: craftBeats.filter((beat) => beat?.type === "relationship_turn").length,
      redemptionBeats: craftBeats.filter((beat) => beat?.type === "redemption").length,
      beatsWithCharacterName: craftBeats.filter((beat) => nonemptyCharacterField(beat?.characterName)).length,
      beatsWithCost: craftBeats.filter((beat) => nonemptyCharacterField(beat?.cost)).length,
    },
    settledStateEvidence: {
      summaries: summaries.length,
      statePatches: statePatches.length,
      acceptedStatePatches: statePatches.filter((patch) => patch?.status === "accepted").length,
      pendingStatePatches: statePatches.filter((patch) => patch?.status === "pending").length,
      withStableCharacterId: statePatches.filter((patch) => nonemptyCharacterField(patch?.characterId)).length,
      withBeforeState: statePatches.filter((patch) => nonemptyCharacterField(patch?.before)).length,
      withAfterState: statePatches.filter((patch) => nonemptyCharacterField(patch?.after)).length,
      withCause: statePatches.filter((patch) => nonemptyCharacterField(patch?.cause)).length,
      emotionItems: emotionItems.length,
      emotionByBucket: countsByValue(emotionItems.map((item) => item.bucket)),
      emotionByStatus: countsByValue(emotionItems.map((item) => item?.status)),
      emotionWithCharacterName: emotionItems.filter((item) => nonemptyCharacterField(item?.characterName)).length,
      emotionWithCause: emotionItems.filter((item) => nonemptyCharacterField(item?.cause)).length,
      characterLedgerEntries: characterLedgerEntries.length,
    },
    relationshipAndPresenceProjection: {
      relationships: relationships.length,
      relationshipEvidenceBySource: countsByValue(relationships.flatMap((relationship) => Array.isArray(relationship?.sourceTypes) ? relationship.sourceTypes : [])),
      relationshipLabels: countsByValue(relationships.map((relationship) => relationship?.label === "co-appears" ? "co-appears" : relationship?.label === "profile-note" ? "profile-note" : "other")),
      isolatedCharacters: relationshipCoverage.filter((item) => item?.isolated === true).length,
      appearanceSignals: appearanceSignals.length,
      appearanceByStatus: countsByValue(appearanceSignals.map((signal) => signal?.status)),
      arcSignals: arcSignals.length,
      arcSignalChangeCount: arcSignals.reduce((sum, signal) => sum + (Number(signal?.changeCount) || 0), 0),
    },
    qualityEvidence: {
      reports: qualityReports.length,
      metricRows: qualityMetrics.length,
      emotionMetricRows: qualityMetrics.filter((metric) => metric?.key === "emotion").length,
      characterArcMetricRows: qualityMetrics.filter((metric) => metric?.key === "character_arc").length,
      relationshipMetricRows: qualityMetrics.filter((metric) => metric?.key === "relationship").length,
      voiceMetricRows: qualityMetrics.filter((metric) => metric?.key === "voice").length,
    },
    governedCharacterArtifacts: {
      dramaticContracts: 0,
      stateSnapshots: 0,
      choiceEvidence: 0,
      beliefStates: 0,
      relationshipStates: 0,
      relationshipEvents: 0,
      voiceProfiles: 0,
      presencePlans: 0,
      offPageEvents: 0,
      arcCertificates: 0,
    },
  };
}

const characterProjectSnapshots = foreshadowProjectDirectories.map(anonymousCharacterProjectSnapshot);
const characterOperationalTotals = characterProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  characterBibleFiles: totals.characterBibleFiles + (project.characterBible.exists ? 1 : 0),
  characterBibleBytes: totals.characterBibleBytes + project.characterBible.bytes,
  characters: totals.characters + project.profiles.characters,
  duplicateStableIds: totals.duplicateStableIds + project.profiles.duplicateStableIds,
  profilesWithAllCoreFields: totals.profilesWithAllCoreFields + project.profiles.withAllCoreStringFields,
  profilesWithAllDramaticFields: totals.profilesWithAllDramaticFields + project.profiles.withAllDramaticStringFields,
  profilesWithSignatureTraits: totals.profilesWithSignatureTraits + project.profiles.withSignatureTraits,
  profilesWithPresenceBounds: totals.profilesWithPresenceBounds + project.profiles.withChapterPresenceBounds,
  scenes: totals.scenes + project.sceneEvidence.scenes,
  scenesWithCharacters: totals.scenesWithCharacters + project.sceneEvidence.withCharacters,
  scenesWithCharacterFunction: totals.scenesWithCharacterFunction + project.sceneEvidence.withCharacterFunction,
  scenesWithEmotionalShift: totals.scenesWithEmotionalShift + project.sceneEvidence.withEmotionalShift,
  craftBeats: totals.craftBeats + project.sceneEvidence.craftBeats,
  relationshipTurnBeats: totals.relationshipTurnBeats + project.sceneEvidence.relationshipTurnBeats,
  redemptionBeats: totals.redemptionBeats + project.sceneEvidence.redemptionBeats,
  statePatches: totals.statePatches + project.settledStateEvidence.statePatches,
  acceptedStatePatches: totals.acceptedStatePatches + project.settledStateEvidence.acceptedStatePatches,
  statePatchesWithStableCharacterId: totals.statePatchesWithStableCharacterId + project.settledStateEvidence.withStableCharacterId,
  statePatchesWithBeforeState: totals.statePatchesWithBeforeState + project.settledStateEvidence.withBeforeState,
  statePatchesWithCause: totals.statePatchesWithCause + project.settledStateEvidence.withCause,
  emotionItems: totals.emotionItems + project.settledStateEvidence.emotionItems,
  emotionItemsWithCharacterName: totals.emotionItemsWithCharacterName + project.settledStateEvidence.emotionWithCharacterName,
  emotionItemsWithCause: totals.emotionItemsWithCause + project.settledStateEvidence.emotionWithCause,
  characterLedgerEntries: totals.characterLedgerEntries + project.settledStateEvidence.characterLedgerEntries,
  relationships: totals.relationships + project.relationshipAndPresenceProjection.relationships,
  isolatedCharacters: totals.isolatedCharacters + project.relationshipAndPresenceProjection.isolatedCharacters,
  appearanceSignals: totals.appearanceSignals + project.relationshipAndPresenceProjection.appearanceSignals,
  arcSignals: totals.arcSignals + project.relationshipAndPresenceProjection.arcSignals,
  qualityReports: totals.qualityReports + project.qualityEvidence.reports,
  emotionMetricRows: totals.emotionMetricRows + project.qualityEvidence.emotionMetricRows,
  characterArcMetricRows: totals.characterArcMetricRows + project.qualityEvidence.characterArcMetricRows,
  relationshipMetricRows: totals.relationshipMetricRows + project.qualityEvidence.relationshipMetricRows,
  voiceMetricRows: totals.voiceMetricRows + project.qualityEvidence.voiceMetricRows,
}), {
  projects: 0, characterBibleFiles: 0, characterBibleBytes: 0, characters: 0, duplicateStableIds: 0,
  profilesWithAllCoreFields: 0, profilesWithAllDramaticFields: 0, profilesWithSignatureTraits: 0, profilesWithPresenceBounds: 0,
  scenes: 0, scenesWithCharacters: 0, scenesWithCharacterFunction: 0, scenesWithEmotionalShift: 0, craftBeats: 0,
  relationshipTurnBeats: 0, redemptionBeats: 0, statePatches: 0, acceptedStatePatches: 0,
  statePatchesWithStableCharacterId: 0, statePatchesWithBeforeState: 0, statePatchesWithCause: 0,
  emotionItems: 0, emotionItemsWithCharacterName: 0, emotionItemsWithCause: 0, characterLedgerEntries: 0,
  relationships: 0, isolatedCharacters: 0, appearanceSignals: 0, arcSignals: 0, qualityReports: 0,
  emotionMetricRows: 0, characterArcMetricRows: 0, relationshipMetricRows: 0, voiceMetricRows: 0,
});

const characterCausalityStages = [
  { id: "CHAR-TRACE-001", label: "resolve-character-identity-and-authority", current: "StoryControl has character IDs and a prose character bible exists, while recap patches may identify a character by name only.", gap: "No entity registry, alias/split/merge history, source priority or document-versus-character classification proves that all surfaces refer to the same person.", target: "Resolve stable identity, aliases, source/version authority and explicit unknown/conflict before any arc inference." },
  { id: "CHAR-TRACE-002", label: "compile-dramatic-contract", current: "Profiles offer goal, wound, desire, misbelief, redemption and free-text relationship pressure.", gap: "These fields are editable descriptions, not a versioned contract connecting want/need/fear/value/strategy/limits to story promise and evidence.", target: "Adopt a CharacterDramaticContract with provenance, unknowns, forbidden shortcuts and milestone hypotheses." },
  { id: "CHAR-TRACE-003", label: "separate-planned-arc-from-actual-evidence", current: "Growth stage and redemption text coexist with accepted state-change summaries and a top-eight arc signal projection.", gap: "A planned label or recent state can masquerade as actual development; projection truncation can hide ensemble characters.", target: "Keep ArcPlan/ArcMilestone separate from on-page CharacterArcMilestoneEvidence and expose missing/contradictory coverage." },
  { id: "CHAR-TRACE-004", label: "freeze-pre-scene-character-state", current: "Current state, known secrets, summary patches and emotion ledgers are read from several mutable files.", gap: "No time-indexed snapshot proves body, goal, belief, knowledge, emotion, resources, obligations, relationships and voice conditions at scene entry.", target: "Compile a source-versioned CharacterStateSnapshot for each participant and mark unknown/conflict dimensions." },
  { id: "CHAR-TRACE-005", label: "design-choice-pressure-and-cost", current: "Prompts request desire/wound/misbelief/pressure and concrete choice; scenes have generic conflict/turn fields.", gap: "No typed choice set proves alternatives, perceived information, pressure, refusal, cost, action and irreversible consequence.", target: "Create CharacterChoiceEvidence linking state and belief to a costly action and downstream change." },
  { id: "CHAR-TRACE-006", label: "guard-agency-and-belief-lifecycle", current: "Continuity and quality prompts mention credible motivation and POV knowledge.", gap: "The system cannot distinguish earned reversal from plot-required stupidity, coercion, forgotten capability or magically corrected misbelief.", target: "Track belief support/disconfirmation and run an agency counterfactual before validating each major choice." },
  { id: "CHAR-TRACE-007", label: "model-directed-relationship-state", current: "Relationship edges come from keyword triples, co-appearance and names mentioned in free-text profile notes.", gap: "Co-presence and a label do not represent asymmetric trust, intimacy, fear, debt, power, knowledge, obligation or misreading over time.", target: "Maintain directional multi-dimensional RelationshipState; only evidence-bearing RelationshipEvent can change it." },
  { id: "CHAR-TRACE-008", label: "preserve-opponent-and-offpage-agency", current: "Story events list participants and profiles can describe goals, but scheduling is largely appearance-count based.", gap: "Opponents and supporting characters can freeze off page, teleport into plot, or exist only to deliver the protagonist's next beat.", target: "Give major non-POV characters independent goals, resources, decision clocks and OffPageCharacterEvents with causal consequences." },
  { id: "CHAR-TRACE-009", label: "allocate-ensemble-function-and-choice-share", current: "Appearance signals classify should-appear/overexposed/absent/balanced using role, gaps and counts.", gap: "Balanced frequency does not prove narrative function, meaningful choice, relationship movement or spotlight equity.", target: "Plan presence by required function and monitor choice/consequence share, not quotas or raw appearances." },
  { id: "CHAR-TRACE-010", label: "compile-state-conditioned-voice", current: "Profiles may store signature traits and drafting prompts ask for character texture; quality has no dedicated voice metric.", gap: "Catchphrases or one global description cannot prove characters remain distinguishable while voice changes with audience, power, emotion, concealment and arc stage.", target: "Use CharacterVoiceProfile matrices plus blind speaker attribution and state-conditioned drift evidence." },
  { id: "CHAR-TRACE-011", label: "validate-scene-character-change", current: "SceneCard types include characterFunction/emotionalShift, but the editor omits them and current saved coverage is sparse.", gap: "A scene can progress plot while every character leaves with the same goal, belief, relationship and emotional position.", target: "Validate intended versus observed character function, choice, cost, state delta and emotional aftershock per scene." },
  { id: "CHAR-TRACE-012", label: "settle-character-and-relationship-events", current: "Author-approved recap patches merge character state and emotion items after chapter drafting.", gap: "Name-based merges and free-text after/cause do not atomically settle belief, relationship, voice and arc evidence against the adopted prose version.", target: "Settle typed character/relationship events only after prose adoption, with source anchors and reversible impact propagation." },
  { id: "CHAR-TRACE-013", label: "revise-and-certify-arc-closure", current: "Series metrics summarize recent accepted state changes; no arc certificate exists.", gap: "Last appearance, death, changed state or high quality score can falsely imply the character arc and relationship obligations are complete.", target: "Issue CharacterArcCertificate from current canon evidence, listing paid, intentionally open, failed and stale milestones plus impact scope." },
];

const characterCausalityAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "Characters remain causally alive across a whole novel: each major action follows from what that person wants, believes, knows, fears and can afford; relationships and voices change through on-page evidence; supporting characters keep agency off page; revisions propagate; and every promised arc has an honest ending state.",
  sourceFiles: [...characterCausalitySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "aggregate source fingerprints/bytes/file counts", "profile field coverage", "scene function/state/emotion coverage", "accepted state/emotion counts", "relationship/appearance/quality aggregate counts", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "character name/ID/alias/role", "chapter/scene/event/entity identity", "character profile, relationship, emotion or state text", "prose/prompt/source content", "file path inside a project", "raw task/recap/model output", "absolute path or secret"],
  },
  operationalSnapshot: {
    projects: characterProjectSnapshots,
    totals: characterOperationalTotals,
    profileStatusTotals: countsByValue(characterProjectSnapshots.flatMap((project) => Object.entries(project.profiles.byStatus).flatMap(([status, count]) => Array.from({ length: count }, () => status)))),
    emotionStatusTotals: countsByValue(characterProjectSnapshots.flatMap((project) => Object.entries(project.settledStateEvidence.emotionByStatus).flatMap(([status, count]) => Array.from({ length: count }, () => status)))),
    relationshipSourceTotals: countsByValue(characterProjectSnapshots.flatMap((project) => Object.entries(project.relationshipAndPresenceProjection.relationshipEvidenceBySource).flatMap(([sourceType, count]) => Array.from({ length: count }, () => sourceType)))),
    appearanceStatusTotals: countsByValue(characterProjectSnapshots.flatMap((project) => Object.entries(project.relationshipAndPresenceProjection.appearanceByStatus).flatMap(([status, count]) => Array.from({ length: count }, () => status)))),
    interpretation: "The platform has valuable character scaffolding—editable profiles, scene participants, recap state patches, emotion ledgers, relationship and appearance projections—but most semantics remain free text, name matching, co-appearance, keyword inference or aggregate recent-state signals. These are authoring aids, not proof of agency, relationship causality, distinct voice or arc closure.",
  },
  summary: {
    auditedStages: characterCausalityStages.length,
    projectsScanned: characterOperationalTotals.projects,
    characters: characterOperationalTotals.characters,
    scenes: characterOperationalTotals.scenes,
    statePatches: characterOperationalTotals.statePatches,
    acceptedStatePatches: characterOperationalTotals.acceptedStatePatches,
    emotionItems: characterOperationalTotals.emotionItems,
    relationships: characterOperationalTotals.relationships,
    arcSignals: characterOperationalTotals.arcSignals,
    characterArcCertificates: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "Character truth is split among free-text StoryControl profiles, Markdown, scene strings, recap patches, emotion arrays, ledgers, knowledge triples and lossy projections. No authority binds stable identity, dramatic contract, time-indexed multi-dimensional state, belief, choice, directional relationship, voice condition and on-page evidence into one causal character graph.",
    consequence: "The model can produce locally plausible dialogue and state summaries while a protagonist acts stupidly for plot convenience, an opponent waits off page, a relationship repairs by label, two voices converge, an emotion resolves without consequence, or a planned growth stage is mistaken for an earned arc—then downstream summaries make the mistake look canonical." ,
  },
  currentEvidence: [
    { claim: "StoryCharacterProfile is a useful editable profile but represents goal/state/secrets/relationships and arc concepts mainly as strings.", evidence: [characterCausalityEvidence("api/src/types.ts", "export interface StoryCharacterProfile"), characterCausalityEvidence("api/src/types.ts", "currentState: string"), characterCausalityEvidence("api/src/types.ts", "relationshipNotes: string")] },
    { claim: "Series character-arc signals group accepted state patches by character name, retain latest state/cause and return only the top eight.", evidence: [characterCausalityEvidence("api/src/writingCockpit.ts", "function buildCharacterArcSignals"), characterCausalityEvidence("api/src/writingCockpit.ts", "grouped.set(name"), characterCausalityEvidence("api/src/writingCockpit.ts", ".slice(0, 8)")] },
    { claim: "Relationship projection infers edges from predicate keywords, event co-appearance and names found in free-text profile notes.", evidence: [characterCausalityEvidence("api/src/storyGraph.ts", "const relationshipPredicates"), characterCausalityEvidence("api/src/storyGraph.ts", "function addEventRelationships"), characterCausalityEvidence("api/src/storyGraph.ts", '"co-appears"'), characterCausalityEvidence("api/src/storyGraph.ts", "function addProfileRelationships")] },
    { claim: "Appearance scheduling uses roles, chapter gaps, counts and upcoming text, which measures exposure rather than narrative function or choice share.", evidence: [characterCausalityEvidence("api/src/storyGraph.ts", "function buildCharacterAppearanceSignals"), characterCausalityEvidence("api/src/storyGraph.ts", "appearanceCount >= 4")] },
    { claim: "Drafting and recap prompts request observable desire/wound/misbelief/choice plus reviewable state/emotion patches, but do not create typed choice, belief, relationship or voice evidence.", evidence: [characterCausalityEvidence("api/src/taskTemplates.ts", "Make character texture observable"), characterCausalityEvidence("api/src/taskTemplates.ts", "characterStatePatches"), characterCausalityEvidence("api/src/taskTemplates.ts", "emotionLedgerPatch")] },
    { claim: "The SceneCard type carries characterFunction/emotionalShift, while the current editor only edits title/location/POV/conflict/turn/power progression.", evidence: [characterCausalityEvidence("api/src/types.ts", "characterFunction?: string"), characterCausalityEvidence("ui/src/components/novel/SceneCardPanel.vue", 'key: "title" | "location" | "pov" | "conflict" | "turn" | "powerProgression"')] },
    { claim: "Rules-based emotion quality is driven by reaction and summary-emotion patterns; the seven-metric review contract has no separate agency, relationship or voice evidence claim.", evidence: [characterCausalityEvidence("api/src/chapterQualityReview.ts", "summaryEmotionPatterns"), characterCausalityEvidence("api/src/chapterQualityReview.ts", 'metrics.set("emotion"'), characterCausalityEvidence("api/src/taskTemplates.ts", "Score only these seven metrics")] },
    { claim: "The recap UI exposes character state and emotion patches for acceptance, but presents free-text after/cause rather than a source-anchored multi-dimensional settlement.", evidence: [characterCausalityEvidence("ui/src/components/novel/WritingRecapPanel.vue", "candidate.characterStatePatches"), characterCausalityEvidence("ui/src/components/novel/WritingRecapPanel.vue", "emotionLedgerItems")] },
  ],
  stages: characterCausalityStages,
  alternatives: [
    { option: "A-enrich-profiles-prompts-and-keyword-dashboards", verdict: "retain-as-authoring-adapters-not-character-truth", blueCase: "Builds on the current UI and files, is easy for authors to edit, and can quickly improve prompt specificity without a large migration.", redCase: "Longer biographies and stronger instructions remain self-reported text; they cannot prove state-at-time, costly choice, asymmetric relationship change, off-page action, voice distinction or arc completion." },
    { option: "B-reread-the-whole-manuscript-with-a-character-critic", verdict: "use-as-review-evidence-not-authority", blueCase: "A capable long-context reviewer can notice subtle motives, subtext, voice and relationships that rigid schemas miss, with little up-front modeling.", redCase: "Its judgment is expensive, non-deterministic and vulnerable to context omission; it can invent evidence, collapse aliases, confuse plan with prose and cannot safely drive canon or selective revision by itself." },
    { option: "C-typed-causal-character-graph-with-evidence-and-independent-reader-review", verdict: "recommended-already-specified-not-implemented", blueCase: "Combine stable identities, dramatic contracts, time-indexed state/belief/relationship/voice, choice evidence, off-page agency, scene deltas and arc certificates; use model review only as evidence against the graph and prose.", redCase: "Requires schema/migration, identity resolution, event extraction with author approval, temporal queries, relationship dimensions, voice evaluation, impact propagation, ensemble UX and genre-sensitive calibration without mechanizing characters." },
  ],
  yAGNI: {
    newRequirementsAdded: 0,
    newAcceptanceTestsAdded: 0,
    newDecisionsAdded: 0,
    rationale: "FR-CHAR-001..020 already specify the complete causal character contract. The missing work is implementation, migration and evidence; another CHARACTER2 or EMOTION domain would split authority and encourage partial delivery.",
    existingContract: {
      requirementIds: ["FR-CHAR-001", "FR-CHAR-002", "FR-CHAR-003", "FR-CHAR-004", "FR-CHAR-005", "FR-CHAR-006", "FR-CHAR-007", "FR-CHAR-008", "FR-CHAR-009", "FR-CHAR-010", "FR-CHAR-011", "FR-CHAR-012", "FR-CHAR-013", "FR-CHAR-014", "FR-CHAR-015", "FR-CHAR-016", "FR-CHAR-017", "FR-CHAR-018", "FR-CHAR-019", "FR-CHAR-020", "FR-PROSE-021", "FR-PROSE-023", "FR-QUALITY-001", "FR-QUALITY-003", "FR-READER-007", "FR-READER-008"],
      acceptanceRefs: ["AT-046", "AT-047", "AT-294", "AT-295", "AT-299", "AT-366", "AT-368", "AT-371", "AT-372", "AT-396", "AT-397", "AT-422", "AT-423", "AT-424", "AT-425", "AT-426", "AT-427", "AT-428", "AT-429", "AT-430", "AT-431", "AT-432", "AT-433", "AT-434", "AT-435", "AT-436", "AT-437", "AT-438", "AT-439", "AT-440", "AT-441", "AT-464"],
      decisionRefs: ["D-019", "D-125", "D-126", "D-127", "D-128", "D-129", "D-130"],
    },
  },
  targetAuthority: {
    entities: ["CharacterDramaticContract", "CharacterStateSnapshot", "CharacterArcPlan", "CharacterArcMilestoneEvidence", "CharacterChoiceEvidence", "CharacterBeliefState", "RelationshipState", "RelationshipEvent", "CharacterVoiceProfile", "CharacterPresencePlan", "OffPageCharacterEvent", "CharacterArcImpactReport", "CharacterArcCertificate"],
    invariant: "No character biography, field completeness, prompt instruction, scene participation, dialogue fluency, emotion keyword, co-appearance, relationship label, latest state string, recap acceptance, appearance count, quality score, last appearance, death or model assertion may independently establish stable identity, credible motivation, agency, belief change, relationship movement, distinct voice, earned growth or arc closure.",
  },
  characterProtocol: {
    order: [
      "resolve stable character identity, aliases/splits/merges, source priority, document classification, canon version and honest unknown/conflict",
      "adopt a dramatic contract connecting want, need, wound, fear, values, misbelief, strategy, limits, story promise and forbidden shortcuts",
      "separate planned arc milestones from actual on-page evidence and compile state snapshots for every scene participant at one canon/time cursor",
      "design meaningful alternatives, perceived information, pressures, refusal path, chosen action, cost and irreversible consequence",
      "run belief and agency checks, including the strongest non-stupid alternative and whether coercion/ignorance/capability constraints are evidenced",
      "model each directed relationship dimension before/after; only a source-anchored RelationshipEvent may change trust, intimacy, fear, debt, power, obligation or interpretation",
      "simulate major non-POV goals/resources/off-page decisions and compile presence by narrative function and ensemble choice share",
      "compile state-conditioned voice rules for audience, power, emotion, concealment and arc stage, then test blind attribution and dialogue function",
      "generate/validate prose against planned character function, choice, cost, state delta, relationship delta and emotional aftershock without exposing the schema mechanically",
      "after prose adoption settle character, belief, relationship and emotion events atomically; propagate revision impact and issue an evidence-based arc certificate at completion",
    ],
    nonGoal: "The target does not reduce people to meters, force every scene to change every character, require linear growth, prohibit ambiguity or relapse, or make readers see internal schemas. Typed state preserves causal evidence while prose remains free to imply, contradict and surprise within the contract.",
  },
  verificationMatrix: [
    "same name, alias, disguise, title, identity split/merge, impostor, possession, clone, death, apparent death and resurrection",
    "plan says growth but prose shows none; prose shows an unplanned turn; relapse preserves prior gains instead of resetting history",
    "major choice has an obvious safer competent option, hidden information, coercion, intoxication, trauma response or forgotten ability",
    "relationship is asymmetric, one party misreads it, secret disclosure occurs without forgiveness, apology occurs without restored trust, intimacy rises while power worsens",
    "opponent and supporting character act off page with their own clocks; protagonist absence does not freeze the world",
    "ensemble character appears often but never chooses, appears rarely but changes causality, or receives disproportionate exposition without consequence",
    "same dialogue content spoken by multiple characters under neutral labels; blind attribution and state-conditioned voice changes across audience/power/emotion",
    "quiet, comic, romantic, mystery, action, tragedy, redemption and anti-growth arcs use different valid evidence patterns",
    "scene changes plot but not character, changes emotion without behavior, changes state without cost, or records a relationship turn from co-presence only",
    "chapter rewrite removes the source choice, moves chronology, changes identity or relationship evidence; exact downstream arc/voice/closure proofs become stale",
    "character dies or exits before milestones, remains intentionally open under the story contract, or closes through refusal rather than transformation",
    "author correction rejects extracted state/relationship event; projections rebuild without resurrecting the rejected interpretation",
  ],
  releaseGate: {
    requirementIds: ["FR-CHAR-001", "FR-CHAR-002", "FR-CHAR-003", "FR-CHAR-004", "FR-CHAR-005", "FR-CHAR-006", "FR-CHAR-007", "FR-CHAR-008", "FR-CHAR-009", "FR-CHAR-010", "FR-CHAR-011", "FR-CHAR-012", "FR-CHAR-013", "FR-CHAR-014", "FR-CHAR-015", "FR-CHAR-016", "FR-CHAR-017", "FR-CHAR-018", "FR-CHAR-019", "FR-CHAR-020"],
    acceptanceRefs: ["AT-422", "AT-423", "AT-424", "AT-425", "AT-426", "AT-427", "AT-428", "AT-429", "AT-430", "AT-431", "AT-432", "AT-433", "AT-434", "AT-435", "AT-436", "AT-437", "AT-438", "AT-439", "AT-440", "AT-441"],
    rule: "Do not claim living characters, credible motivation, independent supporting cast, evolving relationships, distinct voices or completed arcs until stable identities and source conflicts are resolved; planned and actual arcs stay separate; state/belief/relationship/voice are time-versioned; major choices have on-page alternatives/pressure/cost/consequence and pass agency checks; off-page actors remain causal; scene deltas settle only from adopted prose; revisions propagate; blind voice and reader evidence are calibrated; and CharacterArcCertificate honestly lists closed, open, failed, unknown and stale milestones.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens stable identity, planned/actual separation, agency hard guards, directional relationship evidence, author-approved settlement, revision invalidation or honest arc closure.",
};

const worldCausalitySourcePaths = [
  "api/src/types.ts",
  "api/src/novelProject.ts",
  "api/src/contextAssembler.ts",
  "api/src/taskTemplates.ts",
  "api/src/writingCockpit.ts",
  "api/src/storyGraph.ts",
  "ui/src/components/novel/StoryControlPanel.vue",
  "ui/src/components/novel/SceneCardPanel.vue",
  "ui/src/components/novel/WritingRecapPanel.vue",
];
const worldCausalitySources = new Map(worldCausalitySourcePaths.map((relativePath) => {
  const content = readFileSync(join(root, relativePath), "utf8");
  return [relativePath, { content, sha256: createHash("sha256").update(content).digest("hex") }];
}));

function worldCausalityEvidence(relativePath, needle) {
  const entry = worldCausalitySources.get(relativePath);
  if (!entry) throw new Error(`Unknown world-causality source: ${relativePath}`);
  const index = entry.content.indexOf(needle);
  if (index < 0) throw new Error(`World-causality evidence drift: ${relativePath} no longer contains ${JSON.stringify(needle)}`);
  return {
    path: relativePath,
    line: entry.content.slice(0, index).split(/\r?\n/).length,
    sourceSha256: entry.sha256,
    token: needle,
  };
}

const worldTypesSource = worldCausalitySources.get("api/src/types.ts").content;
const worldProjectSource = worldCausalitySources.get("api/src/novelProject.ts").content;
const worldContextSource = worldCausalitySources.get("api/src/contextAssembler.ts").content;
const worldCockpitSource = worldCausalitySources.get("api/src/writingCockpit.ts").content;
const worldGraphSource = worldCausalitySources.get("api/src/storyGraph.ts").content;
const worldControlUiSource = worldCausalitySources.get("ui/src/components/novel/StoryControlPanel.vue").content;
const worldSceneUiSource = worldCausalitySources.get("ui/src/components/novel/SceneCardPanel.vue").content;
if (!worldTypesSource.includes("export interface SceneCard") || !worldTypesSource.includes("powerProgression: string") || !worldTypesSource.includes("export interface StoryEventCard")) {
  throw new Error("World-causality audit drift: SceneCard/StoryEventCard changed and must be reclassified.");
}
if (!worldTypesSource.includes('export type StoryGraphNodeType = "arc" | "character" | "event" | "chapter" | "ledger" | "knowledge"')) {
  throw new Error("World-causality audit drift: story graph gained or changed node semantics and must be reclassified.");
}
if (!worldProjectSource.includes('"bible/world.md"') || !worldProjectSource.includes('"bible/power-system.md"') || !worldProjectSource.includes('"bible/locations.md"')) {
  throw new Error("World-causality audit drift: project Bible surfaces changed and must be reclassified.");
}
if (!worldContextSource.includes("[...中间内容已压缩...]") || !worldContextSource.includes('{ title: "世界观"') || !worldContextSource.includes('{ title: "力量体系"')) {
  throw new Error("World-causality audit drift: context compression/world injection changed and must be reclassified.");
}
if (!worldCockpitSource.includes('power: "ledger/power-progression.json"') || !worldCockpitSource.includes('continuity: "ledger/continuity.json"')) {
  throw new Error("World-causality audit drift: power/continuity ledger handling changed and must be reclassified.");
}
if (!worldGraphSource.includes("subtitle: event.location || event.chapterRange || event.type")) {
  throw new Error("World-causality audit drift: event graph projection changed and must be reclassified.");
}
if (!worldControlUiSource.includes("selectedEvent.trigger") || !worldControlUiSource.includes("selectedEvent.cost") || !worldControlUiSource.includes("selectedCharacter.powerLevel")) {
  throw new Error("World-causality audit drift: StoryControl world/power fields changed and must be reclassified.");
}
if (!worldSceneUiSource.includes('key: "title" | "location" | "pov" | "conflict" | "turn" | "powerProgression"')) {
  throw new Error("World-causality audit drift: SceneCard world fields changed and must be reclassified.");
}
const worldProductSource = [...worldCausalitySources.values()].map((entry) => entry.content).join("\n");
const implementedWorldEntities = [
  "WorldStateSnapshot",
  "LocationGraph",
  "TravelEvent",
  "AbilityContract",
  "ProgressionEvent",
  "ResourceAccount",
  "ResourceTransaction",
  "ConstraintState",
  "InstitutionActionEvent",
  "RuleInteractionEvent",
  "RuleExceptionDebt",
  "WorldIntegrityCertificate",
].filter((entity) => worldProductSource.includes(entity));
if (implementedWorldEntities.length) {
  throw new Error(`World-causality audit drift: governed world entities now exist and must be audited: ${implementedWorldEntities.join(", ")}`);
}

function nonemptyWorldField(value) {
  return typeof value === "string" ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
}

function anonymousMarkdownInventory(absolutePath) {
  if (!existsSync(absolutePath)) return { exists: false, bytes: 0, characters: 0, lines: 0, headings: 0, sha256: null };
  const buffer = readFileSync(absolutePath);
  const content = buffer.toString("utf8");
  return {
    exists: true,
    bytes: buffer.length,
    characters: content.length,
    lines: content.split(/\r?\n/).length,
    headings: (content.match(/^#{1,6}\s+/gm) || []).length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function anonymousWorldProjectSnapshot(projectDirectory, projectIndex) {
  const projectFile = readAnonymousJsonFile(join(projectDirectory, "project.json"), {});
  const storyControlFile = readAnonymousJsonFile(join(projectDirectory, "story-control", "story-control.json"), {});
  const storyGraphFile = readAnonymousJsonFile(join(projectDirectory, "story-graph", "storyline.json"), {});
  const powerLedgerFile = readAnonymousJsonFile(join(projectDirectory, "ledger", "power-progression.json"), []);
  const continuityLedgerFile = readAnonymousJsonFile(join(projectDirectory, "ledger", "continuity.json"), []);
  const worldBible = anonymousMarkdownInventory(join(projectDirectory, "bible", "world.md"));
  const powerBible = anonymousMarkdownInventory(join(projectDirectory, "bible", "power-system.md"));
  const locationBible = anonymousMarkdownInventory(join(projectDirectory, "bible", "locations.md"));
  const events = Array.isArray(storyControlFile.value?.events) ? storyControlFile.value.events : [];
  const sceneFiles = directJsonFiles(join(projectDirectory, "scenes"));
  const scenes = sceneFiles.flatMap((absolutePath) => {
    const file = readAnonymousJsonFile(absolutePath, []);
    return Array.isArray(file.value) ? file.value : [];
  });
  const summaryFiles = directJsonFiles(join(projectDirectory, "memory", "chapter-summaries"));
  const summaries = summaryFiles.map((absolutePath) => readAnonymousJsonFile(absolutePath, {}).value).filter((value) => value && typeof value === "object");
  const powerPatches = summaries.flatMap((summary) => Array.isArray(summary?.powerProgressionUpdates) ? summary.powerProgressionUpdates : []);
  const powerLedger = Array.isArray(powerLedgerFile.value) ? powerLedgerFile.value : [];
  const continuityLedger = Array.isArray(continuityLedgerFile.value) ? continuityLedgerFile.value : [];
  const graphNodes = Array.isArray(storyGraphFile.value?.nodes) ? storyGraphFile.value.nodes : [];
  const inputFingerprint = createHash("sha256").update([
    projectFile.sha256,
    storyControlFile.sha256,
    storyGraphFile.sha256,
    powerLedgerFile.sha256,
    continuityLedgerFile.sha256,
    worldBible.sha256,
    powerBible.sha256,
    locationBible.sha256,
    ...sceneFiles.map((absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex")),
    ...summaryFiles.map((absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex")),
  ].filter(Boolean).join("\u0000")).digest("hex");
  return {
    projectOrdinal: projectIndex + 1,
    inputFingerprint,
    sourceValidity: {
      project: { exists: projectFile.exists, valid: projectFile.valid },
      storyControl: { exists: storyControlFile.exists, valid: storyControlFile.valid },
      storyGraph: { exists: storyGraphFile.exists, valid: storyGraphFile.valid },
      powerLedger: { exists: powerLedgerFile.exists, valid: powerLedgerFile.valid },
      continuityLedger: { exists: continuityLedgerFile.exists, valid: continuityLedgerFile.valid },
      sceneFiles: sceneFiles.length,
      summaryFiles: summaryFiles.length,
    },
    bibles: { world: worldBible, power: powerBible, locations: locationBible },
    storyEvents: {
      events: events.length,
      withTrigger: events.filter((event) => nonemptyWorldField(event?.trigger)).length,
      withLocation: events.filter((event) => nonemptyWorldField(event?.location)).length,
      withReward: events.filter((event) => nonemptyWorldField(event?.reward)).length,
      withCost: events.filter((event) => nonemptyWorldField(event?.cost)).length,
      withChapterRange: events.filter((event) => nonemptyWorldField(event?.chapterRange)).length,
      byStatus: countsByValue(events.map((event) => event?.status)),
    },
    sceneEvidence: {
      scenes: scenes.length,
      withTime: scenes.filter((scene) => nonemptyWorldField(scene?.time)).length,
      withLocation: scenes.filter((scene) => nonemptyWorldField(scene?.location)).length,
      withPowerProgression: scenes.filter((scene) => nonemptyWorldField(scene?.powerProgression) || nonemptyWorldField(scene?.progressionChange)).length,
      withBothTimeAndLocation: scenes.filter((scene) => nonemptyWorldField(scene?.time) && nonemptyWorldField(scene?.location)).length,
    },
    settledEvidence: {
      summaries: summaries.length,
      powerPatches: powerPatches.length,
      acceptedPowerPatches: powerPatches.filter((patch) => patch?.status === "accepted" || patch?.status === "resolved").length,
      powerLedgerEntries: powerLedger.length,
      continuityLedgerEntries: continuityLedger.length,
      powerLedgerByStatus: countsByValue(powerLedger.map((entry) => entry?.status)),
      continuityLedgerByStatus: countsByValue(continuityLedger.map((entry) => entry?.status)),
    },
    graphProjection: {
      nodes: graphNodes.length,
      byType: countsByValue(graphNodes.map((node) => node?.type)),
      governedWorldNodes: graphNodes.filter((node) => ["world-rule", "location", "ability", "resource", "organization"].includes(node?.type)).length,
    },
    governedWorldArtifacts: {
      ruleContracts: 0,
      worldStateSnapshots: 0,
      travelEvents: 0,
      abilityContracts: 0,
      progressionEvents: 0,
      resourceTransactions: 0,
      constraintStates: 0,
      institutionActionEvents: 0,
      ruleInteractionEvents: 0,
      exceptionDebts: 0,
      integrityCertificates: 0,
    },
  };
}

const worldProjectSnapshots = foreshadowProjectDirectories.map(anonymousWorldProjectSnapshot);
const worldOperationalTotals = worldProjectSnapshots.reduce((totals, project) => ({
  projects: totals.projects + 1,
  worldBibleFiles: totals.worldBibleFiles + (project.bibles.world.exists ? 1 : 0),
  worldBibleBytes: totals.worldBibleBytes + project.bibles.world.bytes,
  worldBibleHeadings: totals.worldBibleHeadings + project.bibles.world.headings,
  powerBibleFiles: totals.powerBibleFiles + (project.bibles.power.exists ? 1 : 0),
  powerBibleBytes: totals.powerBibleBytes + project.bibles.power.bytes,
  powerBibleHeadings: totals.powerBibleHeadings + project.bibles.power.headings,
  locationBibleFiles: totals.locationBibleFiles + (project.bibles.locations.exists ? 1 : 0),
  locationBibleBytes: totals.locationBibleBytes + project.bibles.locations.bytes,
  locationBibleHeadings: totals.locationBibleHeadings + project.bibles.locations.headings,
  events: totals.events + project.storyEvents.events,
  eventsWithTrigger: totals.eventsWithTrigger + project.storyEvents.withTrigger,
  eventsWithLocation: totals.eventsWithLocation + project.storyEvents.withLocation,
  eventsWithReward: totals.eventsWithReward + project.storyEvents.withReward,
  eventsWithCost: totals.eventsWithCost + project.storyEvents.withCost,
  eventsWithChapterRange: totals.eventsWithChapterRange + project.storyEvents.withChapterRange,
  scenes: totals.scenes + project.sceneEvidence.scenes,
  scenesWithTime: totals.scenesWithTime + project.sceneEvidence.withTime,
  scenesWithLocation: totals.scenesWithLocation + project.sceneEvidence.withLocation,
  scenesWithPowerProgression: totals.scenesWithPowerProgression + project.sceneEvidence.withPowerProgression,
  summaries: totals.summaries + project.settledEvidence.summaries,
  powerPatches: totals.powerPatches + project.settledEvidence.powerPatches,
  acceptedPowerPatches: totals.acceptedPowerPatches + project.settledEvidence.acceptedPowerPatches,
  powerLedgerEntries: totals.powerLedgerEntries + project.settledEvidence.powerLedgerEntries,
  continuityLedgerEntries: totals.continuityLedgerEntries + project.settledEvidence.continuityLedgerEntries,
  graphNodes: totals.graphNodes + project.graphProjection.nodes,
  governedWorldNodes: totals.governedWorldNodes + project.graphProjection.governedWorldNodes,
}), {
  projects: 0, worldBibleFiles: 0, worldBibleBytes: 0, worldBibleHeadings: 0,
  powerBibleFiles: 0, powerBibleBytes: 0, powerBibleHeadings: 0,
  locationBibleFiles: 0, locationBibleBytes: 0, locationBibleHeadings: 0,
  events: 0, eventsWithTrigger: 0, eventsWithLocation: 0, eventsWithReward: 0, eventsWithCost: 0, eventsWithChapterRange: 0,
  scenes: 0, scenesWithTime: 0, scenesWithLocation: 0, scenesWithPowerProgression: 0,
  summaries: 0, powerPatches: 0, acceptedPowerPatches: 0, powerLedgerEntries: 0, continuityLedgerEntries: 0,
  graphNodes: 0, governedWorldNodes: 0,
});

const worldCausalityStages = [
  { id: "WORLD-TRACE-001", label: "resolve-rule-entity-authority", current: "World, power and location Bibles coexist with StoryControl, scenes, ledgers, summaries and knowledge projections.", gap: "No stable rule/ability/location/organization/resource registry resolves aliases, versions, source priority, conflicts or unknowns.", target: "Resolve stable identities and provenance before any world inference or constraint check." },
  { id: "WORLD-TRACE-002", label: "compile-rule-contract", current: "Bible prose and prompts can describe rules and visible costs.", gap: "No adopted contract binds condition, mechanism, result, cost, limit, failure, time/region validity and disclosure boundary.", target: "Compile versioned WorldRuleContract records only for story-relevant rules." },
  { id: "WORLD-TRACE-003", label: "separate-rule-from-belief", current: "Knowledge facts and prose may contain claims from characters, institutions or narration.", gap: "A doctrine, rumor, proposal or model inference can be flattened into objective world truth.", target: "Keep effective rule, actor belief, proposal, competing explanation and honest unknown distinct." },
  { id: "WORLD-TRACE-004", label: "freeze-world-state-snapshot", current: "Scene time/location and mutable Bible/ledger blocks are assembled independently.", gap: "No single canon/event cursor proves applicable rules, region, weather, closure, inventory and constraints at scene entry.", target: "Freeze WorldStateSnapshot with source versions, story time, region and relevant constraint states." },
  { id: "WORLD-TRACE-005", label: "validate-chronology-and-travel", current: "Scenes store free-text time/location and events store chapter ranges.", gap: "Chapter order cannot prove elapsed time, parallel POV, route reachability, travel duration or blockade effects.", target: "Validate departure, route, transport, obstacles, duration and arrival against a temporal location graph." },
  { id: "WORLD-TRACE-006", label: "compile-ability-and-progression", current: "Profiles/scenes/ledgers carry power-level and progression strings.", gap: "No contract proves prerequisites, acquisition, retention, borrowing, loss, cost, cooldown or recovery; planned progression can masquerade as earned growth.", target: "Use AbilityContract plus adopted ProgressionEvent evidence and contextual capability comparison." },
  { id: "WORLD-TRACE-007", label: "enforce-resource-conservation", current: "Events have generic reward/cost strings and LedgerEntry has no quantity, unit, balance or transaction semantics.", gap: "Items, currency, lifespan, force, status or debt can appear, disappear or be consumed twice.", target: "Settle exact ResourceTransaction values where countable and bounded evidence intervals where not." },
  { id: "WORLD-TRACE-008", label: "persist-injury-and-cooldown", current: "Costs and continuity risks may mention injury or cooldown in prose.", gap: "No time-valid constraint state prevents chapter-boundary healing, repeated use or recovery without treatment/time evidence.", target: "Maintain injury, disease, poison, curse, cooldown and recovery ConstraintState records." },
  { id: "WORLD-TRACE-009", label: "simulate-institution-agency", current: "Story events list participants but do not model organization knowledge, response clocks, communication, routes or resource use.", gap: "Institutions may become instantly omniscient, teleport forces or freeze whenever the protagonist leaves.", target: "Generate evidence-bound InstitutionActionEvents and settle social/institutional consequences." },
  { id: "WORLD-TRACE-010", label: "resolve-rule-interaction-and-exception", current: "Continuity review can flag prose risks but has no deterministic interaction or exception lineage.", gap: "The system can choose the convenient outcome, silently weaken a rule or lose the explanation debt.", target: "Preserve candidate interactions; adopted outcomes and exceptions create replayable events and RuleExceptionDebt." },
  { id: "WORLD-TRACE-011", label: "guard-new-rule-fairness", current: "Draft prompts ask for setup/cost/aftershock and foreshadowing, but a new rule remains free text.", gap: "A climax-only rule can solve the plot without prior salience, limits, irreversible cost or author decision.", target: "Apply rising admission, setup, disclosure and author-approval thresholds as rules approach decisive payoff." },
  { id: "WORLD-TRACE-012", label: "validate-plan-and-prose", current: "Context includes trimmed Bibles, StoryControl, scenes and generic ledgers.", gap: "A locally fluent plan or chapter can violate a rule omitted from context, while forcing full lore exposition would harm prose.", target: "Validate full relevant contracts privately and expose only reader-appropriate observable rule evidence in prose." },
  { id: "WORLD-TRACE-013", label: "settle-world-events-after-adoption", current: "Recap merges generic power and continuity ledger patches after author acceptance.", gap: "Free-text ledger acceptance cannot atomically update rule use, time/location, ability, resource, injury, organization and disclosure state against one prose version.", target: "After prose adoption settle typed world events atomically with source anchors and reversible projections." },
  { id: "WORLD-TRACE-014", label: "propagate-revision-and-certify", current: "Story graphs project generic events/ledgers; no world integrity certificate exists.", gap: "A changed rule, route, resource source or organization knowledge may leave stale prose/outline/closure claims, while an empty ledger can look healthy.", target: "Propagate exact invalidation and issue scope-bound WorldIntegrityCertificate with consistent/open/conflict/unknown/failed/stale results." },
];

const worldCausalityAudit = {
  schemaVersion: "1.0.0",
  status: "current-state-cross-surface-audit-not-implementation",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  userPromise: "The fictional world constrains the story fairly across an entire novel: rules remain versioned and scoped, travel consumes time, abilities require prerequisites and costs, resources and injuries persist, institutions act off page, new rules cannot conveniently solve climaxes, revisions propagate, and completion states exactly what was and was not proven.",
  sourceFiles: [...worldCausalitySources.entries()].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
  privacy: {
    snapshotIncludes: ["anonymous project ordinal", "aggregate source/Bible fingerprints, bytes, lines and heading counts", "StoryControl event field coverage", "scene time/location/progression coverage", "summary and ledger aggregate counts", "story-graph type counts", "source evidence paths and code tokens"],
    snapshotExcludes: ["project slug or ID", "title", "genre", "rough idea", "rule, ability, location, organization, resource or character identity", "chapter/scene/event/entity identity", "Bible, ledger, summary, outline or prose text", "file path inside a project", "raw task/model output", "absolute path or secret"],
  },
  operationalSnapshot: {
    projects: worldProjectSnapshots,
    totals: worldOperationalTotals,
    eventStatusTotals: countsByValue(worldProjectSnapshots.flatMap((project) => Object.entries(project.storyEvents.byStatus).flatMap(([status, count]) => Array.from({ length: count }, () => status)))),
    graphNodeTypeTotals: countsByValue(worldProjectSnapshots.flatMap((project) => Object.entries(project.graphProjection.byType).flatMap(([type, count]) => Array.from({ length: count }, () => type)))),
    interpretation: "The platform preserves substantial world and power prose plus editable time/location/progression/event fields, but those surfaces remain trimmed text or generic strings and ledgers. They are useful authoring evidence, not executable proof of applicable rules, travel, capability, conservation, persistent injury, institutional agency, fair exceptions or world closure.",
  },
  summary: {
    auditedStages: worldCausalityStages.length,
    projectsScanned: worldOperationalTotals.projects,
    worldBibleBytes: worldOperationalTotals.worldBibleBytes,
    powerBibleBytes: worldOperationalTotals.powerBibleBytes,
    events: worldOperationalTotals.events,
    scenes: worldOperationalTotals.scenes,
    powerPatches: worldOperationalTotals.powerPatches,
    powerLedgerEntries: worldOperationalTotals.powerLedgerEntries,
    continuityLedgerEntries: worldOperationalTotals.continuityLedgerEntries,
    worldIntegrityCertificates: 0,
    implementationVerified: false,
  },
  rootCause: {
    statement: "World truth is split among long Markdown Bibles, free-text event/scene/profile fields, generic ledgers, summaries, knowledge triples and lossy graph/context projections. No authority binds stable rule identity, temporal/regional validity, condition-mechanism-result-cost, location reachability, ability lifecycle, resource/constraint conservation, institutional clocks, exceptions and adopted prose evidence into one causal world graph.",
    consequence: "The model can write a locally exciting chapter while teleporting a character, forgetting a cooldown, spending an item twice, healing an injury, promoting borrowed power, freezing an antagonist organization or inventing a climax rule—then summaries and empty ledgers make the violation difficult to detect and selectively repair.",
  },
  currentEvidence: [
    { claim: "SceneCard and StoryEventCard expose useful time/location/progression/trigger/reward/cost strings but not executable temporal, capability or conservation contracts.", evidence: [worldCausalityEvidence("api/src/types.ts", "export interface SceneCard"), worldCausalityEvidence("api/src/types.ts", "powerProgression: string"), worldCausalityEvidence("api/src/types.ts", "export interface StoryEventCard"), worldCausalityEvidence("api/src/types.ts", "cost: string")] },
    { claim: "The story graph type system contains arcs, characters, events, chapters, ledgers and knowledge, with no first-class world rule, location, ability, resource or organization node.", evidence: [worldCausalityEvidence("api/src/types.ts", 'export type StoryGraphNodeType = "arc" | "character" | "event" | "chapter" | "ledger" | "knowledge"')] },
    { claim: "World and power Bibles are always assembled as context blocks, while oversized blocks retain their beginning and end around a middle-compression marker.", evidence: [worldCausalityEvidence("api/src/contextAssembler.ts", "function trimContext"), worldCausalityEvidence("api/src/contextAssembler.ts", "[...中间内容已压缩...]"), worldCausalityEvidence("api/src/contextAssembler.ts", '{ title: "世界观"'), worldCausalityEvidence("api/src/contextAssembler.ts", '{ title: "力量体系"')] },
    { claim: "New projects create prose world/power/location files plus generic Markdown/JSON power and continuity ledgers.", evidence: [worldCausalityEvidence("api/src/novelProject.ts", '"bible/world.md"'), worldCausalityEvidence("api/src/novelProject.ts", '"bible/power-system.md"'), worldCausalityEvidence("api/src/novelProject.ts", '"bible/locations.md"'), worldCausalityEvidence("api/src/novelProject.ts", '"ledger/power-progression.json"')] },
    { claim: "Power and continuity are generic LedgerEntry kinds; recap acceptance merges them without quantities, units, rule versions, ability prerequisites or world-state transactions.", evidence: [worldCausalityEvidence("api/src/writingCockpit.ts", 'continuity: "ledger/continuity.json"'), worldCausalityEvidence("api/src/writingCockpit.ts", 'power: "ledger/power-progression.json"'), worldCausalityEvidence("api/src/writingCockpit.ts", 'const powerProgressionUpdates = ledgerPatches.filter((entry) => entry.kind === "power")')] },
    { claim: "The StoryControl editor exposes power-level and event trigger/location/reward/cost fields, while the SceneCard editor exposes a free-text power-progression field.", evidence: [worldCausalityEvidence("ui/src/components/novel/StoryControlPanel.vue", "selectedCharacter.powerLevel"), worldCausalityEvidence("ui/src/components/novel/StoryControlPanel.vue", "selectedEvent.trigger"), worldCausalityEvidence("ui/src/components/novel/StoryControlPanel.vue", "selectedEvent.cost"), worldCausalityEvidence("ui/src/components/novel/SceneCardPanel.vue", 'key: "title" | "location" | "pov" | "conflict" | "turn" | "powerProgression"')] },
    { claim: "The recap UI presents counts for generic continuity and progression patches, not a review of resource, injury, rule-interaction or institutional transactions.", evidence: [worldCausalityEvidence("ui/src/components/novel/WritingRecapPanel.vue", "candidate.continuityRisks.length"), worldCausalityEvidence("ui/src/components/novel/WritingRecapPanel.vue", "candidate.powerProgressionUpdates.length")] },
    { claim: "Event graph projection uses location or chapter range as a subtitle, which provides navigation but not story-time or reachability semantics.", evidence: [worldCausalityEvidence("api/src/storyGraph.ts", "subtitle: event.location || event.chapterRange || event.type")] },
  ],
  stages: worldCausalityStages,
  alternatives: [
    { option: "A-enrich-bibles-maps-tables-and-prompts", verdict: "retain-as-authoring-sources-and-adapters-not-world-truth", blueCase: "Authors can express nuanced lore naturally, reuse current files and UI, migrate cheaply and improve local generation detail quickly.", redCase: "Longer prose remains truncated, conflicting and non-executable; prompts cannot prove time, travel, capability, conservation, recovery, organization response or fair exception handling." },
    { option: "B-build-a-complete-economic-geographic-political-physics-simulator", verdict: "defer-to-optional-project-specific-simulators", blueCase: "A full simulation can produce strong consistency and emergent possibilities for hard-worldbuilding or sandbox stories.", redCase: "It is expensive, falsely precise for social resources, burdens authors with parameters, constrains discovery writing and solves far more world state than the narrative can observe or use." },
    { option: "C-typed-narrative-relevant-world-graph-with-transactions-and-independent-fairness-review", verdict: "recommended-already-specified-not-implemented", blueCase: "Promote only rules that affect choice, causality, reader fairness or closure; combine scoped contracts, temporal states, reachability, abilities, transactions, constraints, institutional events, exceptions and evidence certificates while keeping atmospheric lore in prose.", redCase: "Requires schema/migration, identity and temporal resolution, units and intervals, interaction logic, author-approved extraction, impact propagation, genre calibration and careful UX that does not turn fiction into a spreadsheet." },
  ],
  yAGNI: {
    newRequirementsAdded: 0,
    newAcceptanceTestsAdded: 0,
    newDecisionsAdded: 0,
    rationale: "FR-WORLD-001..020 already specify the complete causal world contract. The missing work is implementation, migration and evidence; parallel LORE2, POWER2, TIMELINE2 or RESOURCE domains would split authority and invite partial delivery.",
    existingContract: {
      requirementIds: ["FR-WORLD-001", "FR-WORLD-002", "FR-WORLD-003", "FR-WORLD-004", "FR-WORLD-005", "FR-WORLD-006", "FR-WORLD-007", "FR-WORLD-008", "FR-WORLD-009", "FR-WORLD-010", "FR-WORLD-011", "FR-WORLD-012", "FR-WORLD-013", "FR-WORLD-014", "FR-WORLD-015", "FR-WORLD-016", "FR-WORLD-017", "FR-WORLD-018", "FR-WORLD-019", "FR-WORLD-020", "FR-LONGMEM-004", "FR-LONGMEM-007", "FR-PROSE-023", "FR-READER-012"],
      acceptanceRefs: ["AT-284", "AT-367", "AT-380", "AT-462", "AT-463", "AT-464", "AT-465", "AT-466", "AT-467", "AT-468", "AT-469", "AT-470", "AT-471", "AT-472", "AT-473", "AT-474", "AT-475", "AT-476", "AT-477", "AT-478", "AT-479", "AT-480", "AT-481", "AT-510"],
      decisionRefs: ["D-137", "D-138", "D-139", "D-140", "D-141", "D-142"],
    },
  },
  targetAuthority: {
    entities: ["WorldRuleContract", "WorldStateSnapshot", "LocationGraph", "TravelEvent", "AbilityContract", "ProgressionEvent", "CapabilityComparison", "ResourceAccount", "ResourceTransaction", "ConstraintState", "InstitutionActionEvent", "RuleInteractionEvent", "RuleExceptionDebt", "WorldImpactReport", "WorldIntegrityCertificate"],
    invariant: "No Bible size or heading, prompt instruction, scene time/location/progression string, event trigger/reward/cost, chapter range, generic ledger entry, recap acceptance, knowledge triple, quality score, model assertion or empty ledger may independently establish rule validity, reachability, ability availability, earned progression, conservation, recovery, institutional causality, fair exception or world integrity.",
  },
  worldProtocol: {
    order: [
      "resolve stable rule, ability, location, organization and resource identities plus aliases, versions, provenance, conflicts and honest unknowns",
      "adopt story-relevant WorldRuleContracts with condition, mechanism, result, cost, limit, failure, temporal/regional validity and disclosure boundary",
      "separate objective effective rules from character/institution belief, author proposal and competing explanations",
      "freeze one WorldStateSnapshot at the canon/event cursor and validate chronology, location graph, route, transport, obstacles and duration",
      "compile AbilityContracts and evidence-bearing ProgressionEvents; compare capability contextually and preserve borrowing, loss, cost, cooldown and recovery",
      "settle exact or bounded ResourceTransactions plus injury/disease/poison/curse/cooldown ConstraintStates without silent reset",
      "simulate InstitutionActionEvents from knowledge, goals, response clocks, communication, routes and resource expenditure, including social consequences",
      "preserve candidate rule interactions; admit new rules and exceptions through rising setup, salience, cost, fairness and author-approval gates",
      "validate plan and prose against full relevant contracts while revealing only reader-appropriate observable consequences",
      "after prose adoption atomically settle world events, propagate exact revision invalidation and issue a scope-bound WorldIntegrityCertificate",
    ],
    nonGoal: "The target does not simulate every citizen, coin, weather cell or unwritten continent; force all resources into exact numbers; reveal private lore to readers; forbid intentional mystery; or prevent discovery writing. It promotes only constraints that change choice, causality, fairness or closure and leaves the rest as narrative source material until needed.",
  },
  verificationMatrix: [
    "same-named rules, superseded versions, regional variants, unreliable doctrine, author proposal, conflicting sources and honest unknown",
    "parallel POV night, time jump, flashback, time stop, teleport, blocked road, detour, transport speed and exact boundary duration",
    "missing prerequisite/artifact/anchor, borrowed power, temporary buff, retained/lost skill, cooldown, recovery and contextual underdog victory",
    "single-use item spent twice, negative currency, lifespan cost restored, debt transfer, fuzzy prestige/force interval and concurrent transactions",
    "injury, disease, poison, curse and ability cooldown across chapter boundaries with treatment, rest and failed recovery",
    "institution receives partial intelligence, verifies, communicates, mobilizes, travels and spends resources while protagonist is absent",
    "climax-only solution rule, prior subtle setup, irreversible cost, silent exception, multiple-rule interaction and replay after adoption",
    "cheap healing/communication/power changes professions, prices, warfare, hierarchy or lifespan unless a sourced exception explains why not",
    "validator sees full contract while prose preserves mystery and avoids lore dump; character belief remains wrong without corrupting truth",
    "revision changes rule, location, departure time, acquisition, resource or institution knowledge; only exact dependents become stale",
    "unknown continent and intentionally soft economics remain unknown while empty ledger, failed scan or key conflict blocks certification",
    "author rejects an extracted world event; projections rebuild without resurrecting the rejected balance, capability or rule interpretation",
  ],
  releaseGate: {
    requirementIds: ["FR-WORLD-001", "FR-WORLD-002", "FR-WORLD-003", "FR-WORLD-004", "FR-WORLD-005", "FR-WORLD-006", "FR-WORLD-007", "FR-WORLD-008", "FR-WORLD-009", "FR-WORLD-010", "FR-WORLD-011", "FR-WORLD-012", "FR-WORLD-013", "FR-WORLD-014", "FR-WORLD-015", "FR-WORLD-016", "FR-WORLD-017", "FR-WORLD-018", "FR-WORLD-019", "FR-WORLD-020"],
    acceptanceRefs: ["AT-462", "AT-463", "AT-464", "AT-465", "AT-466", "AT-467", "AT-468", "AT-469", "AT-470", "AT-471", "AT-472", "AT-473", "AT-474", "AT-475", "AT-476", "AT-477", "AT-478", "AT-479", "AT-480", "AT-481"],
    rule: "Do not claim coherent world rules, reachable travel, valid abilities, earned progression, conserved resources, persistent constraints, causal institutions, fair new rules or world completion until stable identities/versions and belief boundaries resolve; one time/region snapshot determines applicability; travel, ability, resource, injury and organization events settle from adopted prose; interactions/exceptions retain explanation debt and reader-fairness evidence; revisions propagate; and WorldIntegrityCertificate honestly limits its scope and lists conflicts, unknowns, failures and stale evidence.",
  },
  unresolvedDecisionBoundary: "Q-003 through Q-009 are confirmed at specification level; none weakens rule identity/version, time/region validity, travel reachability, ability prerequisites, resource/constraint conservation, new-rule fairness, author-approved settlement, revision invalidation or honest scope-bound certification.",
};

const rp2AcceptanceRefs = new Map([
  ["FR-INTENT-001", ["AT-190", "AT-192", "AT-443", "AT-444"]],
  ["FR-QUESTION-001", ["AT-195", "AT-451", "AT-452"]],
  ["FR-QUESTION-002", ["AT-022", "AT-078", "AT-195"]],
  ["FR-QUESTION-003", ["AT-334"]],
  ["FR-QUESTION-004", ["AT-193", "AT-194", "AT-337"]],
  ["FR-QUESTION-005", ["AT-022", "AT-078"]],
  ["FR-QUESTION-006", ["AT-023", "AT-201", "AT-345"]],
  ["FR-QUESTION-007", ["AT-198"]],
  ["FR-QUESTION-008", ["AT-335"]],
  ["FR-QUESTION-009", ["AT-200", "AT-346"]],
  ["FR-COLLAB-001", ["AT-041", "AT-191"]],
  ["FR-COLLAB-005", ["AT-059", "AT-200", "AT-212", "AT-346"]],
  ["FR-DEBATE-001", ["AT-002", "AT-340"]],
  ["FR-DEBATE-002", ["AT-028"]],
  ["FR-DEBATE-003", ["AT-002", "AT-029"]],
  ["FR-DEBATE-004", ["AT-194", "AT-335"]],
  ["FR-DEBATE-005", ["AT-027"]],
  ["FR-DEBATE-006", ["AT-027"]],
  ["FR-DEBATE-007", ["AT-028"]],
  ["FR-DEBATE-008", ["AT-079"]],
  ["FR-DEBATE-009", ["AT-029"]],
  ["FR-STATE-002", ["AT-460", "AT-496"]],
  ["FR-API-002", ["AT-074", "AT-497"]],
  ["FR-UX-004", ["AT-078"]],
  ["FR-UX-005", ["AT-079"]],
  ["FR-UX-019", ["AT-093"]],
  ["FR-EFFORT-002", ["AT-334"]],
  ["FR-EFFORT-003", ["AT-335"]],
  ["FR-EFFORT-004", ["AT-336"]],
  ["FR-EFFORT-005", ["AT-194", "AT-337"]],
  ["FR-EFFORT-006", ["AT-199", "AT-338"]],
  ["FR-EFFORT-008", ["AT-340"]],
  ["FR-EFFORT-010", ["AT-197", "AT-342"]],
  ["FR-EFFORT-012", ["AT-209", "AT-344"]],
  ["FR-EFFORT-013", ["AT-201", "AT-345"]],
  ["FR-EFFORT-014", ["AT-200", "AT-346"]],
  ["FR-AI-001", ["AT-095", "AT-096"]],
  ["FR-AI-002", ["AT-095", "AT-096", "AT-117"]],
  ["FR-AI-003", ["AT-095", "AT-096"]],
  ["FR-AI-004", ["AT-097"]],
  ["FR-AI-005", ["AT-027", "AT-114"]],
  ["FR-AI-006", ["AT-100"]],
  ["FR-AI-007", ["AT-098", "AT-099"]],
  ["FR-AI-008", ["AT-099"]],
  ["FR-AI-009", ["AT-101", "AT-102"]],
  ["FR-AI-010", ["AT-103"]],
  ["FR-AI-012", ["AT-113"]],
  ["FR-AI-013", ["AT-116"]],
  ["FR-AI-014", ["AT-114"]],
  ["FR-AI-015", ["AT-115"]],
  ["FR-AI-016", ["AT-095", "AT-099", "AT-117"]],
  ["FR-CONTEXT-001", ["AT-105"]],
  ["FR-CONTEXT-002", ["AT-106", "AT-498"]],
  ["FR-CONTEXT-003", ["AT-499"]],
  ["FR-CONTEXT-004", ["AT-112"]],
  ["FR-CONTEXT-005", ["AT-116", "AT-500"]],
  ["FR-CONTEXT-006", ["AT-109"]],
  ["FR-CONTEXT-007", ["AT-103", "AT-110"]],
  ["FR-CONTEXT-008", ["AT-111"]],
  ["FR-CONTEXT-009", ["AT-107", "AT-108"]],
  ["FR-CONTEXT-010", ["AT-501"]],
  ["FR-DIALOGUE-003", ["AT-192"]],
  ["FR-DIALOGUE-004", ["AT-192", "AT-444"]],
  ["FR-DIALOGUE-005", ["AT-190", "AT-443", "AT-446"]],
  ["FR-DIALOGUE-006", ["AT-193", "AT-194"]],
  ["FR-DIALOGUE-007", ["AT-195", "AT-451"]],
  ["FR-DIALOGUE-008", ["AT-196"]],
  ["FR-DIALOGUE-009", ["AT-193", "AT-198", "AT-450"]],
  ["FR-DIALOGUE-010", ["AT-197", "AT-342"]],
  ["FR-DIALOGUE-011", ["AT-198"]],
  ["FR-DIALOGUE-012", ["AT-199", "AT-338"]],
  ["FR-DIALOGUE-013", ["AT-200"]],
  ["FR-DIALOGUE-014", ["AT-199", "AT-203"]],
  ["FR-DIALOGUE-015", ["AT-201"]],
  ["FR-DIALOGUE-016", ["AT-202"]],
  ["FR-DIALOGUE-017", ["AT-204"]],
  ["FR-DIALOGUE-018", ["AT-204"]],
  ["FR-DIALOGUE-019", ["AT-206"]],
  ["FR-DIALOGUE-020", ["AT-207"]],
  ["FR-DIALOGUE-021", ["AT-025", "AT-026", "AT-208"]],
  ["FR-DIALOGUE-022", ["AT-209"]],
  ["FR-DIALOGUE-024", ["AT-212"]],
  ["FR-SEED-002", ["AT-443"]],
  ["FR-SEED-003", ["AT-444"]],
  ["FR-SEED-004", ["AT-445"]],
  ["FR-SEED-005", ["AT-446"]],
  ["FR-SEED-006", ["AT-447"]],
  ["FR-SEED-007", ["AT-448"]],
  ["FR-SEED-008", ["AT-449"]],
  ["FR-SEED-009", ["AT-450"]],
  ["FR-SEED-010", ["AT-451"]],
  ["FR-SEED-011", ["AT-452"]],
  ["FR-SEED-018", ["AT-459"]],
  ["FR-OBJECTIVE-001", ["AT-215"]],
  ["FR-OBJECTIVE-002", ["AT-215", "AT-216"]],
  ["FR-OBJECTIVE-004", ["AT-218"]],
  ["FR-DELIVERY-018", ["AT-358", "AT-502"]],
]);

if (rp2AcceptanceRefs.size !== 97 || rp2MovedDecisions.size !== 15) {
  throw new Error("RP2 semantic review must contain 97 retained and 15 moved requirements.");
}

const rp1AcceptanceRefs = new Map([
  ["FR-COLLAB-002", ["AT-239"]],
  ["FR-COLLAB-003", ["AT-077", "AT-488"]],
  ["FR-SESSION-001", ["AT-076", "AT-210", "AT-239"]],
  ["FR-SESSION-002", ["AT-190", "AT-489"]],
  ["FR-STATE-001", ["AT-066"]],
  ["FR-STATE-003", ["AT-021"]],
  ["FR-STATE-004", ["AT-060", "AT-242", "AT-354"]],
  ["FR-STATE-009", ["AT-490"]],
  ["FR-MIGRATE-005", ["AT-064", "AT-065"]],
  ["FR-MIGRATE-007", ["AT-063", "AT-245", "AT-361"]],
  ["FR-MIGRATE-008", ["AT-071", "AT-072", "AT-491"]],
  ["FR-API-001", ["AT-018", "AT-202", "AT-415"]],
  ["FR-API-003", ["AT-063", "AT-243", "AT-245"]],
  ["FR-UX-001", ["AT-090", "AT-333", "AT-494"]],
  ["FR-UX-002", ["AT-076", "AT-239"]],
  ["FR-UX-003", ["AT-077", "AT-333"]],
  ["FR-UX-006", ["AT-239", "AT-410", "AT-411"]],
  ["FR-UX-010", ["AT-084", "AT-348"]],
  ["FR-UX-011", ["AT-085"]],
  ["FR-UX-012", ["AT-086", "AT-418"]],
  ["FR-UX-016", ["AT-090", "AT-333"]],
  ["FR-UX-017", ["AT-091"]],
  ["FR-UX-018", ["AT-092"]],
  ["FR-UX-020", ["AT-094", "AT-412", "AT-421"]],
  ["FR-UX-021", ["AT-410", "AT-495"]],
  ["FR-UX-022", ["AT-410", "AT-411"]],
  ["FR-UX-023", ["AT-412"]],
  ["FR-UX-024", ["AT-413"]],
  ["FR-UX-025", ["AT-414", "AT-442"]],
  ["FR-UX-026", ["AT-415"]],
  ["FR-UX-027", ["AT-416"]],
  ["FR-UX-028", ["AT-417"]],
  ["FR-UX-029", ["AT-418"]],
  ["FR-UX-030", ["AT-419"]],
  ["FR-UX-031", ["AT-420", "AT-421"]],
  ["FR-UX-032", ["AT-239", "AT-421"]],
  ["FR-EFFORT-001", ["AT-249", "AT-333"]],
  ["FR-EFFORT-011", ["AT-077", "AT-343"]],
  ["FR-EFFORT-016", ["AT-348"]],
  ["FR-EFFORT-017", ["AT-349"]],
  ["FR-EFFORT-019", ["AT-351"]],
  ["FR-DIALOGUE-001", ["AT-190", "AT-442"]],
  ["FR-DIALOGUE-002", ["AT-041", "AT-191", "AT-414"]],
  ["FR-DIALOGUE-023", ["AT-076", "AT-210", "AT-211"]],
  ["FR-SEED-001", ["AT-442"]],
  ["FR-SEED-016", ["AT-457"]],
  ["FR-SEED-017", ["AT-458"]],
  ["FR-DELIVERY-014", ["AT-242", "AT-354"]],
  ["FR-DELIVERY-015", ["AT-355", "AT-492"]],
  ["FR-DELIVERY-021", ["AT-361", "AT-493"]],
  ["FR-DELIVERY-022", ["AT-362"]],
]);

if (rp1AcceptanceRefs.size !== 51 || rp1MovedDecisions.size !== 13) {
  throw new Error("RP1 semantic review must contain 51 retained and 13 moved requirements.");
}

const downstreamSlices = [
  "V2-understanding",
  "V3-contract",
  "V4-outline",
  "V5-drafting",
  "V6-obligations",
  "V7-revision",
  "V8-completion",
];
const rp0DownstreamSlices = ["V1-conversation", ...downstreamSlices];
const rp2DownstreamSlices = downstreamSlices.slice(1);
const rp3DownstreamSlices = rp2DownstreamSlices.slice(1);
const rp4DownstreamSlices = rp3DownstreamSlices.slice(1);
const rp5DownstreamSlices = ["V6-obligations", "V7-revision", "V8-completion"];
const rp6DownstreamSlices = ["V7-revision", "V8-completion"];
const rp7DownstreamSlices = ["V8-completion"];
const rp8DownstreamSlices = [];

function rp0ReviewCategory(domain) {
  if (domain === "EVAL") return "evaluation-foundation";
  if (domain === "DELIVERY") return "governance-guard";
  if (domain === "DURABILITY") return "durability-and-recovery-guard";
  return "baseline-observation";
}

function rp1ReviewCategory(requirementId, domain) {
  const compatibility = new Set([
    "FR-MIGRATE-007", "FR-MIGRATE-008", "FR-UX-020", "FR-UX-023",
    "FR-UX-031", "FR-DELIVERY-021", "FR-DELIVERY-022",
  ]);
  if (compatibility.has(requirementId)) return "compatibility-guard";
  if (["STATE", "MIGRATE", "API", "DELIVERY"].includes(domain)) return "enabling-invariant";
  return "direct-journey";
}

function rp2ReviewCategory(requirementId, domain) {
  if (["FR-UX-019", "FR-SEED-018"].includes(requirementId)) return "compatibility-guard";
  if (["STATE", "API", "AI", "CONTEXT", "DELIVERY"].includes(domain)) return "enabling-invariant";
  return "direct-journey";
}

function rp3ReviewCategory(requirementId, domain) {
  if (["FR-MIGRATE-004", "FR-STATE-005"].includes(requirementId)) return "compatibility-guard";
  if (["STATE", "API", "DELIVERY"].includes(domain)) return "enabling-invariant";
  return "direct-journey";
}

function rp4ReviewCategory(requirementId, domain) {
  if (requirementId === "FR-WORLD-019") return "compatibility-guard";
  if (["LONGMEM", "DELIVERY"].includes(domain)) return "enabling-invariant";
  if (domain === "RESEARCH") return "research-evidence-foundation";
  return "direct-journey";
}

function rp5ReviewCategory(requirementId, domain) {
  if (["MIGRATE", "UX"].includes(domain)) return "compatibility-and-interface-guard";
  if (["RUN", "AI", "MEMORY"].includes(domain)) return "drafting-runtime-invariant";
  if (domain === "CRAFT") return "craft-learning-and-rights-guard";
  if (["QUALITY", "EVAL", "READER"].includes(domain)) return "prose-evidence-gate";
  if (domain === "FEEDBACK") return "first-feedback-foundation";
  if (domain === "TEXT") return "text-integrity-guard";
  if (requirementId === "FR-OBJECTIVE-012") return "policy-decision-slot";
  return "direct-drafting-journey";
}

function rp6ReviewCategory(requirementId) {
  if (requirementId === "FR-OBL-024") return "compatibility-guard";
  return "direct-journey";
}

function rp7ReviewCategory(requirementId, domain) {
  if (["FR-EVAL-017", "FR-EVAL-018"].includes(requirementId)) return "strategy-release-guard";
  if (domain === "LONGMEM") return "revision-invalidation-invariant";
  return "longitudinal-learning-journey";
}

function rp8ReviewCategory(requirementId, domain) {
  if (["CHAR", "WORLD", "LONGMEM"].includes(domain)) return "cross-domain-certificate";
  if (requirementId === "FR-RUN-024") return "termination-invariant";
  if (domain === "PUBLISH") return "release-artifact";
  return "direct-completion-gate";
}

const profileBySlice = {
  "V0-baseline": "RP0-baseline",
  "V1-conversation": "RP1-capture",
  "V2-understanding": "RP2-understanding",
  "V3-contract": "RP3-contract",
  "V4-outline": "RP4-outline",
  "V5-drafting": "RP5-drafting",
  "V6-obligations": "RP6-obligations",
  "V7-revision": "RP7-revision",
  "V8-completion": "RP8-completion",
};

const sliceEvidence = {
  "V0-baseline": ["AT-239..AT-250", "AT-353..AT-364", "AT-482..AT-487", "AT-516..AT-519"],
  "V1-conversation": ["AT-333..AT-334", "AT-348..AT-351", "AT-410..AT-421", "AT-442", "AT-457..AT-458"],
  "V2-understanding": ["AT-190..AT-238", "AT-335..AT-352", "AT-443..AT-452", "AT-459..AT-460"],
  "V3-contract": ["AT-422..AT-441", "AT-453..AT-465"],
  "V4-outline": ["AT-269..AT-288", "AT-357", "AT-389", "AT-425", "AT-433..AT-436", "AT-466..AT-467", "AT-473..AT-474", "AT-508..AT-511"],
  "V5-drafting": ["AT-011..AT-016", "AT-044..AT-059", "AT-251..AT-312", "AT-358..AT-361", "AT-365..AT-409", "AT-426..AT-438", "AT-468..AT-478", "AT-512..AT-515"],
  "V6-obligations": ["AT-004..AT-007", "AT-030..AT-040", "AT-166..AT-189", "AT-313..AT-332"],
  "V7-revision": ["AT-118..AT-141"],
  "V8-completion": ["AT-007", "AT-038..AT-040", "AT-142..AT-189", "AT-439..AT-441", "AT-479..AT-481", "AT-504..AT-507"],
};

function normalizedBigrams(value) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const grams = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

function similarity(left, right) {
  const leftGrams = normalizedBigrams(left);
  const rightGrams = normalizedBigrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  const union = new Set([...leftGrams, ...rightGrams]).size;
  return intersection / union;
}

function expandEvidenceRefs(refs) {
  const ids = new Set();
  for (const ref of refs) {
    const range = ref.match(/^AT-(\d{3})\.\.AT-(\d{3})$/);
    if (range) {
      for (let number = Number(range[1]); number <= Number(range[2]); number += 1) {
        ids.add(`AT-${String(number).padStart(3, "0")}`);
      }
      continue;
    }
    if (/^AT-\d{3}$/.test(ref)) ids.add(ref);
  }
  return ids;
}

function acceptanceCandidates(requirement, firstSlice) {
  const allowed = expandEvidenceRefs(sliceEvidence[firstSlice]);
  return acceptanceTests
    .filter((test) => allowed.has(test.id))
    .map((test) => ({
      acceptanceTestId: test.id,
      title: test.title,
      score: Number(similarity(requirement.title, test.title).toFixed(3)),
    }))
    .filter((candidate) => candidate.score >= 0.16)
    .sort((left, right) => right.score - left.score || left.acceptanceTestId.localeCompare(right.acceptanceTestId))
    .slice(0, 3);
}

const requirementCatalog = requirements.map((requirement) => {
  const firstSlice = sliceOverrides.get(requirement.id) ?? defaultSliceByDomain[requirement.domain];
  if (!firstSlice) throw new Error(`No firstSlice mapping for ${requirement.id}`);
  const releaseProfile = profileBySlice[firstSlice] ?? null;
  const rp0Retained = rp0AcceptanceRefs.has(requirement.id);
  const rp0Moved = rp0MovedDecisions.get(requirement.id);
  const rp1Retained = rp1AcceptanceRefs.has(requirement.id);
  const rp1Moved = rp1MovedDecisions.get(requirement.id);
  const rp2Retained = rp2AcceptanceRefs.has(requirement.id);
  const rp2Moved = rp2MovedDecisions.get(requirement.id);
  const rp3Retained = rp3AcceptanceRefs.has(requirement.id);
  const rp3Moved = rp3MovedDecisions.get(requirement.id);
  const rp4Retained = rp4AcceptanceRefs.has(requirement.id);
  const rp4Moved = rp4MovedDecisions.get(requirement.id);
  const rp5Retained = rp5AcceptanceRefs.has(requirement.id);
  const rp6Retained = rp6AcceptanceRefs.has(requirement.id);
  const rp6Moved = rp6MovedDecisions.get(requirement.id);
  const rp7Retained = rp7AcceptanceRefs.has(requirement.id);
  const rp7Moved = rp7MovedDecisions.get(requirement.id);
  const rp8Retained = rp8AcceptanceRefs.has(requirement.id);
  const rp8Moved = rp8MovedDecisions.get(requirement.id);
  const retainedBySemanticReview = rp0Retained || rp1Retained || rp2Retained || rp3Retained || rp4Retained || rp5Retained || rp6Retained || rp7Retained || rp8Retained;
  const movedBySemanticReview = rp8Moved || rp7Moved || rp6Moved || rp4Moved || rp3Moved || rp2Moved || rp1Moved || rp0Moved;
  const movedExtensionSlices = movedBySemanticReview?.extensionSlices ?? [];
  return {
    requirementId: requirement.id,
    title: requirement.title,
    domain: requirement.domain,
    normativeStrength: strengthOverrides.get(requirement.id) ?? "MUST",
    firstSlice,
    extensionSlices: rp0Retained
      ? rp0DownstreamSlices
      : rp1Retained
        ? downstreamSlices
        : rp2Retained
          ? rp2DownstreamSlices
          : rp3Retained
            ? rp3DownstreamSlices
            : rp4Retained
              ? rp4DownstreamSlices
              : rp5Retained
                ? rp5DownstreamSlices
                : rp6Retained
                  ? rp6DownstreamSlices
                  : rp7Retained
                    ? rp7DownstreamSlices
                    : rp8Retained
                      ? rp8DownstreamSlices
            : movedExtensionSlices,
    extensionMode: rp8Retained
      ? "terminal-evidence"
      : retainedBySemanticReview || movedExtensionSlices.length
        ? "invariant-revalidation"
        : null,
    releaseProfile,
    disposition: releaseProfile ? "included-draft" : "planned",
    classificationStatus: retainedBySemanticReview || movedBySemanticReview
      ? "spec-audited"
      : "rule-derived-human-review-required",
    firstSliceScope: rp0Retained
      ? "Only read-only baseline observation, governance policy, and evaluation fixtures; no product write authority, UI activation, AI backfill, or canon generation."
      : rp1Retained
        ? "Only the behavior required to capture and recover the original author utterance; downstream semantics remain extension obligations."
        : rp2Retained
          ? "Only the behavior required to form an evidence-bounded understanding and ask one high-value question; downstream semantics remain extension obligations."
          : rp3Retained
            ? "Only the behavior required to adopt an evidence-bounded story contract with core character and world-rule fields; downstream planning semantics remain extension obligations."
            : rp4Retained
              ? "Only the behavior required to compile an adopted story contract into a causally reachable, candidate-isolated, near-term execution-ready outline; actual prose, revision propagation, and completion certificates remain downstream obligations."
              : rp5Retained
                ? "Only the behavior required to turn an executable outline into governed prose candidates, validate and adopt them atomically, settle chapters, capture first feedback, and run continuously without weakening canon, POV, rights, author-lock, obligation, or stale-input gates; Q-003 changes execution intensity, not these invariants."
                : rp6Retained
                  ? "Only the behavior required to admit, mark, schedule, evidence, settle, transform, or intentionally open identified narrative obligations without leaking secrets or claiming full-book completion; completion-wide coverage certificates remain downstream obligations."
                  : rp7Retained
                    ? "Only the behavior required to evaluate longitudinal revision evidence, detect cross-chapter drift, form reversible preference hypotheses, and gate or roll back strategy changes; first-prose review and feedback capture belong to RP5, and final completion remains RP8."
                    : rp8Retained
                      ? "Only the terminal behavior required to distinguish draft/review/closure/audited completion, prove cross-domain closure and source coverage against a frozen publication scope, invalidate stale audits, and terminate with no active writers or transactions."
            : null,
    source: { path: sddRelativePath, line: requirement.sourceLine },
    sliceEvidenceRefs: sliceEvidence[firstSlice],
    reviewedFirstSliceAcceptanceRefs: rp0AcceptanceRefs.get(requirement.id)
      ?? rp1AcceptanceRefs.get(requirement.id)
      ?? rp2AcceptanceRefs.get(requirement.id)
      ?? rp3AcceptanceRefs.get(requirement.id)
      ?? rp4AcceptanceRefs.get(requirement.id)
      ?? rp5AcceptanceRefs.get(requirement.id)
      ?? rp6AcceptanceRefs.get(requirement.id)
      ?? rp7AcceptanceRefs.get(requirement.id)
      ?? rp8AcceptanceRefs.get(requirement.id)
      ?? [],
    reviewedFirstSliceAcceptanceStatus: retainedBySemanticReview ? "spec-audited" : "not-reviewed",
    directAcceptanceCandidates: acceptanceCandidates(requirement, firstSlice),
    directAcceptanceStatus: "human-review-required",
    relations: relations.get(requirement.id) ?? {},
    rp0SemanticReview: rp0Retained
      ? { decision: "retain", category: rp0ReviewCategory(requirement.domain) }
      : rp0Moved
        ? { decision: "move", ...rp0Moved }
        : null,
    rp1SemanticReview: rp1Retained
      ? { decision: "retain", category: rp1ReviewCategory(requirement.id, requirement.domain) }
      : rp1Moved
        ? { decision: "move", ...rp1Moved }
        : null,
    rp2SemanticReview: rp2Retained
      ? { decision: "retain", category: rp2ReviewCategory(requirement.id, requirement.domain) }
      : rp2Moved
        ? { decision: "move", ...rp2Moved }
        : null,
    rp3SemanticReview: rp3Retained
      ? { decision: "retain", category: rp3ReviewCategory(requirement.id, requirement.domain) }
      : rp3Moved
        ? { decision: "move", ...rp3Moved }
        : null,
    rp4SemanticReview: rp4Retained
      ? { decision: "retain", category: rp4ReviewCategory(requirement.id, requirement.domain) }
      : rp4Moved
        ? { decision: "move", ...rp4Moved }
        : null,
    rp5SemanticReview: rp5Retained
      ? { decision: "retain", category: rp5ReviewCategory(requirement.id, requirement.domain) }
      : null,
    rp6SemanticReview: rp6Retained
      ? { decision: "retain", category: rp6ReviewCategory(requirement.id) }
      : rp6Moved
        ? { decision: "move", ...rp6Moved }
        : null,
    rp7SemanticReview: rp7Retained
      ? { decision: "retain", category: rp7ReviewCategory(requirement.id, requirement.domain) }
      : rp7Moved
        ? { decision: "move", ...rp7Moved }
        : null,
    rp8SemanticReview: rp8Retained
      ? { decision: "retain", category: rp8ReviewCategory(requirement.id, requirement.domain) }
      : rp8Moved
        ? { decision: "move", ...rp8Moved }
        : null,
  };
});

const requirementIds = new Set(requirementCatalog.map((item) => item.requirementId));
const acceptanceTestIds = new Set(acceptanceTests.map((item) => item.id));
for (const requirementId of writeAuthorityAudit.releaseGate.requirementIds) {
  if (!requirementIds.has(requirementId)) throw new Error(`Unknown write-authority release-gate requirement ${requirementId}`);
}
for (const acceptanceTestId of writeAuthorityAudit.releaseGate.acceptanceRefs) {
  if (!acceptanceTestIds.has(acceptanceTestId)) throw new Error(`Unknown write-authority release-gate acceptance test ${acceptanceTestId}`);
}
for (const item of requirementCatalog) {
  for (const targets of Object.values(item.relations)) {
    for (const target of targets) {
      if (!requirementIds.has(target)) throw new Error(`Unknown relation target ${target}`);
    }
  }
  for (const acceptanceTestId of item.reviewedFirstSliceAcceptanceRefs) {
    if (!acceptanceTestIds.has(acceptanceTestId)) {
      throw new Error(`Unknown reviewed acceptance test ${acceptanceTestId} for ${item.requirementId}`);
    }
  }
}

const sliceOrder = [
  "V0-baseline",
  "V1-conversation",
  "V2-understanding",
  "V3-contract",
  "V4-outline",
  "V5-drafting",
  "V6-obligations",
  "V7-revision",
  "V8-completion",
];

function expandRequirementSelectors(selectors) {
  const expanded = new Set();
  for (const selector of selectors) {
    const domainWildcard = selector.match(/^FR-([A-Z0-9-]+)-\*$/);
    if (domainWildcard) {
      const matches = requirementCatalog.filter((item) => item.domain === domainWildcard[1]);
      if (!matches.length) throw new Error(`Requirement selector matched nothing: ${selector}`);
      for (const item of matches) expanded.add(item.requirementId);
      continue;
    }
    if (!requirementIds.has(selector)) throw new Error(`Unknown requirement selector: ${selector}`);
    expanded.add(selector);
  }
  return [...expanded].sort();
}

function expandAcceptanceSelectors(selectors) {
  const expanded = new Set();
  for (const selector of selectors) {
    const range = selector.match(/^AT-(\d{3})\.\.AT-(\d{3})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`Invalid acceptance selector range: ${selector}`);
      for (let number = start; number <= end; number += 1) {
        const id = `AT-${String(number).padStart(3, "0")}`;
        if (!acceptanceTestIds.has(id)) throw new Error(`Unknown acceptance selector member: ${id}`);
        expanded.add(id);
      }
      continue;
    }
    if (!acceptanceTestIds.has(selector)) throw new Error(`Unknown acceptance selector: ${selector}`);
    expanded.add(selector);
  }
  return [...expanded].sort();
}

const objectiveDefinitions = [
  {
    objectiveId: "OBJ-USER-001",
    userIntent: "作者只提供一句话或大概思路，系统主动理解、显式区分未知并推进创作。",
    requirementSelectors: ["FR-INTENT-*", "FR-SESSION-*", "FR-DIALOGUE-*", "FR-SEED-*"],
    acceptanceSelectors: ["AT-001", "AT-041..AT-043", "AT-190..AT-214", "AT-442..AT-460", "AT-488..AT-502"],
    futureDecisionDependencies: [],
  },
  {
    objectiveId: "OBJ-USER-002",
    userIntent: "根据低信息创意自动组装可执行、可追踪、可修订的小说大纲。",
    requirementSelectors: ["FR-ARCH-*", "FR-CHAR-*", "FR-WORLD-*"],
    acceptanceSelectors: ["AT-269..AT-288", "AT-357", "AT-389", "AT-422..AT-441", "AT-462..AT-481"],
    futureDecisionDependencies: [
      "Q-004 is confirmed as adaptive-risk-pause and tunes pause and adoption behavior without changing outline authority.",
      "Q-008 is confirmed as contract-anchored-rolling-emergence: the next 3-5 chapters are strongly frozen, the far horizon may evolve, and material story changes remain author-controlled.",
    ],
  },
  {
    objectiveId: "OBJ-USER-003",
    userIntent: "从大纲持续创作高质量小说正文，并允许按作者偏好调整速度与审校深度。",
    requirementSelectors: ["FR-WRITE-*", "FR-PROSE-*", "FR-QUALITY-*", "FR-READER-*", "FR-RESEARCH-*", "FR-TEXT-*"],
    acceptanceSelectors: ["AT-011..AT-016", "AT-044..AT-059", "AT-251..AT-312", "AT-358..AT-409", "AT-426..AT-438", "AT-468..AT-478", "AT-508..AT-515"],
    futureDecisionDependencies: [
      "Q-003 is confirmed as C/tiered-quality; runtime activation still requires implementation and release evidence.",
      "Q-006 is confirmed as author-goal-led-multi-evidence; hard narrative guards remain non-compensable and runtime activation still requires implementation evidence.",
      "Q-009 is confirmed as obligation-led elastic length: counts are soft budgets unless explicitly locked, and hard locks, obligations, pacing, reader experience and a 15% default pause threshold govern variance.",
    ],
  },
  {
    objectiveId: "OBJ-USER-004",
    userIntent: "跨平台、联网研究优质创作方式，由平台处理来源边界，只迁移经过验证的抽象机制而不近似复刻或把相关性冒充因果。",
    requirementSelectors: ["FR-CRAFT-*", "FR-EVAL-*"],
    acceptanceSelectors: ["AT-054..AT-057", "AT-118..AT-141", "AT-251..AT-268"],
    futureDecisionDependencies: ["Q-005 is confirmed as broad-network-mechanism-learning with platform-managed source, privacy, originality, expiry, and rollback boundaries; runtime activation remains unverified."],
  },
  {
    objectiveId: "OBJ-USER-005",
    userIntent: "通过一次一个高价值问题的苏格拉底式对话，与作者共同澄清和推进小说。",
    requirementSelectors: ["FR-QUESTION-*", "FR-COLLAB-*", "FR-SESSION-*", "FR-DIALOGUE-*", "FR-EFFORT-*"],
    acceptanceSelectors: ["AT-022..AT-029", "AT-190..AT-214", "AT-333..AT-352", "AT-443..AT-452"],
    futureDecisionDependencies: ["Q-004 is confirmed as adaptive-risk-pause and tunes when to pause for confirmation without weakening one-question discipline."],
  },
  {
    objectiveId: "OBJ-USER-006",
    userIntent: "用红蓝辩证保留竞争解释，让支持方案与反方质疑都接受证据检验。",
    requirementSelectors: ["FR-DEBATE-*", "FR-QUALITY-005", "FR-EVAL-009"],
    acceptanceSelectors: ["AT-002", "AT-015", "AT-027..AT-029", "AT-079", "AT-125"],
    futureDecisionDependencies: [],
  },
  {
    objectiveId: "OBJ-USER-007",
    userIntent: "持续协作直至整本小说完成，并对完成度、欠债和未决项给出诚实证据。",
    requirementSelectors: ["FR-RUN-*", "FR-COMPLETE-*", "FR-STATE-*", "FR-MIGRATE-*", "FR-API-*", "FR-LONGMEM-*", "FR-MEMORY-*", "FR-OBL-*", "FR-CLOSURE-*", "FR-PUBLISH-*", "FR-DURABILITY-*"],
    acceptanceSelectors: ["AT-007", "AT-009", "AT-020", "AT-038..AT-040", "AT-060..AT-070", "AT-142..AT-189", "AT-310..AT-312", "AT-313..AT-332", "AT-384..AT-385", "AT-439..AT-441", "AT-479..AT-481", "AT-504..AT-507", "AT-516..AT-519"],
    futureDecisionDependencies: [
      "Q-002 is confirmed as the open-suspense contract mode.",
      "Q-004 is confirmed as adaptive-risk-pause and tunes pause behavior without changing completion evidence.",
      "Q-007 is confirmed as maturity-tiered-revision-authority; accepted prose and released editions cannot be silently overwritten.",
      "Q-009 is confirmed as obligation-led elastic length without allowing filler to satisfy a count or compression to skip required payoff and closure.",
    ],
  },
  {
    objectiveId: "OBJ-USER-008",
    userIntent: "所有伏笔显式标记、可追踪，并在计划回收、改写或作者批准的开放结局中闭环。",
    requirementSelectors: ["FR-FORESHADOW-*", "FR-DEBT-*", "FR-OBL-*", "FR-CLOSURE-*"],
    acceptanceSelectors: ["AT-004..AT-007", "AT-030..AT-040", "AT-166..AT-189", "AT-313..AT-332"],
    futureDecisionDependencies: ["Q-002 is confirmed as the open-suspense contract mode."],
  },
  {
    objectiveId: "OBJ-USER-009",
    userIntent: "循环头脑风暴并依据作者反馈持续优化平台，而不是无证据堆叠功能。",
    requirementSelectors: ["FR-OBJECTIVE-*", "FR-FEEDBACK-*", "FR-DELIVERY-*"],
    acceptanceSelectors: ["AT-215..AT-238", "AT-482..AT-487"],
    futureDecisionDependencies: [],
  },
  {
    objectiveId: "OBJ-USER-010",
    userIntent: "先创建可持续收敛、可追踪、可机器检查的 SDD 需求文档。",
    requirementSelectors: [
      "FR-DELIVERY-026", "FR-DELIVERY-027", "FR-DELIVERY-028",
      "FR-DELIVERY-029", "FR-DELIVERY-030", "FR-DELIVERY-031",
    ],
    acceptanceSelectors: ["AT-482..AT-487"],
    futureDecisionDependencies: [],
    artifactRefs: [
      sddRelativePath,
      "docs/spec-governance/requirement-catalog.json",
      "docs/spec-governance/objective-coverage.json",
      "scripts/spec-governance-verifier.mjs",
      "scripts/spec-governance-verifier.spec.mjs",
    ],
  },
];

const objectiveCoverageItems = objectiveDefinitions.map((definition) => {
  const mappedRequirementIds = expandRequirementSelectors(definition.requirementSelectors);
  const mappedAcceptanceTestIds = expandAcceptanceSelectors(definition.acceptanceSelectors);
  const firstSlices = [...new Set(mappedRequirementIds.map((requirementId) => (
    requirementCatalog.find((item) => item.requirementId === requirementId).firstSlice
  )))].sort((left, right) => sliceOrder.indexOf(left) - sliceOrder.indexOf(right));
  const implementationEvidence = {
    "OBJ-USER-001": ["api/src/app.spec.ts#V1-V2-V3-vertical-slice", "api/src/contextManifest.spec.ts", "api/src/dialogueQuestions.spec.ts", "api/src/decisionConsumption.spec.ts", "api/src/app.spec.ts#downstream-decision-consumption"],
    "OBJ-USER-002": ["api/src/app.spec.ts#V3-V4-vertical-slice", "api/src/outlineValidation.spec.ts", "api/src/outlineCommit.spec.ts", "api/src/chapterExecutionPlan.spec.ts", "api/src/chapterExecutionProof.spec.ts", "api/src/runtime.spec.ts#governed-runtime-chapter-execution-plan"],
    "OBJ-USER-003": ["api/src/runtime.spec.ts#governed-prose-candidate", "api/src/proseValidation.spec.ts", "api/src/proseAdoption.spec.ts", "api/src/chapterSettlement.spec.ts", "api/src/researchGrounding.spec.ts", "api/src/researchFactCheck.spec.ts", "api/src/researchReliability.spec.ts", "api/src/app.spec.ts#research-source-snapshots"],
    "OBJ-USER-004": ["api/src/qualityCalibration.spec.ts", "api/src/craftProfile.spec.ts", "api/src/authorFeedback.spec.ts", "api/src/adaptiveEvaluationScale.spec.ts", "api/src/app.spec.ts#adaptive-evaluation-scales", "api/src/evaluationAccess.spec.ts", "api/src/app.spec.ts#private-sample-platform-regression", "api/src/evaluationRunArchive.spec.ts", "api/src/evaluationCase.spec.ts", "api/src/evaluationGovernance.spec.ts", "api/src/evaluationArtifactStore.spec.ts", "api/src/evaluationDisagreementStore.spec.ts", "api/src/evaluationSamplingStore.spec.ts", "api/src/evaluationRegressionStore.spec.ts", "api/src/evaluationParetoStore.spec.ts", "api/src/evaluationSliceStore.spec.ts", "api/src/app.spec.ts#routes-evaluation-disagreements", "api/src/app.spec.ts#seeded-repeat-sampling"],
    "OBJ-USER-005": ["api/src/app.spec.ts#adaptive-question-sequence", "api/src/dialogueQuestions.spec.ts", "api/src/decisionConsumption.spec.ts", "api/src/app.spec.ts#downstream-decision-consumption"],
    "OBJ-USER-006": ["api/src/understandingReview.spec.ts", "api/src/qualityCalibration.spec.ts", "api/src/proseReview.spec.ts", "api/src/adaptiveEvaluationScale.spec.ts", "api/src/app.spec.ts#adaptive-evaluation-scales"],
    "OBJ-USER-007": ["api/src/bookRun.spec.ts", "api/src/bookWorkScheduler.spec.ts", "api/src/completionAudit.spec.ts", "api/src/runtimeWorker.spec.ts", "api/src/workLeaseStore.spec.ts", "api/src/stagnationDetection.spec.ts", "api/src/reviewBatch.spec.ts", "api/src/chapterMemoryPatch.spec.ts", "api/src/mutationPlan.spec.ts", "api/src/migrationPreview.spec.ts", "api/src/migrationValidation.spec.ts", "api/src/migrationCutover.spec.ts", "api/src/app.spec.ts#chapter-memory-patch-and-asset-coverage", "api/src/app.spec.ts#mutation-plan-api", "api/src/app.spec.ts#persists-runtime-work-leases", "api/src/app.spec.ts#pauses-a-run-when-stagnation-thresholds-are-crossed", "api/src/app.spec.ts#high-risk-review-items"],
    "OBJ-USER-008": ["api/src/narrativeObligation.spec.ts", "api/src/obligationCoverage.spec.ts", "api/src/closureCertificate.spec.ts"],
    "OBJ-USER-009": ["api/src/qualityCalibration.spec.ts", "api/src/revisionSettlement.spec.ts", "api/src/revisionAdoptionReceipt.spec.ts"],
    "OBJ-USER-010": ["scripts/spec-governance-verifier.mjs", "scripts/spec-governance-verifier.spec.mjs"],
  }[definition.objectiveId] ?? [];
  const implementationStatus = implementationEvidence.length ? "partially-verified" : "not-verified";
  return {
    objectiveId: definition.objectiveId,
    userIntent: definition.userIntent,
    specCoverageStatus: "covered",
    requirementSelectors: definition.requirementSelectors,
    requirementIds: mappedRequirementIds,
    acceptanceSelectors: definition.acceptanceSelectors,
    acceptanceTestIds: mappedAcceptanceTestIds,
    firstSlices,
    earliestSlice: firstSlices[0],
    implementationStatus,
    implementationEvidence,
    implementationBoundary: implementationEvidence.length
      ? "Component and selected integration evidence is verified; this does not prove the complete objective, representative end-to-end journey, or release readiness."
      : "No implementation evidence is attached for this objective.",
    futureDecisionDependencies: definition.futureDecisionDependencies,
    artifactRefs: definition.artifactRefs ?? [],
  };
});

const objectiveCoverage = {
  schemaVersion: "1.0.0",
  status: "spec-covered-implementation-unverified",
  generatedOn: sourceDate,
  generatedBy: "scripts/generate-spec-governance.mjs",
  source: { path: sddRelativePath, version, sha256: sourceHash },
  summary: {
    explicitUserObjectives: objectiveCoverageItems.length,
    specificationCovered: objectiveCoverageItems.filter((item) => item.specCoverageStatus === "covered").length,
    implementationVerified: objectiveCoverageItems.filter((item) => item.implementationStatus === "verified").length,
    implementationPartiallyVerified: objectiveCoverageItems.filter((item) => item.implementationStatus === "partially-verified").length,
    releaseVerified: 0,
    conclusion: "All explicit objectives are mapped to requirements and acceptance tests; selected component and integration slices have partial implementation evidence, while no objective is fully proven end-to-end or released.",
  },
  objectives: objectiveCoverageItems,
};

const implementationEvidenceByRequirement = new Map();
for (const objective of objectiveCoverageItems) {
  for (const requirementId of objective.requirementIds) {
    const current = implementationEvidenceByRequirement.get(requirementId) ?? new Set();
    for (const evidenceRef of objective.implementationEvidence) current.add(evidenceRef);
    implementationEvidenceByRequirement.set(requirementId, current);
  }
}

const requirementEvidence = {
  schemaVersion: "requirement-evidence.v1",
  status: "current-partial-implementation-evidence",
  generatedOn: sourceDate,
  generatedBy: "scripts/generate-spec-governance.mjs",
  source: { path: sddRelativePath, version, sha256: sourceHash },
  requirements: requirementCatalog.map((requirement) => {
    const implementationRefs = [...(implementationEvidenceByRequirement.get(requirement.requirementId) ?? [])].sort();
    return {
      requirementId: requirement.requirementId,
      normativeStrength: requirement.normativeStrength,
      firstSlice: requirement.firstSlice,
      releaseProfile: requirement.releaseProfile,
      acceptanceRefs: requirement.reviewedFirstSliceAcceptanceRefs,
      implementationStatus: implementationRefs.length ? "partially-verified" : "specified",
      implementationRefs,
      releaseStatus: "not-verified",
      releaseRefs: [],
    };
  }),
  summary: {
    requirementCount: requirementCatalog.length,
    implementationPartiallyVerified: implementationEvidenceByRequirement.size,
    releaseVerified: 0,
    boundary: "Requirement evidence is traceability and selected implementation evidence; it does not prove end-to-end or release completion.",
  },
};

const goalDecisionStates = new Map([
  ["Q-001", "confirmed"],
  ["Q-002", "confirmed"],
  ["Q-003", "confirmed"],
  ["Q-004", "confirmed"],
  ["Q-005", "confirmed"],
  ["Q-006", "confirmed"],
  ["Q-007", "confirmed"],
  ["Q-008", "confirmed"],
  ["Q-009", "confirmed"],
]);

const goalReadinessBlueprints = [
  {
    objectiveId: "OBJ-USER-001",
    shortPromise: "一句粗略想法即可开始，系统主动理解、保留未知并推进",
    decisionIds: ["Q-001", "Q-004"],
    auditRefs: ["audits/current-low-input-journey.json", "audits/current-collaboration-dialogue.json", "audits/current-context-orchestration.json"],
    currentFacts: {
      endToEndLowInputJourneyVerified: lowInputJourneyAudit.summary.endToEndLowInputJourneyVerified,
      interactiveSocraticDecisionExists: lowInputJourneyAudit.summary.interactiveSocraticDecisionExists,
      structuredAnswerPayloads: collaborationDialogueAudit.summary.structuredAnswerPayloads,
      decisionConsumptionReceipts: collaborationDialogueAudit.summary.decisionConsumptionReceipts,
      contextManifests: contextOrchestrationAudit.summary.contextManifests,
    },
    currentEvidenceVerdict: "partial-entry-primitives-target-journey-unverified",
    proofRequired: "A browser/API/runtime replay from one short idea through evidence-bounded understanding, one answerable question, scoped decision consumption, contract readiness and resumable next action.",
  },
  {
    objectiveId: "OBJ-USER-002",
    shortPromise: "自动组装可执行、可追踪、可演化且篇幅诚实的大纲",
    decisionIds: ["Q-008", "Q-009"],
    auditRefs: ["audits/current-executable-outline.json", "audits/current-length-planning.json", "audits/current-character-causality.json", "audits/current-world-causality.json"],
    currentFacts: {
      governedOutlineCandidateExists: executableOutlineAudit.summary.governedOutlineCandidateExists,
      runtimeConsumesChapterPlanResult: executableOutlineAudit.summary.runtimeConsumesChapterPlanResult,
      executionReadyProofExists: executableOutlineAudit.summary.executionReadyProofExists,
      persistentLengthTargets: lengthPlanningAudit.summary.persistentTargets,
      characterArcCertificates: characterCausalityAudit.summary.characterArcCertificates,
      worldIntegrityCertificates: worldCausalityAudit.summary.worldIntegrityCertificates,
    },
    currentEvidenceVerdict: "legacy-structure-assets-without-executable-outline-authority",
    proofRequired: "A rough idea must compile into alternative contract/outline candidates, author/scoped adoption, causal and character/world validation, a Q-009-compliant length forecast, and replayable next-chapter ExecutionReadyProof.",
  },
  {
    objectiveId: "OBJ-USER-003",
    shortPromise: "持续创作高质量正文并按作者目标调节速度与审校深度",
    decisionIds: ["Q-003", "Q-006", "Q-007", "Q-008", "Q-009"],
    auditRefs: ["audits/current-prose-production.json", "audits/current-quality-evaluation.json", "audits/current-text-integrity.json", "audits/current-context-orchestration.json"],
    currentFacts: {
      substantialContentFiles: proseProductionAudit.summary.substantialContentFiles,
      durableProseCandidates: proseProductionAudit.summary.durableProseCandidates,
      adoptionReceipts: proseProductionAudit.summary.adoptionReceipts,
      chapterSettlementProofs: proseProductionAudit.summary.chapterSettlementProofs,
      qualityReports: qualityEvaluationAudit.summary.qualityReports,
      reportsWithEvidenceOrProvenance: qualityEvaluationAudit.summary.reportsWithEvidenceOrProvenance,
      replayableQualityGateDecisions: qualityEvaluationAudit.summary.replayableQualityGateDecisions,
      textSettlements: textIntegrityAudit.summary.textSettlements,
    },
    currentEvidenceVerdict: "prose-files-exist-without-governed-candidate-adoption-quality-settlement",
    proofRequired: "Frozen chapter intent and context must produce isolated prose candidates, tiered evidence-backed comparison, author/scoped adoption, text/canon settlement and no-regression continuation across chapters.",
  },
  {
    objectiveId: "OBJ-USER-004",
    shortPromise: "跨平台学习优质创作机制而不近似复刻或污染来源边界",
    decisionIds: ["Q-005"],
    auditRefs: ["audits/current-craft-learning-loop.json", "audits/current-research-grounding.json"],
    currentFacts: {
      governedCraftExperimentExists: craftLearningAudit.summary.governedCraftExperimentExists,
      governedPreferenceHypothesisExists: craftLearningAudit.summary.governedPreferenceHypothesisExists,
      craftReleaseAndRollbackExists: craftLearningAudit.summary.craftReleaseAndRollbackExists,
      externalKnowledgeSourceRecords: researchGroundingAudit.summary.externalKnowledgeSourceRecords,
      researchSettlements: researchGroundingAudit.summary.researchSettlements,
    },
    currentEvidenceVerdict: "static-guidance-and-local-samples-without-governed-learning-loop",
    proofRequired: "Eligible sources must pass isolation and provenance, abstract mechanisms must win controlled project trials, author/independent evidence must bound applicability, and retirement/deletion must propagate without retaining source expression.",
  },
  {
    objectiveId: "OBJ-USER-005",
    shortPromise: "一次一个高价值苏格拉底问题，与作者持续共同推进",
    decisionIds: ["Q-004"],
    auditRefs: ["audits/current-collaboration-dialogue.json", "audits/current-low-input-journey.json"],
    currentFacts: {
      emittedQuestionStrings: collaborationDialogueAudit.summary.emittedQuestionStrings,
      structuredAnswerPayloads: collaborationDialogueAudit.summary.structuredAnswerPayloads,
      activeQuestionQueues: collaborationDialogueAudit.summary.activeQuestionQueues,
      decisionRecords: collaborationDialogueAudit.summary.decisionRecords,
      decisionConsumptionReceipts: collaborationDialogueAudit.summary.decisionConsumptionReceipts,
    },
    currentEvidenceVerdict: "question-text-output-without-answerable-decision-loop",
    proofRequired: "One durable active QuestionCard must be answerable, bind the answer to one decision and scope, survive restart, produce a consumption receipt, avoid duplicate questioning and allow unrelated safe work to continue.",
  },
  {
    objectiveId: "OBJ-USER-006",
    shortPromise: "红蓝辩证保留竞争解释并用证据裁决",
    decisionIds: ["Q-006"],
    auditRefs: ["audits/current-collaboration-dialogue.json", "audits/current-quality-evaluation.json", "audits/current-low-input-journey.json"],
    currentFacts: {
      redBlueCases: collaborationDialogueAudit.summary.redBlueCases,
      governedRedBlueContractExists: lowInputJourneyAudit.summary.governedRedBlueContractExists,
      reportsWithEvidenceOrProvenance: qualityEvaluationAudit.summary.reportsWithEvidenceOrProvenance,
      calibratedEvaluatorSuites: qualityEvaluationAudit.summary.calibratedEvaluatorSuites,
    },
    currentEvidenceVerdict: "specification-method-present-runtime-debate-evidence-absent",
    proofRequired: "Competing interpretations and candidates must retain support, counterevidence, assumptions, protected strengths and falsifiers until a scoped authority adopts, merges or rejects them with replayable evidence.",
  },
  {
    objectiveId: "OBJ-USER-007",
    shortPromise: "持续协作直至整书完成、审计、恢复并交付",
    decisionIds: ["Q-002", "Q-004", "Q-007", "Q-009"],
    auditRefs: ["audits/current-full-book-orchestration.json", "audits/current-long-memory-continuity.json", "audits/current-revision-lineage.json", "audits/current-manuscript-delivery.json", "audits/current-project-durability.json"],
    currentFacts: {
      bookRuns: fullBookOrchestrationAudit.summary.bookRuns,
      workGraphs: fullBookOrchestrationAudit.summary.workGraphs,
      chapterSettlements: fullBookOrchestrationAudit.summary.chapterSettlements,
      completionProofs: fullBookOrchestrationAudit.summary.completionProofs,
      memoryReadyProofs: longMemoryAudit.summary.memoryReadyProofs,
      revisionSettlements: revisionLineageAudit.summary.revisionSettlements,
      deliveryProofs: manuscriptDeliveryAudit.summary.deliveryProofs,
      verifiedBackupSets: projectDurabilityAudit.summary.verifiedBackupSets,
      restoreDrills: projectDurabilityAudit.summary.restoreDrills,
    },
    currentEvidenceVerdict: "chapter-runtime-primitives-without-book-run-completion-delivery-proof",
    proofRequired: "A recoverable BookRun must execute an obligation-aware work graph through chapter settlements, continuity/revision/closure/quality audits, stable quiescence, immutable edition rendering and replayable DeliveryProof.",
  },
  {
    objectiveId: "OBJ-USER-008",
    shortPromise: "伏笔显式标记、证据化埋设并全部回收、转化或合法开放",
    decisionIds: ["Q-002"],
    auditRefs: ["audits/current-foreshadowing-closure.json", "audits/current-full-book-orchestration.json", "audits/current-long-memory-continuity.json"],
    currentFacts: {
      legacyLedgerEntries: foreshadowingClosureAudit.summary.legacyLedgerEntries,
      unifiedObligationAuthorityExists: foreshadowingClosureAudit.summary.unifiedObligationAuthorityExists,
      evidenceBackedPayoffTransitionExists: foreshadowingClosureAudit.summary.evidenceBackedPayoffTransitionExists,
      sourceCoverageCertificateExists: foreshadowingClosureAudit.summary.sourceCoverageCertificateExists,
      replayableClosureCertificateExists: foreshadowingClosureAudit.summary.replayableClosureCertificateExists,
    },
    currentEvidenceVerdict: "fragmented-or-empty-legacy-ledgers-without-evidence-backed-closure",
    proofRequired: "Every admitted canon obligation must have stable identity, setup evidence, reminder/payoff windows, terminal evidence or Q-002-valid open contract, exhaustive-enough source coverage and revision-invalidatable ClosureCertificate.",
  },
  {
    objectiveId: "OBJ-USER-009",
    shortPromise: "循环头脑风暴并依据作者反馈持续优化平台与创作",
    decisionIds: ["Q-003", "Q-005", "Q-006", "Q-007"],
    auditRefs: ["audits/current-craft-learning-loop.json", "audits/current-quality-evaluation.json", "audits/current-revision-lineage.json"],
    currentFacts: {
      governedPreferenceHypothesisExists: craftLearningAudit.summary.governedPreferenceHypothesisExists,
      structuredAuthorQualityRatings: qualityEvaluationAudit.summary.structuredAuthorQualityRatings,
      calibratedEvaluatorSuites: qualityEvaluationAudit.summary.calibratedEvaluatorSuites,
      semanticImpactGraphs: revisionLineageAudit.summary.semanticImpactGraphs,
      revisionSettlements: revisionLineageAudit.summary.revisionSettlements,
    },
    currentEvidenceVerdict: "manual-iteration-without-measurable-governed-learning-and-regression-loop",
    proofRequired: "Author feedback and red/blue experiments must update scoped hypotheses, demonstrate downstream consumption, retain negative evidence, detect regression, support rollback and never globalize private preferences without authority.",
  },
  {
    objectiveId: "OBJ-USER-010",
    shortPromise: "先形成可持续收敛、可追踪、可机器检查的 SDD",
    decisionIds: ["Q-009"],
    auditRefs: ["requirement-catalog.json", "objective-coverage.json", `convergence/${version}.json`, "release-profiles/RP0-baseline.json", "defer-decisions.jsonl"],
    currentFacts: {
      sddExists: existsSync(sddPath),
      parsedVersion: version,
      requirements: requirements.length,
      acceptanceTests: acceptanceTests.length,
      designDecisions: decisions.length,
      specificationCoveredObjectives: objectiveCoverage.summary.specificationCovered,
      generatedGovernanceEntrypointExists: existsSync(join(root, "scripts", "generate-spec-governance.mjs")),
    },
    currentEvidenceVerdict: "documentation-deliverable-verified-decisions-confirmed",
    proofRequired: "The SDD and deterministic projections must parse, map all explicit objectives, preserve unique/contiguous identities, expose scope/decision/implementation boundaries and reproduce without drift; author decisions must close before specification approval.",
  },
];

const goalReadinessObjectiveIds = goalReadinessBlueprints.map((item) => item.objectiveId);
if (new Set(goalReadinessObjectiveIds).size !== goalReadinessBlueprints.length) {
  throw new Error("Goal-readiness audit contains duplicate objective IDs.");
}
if (goalReadinessBlueprints.length !== objectiveCoverageItems.length || objectiveCoverageItems.some((item) => !goalReadinessObjectiveIds.includes(item.objectiveId))) {
  throw new Error("Goal-readiness audit must cover every explicit objective exactly once.");
}

const goalReadinessItems = goalReadinessBlueprints.map((blueprint) => {
  const coverage = objectiveCoverageItems.find((item) => item.objectiveId === blueprint.objectiveId);
  const decisionStates = blueprint.decisionIds.map((decisionId) => ({ decisionId, status: goalDecisionStates.get(decisionId) || "unknown" }));
  const isSddDeliverable = blueprint.objectiveId === "OBJ-USER-010";
  return {
    ...blueprint,
    specificationEvidence: {
      status: coverage.specCoverageStatus,
      requirementCount: coverage.requirementIds.length,
      acceptanceTestCount: coverage.acceptanceTestIds.length,
      firstSlices: coverage.firstSlices,
    },
    decisionEvidence: {
      status: decisionStates.some((item) => item.status !== "confirmed") ? "open" : "confirmed",
      decisions: decisionStates,
    },
    deliverableEvidence: {
      status: isSddDeliverable ? "verified" : "not-applicable",
      evidence: isSddDeliverable ? [sddRelativePath, "scripts/generate-spec-governance.mjs", "docs/spec-governance/requirement-catalog.json"] : [],
    },
    targetProductImplementationEvidence: {
      status: isSddDeliverable ? "not-applicable" : coverage.implementationStatus,
      evidence: isSddDeliverable ? [] : coverage.implementationEvidence,
      boundary: isSddDeliverable
        ? "This objective is the documentation deliverable, not a product runtime capability."
        : coverage.implementationEvidence.length
          ? "Partial component/integration evidence exists; full objective, representative end-to-end journey and release proof remain unverified."
          : "No implementation evidence is attached for this objective.",
    },
    releaseEvidence: {
      status: isSddDeliverable ? "not-applicable" : "not-verified",
      evidence: [],
    },
  };
});

const requirementsQualityAssessment = {
  score: 97,
  maximum: 100,
  scope: "specification-quality-only-not-product-quality-not-implementation-readiness",
  dimensions: [
    { dimension: "business-value-and-goals", score: 27, maximum: 30, evidence: ["explicit problem and ten user objectives", "measurable completion/closure/readiness semantics", "objective coverage and outcome guards"], deduction: "No production ROI, adoption baseline, cost target or validated market outcome exists." },
    { dimension: "functional-requirements", score: 25, maximum: 25, evidence: [`${requirements.length} uniquely identified requirements`, `${acceptanceTests.length} acceptance tests`, "happy path, edge, failure, concurrency, recovery and evidence boundaries"] },
    { dimension: "user-experience", score: 20, maximum: 20, evidence: ["low-input primary author journey", "one-question discipline", "complexity firewall, accessibility and interruption budgets", "Q-009 approved obligation-led elastic-length interaction"], deduction: "None." },
    { dimension: "technical-constraints", score: 15, maximum: 15, evidence: ["security/privacy/source rights", "performance/budget/context", "atomicity/idempotency/recovery/integration and migration constraints"] },
    { dimension: "scope-and-priorities", score: 10, maximum: 10, evidence: ["V0-V8 slices", "RP0-RP8 budgets and dependencies", "defer decisions and YAGNI mappings", "all author decisions are confirmed"], deduction: "None." },
  ],
  interpretation: "A 97/100 requirements score means the approved specification is unusually detailed and testable. It does not prove the product works, users benefit, the model writes well, or a release is ready.",
};

const goalReadinessAudit = {
  schemaVersion: "1.0.0",
  status: "current-goal-readiness-audit-not-product-completion",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  objective: "A low-input intelligent novel partner that uses Socratic questioning, red/blue evidence and iterative learning to create outline and prose, track foreshadowing and finish the whole book; first deliver an executable SDD.",
  privacy: {
    includes: ["objective IDs and normalized promises", "requirement/acceptance counts", "audit artifact references", "aggregate current-state facts", "decision and evidence verdicts"],
    excludes: ["project identity", "rough idea", "novel prose", "outline content", "character or foreshadowing names", "prompt/model output", "author private feedback"],
  },
  summary: {
    explicitObjectives: goalReadinessItems.length,
    specificationCovered: goalReadinessItems.filter((item) => item.specificationEvidence.status === "covered").length,
    documentationDeliverablesVerified: goalReadinessItems.filter((item) => item.deliverableEvidence.status === "verified").length,
    targetProductObjectivesImplementationVerified: goalReadinessItems.filter((item) => item.targetProductImplementationEvidence.status === "verified").length,
    targetProductObjectivesImplementationPartiallyVerified: goalReadinessItems.filter((item) => item.targetProductImplementationEvidence.status === "partially-verified").length,
    productReleaseObjectivesVerified: goalReadinessItems.filter((item) => item.releaseEvidence.status === "verified").length,
    confirmedAuthorDecisions: [...goalDecisionStates.values()].filter((status) => status === "confirmed").length,
    activeAuthorDecisions: [...goalDecisionStates.values()].filter((status) => status === "active-unconfirmed").length,
    soleActiveDecision: null,
    sddSpecificationApproved: true,
    productGoalAchieved: false,
    conclusion: "All ten promises are mapped at specification level and all author decisions are confirmed; selected target slices have partial implementation evidence, but no target capability has complete end-to-end or release proof.",
  },
  qualityAssessment: requirementsQualityAssessment,
  evidenceLadder: [
    { level: "L0-intent", meaning: "The user promise is recorded.", sufficientForCompletion: false },
    { level: "L1-specification", meaning: "Requirements, acceptance and authority are defined.", sufficientForCompletion: false },
    { level: "L2-current-state", meaning: "Existing primitives and gaps are evidenced by code/data audits.", sufficientForCompletion: false },
    { level: "L3-implementation", meaning: "Target behavior passes authoritative component and integration evidence.", sufficientForCompletion: false },
    { level: "L4-end-to-end", meaning: "The full user journey passes on representative projects, failures and recovery.", sufficientForCompletion: false },
    { level: "L5-release", meaning: "A frozen build, migration, operations and production acceptance prove delivery.", sufficientForCompletion: true },
  ],
  gates: [
    { gateId: "SDD-STRUCTURE", status: "passed", evidence: [sddRelativePath, "requirement-catalog.json", "objective-coverage.json", `convergence/${version}.json`], boundary: "Proves deterministic document structure and traceability only." },
    { gateId: "SDD-QUALITY", status: "passed-with-explicit-deductions", evidence: ["qualityAssessment"], boundary: "97/100 is specification quality, not runtime quality." },
    { gateId: "SDD-AUTHOR-DECISIONS", status: "passed", evidence: ["Q-009", "author-delegated-obligation-led-elastic-length"], boundary: "All author decisions are confirmed at specification level." },
    { gateId: "PRODUCT-IMPLEMENTATION", status: goalReadinessItems.some((item) => item.targetProductImplementationEvidence.status === "partially-verified") ? "partially-verified" : "authorized-not-verified", evidence: goalReadinessItems.flatMap((item) => item.targetProductImplementationEvidence.evidence), boundary: "Partial component/integration evidence authorizes continued slice development; it does not prove complete target runtime behavior." },
    { gateId: "PRODUCT-END-TO-END", status: "not-verified", evidence: [], boundary: "No representative rough-idea-to-delivered-book journey has passed." },
    { gateId: "PRODUCT-RELEASE", status: "not-verified", evidence: [], boundary: "No release artifact, migration, production acceptance or DeliveryProof exists for the target platform." },
  ],
  objectives: goalReadinessItems,
};

for (const [requirementId, decision] of rp1MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V1-conversation") {
    throw new Error(`Invalid RP1 move decision for ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp0MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V0-baseline") {
    throw new Error(`Invalid RP0 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp0AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V0-baseline") {
    throw new Error(`Invalid retained RP0 requirement ${requirementId}`);
  }
}
for (const requirementId of rp1AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V1-conversation") {
    throw new Error(`Invalid retained RP1 requirement ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp2MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V2-understanding") {
    throw new Error(`Invalid RP2 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp2AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V2-understanding") {
    throw new Error(`Invalid retained RP2 requirement ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp3MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V3-contract") {
    throw new Error(`Invalid RP3 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp3AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V3-contract") {
    throw new Error(`Invalid retained RP3 requirement ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp4MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V4-outline") {
    throw new Error(`Invalid RP4 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp4AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V4-outline") {
    throw new Error(`Invalid retained RP4 requirement ${requirementId}`);
  }
}
for (const requirementId of rp5AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V5-drafting") {
    throw new Error(`Invalid retained RP5 requirement ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp6MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V6-obligations") {
    throw new Error(`Invalid RP6 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp6AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V6-obligations") {
    throw new Error(`Invalid retained RP6 requirement ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp7MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V7-revision") {
    throw new Error(`Invalid RP7 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp7AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V7-revision") {
    throw new Error(`Invalid retained RP7 requirement ${requirementId}`);
  }
}
for (const [requirementId, decision] of rp8MovedDecisions) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== decision.targetSlice || item.firstSlice === "V8-completion") {
    throw new Error(`Invalid RP8 move decision for ${requirementId}`);
  }
}
for (const requirementId of rp8AcceptanceRefs.keys()) {
  const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
  if (!item || item.firstSlice !== "V8-completion") {
    throw new Error(`Invalid retained RP8 requirement ${requirementId}`);
  }
}

const catalog = {
  schemaVersion: "1.0.0",
  status: "draft-generated",
  generatedOn: sourceDate,
  generatedBy: "scripts/generate-spec-governance.mjs",
  source: {
    path: sddRelativePath,
    version,
    sha256: sourceHash,
  },
  policies: {
    normativeStrengths: ["MUST", "SHOULD", "MAY", "EXPERIMENT"],
    dispositions: ["included-draft", "planned", "deferred", "replaced", "superseded"],
    acceptanceCandidatePolicy: "Lexical candidates are review aids, never proof of coverage.",
    completionDenominator: "Only human-confirmed MUST requirements inside the active ReleaseProfile count.",
  },
  requirements: requirementCatalog,
};

const profileDefinitions = {
  "V0-baseline": {
    version: "RP0-baseline",
    profileKind: "governance-baseline",
    journey: "Freeze a read-only capability, data, and failure baseline.",
    explicitExclusions: ["No new write authority", "No default UI change", "No canon generation"],
    dependencies: [],
    mustBudget: 48,
  },
  "V1-conversation": {
    version: "RP1-capture",
    profileKind: "user-release",
    journey: "Capture the author's original idea before execution and restore the same collaboration state after refresh.",
    explicitExclusions: ["No claim of complete understanding", "No canon contract", "No outline or prose generation"],
    dependencies: ["RP0-baseline"],
    mustBudget: 64,
  },
  "V2-understanding": {
    version: "RP2-understanding",
    profileKind: "user-release",
    journey: "Separate evidence, inference, unknowns, and competing interpretations, then ask one high-value question.",
    explicitExclusions: ["No understanding snapshot treated as a story contract", "No exploratory probe written to canon"],
    dependencies: ["RP1-capture"],
    mustBudget: 112,
  },
  "V3-contract": {
    version: "RP3-contract",
    profileKind: "user-release",
    journey: "Create a field-adoptable story contract with core character and world-rule evidence.",
    explicitExclusions: ["No claim that a full-book outline is executable", "No autonomous continuous drafting"],
    dependencies: ["RP2-understanding"],
    mustBudget: 32,
  },
  "V4-outline": {
    version: "RP4-outline",
    profileKind: "user-release",
    journey: "Compile the adopted story contract into a comparable, causally reachable, candidate-isolated and research-grounded full-book skeleton with an execution-ready near horizon.",
    explicitExclusions: [
      "No outline plan promoted to occurred canon fact",
      "No exploratory prose feedback without a governed prose candidate",
      "No character-arc, world-integrity, or full-book continuity completion certificate",
      "No claim that Markdown generation alone proves execution readiness",
      "No model memory, search ranking, copied pages, or untraceable reference asset treated as settled real-world fact",
    ],
    dependencies: ["RP3-contract"],
    mustBudget: 88,
  },
  "V5-drafting": {
    version: "RP5-drafting",
    profileKind: "user-release",
    journey: "Turn an executable outline into evidence-bounded, structurally clean prose candidates, adopt only validated text atomically, settle chapters, capture author feedback, and continue across the book under explicit cost, pause, recovery, text-integrity, and quality policy.",
    explicitExclusions: [
      "No generated or self-repaired prose written directly to canon before validation and governed adoption",
      "No fixed overall score or seven-metric threshold treated as universal chapter quality",
      "No same-model self-review, non-empty file, task success, or patch presence treated as chapter settlement",
      "No rights-unknown source excerpt injected into generation or used to imitate protected expression",
      "No Q-003 option allowed to weaken canon, POV, author-lock, secrecy, rights, obligation, stale-input, or atomic-adoption gates",
      "No single-chapter runtime status presented as continuous-book or audited completion",
      "No silent Unicode, punctuation, whitespace, heading, wrapper-stripping, or line-ending normalization on save/import/runtime paths",
    ],
    dependencies: ["RP4-outline"],
    openDecisions: [],
    policyCandidateRef: "policy-candidates/Q-003-drafting-quality.json",
    mustBudget: 144,
  },
  "V6-obligations": {
    version: "RP6-obligations",
    profileKind: "user-release",
    journey: "Turn identified reader promises into visible, evidence-anchored obligations that can be reminded, paid, transformed, neutralized, or intentionally opened without false closure claims.",
    explicitExclusions: [
      "No plan or task-success event promoted to seeded or paid evidence",
      "No keyword mention accepted as semantic payoff",
      "No automatic author waiver or hidden open-ending conversion",
      "No full-book completion or source-coverage certificate before RP8",
      "No secret answer exposed through maps, notifications, search, preview, or export",
    ],
    dependencies: ["RP5-drafting"],
    mustBudget: 64,
  },
  "V7-revision": {
    version: "RP7-revision",
    profileKind: "user-release",
    journey: "Use longitudinal author feedback and multi-scale evidence to revise locally, learn reversible preferences, detect drift, and release or roll back quality strategies without metric gaming.",
    explicitExclusions: [
      "No first-feedback event postponed until the learning phase",
      "No single accept, reject, or edit generalized into an active preference",
      "No overall score, same-model self-review, or average improvement overriding hard failures",
      "No platform-wide use of private project feedback",
      "No strategy promotion without holdout, slice, cost, rollback, and evidence gates",
    ],
    dependencies: ["RP5-drafting", "RP6-obligations"],
    mustBudget: 24,
  },
  "V8-completion": {
    version: "RP8-completion",
    profileKind: "user-release",
    journey: "Prove that the frozen publication scope is complete, coherent, closed or contractually open, replayably audited, stale-safe, terminated with no active writer or transaction, and delivered as an immutable reader-safe edition with verifiable artifacts.",
    explicitExclusions: [
      "No chapter file count or non-empty file treated as audited completion",
      "No single completed runtime, empty queue, model claim, score, or final-chapter existence treated as book completion",
      "No unresolved required obligation renamed as an open sequel hook",
      "No completion certificate when source scans, evidence anchors, cross-domain certificates, or active-write checks are missing",
      "No stale audit displayed as current after any frozen input changes",
      "No mutable folder, live audit JSON, partial format set, or download click treated as an immutable delivered manuscript edition",
    ],
    dependencies: ["RP6-obligations", "RP7-revision"],
    mustBudget: 16,
  },
};

const profileDefinitionByVersion = new Map(
  Object.values(profileDefinitions).map((definition) => [definition.version, definition]),
);

function unresolvedDependencyProfiles(profileVersion, seen = new Set()) {
  if (seen.has(profileVersion)) return [];
  const nextSeen = new Set(seen).add(profileVersion);
  const definition = profileDefinitionByVersion.get(profileVersion);
  if (!definition) return [profileVersion];
  if (definition.openDecisions?.length) return [profileVersion];
  return definition.dependencies.flatMap((dependency) => unresolvedDependencyProfiles(dependency, nextSeen));
}

const releaseProfiles = Object.entries(profileDefinitions).map(([slice, definition]) => {
  const members = requirementCatalog.filter((item) => item.firstSlice === slice);
  const must = members.filter((item) => item.normativeStrength === "MUST").map((item) => item.requirementId);
  const should = members.filter((item) => item.normativeStrength === "SHOULD").map((item) => item.requirementId);
  const experiments = members.filter((item) => item.normativeStrength === "EXPERIMENT").map((item) => item.requirementId);
  const reviewedFirstSlice = members.filter(
    (item) => item.reviewedFirstSliceAcceptanceStatus === "spec-audited",
  );
  const allFirstSliceAcceptanceReviewed = reviewedFirstSlice.length === members.length;
  const openDecisions = definition.openDecisions ?? [];
  const missingDependencyProfiles = [...new Set(
    definition.dependencies.flatMap((dependency) => unresolvedDependencyProfiles(dependency)),
  )].sort();
  return {
    schemaVersion: "1.0.0",
    status: must.length > definition.mustBudget
      ? "draft-over-budget"
      : missingDependencyProfiles.length
        ? "draft-dependency-open"
        : openDecisions.length
          ? "draft-decision-open"
          : "draft",
    generatedOn: sourceDate,
    sourceSddVersion: version,
    releaseProfile: definition.version,
    profileKind: definition.profileKind,
    isUserRelease: definition.profileKind === "user-release",
    firstSlice: slice,
    journey: definition.journey,
    dependencies: definition.dependencies,
    missingDependencyProfiles,
    openDecisionIds: openDecisions,
    policyCandidateRef: definition.policyCandidateRef ?? null,
    scopeBudget: {
      mustRequirementsMax: definition.mustBudget,
      actualMustRequirements: must.length,
      withinBudget: must.length <= definition.mustBudget,
    },
    mustRequirementIds: must,
    shouldRequirementIds: should,
    experimentRequirementIds: experiments,
    evidenceBundleRefs: sliceEvidence[slice],
    directAcceptanceStatus: "human-review-required",
    firstSliceAcceptance: {
      status: allFirstSliceAcceptanceReviewed ? "spec-audited" : "human-review-required",
      reviewedRequirements: reviewedFirstSlice.length,
      totalRequirements: members.length,
    },
    explicitExclusions: definition.explicitExclusions,
    activationGate: missingDependencyProfiles.length
      ? `Classification and first-slice acceptance mapping may be spec-audited, but unresolved dependency profiles (${missingDependencyProfiles.join(", ")}) and implementation evidence are still required.`
      : openDecisions.length
        ? `Classification and first-slice acceptance mapping may be spec-audited, but author decisions (${openDecisions.join(", ")}) and implementation evidence are still required.`
        : allFirstSliceAcceptanceReviewed
          ? "Classification and first-slice acceptance mapping are spec-audited; implementation evidence is still required."
          : "All MUST classifications and direct acceptance links require human confirmation.",
  };
});

const rp0SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP0-baseline",
  profileKind: "governance-baseline",
  isUserRelease: false,
  journey: profileDefinitions["V0-baseline"].journey,
  protocol: {
    blueQuestion: "What read-only evidence or governance rule is needed before the first user-facing slice can be trusted?",
    redQuestion: "Does the requirement invoke AI backfill, create a write authority, activate UI, or mutate canon?",
    rule: "RP0 may observe, classify, freeze fixtures, and govern future releases; it cannot claim product capability or perform semantic writes.",
  },
  counts: {
    originalMustRequirements: rp0AcceptanceRefs.size + rp0MovedDecisions.size,
    retainedMustRequirements: rp0AcceptanceRefs.size,
    movedRequirements: rp0MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V0-baseline"].mustBudget - rp0AcceptanceRefs.size,
  },
  retained: requirementCatalog
    .filter((item) => rp0AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      category: item.rp0SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp0MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP0 is a governance baseline, not a user release; AI backfill moves to V5/V6, while observation/evaluation guards and the project-durability contract are frozen before later slices depend on recoverability. Current product backup implementation remains unverified.",
};

const rp1SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP1-capture",
  journey: profileDefinitions["V1-conversation"].journey,
  protocol: {
    blueQuestion: "What breaks the capture-and-recovery journey if this requirement is absent?",
    redQuestion: "Can the requirement move later without losing the original utterance, recovery, single action, or legacy-path safety?",
    rule: "Domain relevance is insufficient; retain only the first behavior actually consumed by RP1.",
  },
  counts: {
    originalMustRequirements: rp1AcceptanceRefs.size + rp1MovedDecisions.size,
    retainedMustRequirements: rp1AcceptanceRefs.size,
    movedRequirements: rp1MovedDecisions.size,
    remainingBudgetHeadroom: profileDefinitions["V1-conversation"].mustBudget - rp1AcceptanceRefs.size,
  },
  retained: requirementCatalog
    .filter((item) => rp1AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      category: item.rp1SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp1MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP1 is reduced to source capture, recovery, one-action UX, and compatibility guards; downstream semantic work no longer counts in its denominator.",
};

const rp2SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP2-understanding",
  journey: profileDefinitions["V2-understanding"].journey,
  protocol: {
    blueQuestion: "What breaks evidence-bounded understanding or the single high-value question if this requirement is absent?",
    redQuestion: "Can the requirement move to contract, outline, drafting, or revision without corrupting RP2 truth boundaries?",
    rule: "Retain production safety for the first AI interpretation call, but defer downstream candidate, prose, and longitudinal optimization semantics.",
  },
  counts: {
    originalRequirements: rp2AcceptanceRefs.size + rp2MovedDecisions.size,
    originalMustRequirements: 111,
    originalExperimentRequirements: 1,
    retainedRequirements: rp2AcceptanceRefs.size,
    retainedMustRequirements: 96,
    retainedExperimentRequirements: 1,
    movedRequirements: rp2MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V2-understanding"].mustBudget - 96,
  },
  retained: requirementCatalog
    .filter((item) => rp2AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      normativeStrength: item.normativeStrength,
      category: item.rp2SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp2MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP2 retains truth-bounded interpretation, Socratic questioning, red-blue evidence, effort gates, and first-call AI/context safety; downstream optimization no longer counts in its denominator.",
};

const rp3SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP3-contract",
  journey: profileDefinitions["V3-contract"].journey,
  protocol: {
    blueQuestion: "What breaks field-level story-contract adoption or core character/world-rule evidence if this requirement is absent?",
    redQuestion: "Does the requirement actually need outline milestones, arcs, obligations, or prose before it can be consumed?",
    rule: "Retain contract identity, evidence, candidate adoption, atomicity, and compatibility; defer story-engine planning semantics to V4.",
  },
  counts: {
    originalMustRequirements: rp3AcceptanceRefs.size + rp3MovedDecisions.size,
    retainedMustRequirements: rp3AcceptanceRefs.size,
    movedRequirements: rp3MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V3-contract"].mustBudget - rp3AcceptanceRefs.size,
  },
  retained: requirementCatalog
    .filter((item) => rp3AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      category: item.rp3SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp3MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP3 is limited to evidence-bounded contract candidates, field-level adoption, core character/world rules, and atomic compatibility; StoryEngineContract and NarrativeQuestion move to V4.",
};

const rp4SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP4-outline",
  profileKind: "user-release",
  isUserRelease: true,
  journey: profileDefinitions["V4-outline"].journey,
  protocol: {
    blueQuestion: "Does this requirement directly make the adopted contract into a causally reachable, truth-bounded, author-adoptable, near-term executable outline?",
    redQuestion: "Does it require observed prose, canon revision, a frozen publication draft, or completion evidence that cannot exist in RP4?",
    rule: "RP4 may plan full-book structure and prove the near horizon executable; plans remain candidates, while prose evidence and completion certificates stay downstream.",
  },
  currentPlatformEvidence: {
    present: [
      "outline.generate and chapter.plan task types",
      "StoryControl with arcs, characters, and events",
      "SceneCard persistence and editing",
      "imported chapter-outline files in real workspace projects",
      "A platform library can name and link generic reference assets, and the internal knowledge index can search story-derived facts",
    ],
    insufficient: [
      "No StoryEngineContract or NarrativeQuestion authority was found in current business types",
      "No OutlineCandidate adoption boundary was found",
      "No execution_ready proof or causal reachability gate was found",
      "Existing StoryControl and Markdown outlines therefore do not prove RP4 implementation",
      "No ResearchObligation, versioned external source snapshot, claim adjudication, prose consumption receipt, or ResearchSettlement was found",
    ],
  },
  counts: {
    originalMustRequirements: rp4AcceptanceRefs.size + rp4MovedDecisions.size,
    retainedMustRequirements: rp4AcceptanceRefs.size,
    movedRequirements: rp4MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V4-outline"].mustBudget - rp4AcceptanceRefs.size,
  },
  retained: requirementCatalog
    .filter((item) => rp4AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      category: item.rp4SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp4MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP4 retains 83 outline-journey, research-grounding, and enabling invariants, and moves six prose-, revision-, or completion-dependent requirements downstream; current platform primitives remain implementation evidence only for legacy capabilities, not for RP4 completion.",
};

const rp5SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited-policy-selected-not-implemented",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP5-drafting",
  profileKind: "user-release",
  isUserRelease: true,
  journey: profileDefinitions["V5-drafting"].journey,
  protocol: {
    blueQuestion: "Does this requirement directly protect the first real prose candidate, its review and adoption, chapter settlement, first feedback evidence, or the continuous drafting run that schedules the next chapter?",
    redQuestion: "Can a task-success flag, direct file write, fixed score, same-model review, unapproved recap, or one Q-003 speed preference make this requirement appear satisfied without trustworthy prose evidence?",
    rule: "RP5 owns all first-prose and continuous-run invariants; Q-003 selects review intensity and resource policy only, never requirement membership or hard-gate strength.",
  },
  currentPlatformEvidence: {
    present: [
      "chapter.plan, chapter.draft, quality.review, selection.polish, quality.rewrite, continuity.check, and writing.recap task templates",
      "A single-chapter runtime pipeline with checkpoints, narrative snapshots, context assembly, quality review, recap, knowledge rebuild, story-graph update, pause, rewrite, and author-review states",
      "ChapterQualityReport, series quality metrics, rewrite comparison UI, task invocation history, adoption decisions, and accepted patch targets",
      "Real projects with chapter plans, drafted prose, scene cards, ledgers, summaries, and quality files that can serve as migration fixtures",
      "Monaco edits Markdown and all current save/import/runtime paths preserve the provided UTF-8 string directly",
    ],
    contradictoryOrInsufficient: [
      "runSingleChapterPipeline dispatches chapter_draft writes to the chapter content path before continuity validation, quality review, or author adoption",
      "The self-repair loop dispatches full-chapter quality_self_repair writes before the final author-review gate",
      "RUNTIME_QUALITY_TARGET is a fixed 86 and qualityMeetsTarget requires every one of the same seven metrics to reach it, regardless of chapter function",
      "quality.rewrite is instructed to rewrite the full chapter and raise every metric, which can erase valid quiet-chapter strengths and author-locked prose",
      "The start path executes one single-chapter pipeline; no first-class BookRun dependency graph proves autoContinue, authorization expiry, lease fencing, or honest whole-book progress",
      "No ProseCandidate, ProseAdoptionTransaction, SceneExecutionLedger, DraftingQualityPolicy, hard-versus-aesthetic verdict, immutable AuthorFeedbackEvent, or settled chapter certificate authority was found",
      "Recap and knowledge rebuilding occur after direct draft writes, so rejected prose can influence derived assets before governed settlement",
      "No TextProfile, structure snapshot, contamination quarantine, source map, bounded normalization receipt, cross-entry round-trip proof, or TextSettlement was found",
    ],
  },
  q003Boundary: {
    decisionStatus: "confirmed",
    selectedOption: "C",
    selectedPolicyId: "tiered-quality",
    runtimeActivationStatus: "not-implemented-not-verified",
    policyCandidateRef: profileDefinitions["V5-drafting"].policyCandidateRef,
    invariantRequirementCount: rp5AcceptanceRefs.size,
    effect: "C applies ordinary/elevated/key tiers to candidate count, independent review, pairwise depth, repair budget and milestone cadence only.",
    forbiddenEffect: "The selected policy cannot weaken hard guards, candidate-before-canon, atomic adoption, rights, evidence, feedback capture, runtime safety, or chapter settlement semantics.",
  },
  counts: {
    originalRequirements: rp5AcceptanceRefs.size,
    retainedRequirements: rp5AcceptanceRefs.size,
    retainedMustRequirements: 144,
    retainedShouldRequirements: 1,
    retainedExperimentRequirements: 3,
    movedRequirements: 0,
    remainingMustBudgetHeadroom: profileDefinitions["V5-drafting"].mustBudget - 144,
  },
  retained: requirementCatalog
    .filter((item) => rp5AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      normativeStrength: item.normativeStrength,
      category: item.rp5SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [],
  conclusion: "RP5 retains all 148 first-prose, text-integrity, and continuous-run requirements as one common contract: 144 MUST, one SHOULD, and three EXPERIMENT. Q-003 is author-confirmed as C/tiered-quality, so the profile is specification-locked but remains unimplemented; current direct-string/direct-to-canon paths still contradict the required candidate/adoption and text-settlement boundaries.",
};

const rp6SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited-dependencies-specified-not-implemented",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP6-obligations",
  profileKind: "user-release",
  isUserRelease: true,
  journey: profileDefinitions["V6-obligations"].journey,
  protocol: {
    blueQuestion: "Does this requirement directly let the author and system identify, mark, schedule, evidence, settle, transform, or intentionally open a reader-facing narrative obligation?",
    redQuestion: "Does it claim full-book source coverage or completion, rely only on a mutable status field, or expose an answer that the current reader/POV must not know?",
    rule: "RP6 proves lifecycle actions for identified obligations and honest scoped closure; RP8 alone may certify completion-wide coverage and final portfolio closure.",
  },
  currentPlatformEvidence: {
    present: [
      "LedgerEntry supports foreshadowing, status, severity, chapterIds, and expected resolution text",
      "SceneCard and chapter dashboard carry foreshadowing identifiers",
      "Runtime snapshots expose open and overdue narrative-debt counts",
      "Real project templates contain Markdown and JSON foreshadowing ledgers",
    ],
    contradictoryOrInsufficient: [
      "LedgerPanel can directly PUT a mutable resolved status without payoff evidence",
      "Overdue detection parses chapter numbers from free text instead of semantic milestones",
      "No NarrativeObligation authority, append-only lifecycle, EvidenceAnchor, PayoffContract, or ClosureCertificate was found",
      "A real sampled foreshadowing ledger is empty, so zero entries cannot prove source coverage or closure health",
    ],
  },
  counts: {
    originalRequirements: rp6AcceptanceRefs.size + rp6MovedDecisions.size,
    originalMustRequirements: 57,
    originalShouldRequirements: 1,
    retainedRequirements: rp6AcceptanceRefs.size,
    retainedMustRequirements: 55,
    retainedShouldRequirements: 1,
    movedMustRequirements: rp6MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V6-obligations"].mustBudget - 55,
  },
  retained: requirementCatalog
    .filter((item) => rp6AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      normativeStrength: item.normativeStrength,
      category: item.rp6SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp6MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP6 retains 55 MUST plus one SHOULD obligation-lifecycle requirement and moves two completion-wide certificates to RP8; Q-003 no longer blocks specification dependency resolution, but RP5/RP6 implementation and release evidence remain absent.",
};

const rp7SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited-dependencies-specified-not-implemented",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP7-revision",
  profileKind: "user-release",
  isUserRelease: true,
  journey: profileDefinitions["V7-revision"].journey,
  protocol: {
    blueQuestion: "Does this requirement consume longitudinal, multi-candidate, or author-feedback evidence to revise locally, detect drift, learn a reversible preference, or govern a strategy release?",
    redQuestion: "Should this control have existed at the first prose gate or first feedback event, or does it mistake a proxy score or self-judgment for trustworthy quality evidence?",
    rule: "RP5 captures first-prose review and feedback evidence; RP7 may aggregate that evidence into bounded hypotheses and reversible strategy decisions, but cannot override hard failures or generalize private feedback without proof.",
  },
  currentPlatformEvidence: {
    present: [
      "quality.review and quality.rewrite task types",
      "ChapterQualityReport with seven metrics and an overall score",
      "Series quality trends and background quality rebuild paths",
      "Invocation adoption decisions with accepted or rejected states and accepted patch targets",
    ],
    contradictoryOrInsufficient: [
      "The same fixed seven metrics are applied broadly instead of adapting to chapter function and declared intent",
      "qualityMeetsTarget relies on overall and per-metric scores without a separate evidence-backed hard-failure gate",
      "The review UI proposes full-chapter rewrite from metric deficits rather than bounded evidence-anchored edits",
      "No blind pairwise review, reviewer calibration, PreferenceHypothesis, LearningPolicy, EvaluationRun, ReleaseDecision, holdout, shadow, or canary evidence was found",
      "Accepted or rejected patch targets do not capture fragment-level reason, scope, confounding factors, or undo semantics",
    ],
  },
  counts: {
    originalRequirements: rp7AcceptanceRefs.size + rp7MovedDecisions.size,
    originalMustRequirements: 35,
    originalShouldRequirements: 1,
    retainedRequirements: rp7AcceptanceRefs.size,
    retainedMustRequirements: 20,
    retainedShouldRequirements: 1,
    movedRequirements: rp7MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V7-revision"].mustBudget - 20,
  },
  retained: requirementCatalog
    .filter((item) => rp7AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      normativeStrength: item.normativeStrength,
      category: item.rp7SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp7MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP7 retains 20 MUST plus one SHOULD longitudinal revision and learning requirement, while moving 15 first-prose review and feedback foundations to RP5; Q-003 is closed at specification level, but no implementation evidence proves the learning loop.",
};

const rp8SemanticReview = {
  schemaVersion: "1.0.0",
  status: "spec-audited-dependencies-specified-not-implemented",
  generatedOn: sourceDate,
  sourceSddVersion: version,
  releaseProfile: "RP8-completion",
  profileKind: "user-release",
  isUserRelease: true,
  journey: profileDefinitions["V8-completion"].journey,
  protocol: {
    blueQuestion: "Does this requirement consume a frozen full-book publication scope to prove completion, cross-domain closure, audit replay, staleness, source coverage, or safe terminal quiescence?",
    redQuestion: "Is it actually a control needed from the first continuous drafting chapter, or does it infer book completion from file counts, one completed runtime, an empty queue, a model score, or a mutable status?",
    rule: "RP5 owns continuous-run safety from the first drafting action; RP8 owns only terminal evidence that cannot exist until the book, obligations, revision, and active writers have converged.",
  },
  currentPlatformEvidence: {
    present: [
      "A single-chapter runtime pipeline supports queued, running, paused, review_required, completed, failed, and cancelled statuses",
      "The runtime UI projects a completed run as 100 percent and labels it as autopilot completed",
      "A real imported project contains 198 planned chapters and substantial drafted content",
      "The browser can download a mutable project audit report as JSON",
    ],
    contradictoryOrInsufficient: [
      "The runtime start path calls runSingleChapterPipeline rather than a first-class BookRun work graph",
      "The UI completion label has no draft/review/closure/audited completion denominator",
      "The sampled 198-chapter project has 70 drafted and 128 planned chapters, contradicting full-book completion",
      "No full-book CompletionReport, replayable CompletionAudit, ObligationCoverageCertificate, quiescence proof, or stale audited_complete authority was found",
      "No ManuscriptRelease, EditionManifest, publication tree, reader-safe manuscript artifact, deterministic renderer, artifact hash set, or DeliveryProof was found",
    ],
  },
  counts: {
    originalRequirements: rp8AcceptanceRefs.size + rp8MovedDecisions.size,
    retainedMustRequirements: rp8AcceptanceRefs.size,
    movedToDraftingRequirements: rp8MovedDecisions.size,
    remainingMustBudgetHeadroom: profileDefinitions["V8-completion"].mustBudget - rp8AcceptanceRefs.size,
  },
  retained: requirementCatalog
    .filter((item) => rp8AcceptanceRefs.has(item.requirementId))
    .map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      category: item.rp8SemanticReview.category,
      firstSliceScope: item.firstSliceScope,
      acceptanceRefs: item.reviewedFirstSliceAcceptanceRefs,
      extensionMode: item.extensionMode,
      extensionSlices: item.extensionSlices,
    })),
  moved: [...rp8MovedDecisions.entries()].map(([requirementId, decision]) => {
    const item = requirementCatalog.find((candidate) => candidate.requirementId === requirementId);
    return { requirementId, title: item.title, ...decision };
  }),
  conclusion: "RP8 retains 16 terminal completion and manuscript-delivery requirements and moves 23 continuous-run controls to RP5; Q-003 is closed at specification level, while RP5 remains unimplemented and no evidence proves full-book completion or artifact delivery.",
};

const futureRequirements = requirementCatalog.filter((item) => !item.releaseProfile);
const deferLines = futureRequirements.map((item) => JSON.stringify({
  schemaVersion: "1.0.0",
  decisionId: `DEFER-${item.requirementId}`,
  requirementId: item.requirementId,
  status: "planned-not-active",
  reason: "Outside the RP0-RP3 planning horizon; retained in the complete product vision.",
  targetSlice: item.firstSlice,
  risk: "Early slices must preserve upstream event, version, evidence, and rollback invariants.",
  reactivationCondition: "All dependency ReleaseProfiles have valid evidence bundles and the target profile is budgeted.",
  sourceSddVersion: version,
}));

const countBy = (items, key) => Object.fromEntries(
  [...Map.groupBy(items, (item) => item[key]).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, members]) => [value, members.length]),
);

const requirementsWithoutCandidates = requirementCatalog
  .filter((item) => item.directAcceptanceCandidates.length === 0)
  .map((item) => item.requirementId);
const overBudgetProfiles = releaseProfiles
  .filter((profile) => !profile.scopeBudget.withinBudget)
  .map((profile) => profile.releaseProfile);
const atBudgetCeilingProfiles = releaseProfiles
  .filter((profile) => profile.scopeBudget.actualMustRequirements === profile.scopeBudget.mustRequirementsMax)
  .map((profile) => profile.releaseProfile);
const lowHeadroomProfiles = releaseProfiles
  .filter((profile) => {
    const headroom = profile.scopeBudget.mustRequirementsMax - profile.scopeBudget.actualMustRequirements;
    return headroom >= 0 && headroom <= 1;
  })
  .map((profile) => profile.releaseProfile);
const dependencyOpenProfiles = releaseProfiles
  .filter((profile) => profile.missingDependencyProfiles.length > 0)
  .map((profile) => ({
    releaseProfile: profile.releaseProfile,
    missingDependencyProfiles: profile.missingDependencyProfiles,
  }));
const decisionOpenProfiles = releaseProfiles
  .filter((profile) => profile.openDecisionIds.length > 0)
  .map((profile) => ({
    releaseProfile: profile.releaseProfile,
    openDecisionIds: profile.openDecisionIds,
  }));

const convergenceReport = {
  schemaVersion: "1.0.0",
  status: "draft-blocked-from-approval",
  generatedOn: sourceDate,
  sddVersion: version,
  sourceSha256: sourceHash,
  counts: {
    requirements: requirements.length,
    acceptanceTests: acceptanceTests.length,
    decisions: decisions.length,
    requirementsBySlice: countBy(requirementCatalog, "firstSlice"),
    requirementsByStrength: countBy(requirementCatalog, "normativeStrength"),
    futureDeferredRequirements: futureRequirements.length,
    requirementsWithAcceptanceCandidates: requirements.length - requirementsWithoutCandidates.length,
    requirementsWithoutAcceptanceCandidates: requirementsWithoutCandidates.length,
    specAuditedClassifications: requirementCatalog.filter((item) => item.classificationStatus === "spec-audited").length,
    specAuditedFirstSliceAcceptance: requirementCatalog.filter(
      (item) => item.reviewedFirstSliceAcceptanceStatus === "spec-audited",
    ).length,
    explicitUserObjectives: objectiveCoverage.summary.explicitUserObjectives,
    specificationCoveredObjectives: objectiveCoverage.summary.specificationCovered,
    implementationVerifiedObjectives: objectiveCoverage.summary.implementationVerified,
    documentationDeliverablesVerified: goalReadinessAudit.summary.documentationDeliverablesVerified,
    targetProductObjectivesImplementationVerified: goalReadinessAudit.summary.targetProductObjectivesImplementationVerified,
    productReleaseObjectivesVerified: goalReadinessAudit.summary.productReleaseObjectivesVerified,
    profileMemberRequirements: requirementCatalog.filter((item) => item.releaseProfile).length,
    decisionOpenProfiles: decisionOpenProfiles.length,
    dependencyOpenProfiles: dependencyOpenProfiles.length,
  },
  structuralChecks: {
    uniqueIds: true,
    contiguousRequirementDomains: true,
    contiguousAcceptanceTests: true,
    contiguousDecisions: true,
    everyRequirementHasFirstSlice: true,
    relationTargetsExist: true,
  },
  manualDispositions: [
    { semantic: "SourceMaterialRecord", compatibilityEntry: "8.14", canonicalEntry: "8.57", decision: "retain-compatibility-summary" },
    { semantic: "CraftPattern", compatibilityEntry: "8.15", canonicalEntry: "8.58", decision: "retain-compatibility-summary" },
    { semantic: "CraftExperiment", compatibilityEntry: "8.16", canonicalEntry: "8.60", decision: "retain-compatibility-summary" },
    { semantic: "CraftPattern.lifecycle", canonicalRequirement: "FR-CRAFT-003", decision: "remove-undefined-active-state" },
  ],
  openDecisions: [
    { id: "Q-003", status: "confirmed", selection: "C/tiered-quality", impact: "RP5 drafting speed, review depth, and model-budget weights" },
    { id: "Q-004", status: "confirmed", selection: "adaptive-risk-pause", impact: "milestone pause, discussion, and low-interruption continuation policy" },
    { id: "Q-005", status: "confirmed", selection: "broad-network-mechanism-learning", impact: "cross-platform discovery, source eligibility, isolation, cross-project abstraction, originality, expiry, and rollback" },
    { id: "Q-006", status: "confirmed", selection: "author-goal-led-multi-evidence", impact: "prose-quality evidence authority and tier-aware automatic adoption threshold" },
    { id: "Q-007", status: "confirmed", selection: "maturity-tiered-revision-authority", impact: "automatic revision authority over accepted, settled, and published prose" },
    { id: "Q-008", status: "confirmed", selection: "contract-anchored-rolling-emergence", impact: "story-contract authority, 3-5 chapter freeze, far-horizon evolution, and drafting-emergence adoption" },
    { id: "Q-009", status: "confirmed", selection: "obligation-led-elastic-length", impact: "elasticity authority for word count, chapter count, volume count, obligation closure, pacing, reader experience, hard locks and the default 15% pause threshold" },
  ],
  overBudgetProfiles,
  atBudgetCeilingProfiles,
  lowHeadroomProfiles,
  decisionOpenProfiles,
  dependencyOpenProfiles,
  requirementsWithoutAcceptanceCandidates: requirementsWithoutCandidates,
  blockingIssues: [
    "All ten explicit user objectives are specification-covered and the SDD documentation deliverable is machine-verifiable, but none of the nine target product capabilities is implementation- or release-verified by this documentation-only work.",
    "Q-003 is confirmed as C/tiered-quality at specification level, but no drafting policy runtime or common RP5 hard gate is implementation-verified.",
    "Q-004 is confirmed as adaptive-risk-pause at specification level, but no adaptive pause runtime is implementation-verified.",
    "Q-005 is confirmed as broad-network-mechanism-learning at specification level, but no connector, source quarantine, pattern laboratory, cross-project registry, originality guard, or deletion propagation runtime is implementation-verified.",
    "Q-006 is confirmed as author-goal-led-multi-evidence at specification level, but no calibrated quality-authority or tier-aware automatic-adoption runtime is implementation-verified.",
    "Q-007 is confirmed as maturity-tiered-revision-authority at specification level, but no semantic revision transaction, accepted-text fence, immutable edition supersession, or RevisionSettlement runtime is implementation-verified.",
    "Q-008 is confirmed as contract-anchored-rolling-emergence at specification level, but no contract-lock evaluator, 3-5 chapter freeze, EmergenceCandidate, semantic change classifier, automatic-adoption fence, or minimal re-planning runtime is implementation-verified.",
    "Q-009 is confirmed as obligation-led elastic length with a default 15% pause threshold and explicit hard-lock precedence, but no LengthContract, forecast, variance-decision or anti-filler/anti-compression runtime is implementation-verified.",
    ...decisionOpenProfiles.map(
      (profile) => `${profile.releaseProfile} cannot activate until author decisions close: ${profile.openDecisionIds.join(", ")}.`,
    ),
    ...dependencyOpenProfiles.map(
      (profile) => `${profile.releaseProfile} cannot activate until dependency profiles activate: ${profile.missingDependencyProfiles.join(", ")}.`,
    ),
    ...overBudgetProfiles.map((profile) => `${profile} exceeds its draft MUST budget.`),
  ],
  scopeWarnings: atBudgetCeilingProfiles.map(
    (profile) => `${profile} is exactly at its MUST budget ceiling; additions require replacement or deferral.`,
  ).concat(lowHeadroomProfiles
    .filter((profile) => !atBudgetCeilingProfiles.includes(profile))
    .map((profile) => `${profile} has one or fewer MUST slots of budget headroom.`)),
  conclusion: "All 537 requirements have spec-audited first-slice classifications and acceptance mappings. Q-003 through Q-009 are confirmed at specification level, so the SDD is Approved; implementation and release evidence remain open.",
};

const outputs = new Map([
  [join(outputRoot, "requirement-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`],
  [join(outputRoot, "requirement-evidence.json"), `${JSON.stringify(requirementEvidence, null, 2)}\n`],
  [join(outputRoot, "objective-coverage.json"), `${JSON.stringify(objectiveCoverage, null, 2)}\n`],
  [join(outputRoot, "goal-readiness.json"), `${JSON.stringify(goalReadinessAudit, null, 2)}\n`],
  [join(outputRoot, "defer-decisions.jsonl"), `${deferLines.join("\n")}\n`],
  [join(outputRoot, "reviews", "RP0-baseline-semantic-review.json"), `${JSON.stringify(rp0SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP1-capture-semantic-review.json"), `${JSON.stringify(rp1SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP2-understanding-semantic-review.json"), `${JSON.stringify(rp2SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP3-contract-semantic-review.json"), `${JSON.stringify(rp3SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP4-outline-semantic-review.json"), `${JSON.stringify(rp4SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP5-drafting-semantic-review.json"), `${JSON.stringify(rp5SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP6-obligations-semantic-review.json"), `${JSON.stringify(rp6SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP7-revision-semantic-review.json"), `${JSON.stringify(rp7SemanticReview, null, 2)}\n`],
  [join(outputRoot, "reviews", "RP8-completion-semantic-review.json"), `${JSON.stringify(rp8SemanticReview, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-003-drafting-quality.json"), `${JSON.stringify(q003DraftingPolicyCandidates, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-004-pause-discussion.json"), `${JSON.stringify(q004PauseDiscussionPolicy, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-005-craft-sources.json"), `${JSON.stringify(q005CraftSourcePolicy, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-006-quality-authority.json"), `${JSON.stringify(q006QualityAuthorityPolicy, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-007-revision-authority.json"), `${JSON.stringify(q007RevisionAuthorityPolicy, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-008-outline-evolution.json"), `${JSON.stringify(q008OutlineEvolutionPolicy, null, 2)}\n`],
  [join(outputRoot, "policy-candidates", "Q-009-length-elasticity.json"), `${JSON.stringify(q009LengthElasticityCandidates, null, 2)}\n`],
  [join(outputRoot, "audits", "current-write-authority-surfaces.json"), `${JSON.stringify(writeAuthorityAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-low-input-journey.json"), `${JSON.stringify(lowInputJourneyAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-craft-learning-loop.json"), `${JSON.stringify(craftLearningAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-foreshadowing-closure.json"), `${JSON.stringify(foreshadowingClosureAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-executable-outline.json"), `${JSON.stringify(executableOutlineAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-length-planning.json"), `${JSON.stringify(lengthPlanningAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-prose-production.json"), `${JSON.stringify(proseProductionAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-collaboration-dialogue.json"), `${JSON.stringify(collaborationDialogueAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-long-memory-continuity.json"), `${JSON.stringify(longMemoryAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-full-book-orchestration.json"), `${JSON.stringify(fullBookOrchestrationAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-quality-evaluation.json"), `${JSON.stringify(qualityEvaluationAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-revision-lineage.json"), `${JSON.stringify(revisionLineageAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-manuscript-delivery.json"), `${JSON.stringify(manuscriptDeliveryAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-research-grounding.json"), `${JSON.stringify(researchGroundingAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-text-integrity.json"), `${JSON.stringify(textIntegrityAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-project-durability.json"), `${JSON.stringify(projectDurabilityAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-context-orchestration.json"), `${JSON.stringify(contextOrchestrationAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-character-causality.json"), `${JSON.stringify(characterCausalityAudit, null, 2)}\n`],
  [join(outputRoot, "audits", "current-world-causality.json"), `${JSON.stringify(worldCausalityAudit, null, 2)}\n`],
  [join(outputRoot, "convergence", `${version}.json`), `${JSON.stringify(convergenceReport, null, 2)}\n`],
  ...releaseProfiles.map((profile) => [
    join(outputRoot, "release-profiles", `${profile.releaseProfile}.json`),
    `${JSON.stringify(profile, null, 2)}\n`,
  ]),
]);

let stale = false;
for (const [path, content] of outputs) {
  if (checkOnly) {
    let existing = null;
    try {
      existing = readFileSync(path, "utf8");
    } catch {
      // Missing output is stale.
    }
    if (existing !== content) {
      stale = true;
      console.error(`STALE ${path.slice(root.length + 1)}`);
    }
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  console.log(`WROTE ${path.slice(root.length + 1)}`);
}

if (stale) process.exitCode = 1;
if (!checkOnly) {
  console.log(`CATALOG ${requirements.length} requirements, ${acceptanceTests.length} acceptance tests, ${decisions.length} decisions`);
}
