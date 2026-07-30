import { describe, expect, it } from "vitest";
import { evaluateProseSpecificity } from "./proseSpecificity.js";

const valid = { sceneId: "scene-1", blocks: [{ blockId: "b1", text: "旧闸门的齿轮卡住了，她的手被铁屑划破，只能用外套缠住扳手。", mode: "scene" as const, linkedFunction: "choice", hasSensoryEvidence: true, changesAction: true }, { blockId: "b2", text: "她决定留下。", mode: "scene" as const, linkedFunction: "consequence", hasSensoryEvidence: false, changesAction: true }], sourceRefs: ["prose://scene-1"] };
describe("prose specificity", () => {
  it("passes concrete scene-bound evidence", () => { const report = evaluateProseSpecificity(valid); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]); });
  it("flags exposition blocks, setting dumps, grandiose abstraction and sensory lists", () => { const report = evaluateProseSpecificity({ ...valid, blocks: [{ blockId: "b1", text: "这是一个宏大而永恒的伟大世界，规则如下：火、水、风、土、光、影。", mode: "exposition", linkedFunction: null, hasSensoryEvidence: true, changesAction: false }, { blockId: "b2", text: "冷、热、红、蓝、香、臭、响、静。", mode: "description", linkedFunction: null, hasSensoryEvidence: true, changesAction: false }] }); expect(report.status).toBe("blocked"); expect(report.issues).toEqual(expect.arrayContaining(["CONTINUOUS_EXPOSITION", "SETTING_DUMP", "GRANDIOSE_ABSTRACTION", "SENSORY_LIST_STACK"])); });
  it("requires functional links and evidence", () => { expect(evaluateProseSpecificity({ ...valid, sourceRefs: [] }).issues).toContain("SPECIFICITY_EVIDENCE_REQUIRED"); expect(evaluateProseSpecificity({ ...valid, blocks: [{ ...valid.blocks[1], linkedFunction: null, changesAction: false }] }).status).toBe("blocked"); });
});
