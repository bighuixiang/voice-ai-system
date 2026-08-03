import { describe, expect, it } from "vitest";
import { parseCollaborationMessage } from "./collaborationMessage.js";

describe("collaboration message", () => {
  it("splits an answer, new direction, keep instruction and continue authorization", () => {
    const result = parseCollaborationMessage("选 hero；换个方向：更安静；保留这一段；继续");
    expect(result.events.map((event) => event.type)).toEqual(expect.arrayContaining(["answer", "new-direction", "preserve", "continue"]));
  });

  it("maps minimal control language to explicit reversible events", () => {
    expect(parseCollaborationMessage("你决定").events[0]).toMatchObject({ type: "delegate-decision" });
    expect(parseCollaborationMessage("先写一版看看").events[0]).toMatchObject({ type: "exploratory-draft" });
    expect(parseCollaborationMessage("回到上一版").events[0]).toMatchObject({ type: "rollback" });
    expect(parseCollaborationMessage("少问一点").events[0]).toMatchObject({ type: "policy-change" });
  });

  it("does not treat unrelated chatter as an answer", () => {
    const result = parseCollaborationMessage("今天天气不错");
    expect(result.events[0]).toMatchObject({ type: "unrelated" });
  });

  it("classifies otherwise-natural text as an answer when a blocking question is active", () => {
    const result = parseCollaborationMessage("保护钟声，不让潮水带走它", { activeQuestionId: "question-primary-desire" });
    expect(result.events[0]).toMatchObject({ type: "answer", text: "保护钟声，不让潮水带走它" });
  });
});
