const statusLabels: Record<string, string> = {
  candidate: "候选",
  "within-range": "在计划范围内",
  "pause-required": "需要暂停复核",
  applying: "正在应用修改",
  applied: "修改已完成",
  exhausted: "已用尽",
  recorded: "已记录",
  generated: "已生成",
  stale: "已过期",
  ready: "已准备",
  none: "无门禁",
  "do-not-activate": "不得激活",
  accepted: "已通过验收",
  missing: "缺失",
  degraded: "降级",
  managed: "已托管",
  unmanaged: "未托管",
  governed: "已治理",
  legacy: "旧版本",
  ready_for_authorization: "待作者授权",
  authorized: "已授权，待提交",
  committed: "已完成采纳",
  rejected: "已拒绝",
  blocked: "已阻断",
  passed: "验证通过",
  failed: "失败",
  pending: "等待中",
  queued: "排队中",
  running: "进行中",
  preparing: "准备中",
  paused: "已暂停",
  completed: "已完成",
  cancelled: "已取消",
  review_required: "等待人工确认",
  gate_required: "等待门禁确认",
  scope_complete: "范围已完成",
  settled: "已结算",
  planned: "已计划",
  judged: "已评审",
  active: "进行中",
  approved: "已批准",
  probation: "试验中",
  validated: "已验证",
  retired: "已停用",
  weakened: "已减弱",
  draft: "草稿",
  drafting: "写作中",
  drafted: "已完成草稿",
  reviewing: "评审中",
  checked: "已检查",
  error: "出错",
  success: "成功",
  idle: "未开始",
  waiting: "待处理",
  done: "已完成",
  watch: "需关注",
  stable: "稳定"
};

const beatTypeLabels: Record<string, string> = {
  payoff: "回收",
  foreshadow_setup: "伏笔铺设",
  foreshadow_payoff: "伏笔回收",
  reversal: "反转",
  setback: "受挫",
  progression: "推进",
  redemption: "救赎",
  sublimation: "升华",
  slice_of_life: "日常切片",
  relationship_turn: "关系转折",
  hook: "钩子"
};

const ledgerKindLabels: Record<string, string> = {
  foreshadowing: "伏笔",
  continuity: "连续性",
  power: "能力变化",
  character: "人物",
  risk: "风险"
};

const severityLabels: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  stable: "稳定",
  watch: "关注",
  review: "需要复核",
  blocked: "已阻断"
};

const lengthLabels: Record<string, string> = {
  "within-range": "在计划范围内",
  "pause-required": "需要暂停复核",
  paused: "已暂停",
  recorded: "已记录",
  "pause-and-review": "暂停并复核",
  "keep-plan": "保持当前计划",
  "request-replan": "申请重新规划",
  "forecast-drift": "预测偏差",
  "hard-lock-conflict": "硬约束冲突",
  "external-constraint": "外部约束",
  none: "无"
};

const operationTypeLabels: Record<string, string> = {
  "project.create": "创建项目",
  "outline.generate": "生成大纲",
  "structure.reverse": "反推结构",
  "chapter.plan": "规划章节",
  "chapter.draft": "起草正文",
  "selection.polish": "选区润色",
  "quality.review": "质量评审",
  "quality.rewrite": "质量改造",
  "continuity.check": "连续性检查",
  "idea.suggest": "补灵感",
  "writing.briefing": "写前简报",
  "writing.recap": "写后复盘",
  "assistant.free": "自由指令",
  "knowledge.index.rebuild": "重建知识索引",
  "quality.series.rebuild": "重建全书质量",
  "story.graph.rebuild": "重建故事图谱",
  "understanding.shadow": "理解预处理"
};

const assetTypeLabels: Record<string, string> = {
  character: "角色",
  prop: "道具",
  scene: "场景",
  reference: "参考图",
  frame: "首尾帧",
  video: "视频"
};

