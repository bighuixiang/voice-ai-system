import { compileContractCandidate } from "./contractCandidate.js";
import { createDecisionConsumptionReceipt, persistDecisionConsumptionReceipt, readDecisionConsumptionReceipt } from "./decisionConsumption.js";
import { answerDialogueQuestion, createDialogueQuestion, readDecisionRecords, type DialogueAnswerStatus } from "./dialogueQuestions.js";
import { nextUnansweredQuestion } from "./understandingQuestionSequence.js";

export interface AdvanceUnderstandingAfterConfirmedAnswerInput {
  root: string;
  projectSlug: string;
  answer: {
    questionId: string;
    questionVersion: number;
    expectedSnapshotFingerprint: string;
    idempotencyKey: string;
    answerText: string;
    answerStatus: DialogueAnswerStatus;
    redBlueCaseId?: string;
  };
}

export async function advanceUnderstandingAfterConfirmedAnswer(input: AdvanceUnderstandingAfterConfirmedAnswerInput) {
  const answer = await answerDialogueQuestion(input.root, input.answer);
  if (!answer.accepted || answer.decision?.status !== "recorded") {
    return { answer, completed: false as const };
  }

  const decisions = await readDecisionRecords(input.root);
  const next = nextUnansweredQuestion(decisions);
  if (next) {
    const nextQuestion = await createDialogueQuestion(input.root, {
      projectSlug: input.projectSlug,
      questionId: next.questionId,
      questionVersion: 1,
      text: next.text,
      whyNow: next.whyNow,
      impact: next.impact,
      ambiguity: 0.8,
      errorCost: next.errorCost,
      reversibility: next.reversibility,
      delayCost: next.delayCost,
      options: [],
      recommendation: next.recommendation,
      snapshotFingerprint: answer.question.snapshotFingerprint
    });
    return { answer, nextQuestion, completed: false as const };
  }

  const contractCandidate = await compileContractCandidate(input.root, answer.decision.decisionId);
  const receiptId = `decision-consumption-${contractCandidate.candidate.candidateId}`;
  const existingConsumption = await readDecisionConsumptionReceipt(input.root, receiptId);
  const consumption = existingConsumption
    ? { created: false, receipt: existingConsumption }
    : await persistDecisionConsumptionReceipt(input.root, createDecisionConsumptionReceipt({
        receiptId,
        projectSlug: input.projectSlug,
        decisionId: answer.decision.decisionId,
        decisionVersion: answer.decision.questionVersion,
        consumer: "story-contract",
        consumerRef: contractCandidate.candidate.candidateId,
        sourceFingerprint: contractCandidate.candidate.sourceFingerprint
      }));
  return { answer, contractCandidate, consumption, completed: true as const };
}
