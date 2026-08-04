<template>
  <section class="creative-session-panel" data-testid="creative-session-panel" aria-labelledby="creative-session-title">
    <header class="creative-session-header">
      <div>
        <p class="eyebrow">作者工作台</p>
        <h2 id="creative-session-title">创作输入</h2>
        <p>先记录作者的原话，理解与生成将在后续环节进行。</p>
      </div>
      <span class="session-status" :class="{ loading }">{{ loading ? "加载中" : "已持久化" }}</span>
    </header>

    <div v-if="error" class="session-error" role="alert">{{ error }}</div>
    <div v-if="contractError" class="session-error" data-testid="contract-error" role="alert">
      {{ contractError }}
      <button type="button" data-testid="retry-contract-candidate" @click="emit('retry-contract')">重试生成契约候选</button>
    </div>
    <div v-if="journey" class="journey-primary-action" data-testid="journey-primary-action">
      <span class="journey-stage">{{ stageLabel(journey.stage) }}</span>
      <strong>{{ journey.primaryAction.label }}</strong>
      <span v-if="journey.activeQuestion" class="journey-question">{{ questionText(journey.activeQuestion.id, journey.activeQuestion.text) }}</span>
      <button type="button" class="journey-action-button" @click="emit('primary-action', journey.primaryAction.id)">
        {{ journey.primaryAction.label }}
      </button>
      <button v-if="journey.stage === 'understanding' && contextManifest && !question" type="button" class="prepare-question-button" data-testid="prepare-question" @click="emit('prepare-question')">
        生成唯一问题
      </button>
    </div>
    <form v-if="question?.status === 'active'" class="dialogue-question" data-testid="dialogue-answer-form" @submit.prevent="submitAnswer">
      <strong>{{ questionText(question.questionId, question.text) }}</strong>
      <small>{{ questionWhyNow(question.questionId, question.whyNow) }}</small>
      <textarea v-model="answerDraft" data-testid="dialogue-answer" rows="2" placeholder="用一句话回答这个问题..." />
      <div v-if="question.redBlueCase" class="red-blue-case" data-testid="red-blue-case">
        <strong>红蓝证据对照</strong>
        <p class="red-blue-tradeoff">{{ question.redBlueCase.irreducibleTradeoff }}</p>
        <ul>
          <li v-for="option in question.redBlueCase.options" :key="option.optionId">
            <button type="button" class="red-blue-option" :data-testid="`red-blue-option-${option.optionId}`" @click="selectRedBlueOption(option.label)">{{ option.label }}</button>
            <span>{{ option.claim }}</span>
            <small>最佳情形：{{ option.bestCase }}；风险：{{ option.failureModes.join("、") }}</small>
          </li>
        </ul>
        <small>当前推荐：{{ question.redBlueCase.recommendation }}。{{ question.redBlueCase.recommendationReason }}</small>
      </div>
      <button type="submit" :disabled="!answerDraft.trim()">确认回答</button>
    </form>
    <ol v-if="session?.messages.length" class="session-messages" aria-label="已记录的消息">
      <li v-for="message in session.messages" :key="message.id" class="session-message">
        <span class="message-role">作者</span>
        <p>{{ message.text }}</p>
      </li>
    </ol>
    <p v-else class="session-empty">还没有记录作者原话。</p>

    <div v-if="preview" class="understanding-preview" data-testid="understanding-preview">
      <div class="preview-heading">只读理解预览</div>
      <ul v-if="preview.coreExplicit.length" class="preview-claims">
        <li v-for="claim in preview.coreExplicit" :key="claim.id">{{ claim.text }}</li>
      </ul>
      <p v-for="unknown in preview.unknowns" :key="unknown.id" class="preview-unknown">待确认：{{ unknown.text }}</p>
      <button v-if="!contextManifest" type="button" class="freeze-button" :disabled="freezing || !session?.messages.length" @click="emit('freeze')">
        {{ freezing ? "正在冻结输入" : "冻结 V2 的完整原始输入" }}
      </button>
      <p v-else class="manifest-state">T0 已冻结：{{ contextManifest.manifestId }}</p>
    </div>

    <form class="session-input" @submit.prevent="submitMessage">
      <label for="creative-session-input">作者输入</label>
      <textarea
        id="creative-session-input"
        v-model="draft"
        aria-label="作者输入"
        rows="3"
        placeholder="请用自己的话写下想法、场景、问题或约束……"
        :disabled="submitting"
      />
      <button type="submit" :disabled="submitting || !draft.trim()">
        {{ submitting ? "保存中" : "记录原话" }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { CreativeJourneyProjection, CreativeSession, DialogueQuestion } from "@/types/novel";

withDefaults(
  defineProps<{
    session: CreativeSession | null;
    journey?: CreativeJourneyProjection | null;
    question?: DialogueQuestion | null;
    preview?: import("@/types/novel").UnderstandingPreview | null;
    contextManifest?: import("@/types/novel").ContextManifest | null;
    freezing?: boolean;
    loading?: boolean;
    submitting?: boolean;
    error?: string;
    contractError?: string;
  }>(),
  { session: null, journey: null, question: null, preview: null, contextManifest: null, freezing: false, loading: false, submitting: false, error: "", contractError: "" }
);

const emit = defineEmits<{ submit: [text: string]; freeze: []; "primary-action": [id: "capture-idea" | "review-understanding"]; "prepare-question": []; answer: [text: string, status: "confirmed" | "tentative" | "delegated"]; "retry-contract": [] }>();
const draft = ref("");
const answerDraft = ref("");

const builtInQuestionCopy: Record<string, { text: string; whyNow: string }> = {
  "question-primary-desire": { text: "在开头阶段，主角最想得到什么？", whyNow: "这个回答决定主角第一个核心设定。" },
  "question-core-conflict": { text: "什么对立压力最直接地阻碍主角实现这个愿望？", whyNow: "这个回答决定故事的主要冲突。" },
  "question-failure-cost": { text: "如果主角失败，要付出什么具体代价？", whyNow: "这个回答明确失败的代价。" },
  "question-inner-need": { text: "在表面愿望之下，主角需要学会或接受什么？", whyNow: "这个回答决定主角的内在成长方向。" },
  "question-misbelief": { text: "主角目前被哪一种错误信念保护或限制？", whyNow: "这个回答决定主角为何暂时无法改变。" },
  "question-world-rule": { text: "哪一条世界规则最能约束开头的故事承诺？", whyNow: "这个回答决定世界观如何影响故事。" },
  "question-opposing-pressure": { text: "什么持续施加的压力让核心冲突无法立刻解决？", whyNow: "这个回答决定冲突如何持续推进。" },
  "question-irreversible-choice": { text: "哪一种选择一旦作出，就无法在不改变故事设定的前提下撤销？", whyNow: "这个回答决定故事的关键转折点。" },
  "question-reader-promise": { text: "开头向读者承诺怎样的体验或答案？", whyNow: "这个回答决定读者继续阅读的期待。" },
  "question-ending-direction": { text: "在不预先锁死每个结局情节的前提下，故事必须保留怎样的结局方向？", whyNow: "这个回答决定故事的最终指向。" }
};

function questionText(questionId: string, fallback: string) {
  return builtInQuestionCopy[questionId]?.text ?? fallback;
}

function questionWhyNow(questionId: string, fallback: string) {
  return builtInQuestionCopy[questionId]?.whyNow ?? fallback;
}

function submitMessage() {
  const text = draft.value.trim();
  if (!text) return;
  emit("submit", text);
  draft.value = "";
}

function submitAnswer() {
  const text = answerDraft.value.trim();
  if (!text) return;
  emit("answer", text, "confirmed");
  answerDraft.value = "";
}

function selectRedBlueOption(label: string) {
  answerDraft.value = label;
}

function stageLabel(stage: CreativeJourneyProjection["stage"]) {
  return stage === "capture" ? "记录" : stage === "understanding" ? "理解" : stage;
}
</script>

<style scoped>
.creative-session-panel { display: grid; gap: 16px; padding: 20px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }
.creative-session-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.creative-session-header h2 { margin: 4px 0 6px; }
.creative-session-header p:not(.eyebrow) { margin: 0; color: var(--el-text-color-secondary); }
.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.session-status { color: var(--el-color-success); font-size: 12px; }
.session-status.loading { color: var(--el-color-warning); }
.session-messages { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; max-height: 240px; overflow: auto; }
.session-message { padding: 12px; border-radius: 10px; background: var(--el-fill-color-light); }
.session-message p { margin: 5px 0 0; white-space: pre-wrap; }
.message-role { font-size: 12px; font-weight: 600; color: var(--el-color-primary); }
.session-empty { margin: 0; color: var(--el-text-color-placeholder); }
.understanding-preview { display: grid; gap: 8px; padding: 12px; border-left: 3px solid var(--el-color-warning); background: var(--el-fill-color-lighter); }
.preview-heading { font-size: 12px; font-weight: 700; color: var(--el-color-warning-dark-2); }
.preview-claims { margin: 0; padding-left: 20px; }
.preview-unknown { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
.freeze-button { justify-self: start; padding: 7px 11px; border: 1px solid var(--el-color-warning); border-radius: 7px; background: transparent; color: var(--el-color-warning-dark-2); cursor: pointer; }
.freeze-button:disabled { opacity: .5; cursor: not-allowed; }
.manifest-state { margin: 0; color: var(--el-color-success); font-size: 12px; }
.red-blue-case { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--el-color-warning-light-5); border-radius: 8px; background: var(--el-color-warning-light-9); }
.red-blue-case p, .red-blue-case ul { margin: 0; }
.red-blue-case ul { display: grid; gap: 6px; padding-left: 18px; }
.red-blue-case li { display: grid; gap: 2px; }
.red-blue-option { justify-self: start; border: 0; padding: 0; color: var(--el-color-primary); background: transparent; font-weight: 700; cursor: pointer; }
.red-blue-case span, .red-blue-case small { color: var(--el-text-color-secondary); }
.session-input { display: grid; gap: 8px; }
.session-input label { font-weight: 600; }
.session-input textarea { width: 100%; resize: vertical; box-sizing: border-box; padding: 10px; border: 1px solid var(--el-border-color); border-radius: 8px; font: inherit; background: var(--el-bg-color); color: var(--el-text-color-primary); }
.session-input button { justify-self: start; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--el-color-primary); color: white; cursor: pointer; }
.session-input button:disabled { opacity: .5; cursor: not-allowed; }
.session-error { color: var(--el-color-danger); }
.session-error button { margin-left: 8px; padding: 4px 8px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.journey-primary-action { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--el-color-primary-light-5); border-radius: 10px; background: var(--el-color-primary-light-9); }
.journey-stage { color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; }
.journey-question { color: var(--el-text-color-secondary); font-size: 13px; }
.journey-action-button { justify-self: start; padding: 7px 11px; border: 0; border-radius: 7px; background: var(--el-color-primary); color: white; cursor: pointer; }
.dialogue-question { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--el-color-warning-light-3); border-radius: 10px; background: var(--el-color-warning-light-9); }
.dialogue-question small { color: var(--el-text-color-secondary); }
.dialogue-question textarea { resize: vertical; padding: 8px; font: inherit; }
.dialogue-question button { justify-self: start; padding: 7px 11px; border: 0; border-radius: 7px; background: var(--el-color-success); color: white; cursor: pointer; }
.dialogue-question button:disabled { opacity: .5; cursor: not-allowed; }
.prepare-question-button { justify-self: start; padding: 7px 11px; border: 1px solid var(--el-color-warning); border-radius: 7px; background: transparent; color: var(--el-color-warning-dark-2); cursor: pointer; }
</style>