const sourceTypeLabels: Record<string, string> = {
  "chapter-summary": "章节摘要",
  ledger: "叙事账本",
  "story-control": "故事总控"
};

const checkLabels: Record<string, string> = {
  "causal-chain": "因果链",
  context: "上下文",
  "chapter-goal": "章节目标",
  "source-contract": "来源设定",
  "execution-ready": "执行就绪",
  "canon-integrity": "正式设定完整性",
  "proof-current": "证明时效",
  "chapter-in-window": "章节窗口",
  "source-fingerprint": "来源指纹",
  "evidence-spans": "证据范围",
  "branch-separation": "分支隔离",
  "question-gate": "问题门禁",
  "migration-cutover": "迁移切换",
  "external-calibration": "外部校准",
  "governed-e2e": "受控全链路",
  "v2-independent-review": "第二版独立评审",
  "delivery-proof": "交付证明"
};

const functionLabels: Record<string, string> = {
  "inciting-pressure": "引发压力",
  escalation: "冲突升级",
  midpoint: "中点转折",
  "low-point": "低谷",
  climax: "高潮",
  resolution: "收束"
};

const freezeLabels: Record<string, string> = {
  strong: "强冻结",
  soft: "软冻结",
  open: "开放"
};

export function statusLabel(value: unknown, fallback = "未提供"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return statusLabels[value] || (/[\u4e00-\u9fff]/.test(value) ? value : fallback);
}

export function booleanLabel(value: unknown): string {
  return value === true ? "是" : value === false ? "否" : "未提供";
}

export function epistemicStatusLabel(value: unknown): string {
  const labels: Record<string, string> = { explicit: "明确事实", provisional: "暂定判断", inferred: "推断", unknown: "未知" };
  return typeof value === "string" ? labels[value] || statusLabel(value) : "未提供";
}

export function reviewVerdictLabel(value: unknown): string {
  const labels: Record<string, string> = { "supports-adoption": "支持采纳", "blocks-adoption": "阻断采纳", adopt: "建议采纳", repair: "建议局部修复" };
  return typeof value === "string" ? labels[value] || statusLabel(value) : "未提供";
}

export function provenanceLabel(value: unknown): string {
  const labels: Record<string, string> = { explicit: "作者明确提供", inference: "推断来源", imported: "导入来源", generated: "系统生成" };
  return typeof value === "string" ? labels[value] || statusLabel(value) : "未提供";
}

export function reviewerKindLabel(value: unknown): string {
  const labels: Record<string, string> = { human: "人工", provider: "服务商", "independent-deterministic": "本地确定性评审" };
  return typeof value === "string" ? labels[value] || statusLabel(value) : "未提供";
}

export function checkIdLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "检查项";
  return checkLabels[value] || (/[\u4e00-\u9fff]/.test(value) ? value : "结构检查");
}

export function functionLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定功能";
  return functionLabels[value] || (/[\u4e00-\u9fff]/.test(value) ? value : "章节功能");
}

export function freezeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定冻结级别";
  return freezeLabels[value] || (/[\u4e00-\u9fff]/.test(value) ? value : "未指定冻结级别");
}

export function autonomyLevelLabel(value: unknown): string {
  const labels: Record<string, string> = { L0: "人工主导（L0）", L1: "辅助推进（L1）", L2: "受控自动推进（L2）" };
  return typeof value === "string" ? labels[value] || "未指定" : "未指定";
}

export function gateLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未设置";
  return /[\u4e00-\u9fff]/.test(value) ? value : statusLabel(value, "待确认");
}

export function beatTypeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定节拍";
  return beatTypeLabels[value] || statusLabel(value, "创作节拍");
}

export function ledgerKindLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定账本类型";
  return ledgerKindLabels[value] || statusLabel(value, "账本条目");
}

export function severityLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未提供严重程度";
  return severityLabels[value] || statusLabel(value, "严重程度");
}

