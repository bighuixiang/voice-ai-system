import { describe, expect, it } from "vitest";
import { errorText, lengthLabel, operationTypeLabel, statusLabel, userFacingText } from "./novelLabels";

describe("novel labels", () => {
  it("keeps workflow status and operation labels in Chinese", () => {
    expect(statusLabel("ready_for_authorization")).toBe("待作者授权");
    expect(lengthLabel("pause-required")).toBe("需要暂停复核");
    expect(operationTypeLabel("chapter.draft")).toBe("起草正文");
  });

  it("does not stringify structured errors as objects", () => {
    expect(errorText({ error: { detail: { code: "V2_DEPENDENCY_MISSING" } } })).toBe("当前步骤的前置内容尚未完成。");
    expect(errorText({ context: { reason: "missing" } })).toBe("操作失败，请稍后重试");
  });

  it("translates machine summaries without changing author content", () => {
    expect(userFacingText("1 facts / 0 relations")).toBe("1 条事实 / 0 条关系");
    expect(userFacingText("正文草稿已完成")).toBe("正文草稿已完成");
  });
});
