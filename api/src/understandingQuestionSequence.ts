import type { DecisionRecord } from "./dialogueQuestions.js";

export const UNDERSTANDING_QUESTION_SEQUENCE = [
  { questionId: "question-primary-desire", text: "在开头阶段，主角最想得到什么？", impact: "high" as const, whyNow: "这个回答决定主角第一个核心设定。", errorCost: "高", reversibility: "低", delayCost: "中", recommendation: "请作者回答，或明确委托系统代为决定。" },
  { questionId: "question-core-conflict", text: "什么对立压力最直接地阻碍主角实现这个愿望？", impact: "high" as const, whyNow: "没有对立压力，故事设定就无法约束可执行的大纲。", errorCost: "高", reversibility: "中", delayCost: "中", recommendation: "请明确能够迫使主角作出重要选择的压力。" },
  { questionId: "question-failure-cost", text: "如果主角失败，要付出什么具体代价？", impact: "high" as const, whyNow: "失败代价让大纲的风险可检验，而不只是装饰。", errorCost: "高", reversibility: "中", delayCost: "低", recommendation: "优先说明会改变主角可选道路的后果。" },
  { questionId: "question-inner-need", text: "在表面愿望之下，主角需要学会或接受什么？", impact: "high" as const, whyNow: "内在需求能区分真正的戏剧成长与单纯的外部目标。", errorCost: "高", reversibility: "中", delayCost: "中", recommendation: "说明促成改变的压力，不必预先规定每一场戏。" },
  { questionId: "question-misbelief", text: "主角目前被哪一种错误信念保护或限制？", impact: "high" as const, whyNow: "错误信念必须有来源和受压路径，后续改变才有依据。", errorCost: "高", reversibility: "中", delayCost: "中", recommendation: "请用角色此刻会坚持的方式说出这个信念。" },
  { questionId: "question-world-rule", text: "哪一条世界规则最能约束开头的故事承诺？", impact: "high" as const, whyNow: "核心规则会为后续选择提供条件、机制、代价和边界。", errorCost: "高", reversibility: "低", delayCost: "中", recommendation: "优先明确一条可观察的规则，而不是笼统的设定总览。" },
  { questionId: "question-opposing-pressure", text: "什么持续施加的压力让核心冲突无法立刻解决？", impact: "high" as const, whyNow: "在第一个核心设定确定后，对立压力仍必须能够持续推动剧情。", errorCost: "高", reversibility: "中", delayCost: "中", recommendation: "请明确一种能迫使选择并造成代价的压力。" },
  { questionId: "question-irreversible-choice", text: "哪一种选择一旦作出，就无法在不改变故事设定的前提下撤销？", impact: "high" as const, whyNow: "不可逆的选择能避免故事设定沦为一组偏好清单。", errorCost: "高", reversibility: "低", delayCost: "低", recommendation: "请说明该选择，以及它会消耗的资源、关系或信念。" },
  { questionId: "question-reader-promise", text: "开头向读者承诺怎样的体验或答案？", impact: "medium" as const, whyNow: "读者承诺能让后续结构始终连接到预期体验。", errorCost: "中", reversibility: "高", delayCost: "中", recommendation: "请用读者体验描述承诺，而不是营销标签。" },
  { questionId: "question-ending-direction", text: "在不预先锁死每个结局情节的前提下，故事必须保留怎样的结局方向？", impact: "high" as const, whyNow: "有边界的方向既支持规划，也为作者保留低风险细节上的选择。", errorCost: "高", reversibility: "低", delayCost: "中", recommendation: "请说明结局方向和不可避免的代价，而不是写完整梗概。" }
] as const;

export type UnderstandingQuestion = (typeof UNDERSTANDING_QUESTION_SEQUENCE)[number];

export function nextUnansweredQuestion(decisions: readonly Pick<DecisionRecord, "questionId" | "status">[]): UnderstandingQuestion | undefined {
  const answeredQuestionIds = new Set(decisions.filter((decision) => decision.status === "recorded").map((decision) => decision.questionId));
  return UNDERSTANDING_QUESTION_SEQUENCE.find((question) => !answeredQuestionIds.has(question.questionId));
}