export function lengthLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未提供";
  return lengthLabels[value] || statusLabel(value, "未提供");
}

export function operationTypeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定任务";
  return operationTypeLabels[value] || "其他任务";
}

export function assetTypeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定素材";
  return assetTypeLabels[value] || "其他素材";
}

export function sourceTypeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未指定来源";
  return sourceTypeLabels[value] || "其他来源";
}

const errorCodeLabels: Record<string, string> = {
  OUTLINE_SOURCE_CONTRACT_NOT_ADOPTED: "请先确认并采纳对应的故事设定。",
  CONTRACT_CANDIDATE_NOT_FOUND: "找不到对应的故事设定候选，请先刷新候选列表。",
  OUTLINE_CANDIDATE_NOT_FOUND: "找不到对应的大纲候选，请先刷新候选列表。",
  V2_DEPENDENCY_MISSING: "当前步骤的前置内容尚未完成。",
  repair_required: "需要修复后才能继续。"
};

const userFacingTextMap: Record<string, string> = {
  "AI task stopped before completion.": "AI 任务尚未完成就已停止。",
  "AI task was left running by a previous API process and cannot be recovered.": "上一次服务留下的 AI 任务无法恢复，请重新发起。",
  "AI task cancelled.": "AI 任务已取消。",
  "AI task cancellation requested.": "已请求取消 AI 任务。",
  "AI task was not active in this API process.": "当前服务中没有正在运行的该 AI 任务。",
  "Cancellation requested.": "已请求取消。",
  "Cancellation requested; job stopped after the current handler completed.": "已请求取消，当前处理完成后作业将停止。",
  "Cancellation requested; job stopped after handler error.": "已请求取消，作业处理出错后已停止。",
  "Cancellation requested; short rebuild jobs may finish before the request is observed.": "已请求取消，短时重建任务可能会先完成。",
  "Cancelled before the background handler started.": "后台处理开始前已取消。",
  "Cancelled because the task is no longer active.": "任务已不再运行，因此已取消。",
  "Codex timed out": "Codex 调用超时",
  "Draft complete.": "正文草稿已完成。",
  "Runtime stage recovery decision": "运行阶段恢复决策已记录",
  "Runtime checkpoint reused from receipt": "已从凭证复用运行快照",
  "Runtime checkpoint created": "运行快照已创建",
  "Narrative snapshot reused from receipt": "已从凭证复用叙事快照",
  "Chapter plan reused from receipt": "已从凭证复用章节计划",
  "Chapter plan persisted for recovery": "章节计划已保存，可用于恢复",
  "Context assembly reused from receipt": "已从凭证复用上下文组装结果",
  "Context assembly persisted for recovery": "上下文组装结果已保存，可用于恢复",
  "Governed chapter execution plan bound to proof and context": "受控章节执行计划已绑定证明与上下文",
  "Chapter plan bound to draft input": "章节计划已绑定正文输入",
  "Draft output reused from receipt": "已从凭证复用正文输出",
  "Draft output persisted for recovery": "正文输出已保存，可用于恢复",
  "Prose candidate persisted outside canon; author adoption is required": "正文候选已保存到隔离区，等待作者采纳",
  "Content validation reused from receipt": "已从凭证复用内容校验结果",
  "Content validation persisted for recovery": "内容校验结果已保存，可用于恢复",
  "Runtime quality review completed": "运行质量评审已完成",
  "Runtime quality self-repair started": "运行质量自修已开始",
  "Runtime quality self-repair failed": "运行质量自修失败",
  "Runtime quality self-repair applied": "运行质量自修已应用",
  "Quality report reused from receipt": "已从凭证复用质量报告",
  "Quality report persisted for recovery": "质量报告已保存，可用于恢复",
  "Writing recap candidate saved for author approval": "写作回顾候选已保存，等待作者确认",
  "Writing recap candidate reused from receipt": "已从凭证复用写作回顾候选",
  "Knowledge index updated": "知识索引已更新",
  "Story graph projection reused from receipt": "已从凭证复用故事图谱投影",
  "Story graph projection persisted for recovery": "故事图谱投影已保存，可用于恢复",
  "Runtime requires human review": "运行流程需要人工审阅",
  "Runtime failure scheduled for bounded retry": "运行失败，已安排有限次数重试",
  "Runtime paused after stagnation detection": "检测到停滞，运行流程已暂停",
  "Runtime failure recorded": "运行失败已记录",
  "Runtime run recovered after worker restart": "工作进程重启后已恢复运行",
  "Runtime run paused": "运行流程已暂停",
  "Runtime run started": "运行流程已启动",
  "Runtime run completed": "运行流程已完成",
  MEMORY_HEALTH_BLOCKED: "记忆健康度已阻断",
  MEMORY_HEALTH_DEGRADED: "记忆健康度不足",
  MEMORY_CONTINUITY_AUDIT_BLOCKED: "记忆连续性审计未通过",
  MEMORY_CONTRADICTION_UNRESOLVED: "存在未解决的记忆矛盾",
  CONTRADICTION_SETS_OPEN: "存在未关闭的矛盾集合",
  MEMORY_REPLACEMENT_PENDING: "记忆替换仍待处理",
  MEMORY_PROJECTION_STALE: "记忆投影已过期",
  MEMORY_CLAIM_SOURCE_MISSING: "记忆事实来源缺失",
  MEMORY_RETRIEVAL_EVIDENCE_GAP_CONFLICT: "记忆检索存在冲突证据缺口",
  MEMORY_RETRIEVAL_EVIDENCE_GAP_TIME_UNKNOWN: "记忆检索存在未知时间证据缺口"
};

