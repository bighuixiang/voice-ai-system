<template>
  <section class="creative-session-panel" data-testid="creative-session-panel" aria-labelledby="creative-session-title">
    <header class="creative-session-header">
      <div>
        <p class="eyebrow">Author workspace</p>
        <h2 id="creative-session-title">Main creative input</h2>
        <p>Capture the author's words first. Interpretation and generation stay downstream.</p>
      </div>
      <span class="session-status" :class="{ loading }">{{ loading ? "Loading" : "Durable" }}</span>
    </header>

    <div v-if="error" class="session-error" role="alert">{{ error }}</div>
    <div v-if="contractError" class="session-error" data-testid="contract-error" role="alert">
      {{ contractError }}
      <button type="button" data-testid="retry-contract-candidate" @click="emit('retry-contract')">重试生成契约候选</button>
    </div>
    <div v-if="journey" class="journey-primary-action" data-testid="journey-primary-action">
      <span class="journey-stage">{{ journey.stage }}</span>
      <strong>{{ journey.primaryAction.label }}</strong>
      <span v-if="journey.activeQuestion" class="journey-question">{{ journey.activeQuestion.text }}</span>
      <button type="button" class="journey-action-button" @click="emit('primary-action', journey.primaryAction.id)">
        {{ journey.primaryAction.label }}
      </button>
      <button v-if="journey.stage === 'understanding' && !question" type="button" class="prepare-question-button" data-testid="prepare-question" @click="emit('prepare-question')">
        生成唯一问题
      </button>
    </div>
    <form v-if="question?.status === 'active'" class="dialogue-question" data-testid="dialogue-answer-form" @submit.prevent="submitAnswer">
      <strong>{{ question.text }}</strong>
      <small>{{ question.whyNow }}</small>
      <textarea v-model="answerDraft" data-testid="dialogue-answer" rows="2" placeholder="用一句话回答这个问题..." />
      <button type="submit" :disabled="!answerDraft.trim()">确认回答</button>
    </form>
    <ol v-if="session?.messages.length" class="session-messages" aria-label="Captured messages">
      <li v-for="message in session.messages" :key="message.id" class="session-message">
        <span class="message-role">Author</span>
        <p>{{ message.text }}</p>
      </li>
    </ol>
    <p v-else class="session-empty">No author words captured yet.</p>

    <div v-if="preview" class="understanding-preview" data-testid="understanding-preview">
      <div class="preview-heading">Read-only understanding preview</div>
      <ul v-if="preview.coreExplicit.length" class="preview-claims">
        <li v-for="claim in preview.coreExplicit" :key="claim.id">{{ claim.text }}</li>
      </ul>
      <p v-for="unknown in preview.unknowns" :key="unknown.id" class="preview-unknown">Unknown: {{ unknown.text }}</p>
      <button v-if="!contextManifest" type="button" class="freeze-button" :disabled="freezing || !session?.messages.length" @click="emit('freeze')">
        {{ freezing ? "Freezing input" : "Freeze exact input for V2" }}
      </button>
      <p v-else class="manifest-state">T0 frozen: {{ contextManifest.manifestId }}</p>
    </div>

    <form class="session-input" @submit.prevent="submitMessage">
      <label for="creative-session-input">Author input</label>
      <textarea
        id="creative-session-input"
        v-model="draft"
        aria-label="Author input"
        rows="3"
        placeholder="Write the idea, scene, question, or constraint in your own words..."
        :disabled="loading || submitting"
      />
      <button type="submit" :disabled="loading || submitting || !draft.trim()">
        {{ submitting ? "Saving" : "Capture words" }}
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