function translateUserFacingString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (userFacingTextMap[trimmed]) return userFacingTextMap[trimmed];
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed) && trimmed.startsWith("MEMORY_")) return "记忆门禁未通过：" + trimmed;
  const facts = trimmed.match(/^(\d+) facts? \/ (\d+) relations?$/i);
  if (facts) return `${facts[1]} 条事实 / ${facts[2]} 条关系`;
  const nodes = trimmed.match(/^(\d+) nodes? \/ (\d+) relations?$/i);
  if (nodes) return `${nodes[1]} 个节点 / ${nodes[2]} 条关系`;
  const chapters = trimmed.match(/^(\d+)\/(\d+) chapters reviewed, average (.+)$/i);
  if (chapters) return `${chapters[1]}/${chapters[2]} 章已评审，平均分 ${chapters[3]}`;
  const exited = trimmed.match(/^(.+) exited with (\d+)$/i);
  if (exited) return `${exited[1]} 已退出，退出码：${exited[2]}`;
  const parseFailure = trimmed.match(/^Failed to parse (.+) output: (.+)$/i);
  if (parseFailure) return `无法解析 ${parseFailure[1]} 的输出：${parseFailure[2]}`;
  return value;
}

export function userFacingText(value: unknown, fallback = ""): string {
  if (value instanceof Error) return translateUserFacingString(value.message) || fallback;
  if (typeof value === "string") return translateUserFacingString(value) || fallback;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "detail", "error", "outputSummary", "summary"]) {
      if (record[key] !== undefined) {
        const text = userFacingText(record[key], "");
        if (text) return text;
      }
    }
  }
  return fallback;
}

export function errorText(error: unknown, fallback = "操作失败，请稍后重试"): string {
  if (error instanceof Error && error.message.trim()) return translateUserFacingString(error.message);
  if (typeof error === "string" && error.trim()) return errorCodeLabels[error] || translateUserFacingString(error);
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    if (typeof value.code === "string" && errorCodeLabels[value.code]) return errorCodeLabels[value.code];
    for (const key of ["message", "detail", "error"]) {
      const nested = errorText(value[key], "");
      if (nested) return nested;
    }
  }
  return fallback;
}
