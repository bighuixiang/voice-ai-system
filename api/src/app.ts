import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { checkCodexAvailability } from "./codexConfig.js";
import { checkAllAgentAvailability, checkAgentAvailability, listAgentProfiles, normalizeAgentModelId, resolveAgentProfile } from "./agentConfig.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import {
  createProjectFiles,
  createUniqueProjectSkeleton,
  deleteProject,
  importLocalProject,
  importUploadedProject,
  projectRoot,
  readProject,
  writeProject
} from "./novelProject.js";
import { getDataRoot, getNovelsRoot } from "./workspace.js";
import { aiScenarioKeys, mergePlatformAiConfig, publicPlatformAiConfig, readPlatformAiConfig, writePlatformAiConfig } from "./platformAiConfig.js";
import { createPlatformAsset, linkAssetToProject, readPlatformLibrary } from "./platformLibrary.js";
import {
  applyPatch,
  cancelNovelTask,
  fallbackProjectCreateResult,
  markInvocationPatchesAccepted,
  readInvocationSessions,
  readNovelTask,
  readTaskHistory,
  runNovelTask,
  startNovelTaskAsync
} from "./taskService.js";
import { aiStageDefinitions } from "./aiStages.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import { readKnowledgeIndex, rebuildKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { buildCreationRuntimeSnapshot } from "./runtimeSnapshot.js";
import { buildProjectAuditReport } from "./auditReport.js";
import { buildCapabilityBaseline } from "./capabilityBaseline.js";
import { buildProjectInventory } from "./projectInventory.js";
import { buildRp0EvaluationSuite } from "./evaluationFixtures.js";
import { buildDurabilityBaseline } from "./durabilityBaseline.js";
import { appendObligationEvent, createNarrativeObligation, listNarrativeObligations, readNarrativeObligation, type ObligationStatus, type ObligationType } from "./narrativeObligation.js";
import { auditNarrativeObligationCoverage } from "./obligationCoverage.js";
import { buildNarrativeObligationCandidates } from "./obligationCandidates.js";
import { assertObligationCoverageCertificateCurrent, invalidateObligationCoverageCertificate, issueObligationCoverageCertificate } from "./obligationCertificate.js";
import { createRevisionIntent, listRevisionIntents, type RevisionIntentType, type RevisionMaturity, type RevisionIntentMode } from "./revisionIntent.js";
import { buildRevisionImpactReport } from "./revisionImpact.js";
import { createRevisionChangeSet, type RevisionChangeOperation } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet, type RevisionReviewInput } from "./revisionReview.js";
import { createRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { recordRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";
import { settleRevision } from "./revisionSettlement.js";
import { createProjectBackup, listProjectBackups, readProjectBackup, verifyProjectBackup } from "./projectBackup.js";
import { appendAuthorMessage, appendSessionMessage, readCreativeSession, updateCreativeSessionState } from "./creativeSession.js";
import { buildCreativeJourneyProjection } from "./creativeJourney.js";
import { buildUnderstandingPreview } from "./understandingPreview.js";
import { fingerprintCreativeSession, freezeContextManifest, readContextManifest } from "./contextManifest.js";
import { evaluateContextPlan } from "./contextPlanGate.js";
import { evaluateContextSources } from "./contextSourceGate.js";
import { evaluateContextPrivacy } from "./contextPrivacyGate.js";
import { auditContextRecords } from "./contextIntegrityGate.js";
import { appendModelInvocation, createModelInvocationRecord, evaluateInvocationBudget, readModelInvocations } from "./modelInvocationLedger.js";
import { routeModelCapability } from "./modelRoutingPolicy.js";
import { evaluateIndependentReviewGate } from "./independentReviewGate.js";
import { acceptDebateDecision, createDebateDecision } from "./debateDecision.js";
import { evaluateUnderstandingPreflight } from "./understandingPreflight.js";
import { readUnderstandingBudget, reserveUnderstandingBudget } from "./understandingBudget.js";
import { authorizeUnderstandingCapability, readUnderstandingCapabilityAuthorization } from "./understandingAuthorization.js";
import { buildUnderstandingRiskProfile } from "./understandingRiskProfile.js";
import { answerDialogueQuestion, createDialogueQuestion, readDecisionRecords, readDialogueQuestions } from "./dialogueQuestions.js";
import { compileContractCandidate, listContractCandidates, readContractCandidate } from "./contractCandidate.js";
import { createWorldRuleContract, listWorldRuleContracts, readWorldRuleContract } from "./worldRuleContract.js";
import { ingestExternalUnderstandingReview, readUnderstandingReview, reviewUnderstandingSnapshot } from "./understandingReview.js";
import { createContractAdoptionProposal, readContractAdoptionProposal } from "./contractAdoption.js";
import { commitContractAdoption, readMutationPlan } from "./contractCanonAdoption.js";
import { monitorContractProjectionFreshness, rebuildContractProjections, readContractProjectionFreshness, readProjectionRebuildReceipt } from "./contractProjectionRebuild.js";
import { ingestExternalCalibrationSubmission, readQualityCalibrationEvidence, readQualityCalibrationEvidenceHistory } from "./qualityCalibration.js";
import { compileOutlineCandidate, listOutlineCandidates, readOutlineCandidate } from "./outlineCandidate.js";
import { readOutlineValidationReport, validateOutlineCandidate } from "./outlineValidation.js";
import { authorizeOutlineAdoption, createOutlineAdoptionProposal, readOutlineAdoptionProposal } from "./outlineAdoption.js";
import { commitOutlineAdoption, readExecutionReadyProof, readOutlineVersion } from "./outlineCommit.js";
import { enqueueExecutionWorkItem, listExecutionWorkItems } from "./executionQueue.js";
import { checkExecutionReadiness } from "./executionReadiness.js";
import { listProseCandidates, readProseCandidate, validateProseCandidate } from "./proseCandidate.js";
import { validateAndPersistProseCandidate, readProseValidationBundle } from "./proseValidation.js";
import { readRedBlueReview, reviewProseCandidateById } from "./proseReview.js";
import { createProseRepairPlan, readProseRepairPlan } from "./proseRepairPlan.js";
import { createProseRepairCandidate, readProseRepairCandidate } from "./proseRepairCandidate.js";
import { evaluateProseRepairRegression, readProseRepairRegression } from "./proseRepairRegression.js";
import { readAuthorFeedbackEvent, recordAuthorFeedback } from "./authorFeedback.js";
import { createFeedbackAttribution, derivePreferenceHypothesis, readFeedbackAttribution, readPreferenceHypothesis, recordPreferenceOpposition, revokePreferenceHypothesis } from "./feedbackLearning.js";
import { consumeExplorationBudget, createExplorationBudget, createLearningPolicy, pauseExplorationBudget, readExplorationBudget, readLearningPolicy } from "./learningBudget.js";
import { createRightsEnvelope, createSourceMaterial, readRightsEnvelope, readSourceMaterial } from "./sourceRights.js";
import { approveCraftPattern, createCraftPattern, listCraftPatterns, readCraftPattern } from "./craftPattern.js";
import { createNegativePreference, evaluateNegativePreferenceSuggestion } from "./negativePreference.js";
import { createSourceLineage, revokeSourceLineage } from "./sourceRevocation.js";
import { evaluatePatternPublication } from "./patternPublication.js";
import { isolateUntrustedSample } from "./untrustedSample.js";
import { createCraftMechanismUnit } from "./craftMechanismUnit.js";
import { createSeparatedPattern, evaluateCrossProjectTransfer } from "./surfaceMechanismSeparation.js";
import { createCraftEffectEvidence } from "./craftEffectEvidence.js";
import { createCraftBoundary, evaluateCraftBoundaryMatch } from "./craftBoundary.js";
import { compileAbstractTransfer } from "./abstractionCompiler.js";
import { runAntiImitationGuard } from "./antiImitationGuard.js";
import { buildTaskPatternRetrieval } from "./taskPatternRetrieval.js";
import { buildCraftContextBudget } from "./craftContextBudget.js";
import { resolveCraftConflicts } from "./craftConflict.js";
import { validateCraftHoldout } from "./craftHoldoutValidation.js";
import { createCraftAttribution, transitionCraftAttribution } from "./craftAttribution.js";
import { createCraftProvenanceBundle, projectCraftProvenance } from "./craftProvenance.js";
import { propagateCraftSourceRevocation } from "./craftRevocationPropagation.js";
import { admitCharacterToCast, classifyCharacterDocument, registerCharacterIdentity } from "./characterIdentity.js";
import { resolveCharacterFieldTruth } from "./characterTruth.js";
import { createPatternTransferPlan, evaluateSimilarityGuard, readPatternTransferPlan } from "./patternTransfer.js";
import { createCraftExperiment, judgeCraftExperiment, listCraftExperiments, readCraftExperiment, startCraftExperiment } from "./craftExperiment.js";
import { promoteCraftPatternFromExperiment } from "./craftPatternPromotion.js";
import { validateCraftPatternFromExperiment } from "./craftPatternValidation.js";
import { confirmCharacterContract, createCharacterDramaticContract, listCharacterContracts, readCharacterDramaticContract, reviseCharacterDramaticContract } from "./characterContract.js";
import { listCharacterStateSnapshots, readCharacterStateSnapshot, recordCharacterStateSnapshot } from "./characterState.js";
import { createCharacterChoiceEvidence, observeCharacterChoiceEvidence, readCharacterChoiceEvidence } from "./characterChoice.js";
import { createRelationshipEvent, observeRelationshipEvent, readRelationshipEvent } from "./relationshipEvent.js";
import { createCharacterArcContract, listCharacterArcContracts, readCharacterArcContract, recordCharacterArcMilestone } from "./characterArc.js";
import { projectCharacterArcSeparation } from "./characterArcProjection.js";
import { diffCharacterStateSnapshots } from "./characterStateDiff.js";
import { evaluateCharacterAgency } from "./characterAgencyGuard.js";
import { createBeliefLifecycle, recordBeliefEvent } from "./characterBeliefLifecycle.js";
import { createRelationshipMisread, resolveRelationshipMisread } from "./relationshipMisread.js";
import { createValueOpponentContract } from "./valueOpponent.js";
import { createOffPageCharacterPlan, recordOffPageEvent } from "./offPageCharacter.js";
import { createCharacterPresencePlan, evaluateCharacterPresence } from "./characterPresence.js";
import { evaluateEnsembleAttention, recordEnsembleChapter } from "./ensembleAttention.js";
import { compileCharacterVoiceVariant, createCharacterVoiceProfile } from "./characterVoiceProfile.js";
import { evaluateCharacterArcRhythm, recordArcRhythmEvent } from "./characterArcRhythm.js";
import { createCharacterContinuity, recordCharacterContinuityEvent } from "./characterIdentityContinuity.js";
import { analyzeCharacterRevisionImpact } from "./characterRevisionImpact.js";
import { issueCharacterArcCertificate } from "./characterArcCertificate.js";
import { evaluateWorldRuleExecution } from "./worldRuleExecution.js";
import { recordWorldRuleKnowledge } from "./worldRuleKnowledge.js";
import { listWorldStateSnapshots, readWorldStateSnapshot, recordWorldStateSnapshot } from "./worldState.js";
import { projectWorldState } from "./worldStateProjection.js";
import { createCapabilityContract, createProgressionEvent, listCapabilityContracts, readCapabilityContract } from "./capabilityContract.js";
import { comparePowerInContext } from "./powerComparison.js";
import { applyResourceTransactions, createResourceTransaction } from "./resourceTransaction.js";
import { createConditionLedger, evaluateCondition, recordConditionRecovery } from "./conditionLedger.js";
import { createOrganizationContract, recordInstitutionAction } from "./organizationAction.js";
import { auditWorldRuleConsequences } from "./worldRuleConsequences.js";
import { evaluateWorldRuleAdmission } from "./worldRuleAdmission.js";
import { recordWorldRuleException, settleWorldRuleException } from "./worldRuleException.js";
import { evaluateWorldRuleInteraction, replayWorldRuleInteraction } from "./worldRuleInteraction.js";
import { planWorldRuleDisclosure } from "./worldRuleDisclosure.js";
import { createWorldImpactReport } from "./worldImpactReport.js";
import { compileLegacyWorldMaterials } from "./worldLegacyCompiler.js";
import { createWorldIntegrityCertificate } from "./worldIntegrityCertificate.js";
import { assembleWritingContextContract } from "./writingContextContract.js";
import { createSceneCreationContract, validateSceneCreation } from "./sceneCreationContract.js";
import { createCraftPattern as createCraftPatternLibrary, validateCraftPattern } from "./craftPatternLibrary.js";
import { createWritingCandidateSet, selectWritingCandidate } from "./writingCandidateSelection.js";
import { createDirectedRewrite, validateDirectedRewrite } from "./directedRewrite.js";
import { createChapterCreationContract, validateChapterCreation } from "./chapterCreationContract.js";
import { resolveWritingPriority } from "./writingPriorityResolver.js";
import { evaluateVoiceBlindTest } from "./voiceBlindTest.js";
import { evaluatePovKnowledgeGate } from "./povKnowledgeGate.js";
import { createChapterIntent, validateChapterContinuity } from "./chapterContinuityValidator.js";
import { createLongChapterCheckpoint, resumeLongChapter } from "./longChapterRecovery.js";
import { evaluateAuthorParagraphLocks } from "./authorParagraphLock.js";
import { evaluateCrossChapterTemplate } from "./crossChapterTemplateGuard.js";
import { createLocalRepairPlan, validateLocalRepairPlan } from "./localRepairPlanner.js";
import { composeWritingCandidates } from "./candidateComposition.js";
import { evaluateWritingStopCondition } from "./writingStopCondition.js";
import { createProseGenerationManifest, evaluateProseCandidateFreshness } from "./proseGenerationManifest.js";
import { createIntentDraft } from "./intentDraft.js";
import { evaluateQuestionValue } from "./questionValueGate.js";
import { createQuestionSession, classifyQuestionAnswer } from "./questionInteraction.js";
import { parseCollaborationMessage } from "./collaborationMessage.js";
import { createQuestionGovernance, registerQuestion, updateCollaborationPolicy } from "./questionGovernance.js";
import { createCollaborationProgress } from "./collaborationProgress.js";
import { createIntentCorrection, propagateIntentCorrection } from "./intentCorrection.js";
import { createExploratoryDraft } from "./exploratoryDraft.js";
import { buildStorySeedFrame, captureAuthorUtterance, createSeedInterpretationSet } from "./storySeed.js";
import { applyReversibleDefault, assessSeedConfidence, createSafeSeedExploration, evaluateStoryContractReadiness } from "./seedReadiness.js";
import { createSeedContractCandidates, evaluateSeedBranchQuestion } from "./seedBranchQuestion.js";
import { adoptSeedFields, recompileSeedIncrementally } from "./seedAdoption.js";
import { createSeedCompilationState, recordSeedCompilationFailure } from "./seedCompilationState.js";
import { compileLegacySeedShadow, createStoryContractReadinessProof, replaySeedCompilation } from "./seedDurability.js";
import { atomizeIntent, createDialogueUtterance, createUnderstandingSnapshot, evaluateUnderstandingEvidence } from "./dialogueUnderstanding.js";
import { createMisunderstandingIncident as createMisunderstandingIncidentRecord, resolveMisunderstandingIncident } from "./misunderstandingIncident.js";
import { createDelegationGrant, createProvisionalAssumption, rankDialogueQuestions, renderNonLeadingQuestion } from "./dialoguePolicy.js";
import { applyDialogueAnswerSegments, classifyDialogueAnswer, compressDialogueMemory, createMisunderstandingIncident, createPreferenceProbe } from "./dialogueLifecycle.js";
import { acceptPreferenceProbeSelection, createDialogueMemoryRecord, createPreferenceProbeSelection, forgetDialogueMemory, reviseDialogueMemory } from "./dialogueMemoryGovernance.js";
import { advanceRuntimeInterruption, classifyRuntimeInterruption, reconcileDialogueSession } from "./dialogueRuntime.js";
import { createObligationKnowledgeBoundary, createPayoffContract, createSetupEvidence, evaluatePayoffEvidence } from "./obligationEvidence.js";
import { detectObligationConflict, proposeObligationMerge, recordPartialPayoff, transformObligation } from "./obligationResolution.js";
import { assessObligationSourceCoverage, authorizeIntentionalOpen, evaluateObligationWindow, planObligationRepair, projectObligationVisibility } from "./obligationGovernance.js";
import { createObligationEditorMarkers, evaluateObligationCompletionGate, freezeObligationPublication, migrateLegacyObligations } from "./obligationPublication.js";
import { admitNarrativeObligation, calibrateReaderExpectation, createClueClaim, createFairnessBundle, createHypothesisGraph, validateClueIndependence } from "./closureGovernance.js";
import { createClosureSceneContract, createClosureSchedule, detectExposureRisk, planAdaptiveReminder, propagateClosureOutcome, reservePayoffCapacity } from "./closureExecution.js";
import { assessReaderCognitiveLoad, createColdReadSnapshot, createReaderExperienceContract, createReaderExperienceHypothesis, createReaderKnowledgeState, evaluateReaderPayoff } from "./readerExperience.js";
import { assessSceneNecessity, calibrateReaderReviewer, createExperienceTimeline, createReaderExperienceDossier, evaluateSurpriseFairness, preserveReaderDivergence } from "./readerReview.js";
import { createResearchClaim, createResearchConsumptionReceipt, createResearchSourceSnapshot, identifyResearchObligation, settleResearchClaim } from "./researchGrounding.js";
import { createTextDiagnostic, createTextProfile, parseTextStructure, settleTextRoundTrip } from "./textProfile.js";
import { createBackupPolicy, createBackupVerification, createRestorePlan, settleRecovery } from "./durabilityGovernance.js";
import { createFalseClueFairness, createForeshadowing, recordForeshadowingEvidence, transitionForeshadowing } from "./foreshadowing.js";
import { authorizeForeshadowingWaiver, detectForeshadowingConflict, evaluateForeshadowingWindow, freezeForeshadowingPublication, migrateLegacyForeshadowing, planForeshadowingRepair, projectForeshadowingVisibility, transformForeshadowing } from "./foreshadowingGovernance.js";
import { createCapabilityDependencyProof, createProjectCapabilityManifest, createRequirementEvidenceLink, enforceSingleWriteAuthority } from "./deliveryGovernance.js";
import { createAISafetyGate, createCandidateBoundary, createKernelProof, createLongMemoryProof, createObligationCoreProof, validateMutationPlan } from "./kernelGovernance.js";
import { calibrateEvaluator, createBlindPair, createEvaluationSuite, createReleaseDecision, detectEvaluationContamination, freezeEvaluationInput, monitorEvaluatorDrift } from "./evaluationGovernance.js";
import { authorizeSurfaceCommand, createSurfaceCapabilityRegistry, registerSurfaceCapability } from "./surfaceCapability.js";
import { authorizeReceiptAction, createAuthorCommandReceipt } from "./authorCommandReceipt.js";
import { createWorkspaceContinuityToken, reconcileWorkspaceContinuity } from "./workspaceContinuity.js";
import { advancePrimaryAction, createPrimaryActionDecision, validatePrimaryActionSubmission } from "./primaryActionDecision.js";
  import { applyAuthorEffortPreference, consumeAuthorEffort, createAuthorEffortBudget } from "./authorEffortBudget.js";
  import { readAuthorEffortBudget, writeAuthorEffortBudget } from "./authorEffortBudgetStore.js";
import { createAutonomyReceipt, createDecisionEscalation, revokeAutonomyReceipt } from "./decisionGovernance.js";
import { acceptDecisionBundle, createDecisionBundle } from "./decisionBundle.js";
import { evaluateDialogueTimeout } from "./dialogueTimeout.js";
import { createSeedCompilationRun, replaySeedCompilationRun, transitionSeedCompilationRun } from "./seedCompilationRun.js";
import { createWorldLocation, evaluateLocationReachability, listWorldLocations, readWorldLocation } from "./worldLocation.js";
import { recordWorldTravel } from "./worldTravel.js";
import { compareStoryTime, createStoryTimeEvent, listStoryTimeEvents, readStoryTimeEvent } from "./storyTime.js";
import { createCausalityEdge, listCausalityEdges, readCausalityEdge, validateCausalityGraph } from "./causalityGraph.js";
import { validateNarrativeStructure } from "./structureValidation.js";
import { createSemanticNode, listSemanticNodes, projectSemanticNodeOrder, readSemanticNode } from "./semanticNodes.js";
import { createImpactAnalysis, readImpactAnalysis } from "./impactAnalysis.js";
import { adoptEmergenceCandidate, createEmergenceCandidate, readEmergenceCandidate } from "./emergenceCandidate.js";
import { evaluateExecutionReadyGate } from "./executionReadyGate.js";
import { applyProseSegmentPatch, createProseSegment, readProseSegment } from "./proseSegment.js";
import { appendSceneExecutionEvidence, createSceneExecutionLedger, readSceneExecutionLedger } from "./sceneExecutionLedger.js";
import { readSceneCardContract } from "./sceneCard.js";
import { createBeatFulfillmentLedger, readBeatFulfillmentLedger, transitionBeatFulfillment } from "./beatFulfillment.js";
import { createAgencyChain, readAgencyChain } from "./agencyChain.js";
import { evaluateVoiceConsistency } from "./voiceConsistency.js";
import { evaluateDialogueAction } from "./dialogueAction.js";
import { appendInformationEvent, createInformationStateTrace, readInformationStateTrace } from "./informationState.js";
import { evaluateNarrativeDistance } from "./narrativeDistance.js";
import { evaluateEmotionCausality } from "./emotionCausality.js";
import { evaluateProseSpecificity } from "./proseSpecificity.js";
import { evaluateCognitiveBudget } from "./cognitiveBudget.js";
import { evaluateMicroRhythm } from "./microRhythm.js";
import { evaluateSceneSeam } from "./sceneSeam.js";
import { createChapterContinuationRun, readChapterContinuationRun, resumeFromVerifiedCheckpoint, saveContinuationCheckpoint } from "./chapterContinuation.js";
import { createCandidateConvergence, readCandidateConvergence, recordCandidateIteration } from "./candidateConvergence.js";
import { createReviewIsolationSession, readReviewIsolationSession, submitReview, synthesizeReview } from "./reviewIsolation.js";
import { buildProseValidationDossier } from "./proseDossier.js";
import { createEvidenceRepairPlan } from "./proseRepairPlanV2.js";
import { buildProseRegressionProof } from "./proseRegressionProof.js";
import { createProseCanon } from "./proseAdoptionTransaction.js";
import { settleDerivedChanges } from "./derivedSettlement.js";
import { advanceProseMaturity, createProseMaturity } from "./proseMaturity.js";
import { createSourceMaterialRecord, readSourceMaterialRecord } from "./sourceMaterial.js";
import { createVolumeContract, listVolumeContracts, readVolumeContract } from "./volumeContract.js";
import { createChapterFunctionContract, listChapterFunctionContracts, readChapterFunctionContract } from "./chapterFunction.js";
import { createSceneCardContract, listSceneCardContracts, readSceneCardContract } from "./sceneCard.js";
import { createNarrativeTraceLink, listNarrativeTraceLinks, readNarrativeTraceLink, validateNarrativeTrace } from "./narrativeTrace.js";
import { buildObligationLoadReport } from "./obligationLoad.js";
import { createNarrativeCurvePoint, listNarrativeCurvePoints, readNarrativeCurvePoint } from "./narrativeCurve.js";
import { createPlanningNode, readPlanningNode, transitionPlanningNode } from "./planningNode.js";
import { createStructureAlternativeSet, listStructureAlternativeSets, readStructureAlternativeSet } from "./structureAlternatives.js";
import { publishDerivedAssets, readDerivedPublicationTransaction } from "./derivedPublication.js";
import { adoptProseCandidate, readProseAdoptionTransaction } from "./proseAdoption.js";
import { readChapterSettlement, settleChapter } from "./chapterSettlement.js";
import { createBookWorkGraph, readBookWorkGraph } from "./bookWorkGraph.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";
import { advanceBookRun, controlBookRun, evaluateBookRunQuiescence, listBookRuns, readBookRun, retryBookRun, startBookRun } from "./bookRun.js";
import { runBookCompletionAudit } from "./completionAudit.js";
import { buildLengthForecast, createLengthContract, decideLengthVariance, readLengthContract } from "./lengthPlanning.js";
import { previewProjectMigration, readMigrationPreview } from "./migrationPreview.js";
import { activateProjectMigration, readMigrationActivation, readMigrationRollback, readMigrationValidation, rollbackProjectMigration, validateMigrationPreview } from "./migrationValidation.js";
import { readMigrationResolution, resolveMigrationConflicts, type OutlineAuthority } from "./migrationResolution.js";
import { evaluateMigrationCutover } from "./migrationCutover.js";
import { previewAllProjectMigrations, validateAllProjectMigrations } from "./migrationBatchPreview.js";
import { recordReleaseE2EAcceptance, readReleaseE2EAcceptance } from "./releaseE2EAcceptance.js";
import { evaluateReleaseAcceptance } from "./releaseAcceptance.js";
import { activateRelease, readReleaseActivation } from "./releaseActivation.js";
import { createEditionManifest, readEditionManifest } from "./editionManifest.js";
import { compileAndPersistPublicationTree, readPublicationTree } from "./publicationTree.js";
import { readPublicationArtifactSet, renderPublicationArtifacts, type PublicationFormat } from "./publicationArtifacts.js";
import { issueDeliveryProof, revokeDeliveryProof, supersedeDeliveryProof, verifyDeliveryProof } from "./deliveryProof.js";
import { issueDeliveryAccessGrant, revokeDeliveryAccessGrant, verifyDeliveryAccessGrant } from "./deliveryAccessGrant.js";
import { buildReleasePreflight } from "./releasePreflight.js";
import { assertClosureCertificateCurrent, issueClosureCertificate, readClosureCertificate } from "./closureCertificate.js";
import { buildStoryContractReadinessProof, readStoryContractReadinessProof } from "./contractReadiness.js";
import { executeShadowUnderstanding, readUnderstandingSnapshot } from "./understandingExecutor.js";
import { AgentProcessRunner } from "./codexRunner.js";
import {
  cancelUnderstandingTask,
  recoverUnderstandingTasks,
  readUnderstandingTask,
  resumeUnderstandingTask,
  startModelUnderstandingTask
} from "./understandingWorker.js";
import { cancelBackgroundJob, enqueueProjectBackgroundJob, listProjectBackgroundJobs, readBackgroundJob, retryBackgroundJob } from "./backgroundJobs.js";
import {
  buildEditorSuggestion,
  createWritingFileSnapshot,
  listWritingFileVersions,
  readWritingFileDiff
} from "./fileVersions.js";

const UNDERSTANDING_QUESTION_SEQUENCE = [
  {
    questionId: "question-primary-desire",
    text: "What must the protagonist want most in the opening movement?",
    impact: "high" as const,
    whyNow: "This answer anchors the protagonist's first contract field.",
    errorCost: "high",
    reversibility: "low",
    delayCost: "medium",
    recommendation: "Ask the author or delegate this single decision."
  },
  {
    questionId: "question-core-conflict",
    text: "What opposing pressure most directly prevents that desire?",
    impact: "high" as const,
    whyNow: "A contract without an opposing pressure cannot constrain an executable outline.",
    errorCost: "high",
    reversibility: "medium",
    delayCost: "medium",
    recommendation: "Name the pressure that can force a meaningful choice."
  },
  {
    questionId: "question-failure-cost",
    text: "What is the concrete cost if the protagonist fails?",
    impact: "high" as const,
    whyNow: "Failure cost makes outline stakes testable rather than decorative.",
    errorCost: "high",
    reversibility: "medium",
    delayCost: "low",
    recommendation: "Prefer a consequence that changes the protagonist's available choices."
  }
] as const;
import type {
  AiScenarioConfig,
  BackgroundJobType,
  CodexTaskType,
  EditorSuggestion,
  EditorSuggestionRequest,
  KnowledgeSearchQuery,
  LedgerEntry,
  NovelFilePatch,
  NovelProject,
  NovelTask,
  PlatformAiConfig
} from "./types.js";
import { databaseInfo, listProjectRecords, upsertProjectRecord } from "./database.js";
import {
  appendRuntimeEvent,
  createRuntimeBranch,
  createRuntimeRun,
  enqueueRuntimeCommand,
  getRuntimeBranch,
  getRuntimeCheckpoint,
  getRuntimeRun,
  latestActiveRun,
  listRuntimeEvents,
  runtimeStatus,
  updateRuntimeBranch,
  updateRuntimeRun
} from "./runtimeStore.js";
import { createRuntimeCheckpoint, dispatchRuntimeWrites, restoreRuntimeCheckpoint, RuntimeWriteConflictError } from "./runtimeFiles.js";
import {
  acceptWritingRecapPatches,
  buildSeriesQualityMetrics,
  readChapterDashboard,
  readChapterQualityReport,
  readChapterSummary,
  readLedgerEntries,
  readSceneCards,
  readSeriesQualityMetrics,
  readStoryControl,
  saveChapterDashboard,
  saveChapterQualityReport,
  saveChapterSummary,
  saveLedgerEntries,
  saveSceneCards,
  saveStoryControl
} from "./writingCockpit.js";

const taskTypes: CodexTaskType[] = [
  "project.create",
  "outline.generate",
  "structure.reverse",
  "chapter.plan",
  "chapter.draft",
  "quality.review",
  "selection.polish",
  "quality.rewrite",
  "continuity.check",
  "idea.suggest",
  "writing.briefing",
  "writing.recap",
  "assistant.free"
];

const protectedWritePaths = new Set(["project.json"]);
const ledgerKinds = new Set<LedgerEntry["kind"]>(["foreshadowing", "continuity", "power", "character", "risk"]);
const backgroundJobTypes = new Set<BackgroundJobType>(["knowledge.index.rebuild", "quality.series.rebuild", "story.graph.rebuild", "understanding.shadow"]);

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isProtectedWritePath(relativePath: string): boolean {
  return protectedWritePaths.has(relativePath);
}

function isLedgerKind(kind: string): kind is LedgerEntry["kind"] {
  return ledgerKinds.has(kind as LedgerEntry["kind"]);
}

function isBackgroundJobType(type: string): type is BackgroundJobType {
  return backgroundJobTypes.has(type as BackgroundJobType);
}

function parseTaskInputSummary(task: NovelTask): Record<string, unknown> {
  if (task.payload && typeof task.payload === "object") {
    return task.payload;
  }
  try {
    const parsed = JSON.parse(task.inputSummary);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeQualityRewritePatches(task: NovelTask | null, patches: NovelFilePatch[]): NovelFilePatch[] {
  if (task?.type !== "quality.rewrite") return patches;

  for (const patch of patches) {
    assertSafeNovelPath(patch.target);
  }
  for (const patch of task.result?.patches || []) {
    assertSafeNovelPath(patch.target);
  }

  const input = parseTaskInputSummary(task);
  const target = typeof input.filePath === "string" ? assertSafeNovelPath(input.filePath.trim()) : "";
  const documentKind = typeof input.documentKind === "string" ? input.documentKind : "";
  if (!target || documentKind !== "content") {
    throw new Error("Quality rewrite task is missing a current chapter content target");
  }

  const requestTargetPatch = patches.find(
    (patch) => assertSafeNovelPath(patch.target) === target && patch.mode === "replace-file" && Boolean(patch.content.trim())
  );
  const requestReplacementPatch = patches.find((patch) => patch.mode === "replace-file" && Boolean(patch.content.trim()));
  const resultTargetPatch = task.result?.patches.find(
    (patch) => assertSafeNovelPath(patch.target) === target && patch.mode === "replace-file" && Boolean(patch.content.trim())
  );
  const resultReplacementPatch = task.result?.patches.find((patch) => patch.mode === "replace-file" && Boolean(patch.content.trim()));
  const replacementContent =
    requestTargetPatch?.content ||
    resultTargetPatch?.content ||
    (task.result?.content.trim() ? task.result.content : "") ||
    requestReplacementPatch?.content ||
    resultReplacementPatch?.content ||
    "";

  if (!replacementContent.trim()) {
    throw new Error("Quality rewrite task has no full-chapter replacement content");
  }

  return [
    {
      target,
      mode: "replace-file",
      content: replacementContent
    }
  ];
}

function governedProseMutationRequired(project: NovelProject, relativePath: string): boolean {
  const outlineVersion = (project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion;
  const migration = (project as NovelProject & { migration?: { state?: string } }).migration;
  const governed = Boolean(outlineVersion?.versionId || migration?.state === "activated");
  return Boolean(governed && project.chapters.some((chapter) => chapter.contentPath === relativePath || chapter.outlinePath === relativePath));
}

function governedProjectionMutationRequired(project: NovelProject): boolean {
  const outlineVersion = (project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion;
  const migration = (project as NovelProject & { migration?: { state?: string } }).migration;
  return Boolean(outlineVersion?.versionId || migration?.state === "activated");
}

function governedLegacyFileMutationRequired(project: NovelProject, relativePath: string): boolean {
  if (!governedProjectionMutationRequired(project)) return false;
  const safePath = assertSafeNovelPath(relativePath);
  if (governedProseMutationRequired(project, safePath)) return false;
  return ["story-control/", "bible/", "style/", "outline/", "ledger/", "dashboard/", "scenes/", "memory/", "quality/", "knowledge/", "story-graph/", "sessions/"]
    .some((prefix) => safePath.startsWith(prefix));
}

function rejectGovernedProjectionMutation(project: NovelProject, res: express.Response): boolean {
  if (!governedProjectionMutationRequired(project)) return false;
  res.status(409).json({
    error: {
      code: "CHAPTER_SETTLEMENT_REQUIRED",
      message: "Governed projections are written only after chapter settlement through the derived projection command."
    }
  });
  return true;
}

async function createPatchSnapshotBeforeApply(root: string, project: NovelProject, patch: NovelFilePatch): Promise<void> {
  const safeTarget = assertSafeNovelPath(patch.target);
  if (isProtectedWritePath(safeTarget)) return;

  const target = resolveInside(root, safeTarget);
  const original = await fs.readFile(target, "utf8").catch(() => "");
  const nextContent =
    patch.mode === "replace-file"
      ? patch.content
      : patch.selection
        ? `${original.slice(0, patch.selection.start)}${patch.content}${original.slice(patch.selection.end)}`
        : original;

  await createWritingFileSnapshot(root, project, safeTarget, nextContent, {
    source: "ai",
    reason: "apply-patch"
  });
}

function allowedOrigins(): Set<string> {
  const configured = process.env.NOVEL_API_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173";
  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function validateAiScenarioConfig(config: AiScenarioConfig): AiScenarioConfig {
  const profileId = String(config.profileId || "").trim();
  const profile = listAgentProfiles().find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Unsupported AI agent profile: ${profileId}`);
  }

  const modelId = normalizeAgentModelId(typeof config.modelId === "string" ? config.modelId : undefined);
  if (modelId && !profile.allowCustomModel && !profile.models.some((model) => model.id === modelId)) {
    throw new Error(`Unsupported model for ${profile.label}: ${modelId}`);
  }

  return {
    profileId,
    modelId
  };
}

function validateEmbeddingBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = String(baseUrl || "").trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Embedding base URL must use http or https");
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    throw new Error("Embedding base URL must be a valid URL");
  }
}

function validatePlatformAiConfig(input: PlatformAiConfig): PlatformAiConfig {
  const rawProvider = String(input.knowledgeEmbedding?.provider || "local").trim();
  if (rawProvider !== "local" && rawProvider !== "openai-compatible") {
    throw new Error(`Unsupported knowledge embedding provider: ${rawProvider}`);
  }
  const merged = mergePlatformAiConfig(input);
  const scenarioKeys = aiScenarioKeys();
  return {
    version: 1,
    defaultScenario: scenarioKeys.includes(merged.defaultScenario) ? merged.defaultScenario : "novel",
    scenarios: scenarioKeys.reduce(
      (scenarios, key) => ({
        ...scenarios,
        [key]: validateAiScenarioConfig(merged.scenarios[key])
      }),
      {} as PlatformAiConfig["scenarios"]
    ),
    knowledgeEmbedding: {
      provider: rawProvider,
      baseUrl: validateEmbeddingBaseUrl(merged.knowledgeEmbedding.baseUrl),
      model: String(merged.knowledgeEmbedding.model || "").trim() || undefined,
      apiKey: typeof merged.knowledgeEmbedding.apiKey === "string" ? merged.knowledgeEmbedding.apiKey.trim() : undefined,
      apiKeyConfigured: Boolean(merged.knowledgeEmbedding.apiKey || merged.knowledgeEmbedding.apiKeyConfigured)
    },
    updatedAt: merged.updatedAt || new Date().toISOString()
  };
}

function createBackgroundJobHandler(project: Awaited<ReturnType<typeof readProject>>, root: string, type: BackgroundJobType, inputSummary = "") {
  return async () => {
    if (type === "knowledge.index.rebuild") {
      const index = await rebuildKnowledgeIndex(root, project);
      return {
        outputSummary: `${index.facts.length} facts / ${index.triples.length} relations`,
        resultRef: `/api/novel/projects/${project.slug}/knowledge/index`
      };
    }
    if (type === "quality.series.rebuild") {
      const metrics = await buildSeriesQualityMetrics(root, project);
      return {
        outputSummary: `${metrics.reportCount}/${metrics.chapterCount} chapters reviewed, average ${metrics.averageOverallScore}`,
        resultRef: `/api/novel/projects/${project.slug}/quality/series-metrics`
      };
    }

    if (type === "understanding.shadow") {
      let frozenInput: { sourceFingerprint?: string } = {};
      try {
        frozenInput = JSON.parse(inputSummary) as { sourceFingerprint?: string };
      } catch {
        throw new Error("UNDERSTANDING_INPUT_INVALID");
      }
      const session = await readCreativeSession(root, project.slug);
      const manifest = await readContextManifest(root);
      const budget = await readUnderstandingBudget(root);
      const capability = await readUnderstandingCapabilityAuthorization(root);
      const currentFingerprint = fingerprintCreativeSession(session);
      if (!manifest || !frozenInput.sourceFingerprint || manifest.sourceFingerprint !== frozenInput.sourceFingerprint || currentFingerprint !== frozenInput.sourceFingerprint) {
        throw new Error("UNDERSTANDING_INPUT_STALE");
      }
      const result = await executeShadowUnderstanding({
        root,
        projectSlug: project.slug,
        session,
        manifest,
        riskProfile: buildUnderstandingRiskProfile(),
        budget: budget!,
        capability: capability!
      });
      return {
        outputSummary: "Shadow understanding snapshot persisted; no model or canon write issued.",
        resultRef: `/api/novel/projects/${project.slug}/session/understanding/snapshot`
      };
    }

    return asyncStoryGraphJob(project, root);
  };
}

async function asyncStoryGraphJob(project: Awaited<ReturnType<typeof readProject>>, root: string) {
  const graph = await buildStoryGraphProjection(root, project);
  return {
    outputSummary: `${graph.nodes.length} nodes / ${graph.edges.length} relations`,
    resultRef: `/api/novel/projects/${project.slug}/story-graph`
  };
}

function aiEditorSuggestionEnabled(): boolean {
  const mode = String(process.env.EDITOR_SUGGESTION_PROVIDER || "").trim().toLowerCase();
  return mode === "ai" || mode === "true" || mode === "1";
}

function compactEditorSuggestionText(text: string): string {
  return text
    .replace(/^```(?:\w+)?/g, "")
    .replace(/```$/g, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n")
    .slice(0, 360);
}

async function buildAiBackedEditorSuggestion(
  projectId: string,
  input: EditorSuggestionRequest,
  fallback: EditorSuggestion
): Promise<EditorSuggestion> {
  if (!aiEditorSuggestionEnabled()) return fallback;

  try {
    const task = await runNovelTask(projectId, "assistant.free", {
      mode: "editor.inline-suggestion",
      chapterId: input.chapterId,
      filePath: input.filePath,
      documentKind: input.documentKind,
      beforeText: input.beforeText,
      afterText: input.afterText,
      roughIdea: [
        "为 Monaco Editor inline suggestion 生成一条可直接 Tab 接受的中文续写 ghost text。",
        "只在 CodexTaskResult.content 中放建议文本，不要解释，不要 Markdown，不要改写已有上下文。",
        "建议应短，最多三行；接受后只进入编辑器 dirty buffer，由作者自行保存。"
      ].join("\n")
    });
    const text = compactEditorSuggestionText(task.result?.content || "");
    if (task.status !== "success" || !text.trim()) return fallback;
    return {
      id: `editor-suggestion-${task.id}`,
      text,
      summary: task.result?.summary || "AI inline suggestion",
      source: "ai",
      createdAt: task.finishedAt || new Date().toISOString()
    };
  } catch {
    return fallback;
  }
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : String(error);
  let status = 500;
  if (message.includes("Protected project metadata") || message.includes("Origin is not allowed")) {
    status = 403;
  } else if (message.includes("Project not found")) {
    status = 404;
  } else if (
    message.includes("Unsafe file path") ||
    message.includes("escapes project root") ||
    message.includes("Quality rewrite task") ||
    message.includes("Invalid patch selection range")
  ) {
    status = 400;
  }

  res.status(status).json({ error: message });
};

export function createApp() {
  const app = express();
  const requireProject = async (projectId: string) => {
    try {
      return await readProject(projectId);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
      throw error;
    }
  };
  const origins = allowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin is not allowed: ${origin}`));
      }
    })
  );
  app.use(express.json({ limit: "50mb" }));

  app.get("/health", asyncRoute(async (_req, res) => {
    res.json({ status: "healthy", service: "novel-codex-api", codex: await checkCodexAvailability(), agents: await checkAllAgentAvailability() });
  }));

  app.get("/api/novel/codex", asyncRoute(async (_req, res) => {
    res.json(await checkCodexAvailability());
  }));

  app.get("/api/novel/agents", asyncRoute(async (_req, res) => {
    res.json({
      defaultProfileId: process.env.AI_AGENT_PROFILE_ID || "codex-cli",
      profiles: listAgentProfiles(),
      checks: await checkAllAgentAvailability()
    });
  }));

  app.get("/api/novel/ai-stages", asyncRoute(async (_req, res) => {
    res.json({ stages: aiStageDefinitions });
  }));

  app.post("/api/novel/agents/check", asyncRoute(async (req, res) => {
    res.json(await checkAgentAvailability({ profileId: req.body.profileId, modelId: req.body.modelId }));
  }));

  app.get("/api/platform/ai-config", asyncRoute(async (_req, res) => {
    res.json({ config: publicPlatformAiConfig(await readPlatformAiConfig()) });
  }));

  app.put("/api/platform/ai-config", asyncRoute(async (req, res) => {
    const input = (req.body.config || req.body) as PlatformAiConfig;
    try {
      const config = validatePlatformAiConfig(input);
      res.json({ config: publicPlatformAiConfig(await writePlatformAiConfig(config)) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }));

  app.get("/api/platform/library", asyncRoute(async (_req, res) => {
    res.json({ library: await readPlatformLibrary() });
  }));

  app.get("/api/platform/database", asyncRoute(async (_req, res) => {
    const projects = listProjectRecords();
    const library = await readPlatformLibrary();
    res.json({
      database: {
        ...databaseInfo(),
        projectCount: projects.length,
        assetCount: library.assets.length,
        promptCount: library.prompts.length,
        roleCount: library.roles.length,
        skillCount: library.skills.length
      }
    });
  }));

  app.post("/api/platform/assets", asyncRoute(async (req, res) => {
    const asset = await createPlatformAsset(req.body || {});
    res.status(201).json({ asset });
  }));

  app.post("/api/platform/assets/:assetId/link", asyncRoute(async (req, res) => {
    const projectSlug = String(req.body.projectSlug || "").trim();
    if (!projectSlug) {
      res.status(400).json({ error: "projectSlug is required" });
      return;
    }

    res.json({ asset: await linkAssetToProject(req.params.assetId, projectSlug) });
  }));

  app.get("/api/novel/projects", asyncRoute(async (_req, res) => {
    await fs.mkdir(getNovelsRoot(), { recursive: true });
    const entries = await fs.readdir(getNovelsRoot(), { withFileTypes: true });
    const projects = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        const project = await readProject(entry.name);
        upsertProjectRecord(project, projectRoot(project.slug));
        projects.push(project);
      } catch {
        // Ignore folders that are not novel projects.
      }
    }
    res.json({ projects });
  }));

  app.post("/api/novel/projects", asyncRoute(async (req, res) => {
    const project = await createUniqueProjectSkeleton({
      title: req.body.title,
      genre: req.body.genre,
      roughIdea: req.body.roughIdea || ""
    });
    await createProjectFiles(project);
    res.status(201).json({ project, result: fallbackProjectCreateResult(project.title) });
  }));

  app.post("/api/novel/import", asyncRoute(async (req, res) => {
    const project = Array.isArray(req.body.files)
      ? await importUploadedProject({
          files: req.body.files,
          sourceLabel: req.body.sourcePath,
          title: req.body.title,
          genre: req.body.genre,
          roughIdea: req.body.roughIdea
        })
      : await importLocalProject({
          sourcePath: req.body.sourcePath,
          title: req.body.title,
          genre: req.body.genre,
          roughIdea: req.body.roughIdea
        });
    res.status(201).json({ project });
  }));

  app.get("/api/novel/projects/inventory", asyncRoute(async (_req, res) => {
    res.json({ inventory: await buildProjectInventory() });
  }));

  app.get("/api/novel/migrations/cutover-readiness", asyncRoute(async (_req, res) => {
    res.json({ report: await evaluateMigrationCutover() });
  }));

  app.post("/api/novel/migrations/preview-all", asyncRoute(async (_req, res) => {
    res.json({ report: await previewAllProjectMigrations() });
  }));

  app.post("/api/novel/migrations/validate-all", asyncRoute(async (_req, res) => {
    res.json({ report: await validateAllProjectMigrations() });
  }));

  app.get("/api/novel/release-acceptance", asyncRoute(async (_req, res) => {
    res.json({ decision: await evaluateReleaseAcceptance() });
  }));

  app.get("/api/novel/release-activation", asyncRoute(async (_req, res) => {
    const activation = await readReleaseActivation(getDataRoot());
    if (!activation) { res.status(404).json({ error: "Release activation not found" }); return; }
    res.json({ activation });
  }));

  app.post("/api/novel/release-activation", asyncRoute(async (_req, res) => {
    const decision = await evaluateReleaseAcceptance();
    try {
      const activation = await activateRelease(getDataRoot(), decision);
      res.status(201).json({ activation, decision });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : String(error), decision } });
    }
  }));

  app.post("/api/novel/projects/:projectId/book-runs", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const run = await startBookRun(projectRoot(project.slug), {
        projectSlug: project.slug,
        chapterIds: Array.isArray(req.body?.chapterIds) ? req.body.chapterIds : project.chapters.map((chapter) => chapter.id),
        objective: typeof req.body?.objective === "string" ? req.body.objective : undefined,
        parentRunId: typeof req.body?.parentRunId === "string" ? req.body.parentRunId : undefined,
        storyContractRef: typeof req.body?.storyContractRef === "string" ? req.body.storyContractRef : undefined,
        autonomyLevel: req.body?.autonomyLevel === "L2" ? "L2" : req.body?.autonomyLevel === "L0" ? "L0" : "L1",
        limits: req.body?.limits && typeof req.body.limits === "object" ? req.body.limits : {}
      });
      res.status(201).json({ run });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/length-contract", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const contract = await createLengthContract(projectRoot(project.slug), project.slug, {
        dimensions: req.body?.dimensions && typeof req.body.dimensions === "object" ? req.body.dimensions : {},
        hardLocks: Array.isArray(req.body?.hardLocks) ? req.body.hardLocks.filter((value: unknown): value is string => typeof value === "string") : []
      });
      res.status(201).json({ contract });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "LENGTH_CONTRACT_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/length-contract", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const contract = await readLengthContract(projectRoot(project.slug));
    if (!contract) { res.status(404).json({ error: "Length contract not found" }); return; }
    res.json({ contract });
  }));

  app.get("/api/novel/projects/:projectId/length-forecast", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const contract = await readLengthContract(projectRoot(project.slug));
    if (!contract) { res.status(409).json({ error: { code: "LENGTH_CONTRACT_REQUIRED" } }); return; }
    res.json({ forecast: await buildLengthForecast(projectRoot(project.slug), project, contract) });
  }));

  app.post("/api/novel/projects/:projectId/length-variance-decisions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const contract = await readLengthContract(root);
    if (!contract) { res.status(409).json({ error: { code: "LENGTH_CONTRACT_REQUIRED" } }); return; }
    const forecast = await buildLengthForecast(root, project, contract);
    try {
      const decision = await decideLengthVariance(root, contract, forecast, {
        authority: req.body?.authority === "external" ? "external" : "author",
        choice: req.body?.choice === "keep-plan" ? "keep-plan" : req.body?.choice === "request-replan" ? "request-replan" : "pause-and-review"
      });
      res.status(201).json({ decision, forecast });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "LENGTH_VARIANCE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/book-runs", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ runs: await listBookRuns(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const run = await readBookRun(projectRoot(project.slug), req.params.runId);
    if (!run) { res.status(404).json({ error: "Book run not found" }); return; }
    res.json({ run, quiescence: await evaluateBookRunQuiescence(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/advance", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try { res.status(201).json(await advanceBookRun(projectRoot(project.slug), req.params.runId)); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_ADVANCE_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/completion-audits", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const audit = await runBookCompletionAudit(projectRoot(project.slug), req.params.runId, { sourceFingerprint: typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "" });
      res.status(201).json({ audit });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "COMPLETION_AUDIT_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/retry", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      res.status(201).json(await retryBookRun(projectRoot(project.slug), req.params.runId, { expectedVersion: Number(req.body?.expectedVersion) }));
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_RETRY_INVALID" } }); }
  }));

  const controlRoute = (action: "pause" | "resume" | "stop") => asyncRoute(async (req: any, res: any) => {
    const project = await readProject(req.params.projectId);
    try {
      const run = await controlBookRun(projectRoot(project.slug), req.params.runId, { action, expectedVersion: Number(req.body?.expectedVersion) });
      res.status(201).json({ run, quiescence: await evaluateBookRunQuiescence(projectRoot(project.slug)) });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_CONTROL_INVALID" } }); }
  });
  app.post("/api/novel/projects/:projectId/book-runs/:runId/pause", controlRoute("pause"));
  app.post("/api/novel/projects/:projectId/book-runs/:runId/resume", controlRoute("resume"));
  app.post("/api/novel/projects/:projectId/book-runs/:runId/stop", controlRoute("stop"));

  app.post("/api/novel/projects/:projectId/publication-editions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const manifest = await createEditionManifest({
        root: projectRoot(project.slug),
        projectSlug: project.slug,
        canonCommitFingerprint: typeof req.body?.canonCommitFingerprint === "string" ? req.body.canonCommitFingerprint : "",
        title: typeof req.body?.title === "string" ? req.body.title : project.title,
        author: typeof req.body?.author === "string" ? req.body.author : "",
        language: typeof req.body?.language === "string" ? req.body.language : "",
        chapters: Array.isArray(req.body?.chapters) ? req.body.chapters : []
      });
      res.status(201).json({ manifest });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "EDITION_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await readEditionManifest(projectRoot(project.slug), req.params.editionId);
    if (!manifest) { res.status(404).json({ error: "Publication edition not found" }); return; }
    res.json({ manifest });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/closure-certificate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readEditionManifest(root, req.params.editionId);
    if (!manifest) { res.status(404).json({ error: "Publication edition not found" }); return; }
    try {
      const certificate = await issueClosureCertificate(root, { projectSlug: project.slug, chapterIds: manifest.chapters.map((chapter) => chapter.chapterId), sourceFingerprint: manifest.canonCommitFingerprint });
      res.status(201).json({ certificate });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "CLOSURE_CERTIFICATE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/closure-certificate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const certificate = await readClosureCertificate(projectRoot(project.slug));
    if (!certificate) { res.status(404).json({ error: "Closure certificate not found" }); return; }
    res.json({ certificate });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/preflight", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ report: await buildReleasePreflight(projectRoot(project.slug), req.params.editionId) });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/tree", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readEditionManifest(root, req.params.editionId);
    if (!manifest) { res.status(404).json({ error: "Publication edition not found" }); return; }
    try { res.status(201).json({ tree: await compileAndPersistPublicationTree(root, manifest) }); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PUBLICATION_TREE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/tree", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const tree = await readPublicationTree(projectRoot(project.slug), req.params.editionId);
    if (!tree) { res.status(404).json({ error: "Publication tree not found" }); return; }
    res.json({ tree });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/artifacts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readEditionManifest(root, req.params.editionId);
    const tree = await readPublicationTree(root, req.params.editionId);
    if (!manifest || !tree) { res.status(404).json({ error: "Publication tree or edition not found" }); return; }
    try {
      const formats = Array.isArray(req.body?.formats) ? req.body.formats : [];
      const artifacts = await renderPublicationArtifacts(root, manifest, tree, formats as PublicationFormat[]);
      res.status(201).json({ artifacts });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PUBLICATION_ARTIFACT_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/artifacts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const artifacts = await readPublicationArtifactSet(projectRoot(project.slug), req.params.editionId);
    if (!artifacts) { res.status(404).json({ error: "Publication artifacts not found" }); return; }
    res.json({ artifacts });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const proof = await issueDeliveryProof(projectRoot(project.slug), {
        editionId: req.params.editionId,
        approvalId: typeof req.body?.approvalId === "string" ? req.body.approvalId : "",
        approverKind: req.body?.approverKind === "author" ? "author" : "system",
        expectedArtifactSetFingerprint: typeof req.body?.expectedArtifactSetFingerprint === "string" ? req.body.expectedArtifactSetFingerprint : ""
      });
      res.status(201).json({ proof });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "DELIVERY_PROOF_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await verifyDeliveryProof(projectRoot(project.slug), req.params.editionId);
    if (!verification.proof) { res.status(404).json({ verification }); return; }
    res.json({ verification });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof/revoke", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const event = await revokeDeliveryProof(projectRoot(project.slug), req.params.editionId, { actor: "author", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(201).json({ event });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "DELIVERY_REVOCATION_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof/supersede", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const event = await supersedeDeliveryProof(projectRoot(project.slug), req.params.editionId, { actor: "author", reason: typeof req.body?.reason === "string" ? req.body.reason : "", replacementEditionId: typeof req.body?.replacementEditionId === "string" ? req.body.replacementEditionId : "" });
      res.status(201).json({ event });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "DELIVERY_SUPERSESSION_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/access-grants", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const grant = await issueDeliveryAccessGrant(projectRoot(project.slug), { editionId: req.params.editionId, recipientId: typeof req.body?.recipientId === "string" ? req.body.recipientId : "", scope: req.body?.scope === "archive" ? "archive" : "reader", expiresAt: typeof req.body?.expiresAt === "string" ? req.body.expiresAt : "", actor: "author" });
      res.status(201).json({ grant });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "ACCESS_GRANT_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/access-grants/:grantId/verify", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await verifyDeliveryAccessGrant(projectRoot(project.slug), req.params.grantId);
    if (!verification.grant) { res.status(404).json({ verification }); return; }
    res.json({ verification });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/access-grants/:grantId/revoke", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const event = await revokeDeliveryAccessGrant(projectRoot(project.slug), req.params.grantId, { actor: "author", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(201).json({ event });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "ACCESS_GRANT_REVOKE_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/release-e2e-acceptance", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const proof = await recordReleaseE2EAcceptance(projectRoot(project.slug), {
        projectSlug: project.slug,
        chapterId: typeof req.body?.chapterId === "string" ? req.body.chapterId : "",
        settlementId: typeof req.body?.settlementId === "string" ? req.body.settlementId : "",
        derivedTransactionId: typeof req.body?.derivedTransactionId === "string" ? req.body.derivedTransactionId : ""
      });
      res.status(201).json({ proof });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "RELEASE_E2E_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/release-e2e-acceptance", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await readReleaseE2EAcceptance(projectRoot(project.slug));
    if (!proof) { res.status(404).json({ error: "Release E2E acceptance proof not found" }); return; }
    res.json({ proof });
  }));

  app.get("/api/novel/evaluation/rp0-baseline", asyncRoute(async (_req, res) => {
    res.json({ suite: buildRp0EvaluationSuite() });
  }));

  app.delete("/api/novel/projects/:projectId", asyncRoute(async (req, res) => {
    const deletedSlug = await deleteProject(req.params.projectId);
    res.json({ deletedSlug });
  }));

  app.get("/api/novel/projects/:projectId", asyncRoute(async (req, res) => {
    res.json({ project: await readProject(req.params.projectId) });
  }));

  app.get("/api/novel/projects/:projectId/session", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const session = await readCreativeSession(projectRoot(project.slug), project.slug);
    res.json({ session });
  }));

  app.get("/api/novel/projects/:projectId/session/journey", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const session = await readCreativeSession(projectRoot(project.slug), project.slug);
    res.json({ journey: buildCreativeJourneyProjection(session) });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding-preview", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const session = await readCreativeSession(projectRoot(project.slug), project.slug);
    res.json({ preview: buildUnderstandingPreview(session) });
  }));

  app.get("/api/novel/projects/:projectId/session/context-manifest", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await readContextManifest(projectRoot(project.slug));
    if (!manifest) {
      res.status(404).json({ error: "Context manifest has not been frozen" });
      return;
    }
    res.json({ manifest });
  }));

  app.post("/api/novel/projects/:projectId/session/context-plan-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ plan: evaluateContextPlan({ modelContextTokens: Number(body.modelContextTokens ?? 0), outputReserveTokens: Number(body.outputReserveTokens ?? 0), toolReserveTokens: Number(body.toolReserveTokens ?? 0), blocks: Array.isArray(body.blocks) ? body.blocks : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/session/context-source-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ sources: evaluateContextSources({ purpose: String(body.purpose ?? ""), query: String(body.query ?? ""), sources: Array.isArray(body.sources) ? body.sources : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/session/context-privacy-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ privacy: evaluateContextPrivacy({ projectSlug: project.slug, purpose: String(body.purpose ?? ""), sources: Array.isArray(body.sources) ? body.sources : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/session/context-integrity-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ integrity: auditContextRecords({ authoritative: body.authoritative !== false, records: Array.isArray(body.records) ? body.records : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/session/context-manifest", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await freezeContextManifest(projectRoot(project.slug), project.slug);
    res.status(result.created ? 201 : 200).json(result);
  }));

  app.post("/api/novel/projects/:projectId/session/messages", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const kind = req.body?.kind;
    const result = kind === "system-paraphrase" || kind === "system-inference" || kind === "task-result"
      ? await appendSessionMessage({ root: projectRoot(project.slug), projectSlug: project.slug, clientMessageId: typeof req.body?.clientMessageId === "string" ? req.body.clientMessageId : "", text: typeof req.body?.text === "string" ? req.body.text : "", kind })
      : await appendAuthorMessage({ root: projectRoot(project.slug), projectSlug: project.slug, clientMessageId: typeof req.body?.clientMessageId === "string" ? req.body.clientMessageId : "", text: typeof req.body?.text === "string" ? req.body.text : "" });
    res.status(result.created ? 201 : 200).json(result);
  }));

  app.post("/api/novel/projects/:projectId/session/state", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const body = req.body ?? {};
    const phase = body.phase === "understanding" ? "understanding" : "capture";
    const collaborationMode = body.collaborationMode === "focused" || body.collaborationMode === "review" ? body.collaborationMode : "guided";
    const result = await updateCreativeSessionState({
      root: projectRoot(project.slug), projectSlug: project.slug,
      expectedFingerprint: typeof body.expectedFingerprint === "string" ? body.expectedFingerprint : "",
      phase, collaborationMode, activeQuestionId: typeof body.activeQuestionId === "string" ? body.activeQuestionId : undefined,
      latestDirection: typeof body.latestDirection === "string" ? body.latestDirection : "",
      unconfirmedAssumptions: Array.isArray(body.unconfirmedAssumptions) ? body.unconfirmedAssumptions.map(String) : [],
      decisionRefs: Array.isArray(body.decisionRefs) ? body.decisionRefs.map(String) : [],
      pendingPatchRefs: Array.isArray(body.pendingPatchRefs) ? body.pendingPatchRefs.map(String) : []
    });
    res.json(result);
  }));

  app.post("/api/novel/projects/:projectId/session/understanding", asyncRoute(async (req, res) => {
    const requestedMode = req.body?.mode;
    if (requestedMode !== undefined && requestedMode !== "model" && requestedMode !== "shadow" && requestedMode !== "shadow-async") {
      res.status(400).json({ error: { code: "UNDERSTANDING_MODE_INVALID" } });
      return;
    }
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const session = await readCreativeSession(root, project.slug);
    const contextManifest = await readContextManifest(root);
    const budgetReservation = await readUnderstandingBudget(root);
    const capabilityAuthorization = await readUnderstandingCapabilityAuthorization(root);
    const preflight = evaluateUnderstandingPreflight(
      contextManifest,
      budgetReservation,
      capabilityAuthorization,
      fingerprintCreativeSession(session)
    );
    if (req.body?.mode === "shadow" && preflight.modelCallAllowed && contextManifest && budgetReservation && capabilityAuthorization) {
      const result = await executeShadowUnderstanding({
        root,
        projectSlug: project.slug,
        session,
        manifest: contextManifest,
        riskProfile: buildUnderstandingRiskProfile(),
        budget: budgetReservation,
        capability: capabilityAuthorization
      });
      res.status(201).json(result);
      return;
    }
    if (req.body?.mode === "shadow-async" && preflight.modelCallAllowed && contextManifest && budgetReservation && capabilityAuthorization) {
      const job = await enqueueProjectBackgroundJob(
        project,
        root,
        "understanding.shadow",
        JSON.stringify({
          sourceFingerprint: contextManifest.sourceFingerprint,
          sourceMessageIds: session.messages.map((message) => message.id)
        }),
        createBackgroundJobHandler(
          project,
          root,
          "understanding.shadow",
          JSON.stringify({ sourceFingerprint: contextManifest.sourceFingerprint })
        )
      );
      res.status(202).json({ job, preflight, modelCallIssued: false, understandingWritten: false });
      return;
    }
    if ((req.body?.mode === "model" || req.body?.mode === undefined) && preflight.modelCallAllowed && contextManifest && budgetReservation && capabilityAuthorization) {
      const profile = resolveAgentProfile({ profileId: capabilityAuthorization.profileId, modelId: capabilityAuthorization.modelId });
      const prompt = [
        "Interpret the author's creative session without writing canon.",
        "Return JSON only with coreExplicit, inferred, unknowns, question, and interpretationSet when two materially different explanations remain.",
        "Every claim must include id, text, epistemic status, and evidence spans referencing the supplied message IDs.",
        "If interpretationSet is present it must contain at least two candidate interpretations, their differences, support/counter evidence, downstream impacts, and activeQuestionId equal to question-primary-desire.",
        JSON.stringify({ sourceMessageIds: session.messages.map((message) => message.id), messages: session.messages })
      ].join("\n");
      const task = await startModelUnderstandingTask(
        {
          root,
          projectSlug: project.slug,
          sourceFingerprint: contextManifest.sourceFingerprint,
          sourceMessageIds: session.messages.map((message) => message.id),
          prompt,
          currentSourceFingerprint: fingerprintCreativeSession(session),
          agent: { ...profile, id: profile.id }
        },
        new AgentProcessRunner()
      );
      res.status(202).json({ task, preflight, modelCallIssued: false, understandingWritten: false });
      return;
    }
    if (preflight.modelCallAllowed) {
      res.status(501).json({
        error: {
          code: "V2_EXECUTOR_NOT_IMPLEMENTED",
          message: "Safety dependencies are ready, but the cancellable understanding executor is not implemented.",
          preflight,
          input: { sessionSchemaVersion: session.schemaVersion, messageCount: session.messages.length },
          modelCallIssued: false,
          understandingWritten: false
        }
      });
      return;
    }
    res.status(409).json({
      error: {
        code: "V2_DEPENDENCY_MISSING",
        message: "Understanding is not activated until its safety dependencies are available.",
        missingDependencies: preflight.reasons.filter((reason) => reason.status === "missing").map((reason) => reason.dependency),
        preflight,
        input: { sessionSchemaVersion: session.schemaVersion, messageCount: session.messages.length },
        modelCallIssued: false,
        understandingWritten: false
      }
    });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/snapshot", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const snapshot = await readUnderstandingSnapshot(projectRoot(project.slug));
    if (!snapshot) {
      res.status(404).json({ error: "Understanding snapshot has not been created" });
      return;
    }
    res.json({ snapshot });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/questions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ questions: await readDialogueQuestions(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/decisions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ decisions: await readDecisionRecords(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/questions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const snapshot = await readUnderstandingSnapshot(root);
    if (!snapshot) {
      res.status(409).json({ error: { code: "UNDERSTANDING_SNAPSHOT_REQUIRED" } });
      return;
    }
    const existingQuestions = await readDialogueQuestions(root);
    const decisions = await readDecisionRecords(root);
    const next = UNDERSTANDING_QUESTION_SEQUENCE.find((candidate) => !decisions.some((decision) => decision.questionId === candidate.questionId));
    if (!next) {
      res.status(409).json({ error: { code: "UNDERSTANDING_QUESTIONS_EXHAUSTED" } });
      return;
    }
    const active = existingQuestions.find((question) => question.questionId === next.questionId && question.status === "active");
    const question = await createDialogueQuestion(root, {
      projectSlug: project.slug,
      questionId: next.questionId,
      questionVersion: 1,
      text: next.questionId === snapshot.question.id ? snapshot.question.text : next.text,
      whyNow: next.whyNow,
      impact: next.impact,
      ambiguity: 0.8,
      errorCost: next.errorCost,
      reversibility: next.reversibility,
      delayCost: next.delayCost,
      options: [],
      recommendation: next.recommendation,
      snapshotFingerprint: snapshot.sourceFingerprint
    });
    res.status(question.created && !active ? 201 : 200).json(question);
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/questions/:questionId/answers", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await answerDialogueQuestion(projectRoot(project.slug), {
      questionId: req.params.questionId,
      questionVersion: Number(req.body?.questionVersion),
      expectedSnapshotFingerprint: typeof req.body?.expectedSnapshotFingerprint === "string" ? req.body.expectedSnapshotFingerprint : "",
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "",
      answerText: typeof req.body?.answerText === "string" ? req.body.answerText : "",
      answerStatus: req.body?.answerStatus === "tentative" || req.body?.answerStatus === "delegated" ? req.body.answerStatus : "confirmed"
    });
    if (!result.accepted) {
      res.status(409).json({ error: result.conflict, conflict: result.conflict });
      return;
    }
    res.status(result.replayed ? 200 : 201).json(result);
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/contract-candidates", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const decisionId = typeof req.body?.decisionId === "string" ? req.body.decisionId : "";
    if (!decisionId) {
      res.status(400).json({ error: { code: "DECISION_ID_REQUIRED" } });
      return;
    }
    try {
      const result = await compileContractCandidate(
        projectRoot(project.slug),
        decisionId,
        typeof req.body?.interpretationId === "string" ? req.body.interpretationId : undefined
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      const status = code === "DECISION_NOT_FOUND" || code === "INTERPRETATION_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ error: { code } });
    }
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/contract-candidates", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ candidates: await listContractCandidates(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/contract-candidates/:candidateId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidate = await readContractCandidate(projectRoot(project.slug), req.params.candidateId);
    if (!candidate) {
      res.status(404).json({ error: { code: "CONTRACT_CANDIDATE_NOT_FOUND" } });
      return;
    }
    res.json({ candidate });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/outline-candidates", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const sourceCandidateId = typeof req.body?.sourceCandidateId === "string" ? req.body.sourceCandidateId : "";
    if (!sourceCandidateId) {
      res.status(400).json({ error: { code: "SOURCE_CANDIDATE_ID_REQUIRED" } });
      return;
    }
    try {
      const result = await compileOutlineCandidate(projectRoot(project.slug), sourceCandidateId, {
        ...(Number.isInteger(req.body?.strongFreezeCount) ? { strongFreezeCount: req.body.strongFreezeCount } : {}),
        ...(Number.isInteger(req.body?.totalChapterCount) ? { totalChapterCount: req.body.totalChapterCount } : {})
      });
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      const status = code === "CONTRACT_CANDIDATE_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ error: { code } });
    }
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/outline-candidates", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ candidates: await listOutlineCandidates(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/outline-candidates/:outlineId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const outline = await readOutlineCandidate(projectRoot(project.slug), req.params.outlineId);
    if (!outline) {
      res.status(404).json({ error: { code: "OUTLINE_CANDIDATE_NOT_FOUND" } });
      return;
    }
    res.json({ outline });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/outline-candidates/:outlineId/validate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await validateOutlineCandidate(projectRoot(project.slug), req.params.outlineId);
    if (!report) {
      res.status(404).json({ error: "Outline candidate not found" });
      return;
    }
    res.status(201).json({ report });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/outline-candidates/:outlineId/validation", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await readOutlineValidationReport(projectRoot(project.slug), req.params.outlineId);
    if (!report) {
      res.status(404).json({ error: "Outline validation report not found" });
      return;
    }
    res.json({ report });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/outline-adoption-proposals", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const outlineId = typeof req.body?.outlineId === "string" ? req.body.outlineId : "";
    const expectedOutlineFingerprint = typeof req.body?.expectedOutlineFingerprint === "string" ? req.body.expectedOutlineFingerprint : "";
    if (!outlineId || !expectedOutlineFingerprint) {
      res.status(400).json({ error: { code: "OUTLINE_ADOPTION_INPUT_REQUIRED" } });
      return;
    }
    const proposal = await createOutlineAdoptionProposal(projectRoot(project.slug), { outlineId, expectedOutlineFingerprint, selectedChapterIds: Array.isArray(req.body?.selectedChapterIds) ? req.body.selectedChapterIds.filter((value: unknown): value is string => typeof value === "string") : undefined });
    res.status(201).json({ proposal });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/outline-adoption-proposals/authorize", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proposal = await authorizeOutlineAdoption(projectRoot(project.slug), { expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : "", authorization: { actorId: typeof req.body?.actorId === "string" ? req.body.actorId : "", authorizationId: typeof req.body?.authorizationId === "string" ? req.body.authorizationId : "" } });
    res.status(201).json({ proposal });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/outline-adoption-proposals", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proposal = await readOutlineAdoptionProposal(projectRoot(project.slug));
    if (!proposal) {
      res.status(404).json({ error: "Outline adoption proposal not found" });
      return;
    }
    res.json({ proposal });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/outline-adoption", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await commitOutlineAdoption(projectRoot(project.slug), { expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : "", ...(req.body?.faultAt === "after-project-write" ? { faultAt: req.body.faultAt } : {}) });
    res.status(result.status === "committed" ? 201 : result.status === "blocked" ? 409 : 500).json(result);
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/outline-version/:outlineId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const version = await readOutlineVersion(projectRoot(project.slug), req.params.outlineId);
    if (!version) { res.status(404).json({ error: "Outline version not found" }); return; }
    res.json({ version });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/execution-ready-proof", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await readExecutionReadyProof(projectRoot(project.slug));
    if (!proof) { res.status(404).json({ error: "Execution-ready proof not found" }); return; }
    res.json({ proof });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/world-rule-contracts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const body = req.body || {};
    try {
      const result = await createWorldRuleContract(projectRoot(project.slug), {
        projectSlug: project.slug,
        sourceCandidateId: typeof body.sourceCandidateId === "string" ? body.sourceCandidateId : "",
        sourceFingerprint: typeof body.sourceFingerprint === "string" ? body.sourceFingerprint : "",
        proposition: {
          condition: typeof body.proposition?.condition === "string" ? body.proposition.condition : "",
          mechanism: typeof body.proposition?.mechanism === "string" ? body.proposition.mechanism : "",
          result: typeof body.proposition?.result === "string" ? body.proposition.result : "",
          cost: typeof body.proposition?.cost === "string" ? body.proposition.cost : "",
          limit: typeof body.proposition?.limit === "string" ? body.proposition.limit : "",
          failure: typeof body.proposition?.failure === "string" ? body.proposition.failure : "",
          prohibitedInferences: Array.isArray(body.proposition?.prohibitedInferences) ? body.proposition.prohibitedInferences.filter((value: unknown): value is string => typeof value === "string") : [],
          exceptions: Array.isArray(body.proposition?.exceptions) ? body.proposition.exceptions.filter((value: unknown): value is string => typeof value === "string") : []
        },
        scope: {
          subjects: Array.isArray(body.scope?.subjects) ? body.scope.subjects.filter((value: unknown): value is string => typeof value === "string") : [],
          regions: Array.isArray(body.scope?.regions) ? body.scope.regions.filter((value: unknown): value is string => typeof value === "string") : [],
          ...(body.scope?.time && typeof body.scope.time === "object" ? { time: { from: typeof body.scope.time.from === "string" ? body.scope.time.from : undefined, to: typeof body.scope.time.to === "string" ? body.scope.time.to : undefined } } : {})
        },
        disclosure: {
          objectiveStatus: body.disclosure?.objectiveStatus === "accepted" || body.disclosure?.objectiveStatus === "proposed" ? body.disclosure.objectiveStatus : "unknown",
          domains: Array.isArray(body.disclosure?.domains) ? body.disclosure.domains.filter((value: unknown): value is { domainId: string; kind: "objective_canon" | "character_belief" | "institution_belief" | "author_proposal" | "unknown"; claim: string } => Boolean(value && typeof value === "object" && typeof (value as { domainId?: unknown }).domainId === "string" && typeof (value as { claim?: unknown }).claim === "string" && ["objective_canon", "character_belief", "institution_belief", "author_proposal", "unknown"].includes((value as { kind?: unknown }).kind as string))) : []
        },
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.filter((value: unknown): value is { kind: "dialogue-question" | "canon-asset" | "decision-record"; refId: string } => Boolean(value && typeof value === "object" && typeof (value as { refId?: unknown }).refId === "string" && ["dialogue-question", "canon-asset", "decision-record"].includes((value as { kind?: unknown }).kind as string))) : []
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "WORLD_RULE_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/world-rule-contracts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ contracts: await listWorldRuleContracts(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/world-rule-contracts/:ruleId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const contract = await readWorldRuleContract(projectRoot(project.slug), req.params.ruleId);
    if (!contract) {
      res.status(404).json({ error: "World rule contract not found" });
      return;
    }
    res.json({ contract });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/review", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const review = await reviewUnderstandingSnapshot(projectRoot(project.slug), typeof req.body?.reviewerId === "string" ? req.body.reviewerId : undefined);
    if (!review) {
      res.status(404).json({ error: "Understanding snapshot not found" });
      return;
    }
    res.status(201).json({ review });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/review/external", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const body = req.body ?? {};
      if (body.reviewerKind !== "provider" && body.reviewerKind !== "human") throw new Error("UNDERSTANDING_REVIEWER_KIND_INVALID");
      const review = await ingestExternalUnderstandingReview(projectRoot(project.slug), {
        reviewerKind: body.reviewerKind,
        reviewerId: typeof body.reviewerId === "string" ? body.reviewerId : "",
        attestationReference: typeof body.attestationReference === "string" ? body.attestationReference : "",
        snapshotFingerprint: typeof body.snapshotFingerprint === "string" ? body.snapshotFingerprint : "",
        checks: Array.isArray(body.checks) ? body.checks : [],
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.filter((value: unknown): value is string => typeof value === "string") : []
      });
      res.status(201).json({ review });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "UNDERSTANDING_EXTERNAL_REVIEW_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/review", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const review = await readUnderstandingReview(projectRoot(project.slug));
    if (!review) {
      res.status(404).json({ error: "Understanding review not found" });
      return;
    }
    res.json({ review });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/contract-adoption-proposals", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await createContractAdoptionProposal(projectRoot(project.slug), {
      candidateId: typeof req.body?.candidateId === "string" ? req.body.candidateId : "",
      expectedCandidateFingerprint: typeof req.body?.expectedCandidateFingerprint === "string" ? req.body.expectedCandidateFingerprint : "",
      fieldDecisions: Array.isArray(req.body?.fieldDecisions) ? req.body.fieldDecisions : [],
      worldRuleContractId: typeof req.body?.worldRuleContractId === "string" ? req.body.worldRuleContractId : undefined
    });
    if (!result.proposal) {
      res.status(409).json({ error: { code: result.error || "CONTRACT_ADOPTION_BLOCKED" } });
      return;
    }
    res.status(201).json(result);
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/contract-adoption-proposals", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proposal = await readContractAdoptionProposal(projectRoot(project.slug));
    if (!proposal) {
      res.status(404).json({ error: "Contract adoption proposal not found" });
      return;
    }
    res.json({ proposal });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/contract-adoption", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await commitContractAdoption(projectRoot(project.slug), {
      expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : "",
      authorization: req.body?.authorization && typeof req.body.authorization.actorId === "string" && typeof req.body.authorization.authorizationId === "string"
        ? { actorId: req.body.authorization.actorId, authorizationId: req.body.authorization.authorizationId }
        : undefined
    });
    res.status(result.status === "committed" ? 201 : result.status === "blocked" ? 409 : 500).json(result);
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/mutations/:mutationId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readMutationPlan(projectRoot(project.slug), req.params.mutationId);
    if (!plan) {
      res.status(404).json({ error: "Mutation plan not found" });
      return;
    }
    res.json({ plan });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/projection-rebuild", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const receipt = await rebuildContractProjections(projectRoot(project.slug), project);
    if (!receipt) {
      res.status(404).json({ error: "No projection invalidation pending" });
      return;
    }
    res.status(201).json({ receipt });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/projection-rebuild", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const receipt = await readProjectionRebuildReceipt(projectRoot(project.slug));
    if (!receipt) {
      res.status(404).json({ error: "Projection rebuild receipt not found" });
      return;
    }
    res.json({ receipt });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/projection-freshness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ freshness: await readContractProjectionFreshness(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/quality-calibration", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const evidence = await readQualityCalibrationEvidence(projectRoot(project.slug));
    if (!evidence) {
      res.status(404).json({ error: "Quality calibration evidence not found" });
      return;
    }
    res.json({ evidence });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/quality-calibration/history", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ evidence: await readQualityCalibrationEvidenceHistory(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/quality-calibration", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const evidence = await ingestExternalCalibrationSubmission(projectRoot(project.slug), req.body || {});
      res.status(201).json({ evidence });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : String(error) } });
    }
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/projection-freshness/monitor", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.status(201).json({ event: await monitorContractProjectionFreshness(projectRoot(project.slug), project.slug) });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/contract-readiness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await buildStoryContractReadinessProof(projectRoot(project.slug), project.slug, typeof req.body?.candidateId === "string" ? req.body.candidateId : undefined);
    res.status(201).json({ proof });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/contract-readiness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await readStoryContractReadinessProof(projectRoot(project.slug));
    if (!proof) {
      res.status(404).json({ error: "Story contract readiness proof not found" });
      return;
    }
    res.json({ proof });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/tasks/:taskId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const task = await readUnderstandingTask(projectRoot(project.slug), req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Understanding task not found" });
      return;
    }
    res.json({ task });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/tasks/:taskId/cancel", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const task = await cancelUnderstandingTask(projectRoot(project.slug), req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Understanding task not found" });
      return;
    }
    res.json({ task });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/tasks/:taskId/resume", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const session = await readCreativeSession(root, project.slug);
    try {
      const task = await resumeUnderstandingTask(root, req.params.taskId, fingerprintCreativeSession(session), new AgentProcessRunner());
      if (!task) {
        res.status(404).json({ error: "Understanding task not found" });
        return;
      }
      res.status(202).json({ task });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/recover", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const session = await readCreativeSession(root, project.slug);
    const tasks = await recoverUnderstandingTasks(root, fingerprintCreativeSession(session), new AgentProcessRunner());
    res.status(202).json({ tasks });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/preflight", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const contextManifest = await readContextManifest(root);
    const budgetReservation = await readUnderstandingBudget(root);
    const capabilityAuthorization = await readUnderstandingCapabilityAuthorization(root);
    const session = await readCreativeSession(root, project.slug);
    res.json({
      preflight: evaluateUnderstandingPreflight(
        contextManifest,
        budgetReservation,
        capabilityAuthorization,
        fingerprintCreativeSession(session)
      )
    });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/budget", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const reservation = await readUnderstandingBudget(projectRoot(project.slug));
    if (!reservation) {
      res.status(404).json({ error: "Budget reservation has not been created" });
      return;
    }
    res.json({ reservation });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/budget", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await readContextManifest(projectRoot(project.slug));
    try {
      const result = await reserveUnderstandingBudget(projectRoot(project.slug), project.slug, manifest, {
        reservationId: typeof req.body?.reservationId === "string" ? req.body.reservationId : "",
        units: Number(req.body?.units)
      });
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "T0_MANIFEST_REQUIRED" ? 409 : 400;
      res.status(status).json({ error: { code: message } });
    }
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/capability-authorization", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const authorization = await readUnderstandingCapabilityAuthorization(projectRoot(project.slug));
    if (!authorization) {
      res.status(404).json({ error: "Capability authorization has not been created" });
      return;
    }
    res.json({ authorization });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/capability-authorization", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readContextManifest(root);
    const budget = await readUnderstandingBudget(root);
    try {
      const authorization = await authorizeUnderstandingCapability({
        root,
        projectSlug: project.slug,
        manifest,
        budget,
        riskProfile: buildUnderstandingRiskProfile(),
        profileId: typeof req.body?.profileId === "string" ? req.body.profileId : undefined,
        modelId: typeof req.body?.modelId === "string" ? req.body.modelId : undefined
      });
      res.status(authorization.status === "authorized" ? 201 : 409).json({ authorization });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "T0_MANIFEST_REQUIRED" || message === "BUDGET_RESERVATION_REQUIRED" ? 409 : 400;
      res.status(status).json({ error: { code: message } });
    }
  }));

  app.put("/api/novel/projects/:projectId/ai", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const profileId = String(req.body.profileId || "").trim();
    let modelId: string | undefined;
    try {
      modelId = normalizeAgentModelId(typeof req.body.modelId === "string" ? req.body.modelId : undefined);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const profile = listAgentProfiles().find((item) => item.id === profileId);
    if (!profile) {
      res.status(400).json({ error: `Unsupported AI agent profile: ${profileId}` });
      return;
    }
    if (modelId && !profile.allowCustomModel && !profile.models.some((model) => model.id === modelId)) {
      res.status(400).json({ error: `Unsupported model for ${profile.label}: ${modelId}` });
      return;
    }

    project.ai = {
      profileId,
      modelId
    };
    if (profile.provider === "codex") {
      project.codex.model = project.ai.modelId;
    }
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ project });
  }));

  app.get("/api/novel/projects/:projectId/files", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const files = [
      "project.json",
      "style/style-guide.md",
      "bible/characters.md",
      "bible/world.md",
      "bible/power-system.md",
      "bible/locations.md",
      "outline/volume-01.md",
      "ledger/foreshadowing.md",
      "ledger/continuity.md",
      "ledger/power-progression.md",
      ...project.chapters.flatMap((chapter) => [chapter.outlinePath, chapter.contentPath])
    ];
    res.json({ files, root });
  }));

  app.get("/api/novel/projects/:projectId/relations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const library = await readPlatformLibrary();
    const root = projectRoot(project.slug);
    const assetLinksRaw = await fs
      .readFile(resolveInside(root, "relations/asset-links.json"), "utf8")
      .catch(() => JSON.stringify({ projectSlug: project.slug, links: [] }));
    const storyAssetMap = await fs.readFile(resolveInside(root, "relations/story-asset-map.md"), "utf8").catch(() => "");
    const linkedAssets = library.assets.filter((asset) => asset.linkedProjects.includes(project.slug));

    res.json({
      projectSlug: project.slug,
      assetLinks: JSON.parse(assetLinksRaw),
      storyAssetMap,
      linkedAssets
    });
  }));

  app.get("/api/novel/projects/:projectId/story-control", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const storyControl = await readStoryControl(projectRoot(project.slug));
    res.json({ storyControl });
  }));

  app.get("/api/novel/projects/:projectId/story-graph", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const graph = await buildStoryGraphProjection(projectRoot(project.slug), project);
    res.json({ graph });
  }));

  app.put("/api/novel/projects/:projectId/story-control", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (governedProjectionMutationRequired(project)) {
      res.status(409).json({
        error: {
          code: "CONTRACT_ADOPTION_REQUIRED",
          message: "Governed StoryControl is a read-only projection; change the adopted story contract instead."
        }
      });
      return;
    }
    const storyControl = await saveStoryControl(projectRoot(project.slug), req.body.storyControl || req.body || {});
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ storyControl });
  }));

  app.get("/api/novel/projects/:projectId/dashboard/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const dashboard = await readChapterDashboard(projectRoot(project.slug), req.params.chapterId);
    res.json({ dashboard });
  }));

  app.post("/api/novel/projects/:projectId/runtime/start", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const chapterId = typeof req.body.chapterId === "string" ? req.body.chapterId : undefined;
    const governedProject = governedProjectionMutationRequired(project);
    let workItem;
    if (chapterId && (governedProject || req.body.requireExecutionReady === true)) {
      workItem = await enqueueExecutionWorkItem(projectRoot(project.slug), project.slug, chapterId, typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : `runtime-${chapterId}`);
      if (workItem.status === "blocked") {
        res.status(409).json({ error: { code: "EXECUTION_NOT_READY", reason: workItem.blockedReason }, workItem });
        return;
      }
    }
    const run = createRuntimeRun({
      projectSlug: project.slug,
      chapterId,
      branchId: typeof req.body.branchId === "string" ? req.body.branchId : undefined,
      payload: req.body || {}
    });
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type: "start",
      payload: req.body || {},
      idempotencyKey: typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "command",
      message: "Runtime start queued",
      payload: { commandId: command.id, chapterId }
    });
    res.status(202).json({ run, command, ...(workItem ? { workItem } : {}) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/execution-work-items", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ workItems: await listExecutionWorkItems(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const preview = await readMigrationPreview(projectRoot(project.slug), req.params.migrationId);
    if (!preview) {
      res.status(404).json({ error: "Migration preview not found" });
      return;
    }
    res.json({ preview });
  }));

  app.post("/api/novel/projects/:projectId/migrations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (req.body?.previewOnly === false) {
      res.status(409).json({ error: { code: "MIGRATION_EXECUTION_NOT_READY", message: "Migration execution requires a separately validated and activated capability transition." } });
      return;
    }
    const preview = await previewProjectMigration(projectRoot(project.slug), project.slug);
    res.status(200).json({ preview });
  }));

  app.post("/api/novel/projects/:projectId/migrations/:migrationId/validate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const validation = await validateMigrationPreview(projectRoot(project.slug), project.slug, req.params.migrationId);
      res.json({ validation });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : String(error) } });
    }
  }));

  app.post("/api/novel/projects/:projectId/migrations/:migrationId/resolve-conflicts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const resolution = await resolveMigrationConflicts(projectRoot(project.slug), project.slug, req.params.migrationId, req.body?.selectedOutlineAuthority as OutlineAuthority);
      res.status(201).json({ resolution });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : String(error) } });
    }
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId/resolution", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const resolution = await readMigrationResolution(projectRoot(project.slug), req.params.migrationId);
    if (!resolution) {
      res.status(404).json({ error: "Migration resolution not found" });
      return;
    }
    res.json({ resolution });
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId/validation", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const validation = await readMigrationValidation(projectRoot(project.slug), req.params.migrationId);
    if (!validation) {
      res.status(404).json({ error: "Migration validation not found" });
      return;
    }
    res.json({ validation });
  }));

  app.post("/api/novel/projects/:projectId/migrations/:migrationId/activate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const expectedValidationFingerprint = typeof req.body?.expectedValidationFingerprint === "string" ? req.body.expectedValidationFingerprint.trim() : "";
    if (!idempotencyKey) { res.status(400).json({ error: { code: "MIGRATION_ACTIVATION_IDEMPOTENCY_REQUIRED" } }); return; }
    if (!expectedValidationFingerprint) { res.status(400).json({ error: { code: "MIGRATION_ACTIVATION_FINGERPRINT_REQUIRED" } }); return; }
    const validation = await readMigrationValidation(projectRoot(project.slug), req.params.migrationId);
    if (!validation) { res.status(409).json({ error: { code: "MIGRATION_VALIDATION_REQUIRED" } }); return; }
    if (validation.fingerprint !== expectedValidationFingerprint) { res.status(409).json({ error: { code: "MIGRATION_VALIDATION_FINGERPRINT_STALE" } }); return; }
    try {
      const activation = await activateProjectMigration(projectRoot(project.slug), project.slug, req.params.migrationId, { idempotencyKey, expectedValidationFingerprint });
      res.json({ activation });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : String(error) } });
    }
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId/activation", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const activation = await readMigrationActivation(projectRoot(project.slug), req.params.migrationId);
    if (!activation) {
      res.status(404).json({ error: "Migration activation not found" });
      return;
    }
    res.json({ activation });
  }));

  app.post("/api/novel/projects/:projectId/migrations/:migrationId/rollback", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const rollback = await rollbackProjectMigration(projectRoot(project.slug), project.slug, req.params.migrationId);
      res.status(201).json({ rollback });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : String(error) } });
    }
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId/rollback", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const rollback = await readMigrationRollback(projectRoot(project.slug), req.params.migrationId);
    if (!rollback) {
      res.status(404).json({ error: "Migration rollback has not been created" });
      return;
    }
    res.json({ rollback });
  }));

  app.get("/api/novel/projects/:projectId/runtime/execution-readiness/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ readiness: await checkExecutionReadiness(projectRoot(project.slug), req.params.chapterId) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const candidate = await readProseCandidate(root, req.params.candidateId);
    if (!candidate || candidate.projectSlug !== project.slug) {
      res.status(404).json({ error: "Prose candidate not found" });
      return;
    }
    res.json({ candidate, validation: await validateProseCandidate(root, candidate), validationBundle: await readProseValidationBundle(root, candidate.candidateId) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-candidates", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ candidates: (await listProseCandidates(projectRoot(project.slug))).filter((candidate) => candidate.projectSlug === project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/adoption-readiness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const candidate = await readProseCandidate(root, req.params.candidateId);
    if (!candidate || candidate.projectSlug !== project.slug) { res.status(404).json({ error: "Prose candidate not found" }); return; }
    const chapter = project.chapters.find((item) => item.id === candidate.chapterId);
    if (!chapter) { res.status(409).json({ error: "Candidate chapter no longer exists" }); return; }
    const canon = await fs.readFile(resolveInside(root, chapter.contentPath), "utf8").catch(() => "");
    const validation = await validateProseCandidate(root, candidate);
    res.json({ readiness: {
      candidateId: candidate.candidateId,
      chapterId: chapter.id,
      targetPath: chapter.contentPath,
      expectedCanonSha256: crypto.createHash("sha256").update(canon, "utf8").digest("hex"),
      authorizationRequired: true,
      validationStatus: validation.status,
      canonWritten: false
    } });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/validate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidate = await readProseCandidate(projectRoot(project.slug), req.params.candidateId);
    if (!candidate || candidate.projectSlug !== project.slug) { res.status(404).json({ error: "Prose candidate not found" }); return; }
    const validationBundle = await validateAndPersistProseCandidate(projectRoot(project.slug), candidate);
    res.status(validationBundle.status === "passed" ? 200 : 422).json({ validationBundle });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/review", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidate = await readProseCandidate(projectRoot(project.slug), req.params.candidateId);
    if (!candidate || candidate.projectSlug !== project.slug) { res.status(404).json({ error: "Prose candidate not found" }); return; }
    const review = await reviewProseCandidateById(projectRoot(project.slug), candidate.candidateId);
    res.status(review.status === "passed" ? 200 : 422).json({ review });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/repair-plans", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const candidate = await readProseCandidate(root, req.params.candidateId);
    if (!candidate || candidate.projectSlug !== project.slug) { res.status(404).json({ error: "Prose candidate not found" }); return; }
    try {
      const review = await readRedBlueReview(root, candidate.candidateId) || await reviewProseCandidateById(root, candidate.candidateId);
      const plan = await createProseRepairPlan(root, candidate, review);
      res.status(201).json({ plan });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PROSE_REPAIR_PLAN_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-repair-plans/:planId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readProseRepairPlan(projectRoot(project.slug), req.params.planId);
    if (!plan) { res.status(404).json({ error: "Prose repair plan not found" }); return; }
    res.json({ plan });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-repair-plans/:planId/candidates", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const plan = await readProseRepairPlan(root, req.params.planId);
    if (!plan) { res.status(404).json({ error: "Prose repair plan not found" }); return; }
    const parent = await readProseCandidate(root, plan.candidateId);
    if (!parent) { res.status(409).json({ error: { code: "PROSE_REPAIR_PARENT_NOT_FOUND" } }); return; }
    try {
      const result = await createProseRepairCandidate({ root, plan, parent, content: typeof req.body?.content === "string" ? req.body.content : "" });
      res.status(201).json(result);
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PROSE_REPAIR_CANDIDATE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-repair-candidates/:repairCandidateId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const metadata = await readProseRepairCandidate(projectRoot(project.slug), req.params.repairCandidateId);
    if (!metadata) { res.status(404).json({ error: "Prose repair candidate not found" }); return; }
    const candidate = await readProseCandidate(projectRoot(project.slug), metadata.candidateId);
    res.json({ metadata, candidate });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-repair-candidates/:repairCandidateId/regression", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const metadata = await readProseRepairCandidate(root, req.params.repairCandidateId);
    if (!metadata) { res.status(404).json({ error: "Prose repair candidate not found" }); return; }
    const plan = await readProseRepairPlan(root, metadata.planId);
    const parent = await readProseCandidate(root, metadata.parentCandidateId);
    const repaired = await readProseCandidate(root, metadata.candidateId);
    if (!plan || !parent || !repaired) { res.status(409).json({ error: { code: "PROSE_REPAIR_REGRESSION_INPUT_MISSING" } }); return; }
    try {
      const parentReview = await readRedBlueReview(root, parent.candidateId);
      if (!parentReview) { res.status(409).json({ error: { code: "PROSE_REPAIR_PARENT_REVIEW_REQUIRED" } }); return; }
      const dossier = await evaluateProseRepairRegression({ root, plan, parent, parentReview, repaired });
      res.status(dossier.status === "passed" ? 201 : 422).json({ dossier });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PROSE_REPAIR_REGRESSION_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-repair-regressions/:regressionId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const dossier = await readProseRepairRegression(projectRoot(project.slug), req.params.regressionId);
    if (!dossier) { res.status(404).json({ error: "Prose repair regression not found" }); return; }
    res.json({ dossier });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/adopt", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidate = await readProseCandidate(projectRoot(project.slug), req.params.candidateId);
    if (!candidate || candidate.projectSlug !== project.slug) {
      res.status(404).json({ error: "Prose candidate not found" });
      return;
    }
    const chapter = project.chapters.find((item) => item.id === candidate.chapterId);
    if (!chapter) {
      res.status(409).json({ error: "Candidate chapter no longer exists" });
      return;
    }
    const expectedCanonSha256 = typeof req.body?.expectedCanonSha256 === "string" ? req.body.expectedCanonSha256 : "";
    const authorizationId = typeof req.body?.authorizationId === "string" ? req.body.authorizationId : "";
    if (!expectedCanonSha256 || !authorizationId) {
      res.status(400).json({ error: "expectedCanonSha256 and authorizationId are required" });
      return;
    }
    try {
      const transaction = await adoptProseCandidate({ root: projectRoot(project.slug), candidateId: candidate.candidateId, targetPath: chapter.contentPath, expectedCanonSha256, authorizationId });
      res.status(transaction.status === "committed" ? 201 : 409).json({ transaction });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "PROSE_CANON_BASELINE_STALE" ? 409 : message.startsWith("PROSE_CANDIDATE_") ? 422 : 400;
      res.status(status).json({ error: message });
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-adoptions/:transactionId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const transaction = await readProseAdoptionTransaction(projectRoot(project.slug), req.params.transactionId);
    if (!transaction) {
      res.status(404).json({ error: "Prose adoption transaction not found" });
      return;
    }
    res.json({ transaction });
  }));

  app.post("/api/novel/projects/:projectId/runtime/chapters/:chapterId/settle", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const chapter = project.chapters.find((item) => item.id === req.params.chapterId);
    const adoptionTransactionId = typeof req.body?.adoptionTransactionId === "string" ? req.body.adoptionTransactionId : "";
    if (!chapter || !adoptionTransactionId) {
      res.status(400).json({ error: "chapter and adoptionTransactionId are required" });
      return;
    }
    try {
      const settlement = await settleChapter({ root: projectRoot(project.slug), projectSlug: project.slug, chapterId: chapter.id, adoptionTransactionId, targetPath: chapter.contentPath });
      const bookRunId = typeof req.body?.bookRunId === "string" ? req.body.bookRunId : "";
      const advancement = bookRunId ? await advanceBookRun(projectRoot(project.slug), bookRunId) : undefined;
      res.status(201).json({ settlement, ...(advancement ? { bookRun: advancement.run, scheduled: advancement.scheduled, dispatched: advancement.dispatched } : {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(409).json({ error: message });
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/chapters/:chapterId/settlements/:settlementId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const settlement = await readChapterSettlement(projectRoot(project.slug), req.params.settlementId);
    if (!settlement || settlement.projectSlug !== project.slug || settlement.chapterId !== req.params.chapterId) {
      res.status(404).json({ error: "Chapter settlement not found" });
      return;
    }
    res.json({ settlement });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/feedback", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidate = await readProseCandidate(projectRoot(project.slug), req.params.candidateId);
    const adoptionTransactionId = typeof req.body?.adoptionTransactionId === "string" ? req.body.adoptionTransactionId : "";
    const decision = req.body?.decision;
    if (!candidate || candidate.projectSlug !== project.slug) { res.status(404).json({ error: "Prose candidate not found" }); return; }
    if (decision !== "accepted" && decision !== "needs_revision" && decision !== "rejected") { res.status(400).json({ error: "Unsupported feedback decision" }); return; }
    try {
      const event = await recordAuthorFeedback({ root: projectRoot(project.slug), projectSlug: project.slug, candidateId: candidate.candidateId, adoptionTransactionId, decision, note: typeof req.body?.note === "string" ? req.body.note : undefined });
      res.status(201).json({ event });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-feedback/:eventId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const event = await readAuthorFeedbackEvent(projectRoot(project.slug), req.params.eventId);
    if (!event || event.projectSlug !== project.slug) { res.status(404).json({ error: "Author feedback event not found" }); return; }
    res.json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-feedback/:eventId/attribution", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const event = await readAuthorFeedbackEvent(projectRoot(project.slug), req.params.eventId);
    if (!event || event.projectSlug !== project.slug) { res.status(404).json({ error: "Author feedback event not found" }); return; }
    const category = req.body?.category;
    const allowed = ["content", "structure", "language", "fact", "presentation"];
    if (!allowed.includes(category)) { res.status(400).json({ error: "Unsupported feedback attribution category" }); return; }
    const scope = req.body?.scope && typeof req.body.scope === "object" ? { chapterId: typeof req.body.scope.chapterId === "string" ? req.body.scope.chapterId : undefined, sceneId: typeof req.body.scope.sceneId === "string" ? req.body.scope.sceneId : undefined } : {};
    const evidenceRefs = Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.filter((item: unknown): item is string => typeof item === "string") : [];
    const confounders = Array.isArray(req.body?.confounders) ? req.body.confounders.filter((item: unknown): item is string => typeof item === "string") : [];
    try {
      const attribution = await createFeedbackAttribution({ root: projectRoot(project.slug), event, category, pattern: typeof req.body?.pattern === "string" ? req.body.pattern : undefined, scope, evidenceRefs, confounders, confidence: { lower: Number(req.body?.confidence?.lower), upper: Number(req.body?.confidence?.upper) } });
      res.status(201).json({ attribution });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/prose-feedback-attributions/:attributionId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const attribution = await readFeedbackAttribution(projectRoot(project.slug), req.params.attributionId);
    if (!attribution || attribution.projectSlug !== project.slug) { res.status(404).json({ error: "Feedback attribution not found" }); return; }
    res.json({ attribution });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-feedback-attributions/:attributionId/hypothesis", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const attribution = await readFeedbackAttribution(projectRoot(project.slug), req.params.attributionId);
    if (!attribution || attribution.projectSlug !== project.slug) { res.status(404).json({ error: "Feedback attribution not found" }); return; }
    const hypothesis = await derivePreferenceHypothesis({ root: projectRoot(project.slug), attribution });
    res.status(201).json({ hypothesis });
  }));

  app.get("/api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const hypothesis = await readPreferenceHypothesis(projectRoot(project.slug), req.params.hypothesisId);
    if (!hypothesis || hypothesis.projectSlug !== project.slug) { res.status(404).json({ error: "Preference hypothesis not found" }); return; }
    res.json({ hypothesis });
  }));

  app.post("/api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId/revoke", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const hypothesis = await revokePreferenceHypothesis({ root: projectRoot(project.slug), hypothesisId: req.params.hypothesisId, actor: typeof req.body?.actor === "string" ? req.body.actor : "author", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ hypothesis });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId/oppositions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const hypothesis = await recordPreferenceOpposition({ root: projectRoot(project.slug), hypothesisId: req.params.hypothesisId, oppositionEventId: typeof req.body?.oppositionEventId === "string" ? req.body.oppositionEventId : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ hypothesis });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/learning-policy", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const policy = await createLearningPolicy({ root: projectRoot(project.slug), projectSlug: project.slug, rollbackVersion: typeof req.body?.rollbackVersion === "string" ? req.body.rollbackVersion : "" });
      res.status(201).json({ policy });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/learning-policy", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const policy = await readLearningPolicy(projectRoot(project.slug), project.slug);
    if (!policy) { res.status(404).json({ error: "Learning policy not found" }); return; }
    res.json({ policy });
  }));

  app.post("/api/novel/projects/:projectId/runtime/exploration-budgets", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const budget = await createExplorationBudget({ root: projectRoot(project.slug), projectSlug: project.slug, scope: typeof req.body?.scope === "string" ? req.body.scope : "", maxProbes: Number(req.body?.maxProbes), maxCost: Number(req.body?.maxCost), maxImpact: typeof req.body?.maxImpact === "string" ? req.body.maxImpact : "", stopConditions: Array.isArray(req.body?.stopConditions) ? req.body.stopConditions.filter((item: unknown): item is string => typeof item === "string") : [] });
      res.status(201).json({ budget });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/exploration-budgets/:budgetId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const budget = await readExplorationBudget(projectRoot(project.slug), req.params.budgetId);
    if (!budget || budget.projectSlug !== project.slug) { res.status(404).json({ error: "Exploration budget not found" }); return; }
    res.json({ budget });
  }));

  app.post("/api/novel/projects/:projectId/runtime/exploration-budgets/:budgetId/consume", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const budget = await consumeExplorationBudget({ root: projectRoot(project.slug), budgetId: req.params.budgetId, operationId: typeof req.body?.operationId === "string" ? req.body.operationId : "", probes: Number(req.body?.probes), cost: Number(req.body?.cost), impact: typeof req.body?.impact === "string" ? req.body.impact : "" });
      res.status(200).json({ budget });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/exploration-budgets/:budgetId/pause", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const budget = await pauseExplorationBudget({ root: projectRoot(project.slug), budgetId: req.params.budgetId, reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ budget });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/source-material", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const source = await createSourceMaterial({ root: projectRoot(project.slug), projectSlug: project.slug, title: typeof req.body?.title === "string" ? req.body.title : "", type: typeof req.body?.type === "string" ? req.body.type : "", provenance: typeof req.body?.provenance === "string" ? req.body.provenance : "", rightsStatus: req.body?.rightsStatus, licensor: typeof req.body?.licensor === "string" ? req.body.licensor : "", licenseExpiresAt: typeof req.body?.licenseExpiresAt === "string" ? req.body.licenseExpiresAt : undefined, allowedUses: Array.isArray(req.body?.allowedUses) ? req.body.allowedUses : [], projectScope: typeof req.body?.projectScope === "string" ? req.body.projectScope : "", retainExcerpt: req.body?.retainExcerpt === true, importedBy: typeof req.body?.importedBy === "string" ? req.body.importedBy : "" });
      res.status(201).json({ source });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/source-material/:sourceId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const source = await readSourceMaterial(projectRoot(project.slug), req.params.sourceId);
    if (!source || source.projectSlug !== project.slug) { res.status(404).json({ error: "Source material not found" }); return; }
    res.json({ source });
  }));

  app.post("/api/novel/projects/:projectId/runtime/source-material/:sourceId/rights-envelope", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const source = await readSourceMaterial(projectRoot(project.slug), req.params.sourceId);
    if (!source || source.projectSlug !== project.slug) { res.status(404).json({ error: "Source material not found" }); return; }
    try {
      const envelope = await createRightsEnvelope({ root: projectRoot(project.slug), source, checkedBy: typeof req.body?.checkedBy === "string" ? req.body.checkedBy : "" });
      res.status(201).json({ envelope });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/rights-envelopes/:envelopeId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const envelope = await readRightsEnvelope(projectRoot(project.slug), req.params.envelopeId);
    if (!envelope || envelope.projectSlug !== project.slug) { res.status(404).json({ error: "Rights envelope not found" }); return; }
    res.json({ envelope });
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-patterns", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const pattern = await createCraftPattern({ root: projectRoot(project.slug), projectSlug: project.slug, name: typeof req.body?.name === "string" ? req.body.name : "", mechanism: typeof req.body?.mechanism === "string" ? req.body.mechanism : "", narrativeFunction: typeof req.body?.narrativeFunction === "string" ? req.body.narrativeFunction : "", applicability: Array.isArray(req.body?.applicability) ? req.body.applicability : [], counterexamples: Array.isArray(req.body?.counterexamples) ? req.body.counterexamples : [], sourceEnvelopeIds: Array.isArray(req.body?.sourceEnvelopeIds) ? req.body.sourceEnvelopeIds : [], evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs : [] });
      res.status(201).json({ pattern });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/craft-patterns", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    res.json({ patterns: await listCraftPatterns(projectRoot(project.slug), project.slug) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const body = req.body ?? {};
    const contract = await createCharacterDramaticContract({ root: projectRoot(project.slug), projectSlug: project.slug, characterId: String(body.characterId ?? ""), displayName: String(body.displayName ?? ""), externalWant: String(body.externalWant ?? ""), internalNeed: String(body.internalNeed ?? ""), falseBelief: String(body.falseBelief ?? ""), woundOrFear: String(body.woundOrFear ?? ""), valuesAndBoundaries: Array.isArray(body.valuesAndBoundaries) ? body.valuesAndBoundaries.map(String) : [], contradiction: String(body.contradiction ?? ""), stake: String(body.stake ?? ""), unacceptableChoice: String(body.unacceptableChoice ?? ""), potentialChange: String(body.potentialChange ?? ""), unknown: Array.isArray(body.unknown) ? body.unknown.map(String) : [], sources: Array.isArray(body.sources) ? body.sources : [] });
    res.status(201).json({ contract });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-contracts/:contractId/revise", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const body = req.body ?? {};
    const contract = await reviseCharacterDramaticContract({ root: projectRoot(project.slug), contractId: req.params.contractId, actor: String(body.actor ?? ""), reason: String(body.reason ?? ""), changes: body.changes ?? {} });
    res.status(201).json({ contract });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    res.json({ contracts: await listCharacterContracts(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-contracts/:contractId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const contract = await readCharacterDramaticContract(projectRoot(project.slug), req.params.contractId);
    if (!contract || contract.projectSlug !== project.slug) return res.status(404).json({ error: "CHARACTER_CONTRACT_NOT_FOUND" });
    res.json({ contract });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-contracts/:contractId/confirm", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const contract = await confirmCharacterContract({ root: projectRoot(project.slug), contractId: req.params.contractId, actor: String(req.body?.actor ?? ""), reason: String(req.body?.reason ?? "") });
    res.json({ contract });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-state-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const body = req.body ?? {};
    const snapshot = await recordCharacterStateSnapshot({ root: projectRoot(project.slug), projectSlug: project.slug, characterId: String(body.characterId ?? ""), contractId: String(body.contractId ?? ""), asOf: String(body.asOf ?? ""), currentGoal: String(body.currentGoal ?? ""), priority: String(body.priority ?? ""), belief: String(body.belief ?? ""), knowledge: Array.isArray(body.knowledge) ? body.knowledge.map(String) : [], emotion: String(body.emotion ?? ""), injury: String(body.injury ?? ""), resources: Array.isArray(body.resources) ? body.resources.map(String) : [], abilitiesAndIdentity: Array.isArray(body.abilitiesAndIdentity) ? body.abilitiesAndIdentity.map(String) : [], relationshipStances: Array.isArray(body.relationshipStances) ? body.relationshipStances : [], obligations: Array.isArray(body.obligations) ? body.obligations.map(String) : [], availableChoices: Array.isArray(body.availableChoices) ? body.availableChoices.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ snapshot });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-state-snapshots/diff", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ diff: diffCharacterStateSnapshots(req.body?.before, req.body?.after) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-agency/guard", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateCharacterAgency({ eventId: String(body.eventId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), outcome: String(body.outcome || ""), choiceEvidenceIds: Array.isArray(body.choiceEvidenceIds) ? body.choiceEvidenceIds : [], causalFactors: Array.isArray(body.causalFactors) ? body.causalFactors : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-beliefs", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createBeliefLifecycle({ beliefId: String(body.beliefId || ""), characterId: String(body.characterId || ""), belief: String(body.belief || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-beliefs/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(recordBeliefEvent(body.record, { type: body.type, description: String(body.description || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], pressureRefs: Array.isArray(body.pressureRefs) ? body.pressureRefs : [], costRefs: Array.isArray(body.costRefs) ? body.costRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/relationship-misreads", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createRelationshipMisread({ relationshipId: String(body.relationshipId || ""), sourceCharacterId: String(body.sourceCharacterId || ""), targetCharacterId: String(body.targetCharacterId || ""), sourceDefinition: String(body.sourceDefinition || ""), targetDefinition: String(body.targetDefinition || ""), publicState: String(body.publicState || ""), sourceSecret: String(body.sourceSecret || ""), targetSecret: String(body.targetSecret || ""), misunderstanding: String(body.misunderstanding || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/relationship-misreads/resolve", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(resolveRelationshipMisread(body.record, { sourceInterpretation: String(body.sourceInterpretation || ""), targetInterpretation: String(body.targetInterpretation || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], compensationProvided: body.compensationProvided === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/value-opponents", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createValueOpponentContract({ contractId: String(body.contractId || ""), protagonistId: String(body.protagonistId || ""), opponentId: String(body.opponentId || ""), opponentDesire: String(body.opponentDesire || ""), valueLogic: String(body.valueLogic || ""), viableWinPath: String(body.viableWinPath || ""), pressureOnFalseBelief: String(body.pressureOnFalseBelief || ""), concreteConflict: String(body.concreteConflict || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/offpage-character-plans", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createOffPageCharacterPlan({ planId: String(body.planId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), independentGoal: String(body.independentGoal || ""), resources: Array.isArray(body.resources) ? body.resources : [], constraints: Array.isArray(body.constraints) ? body.constraints : [], nearTermPlan: String(body.nearTermPlan || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/offpage-character-plans/events", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(recordOffPageEvent(body.plan, { eventId: String(body.eventId || ""), action: String(body.action || ""), consequence: String(body.consequence || ""), causalEvidenceRefs: Array.isArray(body.causalEvidenceRefs) ? body.causalEvidenceRefs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-presence-plans", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCharacterPresencePlan({ planId: String(body.planId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), arcRefs: Array.isArray(body.arcRefs) ? body.arcRefs : [], relationshipRefs: Array.isArray(body.relationshipRefs) ? body.relationshipRefs : [], obligationRefs: Array.isArray(body.obligationRefs) ? body.obligationRefs : [], resourceDependencies: Array.isArray(body.resourceDependencies) ? body.resourceDependencies : [], sceneCapacity: Number(body.sceneCapacity || 0), entries: Array.isArray(body.entries) ? body.entries : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-presence-plans/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateCharacterPresence(body.plan, { observed: Array.isArray(body.observed) ? body.observed : [], requiredSceneIds: Array.isArray(body.requiredSceneIds) ? body.requiredSceneIds : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/ensemble-attention/chapters", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(recordEnsembleChapter({ chapterId: String(body.chapterId || ""), projectSlug: project.slug, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], characters: Array.isArray(body.characters) ? body.characters : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/ensemble-attention/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateEnsembleAttention(Array.isArray(body.chapters) ? body.chapters : [], { minimumActiveChapters: Number(body.minimumActiveChapters || 1) })); }));

  app.post("/api/novel/projects/:projectId/runtime/character-voice-profiles", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCharacterVoiceProfile({ characterId: String(body.characterId || ""), version: String(body.version || ""), attentionFocus: String(body.attentionFocus || ""), desireAndAvoidance: String(body.desireAndAvoidance || ""), vocabularyRange: String(body.vocabularyRange || ""), syntaxAndPauses: String(body.syntaxAndPauses || ""), addressHabits: String(body.addressHabits || ""), lyingStyle: String(body.lyingStyle || ""), emotionalLeak: String(body.emotionalLeak || ""), powerExpression: String(body.powerExpression || ""), forbiddenDrift: Array.isArray(body.forbiddenDrift) ? body.forbiddenDrift : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-voice-profiles/compile", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(compileCharacterVoiceVariant(body.profile, { previousVersion: body.previousVersion, changeMilestone: body.changeMilestone, changeEvidenceRefs: Array.isArray(body.changeEvidenceRefs) ? body.changeEvidenceRefs : [], emotion: String(body.emotion || ""), relationshipStage: String(body.relationshipStage || ""), powerPosition: String(body.powerPosition || ""), knowledgeBoundary: Array.isArray(body.knowledgeBoundary) ? body.knowledgeBoundary : [], utterance: String(body.utterance || ""), variantEvidenceRefs: Array.isArray(body.variantEvidenceRefs) ? body.variantEvidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-arc-rhythm/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(recordArcRhythmEvent(body.record, { chapterId: String(body.chapterId || ""), phase: body.phase, pressure: String(body.pressure || ""), choice: String(body.choice || ""), cost: String(body.cost || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-arc-rhythm/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateCharacterArcRhythm(body.record, { minimumNovelPressure: Number(body.minimumNovelPressure || 1) })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-continuity", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCharacterContinuity({ projectSlug: project.slug, characterId: String(body.characterId || ""), identityVersion: String(body.identityVersion || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-continuity/events", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(recordCharacterContinuityEvent(body.record, { type: body.type, description: String(body.description || ""), cause: body.cause, mechanism: body.mechanism, cost: body.cost, identityChange: body.identityChange, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-revision-impact", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(analyzeCharacterRevisionImpact({ revisionId: String(body.revisionId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), changedFields: Array.isArray(body.changedFields) ? body.changedFields : [], oldValues: body.oldValues || {}, newValues: body.newValues || {}, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], dependencies: Array.isArray(body.dependencies) ? body.dependencies : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-arc-certificate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(issueCharacterArcCertificate({ arcId: String(body.arcId || ""), characterId: String(body.characterId || ""), startState: String(body.startState || ""), targetChange: String(body.targetChange || ""), milestones: Array.isArray(body.milestones) ? body.milestones : [], staleDependencyIds: Array.isArray(body.staleDependencyIds) ? body.staleDependencyIds : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/world-rules/execute", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateWorldRuleExecution(body.contract, { subject: String(body.subject || ""), region: String(body.region || ""), chapter: String(body.chapter || ""), conditionMet: body.conditionMet === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/world-rules/knowledge", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(recordWorldRuleKnowledge({ ruleId: String(body.ruleId || ""), subjectId: String(body.subjectId || ""), kind: body.kind, claim: String(body.claim || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/character-state-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    res.json({ snapshots: await listCharacterStateSnapshots(projectRoot(project.slug), project.slug, characterId) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-state-snapshots/:snapshotId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    const snapshot = await readCharacterStateSnapshot(projectRoot(project.slug), req.params.snapshotId);
    if (!snapshot || snapshot.projectSlug !== project.slug) return res.status(404).json({ error: "CHARACTER_STATE_SNAPSHOT_NOT_FOUND" });
    res.json({ snapshot });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-choice-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const evidence = await createCharacterChoiceEvidence({ root: projectRoot(project.slug), projectSlug: project.slug, characterId: String(body.characterId ?? ""), contractId: String(body.contractId ?? ""), beforeSnapshotId: String(body.beforeSnapshotId ?? ""), choice: String(body.choice ?? ""), rejectedChoices: Array.isArray(body.rejectedChoices) ? body.rejectedChoices.map(String) : [], immediateCost: String(body.immediateCost ?? ""), delayedCost: String(body.delayedCost ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ evidence });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-choice-evidence/:evidenceId/observe", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const evidence = await observeCharacterChoiceEvidence({ root: projectRoot(project.slug), evidenceId: req.params.evidenceId, afterSnapshotId: String(body.afterSnapshotId ?? ""), outcomeRefs: Array.isArray(body.outcomeRefs) ? body.outcomeRefs.map(String) : [] });
    res.json({ evidence });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-choice-evidence/:evidenceId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const evidence = await readCharacterChoiceEvidence(projectRoot(project.slug), req.params.evidenceId);
    if (!evidence || evidence.projectSlug !== project.slug) return res.status(404).json({ error: "CHARACTER_CHOICE_EVIDENCE_NOT_FOUND" });
    res.json({ evidence });
  }));

  app.post("/api/novel/projects/:projectId/runtime/relationship-events", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const event = await createRelationshipEvent({ root: projectRoot(project.slug), projectSlug: project.slug, relationshipId: String(body.relationshipId ?? ""), sourceCharacterId: String(body.sourceCharacterId ?? ""), targetCharacterId: String(body.targetCharacterId ?? ""), contractId: String(body.contractId ?? ""), beforeSnapshotId: String(body.beforeSnapshotId ?? ""), sharedEventRef: String(body.sharedEventRef ?? ""), sourceCharacterChoice: String(body.sourceCharacterChoice ?? ""), targetCharacterChoice: String(body.targetCharacterChoice ?? ""), sourceInterpretation: String(body.sourceInterpretation ?? ""), targetInterpretation: String(body.targetInterpretation ?? ""), visibleActions: Array.isArray(body.visibleActions) ? body.visibleActions.map(String) : [], valueExchange: String(body.valueExchange ?? ""), immediateCost: String(body.immediateCost ?? ""), delayedCost: String(body.delayedCost ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/relationship-events/:eventId/observe", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const event = await observeRelationshipEvent({ root: projectRoot(project.slug), eventId: req.params.eventId, afterSnapshotId: String(body.afterSnapshotId ?? ""), outcomeRefs: Array.isArray(body.outcomeRefs) ? body.outcomeRefs.map(String) : [] });
    res.json({ event });
  }));

  app.get("/api/novel/projects/:projectId/runtime/relationship-events/:eventId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const event = await readRelationshipEvent(projectRoot(project.slug), req.params.eventId);
    if (!event || event.projectSlug !== project.slug) return res.status(404).json({ error: "RELATIONSHIP_EVENT_NOT_FOUND" });
    res.json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-arcs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const arc = await createCharacterArcContract({ root: projectRoot(project.slug), projectSlug: project.slug, characterId: String(body.characterId ?? ""), dramaticContractId: String(body.dramaticContractId ?? ""), startState: String(body.startState ?? ""), targetChange: String(body.targetChange ?? ""), keyPressures: Array.isArray(body.keyPressures) ? body.keyPressures.map(String) : [], plannedChoices: Array.isArray(body.plannedChoices) ? body.plannedChoices.map(String) : [], plannedCosts: Array.isArray(body.plannedCosts) ? body.plannedCosts.map(String) : [], relationshipImpacts: Array.isArray(body.relationshipImpacts) ? body.relationshipImpacts.map(String) : [], allowedRegression: String(body.allowedRegression ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ arc });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-arcs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    res.json({ arcs: await listCharacterArcContracts(projectRoot(project.slug), project.slug, characterId) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-arcs/:arcId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const arc = await readCharacterArcContract(projectRoot(project.slug), req.params.arcId);
    if (!arc || arc.projectSlug !== project.slug) return res.status(404).json({ error: "CHARACTER_ARC_NOT_FOUND" });
    res.json({ arc });
  }));

  app.get("/api/novel/projects/:projectId/runtime/character-arcs/:arcId/projection", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const arc = await readCharacterArcContract(projectRoot(project.slug), req.params.arcId);
    if (!arc || arc.projectSlug !== project.slug) return res.status(404).json({ error: "CHARACTER_ARC_NOT_FOUND" });
    res.json({ projection: projectCharacterArcSeparation(arc) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/character-arcs/:arcId/milestones", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const arc = await recordCharacterArcMilestone({ root: projectRoot(project.slug), arcId: req.params.arcId, choiceEvidenceId: String(body.choiceEvidenceId ?? ""), milestone: String(body.milestone ?? ""), actualChange: String(body.actualChange ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.json({ arc });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-state-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const snapshot = await recordWorldStateSnapshot({ root: projectRoot(project.slug), projectSlug: project.slug, asOf: String(body.asOf ?? ""), region: String(body.region ?? ""), publicationVersion: String(body.publicationVersion ?? ""), politicalControl: Array.isArray(body.politicalControl) ? body.politicalControl.map(String) : [], activeConflicts: Array.isArray(body.activeConflicts) ? body.activeConflicts.map(String) : [], institutions: Array.isArray(body.institutions) ? body.institutions.map(String) : [], infrastructure: Array.isArray(body.infrastructure) ? body.infrastructure.map(String) : [], markets: Array.isArray(body.markets) ? body.markets.map(String) : [], environment: Array.isArray(body.environment) ? body.environment.map(String) : [], resources: Array.isArray(body.resources) ? body.resources.map(String) : [], effectiveRuleIds: Array.isArray(body.effectiveRuleIds) ? body.effectiveRuleIds.map(String) : [], unknowns: Array.isArray(body.unknowns) ? body.unknowns.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ snapshot });
  }));

  app.get("/api/novel/projects/:projectId/runtime/world-state-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const region = typeof req.query.region === "string" ? req.query.region : undefined;
    res.json({ snapshots: await listWorldStateSnapshots(projectRoot(project.slug), project.slug, region) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-state-projection", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(projectWorldState(Array.isArray(body.snapshots) ? body.snapshots : [], { region: String(body.region || ""), asOf: String(body.asOf || ""), publicationVersion: String(body.publicationVersion || "") })); }));
  app.get("/api/novel/projects/:projectId/runtime/world-state-snapshots/:snapshotId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const snapshot = await readWorldStateSnapshot(projectRoot(project.slug), req.params.snapshotId);
    if (!snapshot || snapshot.projectSlug !== project.slug) return res.status(404).json({ error: "WORLD_STATE_SNAPSHOT_NOT_FOUND" });
    res.json({ snapshot });
  }));

  app.post("/api/novel/projects/:projectId/runtime/capability-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const capability = await createCapabilityContract({ root: projectRoot(project.slug), projectSlug: project.slug, holderId: String(body.holderId ?? ""), name: String(body.name ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [], canDo: String(body.canDo ?? ""), cannotDo: Array.isArray(body.cannotDo) ? body.cannotDo.map(String) : [], prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.map(String) : [], inputs: Array.isArray(body.inputs) ? body.inputs.map(String) : [], consumption: Array.isArray(body.consumption) ? body.consumption.map(String) : [], scope: Array.isArray(body.scope) ? body.scope.map(String) : [], duration: String(body.duration ?? ""), cooldown: String(body.cooldown ?? ""), precision: String(body.precision ?? ""), counters: Array.isArray(body.counters) ? body.counters.map(String) : [], progressionPath: Array.isArray(body.progressionPath) ? body.progressionPath.map(String) : [], disclosure: String(body.disclosure ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ capability });
  }));

  app.get("/api/novel/projects/:projectId/runtime/capability-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ capabilities: await listCapabilityContracts(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/capability-contracts/:capabilityId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const capability = await readCapabilityContract(projectRoot(project.slug), req.params.capabilityId);
    if (!capability || capability.projectSlug !== project.slug) return res.status(404).json({ error: "CAPABILITY_NOT_FOUND" }); res.json({ capability });
  }));

  app.post("/api/novel/projects/:projectId/runtime/capability-contracts/:capabilityId/progression", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const acquisitionKinds = ["permanent", "temporary-boost", "borrowed-tool", "external-aid", "discovery", "exchange"] as const;
    const acquisitionKind = acquisitionKinds.includes(body.acquisitionKind) ? body.acquisitionKind : "permanent";
    const event = await createProgressionEvent({ root: projectRoot(project.slug), capabilityId: req.params.capabilityId, trigger: String(body.trigger ?? ""), acquisition: String(body.acquisition ?? ""), acquisitionKind, retained: String(body.retained ?? ""), abandoned: String(body.abandoned ?? ""), limitation: String(body.limitation ?? ""), newChoice: String(body.newChoice ?? ""), proseRefs: Array.isArray(body.proseRefs) ? body.proseRefs.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-locations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const location = await createWorldLocation({ root: projectRoot(project.slug), projectSlug: project.slug, locationId: String(body.locationId ?? ""), name: String(body.name ?? ""), hierarchy: String(body.hierarchy ?? ""), region: String(body.region ?? ""), travelRoutes: Array.isArray(body.travelRoutes) ? body.travelRoutes : [], accessConditions: Array.isArray(body.accessConditions) ? body.accessConditions.map(String) : [], currentReachability: body.currentReachability === "blocked" || body.currentReachability === "unknown" ? body.currentReachability : "reachable", sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ location });
  }));

  app.get("/api/novel/projects/:projectId/runtime/world-locations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ locations: await listWorldLocations(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/world-locations/:locationId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const location = await readWorldLocation(projectRoot(project.slug), req.params.locationId);
    if (!location || location.projectSlug !== project.slug) return res.status(404).json({ error: "WORLD_LOCATION_NOT_FOUND" }); res.json({ location });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-locations/:locationId/reachability", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const location = await readWorldLocation(projectRoot(project.slug), req.params.locationId);
    if (!location || location.projectSlug !== project.slug) return res.status(404).json({ error: "WORLD_LOCATION_NOT_FOUND" });
    res.json({ status: evaluateLocationReachability(location, { destinationId: String(req.body?.destinationId ?? ""), hasAccess: req.body?.hasAccess === true }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-travel", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const from = await readWorldLocation(projectRoot(project.slug), String(body.fromLocationId ?? ""));
    if (!from || from.projectSlug !== project.slug) return res.status(404).json({ error: "WORLD_LOCATION_NOT_FOUND" });
    const travel = recordWorldTravel({ from, toLocationId: String(body.toLocationId ?? ""), actorId: String(body.actorId ?? ""), mode: String(body.mode ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [], authorizationReason: typeof body.authorizationReason === "string" ? body.authorizationReason : undefined });
    res.status(201).json({ travel });
  }));

  app.post("/api/novel/projects/:projectId/runtime/power-comparisons", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = comparePowerInContext({ comparisonId: String(body.comparisonId ?? ""), subjectA: String(body.subjectA ?? ""), subjectB: String(body.subjectB ?? ""), dimensions: Array.isArray(body.dimensions) ? body.dimensions.map(String) : [], environment: String(body.environment ?? ""), preparation: String(body.preparation ?? ""), information: String(body.information ?? ""), resources: String(body.resources ?? ""), counters: String(body.counters ?? ""), confidence: { min: Number(body.confidence?.min ?? 0), max: Number(body.confidence?.max ?? 0) }, advantage: body.advantage === "subjectA" || body.advantage === "subjectB" ? body.advantage : "unknown", rationale: String(body.rationale ?? ""), strategyChoice: typeof body.strategyChoice === "string" ? body.strategyChoice : undefined, strategyEvidenceRefs: Array.isArray(body.strategyEvidenceRefs) ? body.strategyEvidenceRefs.map(String) : undefined, strategyCost: typeof body.strategyCost === "string" ? body.strategyCost : undefined, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ comparison: result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/resource-transactions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const transaction = createResourceTransaction({ transactionId: String(body.transactionId ?? ""), resourceType: String(body.resourceType ?? ""), ownerId: String(body.ownerId ?? ""), action: body.action, quantity: { min: Number(body.quantity?.min ?? 0), max: Number(body.quantity?.max ?? 0) }, fromOwnerId: String(body.fromOwnerId ?? ""), toOwnerId: String(body.toOwnerId ?? ""), locked: body.locked === true, at: String(body.at ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    const all = Array.isArray(body.transactions) ? body.transactions.map((item: unknown) => item) : [transaction];
    const transactions = all.length === 1 && all[0] === transaction ? [transaction] : all.map((item: any) => createResourceTransaction(item));
    res.status(201).json({ transaction, ledger: applyResourceTransactions(transactions) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/conditions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const condition = createConditionLedger({ conditionId: String(body.conditionId ?? ""), subjectId: String(body.subjectId ?? ""), kind: body.kind, onset: String(body.onset ?? ""), symptoms: Array.isArray(body.symptoms) ? body.symptoms.map(String) : [], restrictions: Array.isArray(body.restrictions) ? body.restrictions.map(String) : [], treatmentConditions: Array.isArray(body.treatmentConditions) ? body.treatmentConditions.map(String) : [], recoveryWindow: String(body.recoveryWindow ?? ""), relapseRisk: String(body.relapseRisk ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ condition });
  }));

  app.post("/api/novel/projects/:projectId/runtime/conditions/:conditionId/recover", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const condition = createConditionLedger({ conditionId: req.params.conditionId, subjectId: String(body.subjectId ?? ""), kind: body.kind, onset: String(body.onset ?? ""), symptoms: Array.isArray(body.symptoms) ? body.symptoms.map(String) : [], restrictions: Array.isArray(body.restrictions) ? body.restrictions.map(String) : [], treatmentConditions: Array.isArray(body.treatmentConditions) ? body.treatmentConditions.map(String) : [], recoveryWindow: String(body.recoveryWindow ?? ""), relapseRisk: String(body.relapseRisk ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.json({ condition: recordConditionRecovery(condition, { at: String(body.at ?? ""), treatment: String(body.treatment ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/conditions/evaluate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.json({ status: evaluateCondition(body.condition, String(body.action ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/organizations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const organization = createOrganizationContract({ organizationId: String(body.organizationId ?? ""), name: String(body.name ?? ""), goal: String(body.goal ?? ""), values: Array.isArray(body.values) ? body.values.map(String) : [], leaders: Array.isArray(body.leaders) ? body.leaders.map(String) : [], factions: Array.isArray(body.factions) ? body.factions.map(String) : [], permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [], resources: Array.isArray(body.resources) ? body.resources.map(String) : [], information: Array.isArray(body.information) ? body.information.map(String) : [], responseDelay: String(body.responseDelay ?? ""), constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : [], currentPlan: String(body.currentPlan ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ organization });
  }));

  app.post("/api/novel/projects/:projectId/runtime/organizations/:organizationId/actions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const organization = createOrganizationContract({ organizationId: req.params.organizationId, name: String(body.name ?? req.params.organizationId), goal: String(body.goal ?? "ongoing mandate"), values: Array.isArray(body.values) ? body.values.map(String) : ["continuity"], leaders: Array.isArray(body.leaders) ? body.leaders.map(String) : [String(body.actor ?? "")], factions: Array.isArray(body.factions) ? body.factions.map(String) : ["default"], permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [], resources: Array.isArray(body.resources) ? body.resources.map(String) : [], information: Array.isArray(body.information) ? body.information.map(String) : [], responseDelay: String(body.responseDelay ?? "unknown"), constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : ["unrecorded constraints"], currentPlan: String(body.currentPlan ?? "active response"), sourceRefs: Array.isArray(body.organizationSourceRefs) ? body.organizationSourceRefs.map(String) : ["runtime://organization"] });
    const action = recordInstitutionAction(organization, { actionId: String(body.actionId ?? ""), action: String(body.action ?? ""), actor: String(body.actor ?? ""), resourceUse: Array.isArray(body.resourceUse) ? body.resourceUse.map(String) : [], informationUsed: Array.isArray(body.informationUsed) ? body.informationUsed.map(String) : [], at: String(body.at ?? ""), outcome: String(body.outcome ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ action });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/consequence-audits", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const impacts = body.impacts && typeof body.impacts === "object" ? body.impacts : {};
    const audit = auditWorldRuleConsequences({ auditId: String(body.auditId ?? ""), ruleId: String(body.ruleId ?? ""), claim: String(body.claim ?? ""), impacts, exemptions: Array.isArray(body.exemptions) ? body.exemptions : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ audit });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/admission", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = evaluateWorldRuleAdmission({ candidateId: String(body.candidateId ?? ""), ruleId: String(body.ruleId ?? ""), candidateType: body.candidateType === "texture" ? "texture" : "world-rule", sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [], solvesCurrentProblem: String(body.solvesCurrentProblem ?? ""), prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.map(String) : [], foreshadowingRefs: Array.isArray(body.foreshadowingRefs) ? body.foreshadowingRefs.map(String) : [], boundaries: Array.isArray(body.boundaries) ? body.boundaries.map(String) : [], futureCosts: Array.isArray(body.futureCosts) ? body.futureCosts.map(String) : [], existingRuleImpacts: Array.isArray(body.existingRuleImpacts) ? body.existingRuleImpacts.map(String) : [], introductionContext: String(body.introductionContext ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/exceptions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const exception = recordWorldRuleException({ exceptionId: String(body.exceptionId ?? ""), ruleId: String(body.ruleId ?? ""), trigger: String(body.trigger ?? ""), informedParties: Array.isArray(body.informedParties) ? body.informedParties.map(String) : [], repeatability: body.repeatability === "repeatable" ? "repeatable" : "one-time", cost: String(body.cost ?? ""), proseEvidenceRefs: Array.isArray(body.proseEvidenceRefs) ? body.proseEvidenceRefs.map(String) : [], explanationWindow: String(body.explanationWindow ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ exception });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/exceptions/:exceptionId/settle", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const exception = recordWorldRuleException({ exceptionId: req.params.exceptionId, ruleId: String(body.ruleId ?? ""), trigger: String(body.trigger ?? ""), informedParties: Array.isArray(body.informedParties) ? body.informedParties.map(String) : [], repeatability: body.repeatability === "repeatable" ? "repeatable" : "one-time", cost: String(body.cost ?? ""), proseEvidenceRefs: Array.isArray(body.proseEvidenceRefs) ? body.proseEvidenceRefs.map(String) : [], explanationWindow: String(body.explanationWindow ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.json({ exception: settleWorldRuleException(exception, { explanationRefs: Array.isArray(body.explanationRefs) ? body.explanationRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/interactions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = evaluateWorldRuleInteraction({ interactionId: String(body.interactionId ?? ""), ruleIds: Array.isArray(body.ruleIds) ? body.ruleIds.map(String) : [], priorityOrder: Array.isArray(body.priorityOrder) ? body.priorityOrder.map(String) : [], operation: body.operation, observedEffect: String(body.observedEffect ?? ""), uncertainty: Array.isArray(body.uncertainty) ? body.uncertainty.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ interaction: result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/interactions/replay", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ replay: replayWorldRuleInteraction(req.body?.interaction) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-rules/disclosure", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const plan = planWorldRuleDisclosure({ disclosureId: String(body.disclosureId ?? ""), ruleId: String(body.ruleId ?? ""), actionId: String(body.actionId ?? ""), observableFacts: Array.isArray(body.observableFacts) ? body.observableFacts.map(String) : [], readerKnowledge: String(body.readerKnowledge ?? ""), characterKnowledge: Array.isArray(body.characterKnowledge) ? body.characterKnowledge.map(String) : [], objectiveTruth: String(body.objectiveTruth ?? ""), requiredForChoice: body.requiredForChoice === true, hiddenUntil: String(body.hiddenUntil ?? ""), clueRefs: Array.isArray(body.clueRefs) ? body.clueRefs.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ plan });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-impact-reports", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const affected = body.affected && typeof body.affected === "object" ? body.affected : {};
    const report = createWorldImpactReport({ reportId: String(body.reportId ?? ""), changeType: body.changeType, changedId: String(body.changedId ?? ""), changedSummary: String(body.changedSummary ?? ""), affected, protectedUnrelatedCanon: Array.isArray(body.protectedUnrelatedCanon) ? body.protectedUnrelatedCanon.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ report });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-legacy/compile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = compileLegacyWorldMaterials(Array.isArray(body.sources) ? body.sources : []);
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/world-integrity-certificates", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const certificate = createWorldIntegrityCertificate({ certificateId: String(body.certificateId ?? ""), publicationId: String(body.publicationId ?? ""), auditVersion: String(body.auditVersion ?? ""), scope: String(body.scope ?? ""), coverage: body.coverage ?? { rules: [], states: [], capabilities: [], resources: [], time: [], organizations: [] }, openExceptionDebtIds: Array.isArray(body.openExceptionDebtIds) ? body.openExceptionDebtIds.map(String) : [], conflictIds: Array.isArray(body.conflictIds) ? body.conflictIds.map(String) : [], unknowns: Array.isArray(body.unknowns) ? body.unknowns.map(String) : [], scanFailures: Array.isArray(body.scanFailures) ? body.scanFailures.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [], generatedAt: String(body.generatedAt ?? "") });
    res.status(201).json({ certificate });
  }));

  app.post("/api/novel/projects/:projectId/runtime/writing-context", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const contract = assembleWritingContextContract({ requestId: String(body.requestId ?? ""), storyContract: String(body.storyContract ?? ""), characterStates: Array.isArray(body.characterStates) ? body.characterStates.map(String) : [], worldRules: Array.isArray(body.worldRules) ? body.worldRules.map(String) : [], chapterCard: String(body.chapterCard ?? ""), adjacentSummaries: Array.isArray(body.adjacentSummaries) ? body.adjacentSummaries.map(String) : [], distantFacts: Array.isArray(body.distantFacts) ? body.distantFacts.map(String) : [], openForeshadowing: Array.isArray(body.openForeshadowing) ? body.openForeshadowing.map(String) : [], styleConstraints: Array.isArray(body.styleConstraints) ? body.styleConstraints.map(String) : [], latestDirection: String(body.latestDirection ?? ""), limits: { maxChars: Number(body.limits?.maxChars ?? 12000) } });
    res.status(201).json({ contract });
  }));

  app.post("/api/novel/projects/:projectId/runtime/scene-creation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const scene = createSceneCreationContract({ sceneId: String(body.sceneId ?? ""), chapterId: String(body.chapterId ?? ""), narrativeFunction: String(body.narrativeFunction ?? ""), characterFunction: String(body.characterFunction ?? ""), conflict: String(body.conflict ?? ""), change: String(body.change ?? ""), informationRelease: String(body.informationRelease ?? ""), emotionalShift: String(body.emotionalShift ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ scene, validation: validateSceneCreation(scene) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-pattern-library", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const categories = ["opening-pressure", "choice-cost", "information-gap", "dialogue-subtext", "character-arc", "combat-feedback", "daily-life"] as const;
    const category = categories.includes(body.category) ? body.category : "choice-cost";
    const pattern = createCraftPatternLibrary({ patternId: String(body.patternId ?? ""), name: String(body.name ?? ""), category, purpose: String(body.purpose ?? ""), observableMoves: Array.isArray(body.observableMoves) ? body.observableMoves.map(String) : [], transferContexts: Array.isArray(body.transferContexts) ? body.transferContexts.map(String) : [], forbiddenImitationFeatures: Array.isArray(body.forbiddenImitationFeatures) ? body.forbiddenImitationFeatures.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ pattern, validation: validateCraftPattern(pattern) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/writing-candidates", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const set = createWritingCandidateSet({ setId: String(body.setId ?? ""), sceneId: String(body.sceneId ?? ""), candidates: Array.isArray(body.candidates) ? body.candidates : [], selectionCriteria: Array.isArray(body.selectionCriteria) ? body.selectionCriteria.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ set });
  }));

  app.post("/api/novel/projects/:projectId/runtime/writing-candidates/:setId/select", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const set = body.set; if (!set || set.setId !== req.params.setId) return res.status(404).json({ error: "WRITING_CANDIDATE_SET_NOT_FOUND" });
    res.status(201).json({ selection: selectWritingCandidate(set, { candidateId: String(body.candidateId ?? ""), rationale: String(body.rationale ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/directed-rewrites", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const rewrite = createDirectedRewrite({ rewriteId: String(body.rewriteId ?? ""), sourceCandidateId: String(body.sourceCandidateId ?? ""), original: String(body.original ?? ""), directives: Array.isArray(body.directives) ? body.directives.map(String) : [], protectedAnchors: Array.isArray(body.protectedAnchors) ? body.protectedAnchors.map(String) : [], changedSegments: Array.isArray(body.changedSegments) ? body.changedSegments : [], rationale: String(body.rationale ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ rewrite, validation: validateDirectedRewrite(rewrite) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/chapter-creation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const chapter = createChapterCreationContract({ chapterId: String(body.chapterId ?? ""), volumeId: String(body.volumeId ?? ""), chapterFunction: String(body.chapterFunction ?? ""), sceneIds: Array.isArray(body.sceneIds) ? body.sceneIds.map(String) : [], entryState: String(body.entryState ?? ""), exitState: String(body.exitState ?? ""), obligations: Array.isArray(body.obligations) ? body.obligations.map(String) : [], targetLength: { min: Number(body.targetLength?.min ?? 0), max: Number(body.targetLength?.max ?? 0) }, stopConditions: Array.isArray(body.stopConditions) ? body.stopConditions.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ chapter, validation: validateChapterCreation(chapter) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/writing-priority", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = resolveWritingPriority({ requestId: String(body.requestId ?? ""), layers: body.layers ?? {}, sceneMode: String(body.sceneMode ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/voice-blind-tests", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = evaluateVoiceBlindTest({ testId: String(body.testId ?? ""), utteranceId: String(body.utteranceId ?? ""), candidates: Array.isArray(body.candidates) ? body.candidates : [], expectedCharacterId: String(body.expectedCharacterId ?? ""), distinguishingEvidence: Array.isArray(body.distinguishingEvidence) ? body.distinguishingEvidence.map(String) : [], profileVersion: String(body.profileVersion ?? ""), arcChangeEvidenceRefs: Array.isArray(body.arcChangeEvidenceRefs) ? body.arcChangeEvidenceRefs.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/pov-knowledge-gates", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const distances = ["first-person", "close-third", "limited-third", "omniscient"] as const;
    const narrativeDistance = distances.includes(body.narrativeDistance) ? body.narrativeDistance : "close-third";
    const result = evaluatePovKnowledgeGate({ gateId: String(body.gateId ?? ""), sceneId: String(body.sceneId ?? ""), povCharacterId: String(body.povCharacterId ?? ""), narrativeDistance, knownFacts: Array.isArray(body.knownFacts) ? body.knownFacts.map(String) : [], unknownFacts: Array.isArray(body.unknownFacts) ? body.unknownFacts.map(String) : [], misbeliefs: Array.isArray(body.misbeliefs) ? body.misbeliefs.map(String) : [], claims: Array.isArray(body.claims) ? body.claims : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/chapter-continuity", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const intent = createChapterIntent({ chapterId: String(body.chapterId ?? ""), sceneIds: Array.isArray(body.sceneIds) ? body.sceneIds.map(String) : [], goal: String(body.goal ?? ""), entryState: String(body.entryState ?? ""), exitState: String(body.exitState ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    const result = validateChapterContinuity(intent, Array.isArray(body.segments) ? body.segments : []);
    res.status(201).json({ intent, result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/long-chapter/checkpoints", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const checkpoint = createLongChapterCheckpoint({ runId: String(body.runId ?? ""), chapterId: String(body.chapterId ?? ""), contextVersion: String(body.contextVersion ?? ""), completedSceneIds: Array.isArray(body.completedSceneIds) ? body.completedSceneIds.map(String) : [], nextSceneId: String(body.nextSceneId ?? ""), checkpointText: String(body.checkpointText ?? ""), unfinishedGoals: Array.isArray(body.unfinishedGoals) ? body.unfinishedGoals.map(String) : [], naturalBoundary: body.naturalBoundary === "chapter-end" ? "chapter-end" : "scene-end", sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ checkpoint });
  }));

  app.post("/api/novel/projects/:projectId/runtime/long-chapter/checkpoints/resume", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ resume: resumeLongChapter(req.body?.checkpoint, { contextVersion: String(req.body?.contextVersion ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/author-paragraph-locks/evaluate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = evaluateAuthorParagraphLocks({ lockSetId: String(body.lockSetId ?? ""), paragraphId: String(body.paragraphId ?? ""), authorText: String(body.authorText ?? ""), candidateText: String(body.candidateText ?? ""), locks: Array.isArray(body.locks) ? body.locks : [], authorEditedAt: String(body.authorEditedAt ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/cross-chapter-template", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const report = evaluateCrossChapterTemplate({ reportId: String(body.reportId ?? ""), chapters: Array.isArray(body.chapters) ? body.chapters : [], intentionalVariations: Array.isArray(body.intentionalVariations) ? body.intentionalVariations : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ report });
  }));

  app.post("/api/novel/projects/:projectId/runtime/local-repair-plans", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const operations = ["replace-span", "insert-sentence", "delete-span", "rewrite-paragraph", "rewrite-chapter"] as const;
    const operation = operations.includes(body.operation) ? body.operation : "replace-span";
    const scopes = ["sentence", "paragraph", "scene", "chapter"] as const;
    const maxScope = scopes.includes(body.maxScope) ? body.maxScope : "paragraph";
    const plan = createLocalRepairPlan({ planId: String(body.planId ?? ""), documentId: String(body.documentId ?? ""), issueId: String(body.issueId ?? ""), issueCode: String(body.issueCode ?? ""), span: body.span ?? { start: 0, end: 0, text: "" }, operation, replacement: String(body.replacement ?? ""), preserveContext: Array.isArray(body.preserveContext) ? body.preserveContext.map(String) : [], maxScope, authorAuthorization: typeof body.authorAuthorization === "string" ? body.authorAuthorization : undefined, authorEvidenceRefs: Array.isArray(body.authorEvidenceRefs) ? body.authorEvidenceRefs.map(String) : [] });
    res.status(201).json({ plan, validation: validateLocalRepairPlan(plan) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/candidate-compositions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const composition = composeWritingCandidates({ compositionId: String(body.compositionId ?? ""), sceneId: String(body.sceneId ?? ""), segments: Array.isArray(body.segments) ? body.segments : [], conflicts: Array.isArray(body.conflicts) ? body.conflicts : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ composition });
  }));

  app.post("/api/novel/projects/:projectId/runtime/writing-stop-evaluations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = evaluateWritingStopCondition({ evaluationId: String(body.evaluationId ?? ""), workItemId: String(body.workItemId ?? ""), obligations: Array.isArray(body.obligations) ? body.obligations : [], qualityGates: Array.isArray(body.qualityGates) ? body.qualityGates : [], unresolvedRisks: Array.isArray(body.unresolvedRisks) ? body.unresolvedRisks : [], budget: { used: Number(body.budget?.used ?? 0), max: Number(body.budget?.max ?? 0) }, authorInstruction: String(body.authorInstruction ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-generation-manifests", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const manifest = createProseGenerationManifest({ manifestId: String(body.manifestId ?? ""), storyContractRef: String(body.storyContractRef ?? ""), outlineVersion: String(body.outlineVersion ?? ""), chapterIntentRef: String(body.chapterIntentRef ?? ""), sceneCardRefs: Array.isArray(body.sceneCardRefs) ? body.sceneCardRefs.map(String) : [], characterStateRefs: Array.isArray(body.characterStateRefs) ? body.characterStateRefs.map(String) : [], povStateRef: String(body.povStateRef ?? ""), obligationRefs: Array.isArray(body.obligationRefs) ? body.obligationRefs.map(String) : [], authorLockRefs: Array.isArray(body.authorLockRefs) ? body.authorLockRefs.map(String) : [], craftPatternRefs: Array.isArray(body.craftPatternRefs) ? body.craftPatternRefs.map(String) : [], latestAuthorDirection: String(body.latestAuthorDirection ?? ""), proseBaselineRef: String(body.proseBaselineRef ?? ""), planningHorizonRef: String(body.planningHorizonRef ?? ""), contextManifestRef: String(body.contextManifestRef ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ manifest });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-generation-manifests/:manifestId/freshness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const manifest = req.body?.manifest; res.json({ status: evaluateProseCandidateFreshness(manifest, String(req.body?.candidateManifestFingerprint ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/intent-drafts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const draft = createIntentDraft({ draftId: String(body.draftId ?? ""), rawInput: String(body.rawInput ?? ""), items: Array.isArray(body.items) ? body.items : [] });
    res.status(201).json({ draft });
  }));

  app.post("/api/novel/projects/:projectId/runtime/question-value-gates", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const result = evaluateQuestionValue({ questionId: String(body.questionId ?? ""), text: String(body.text ?? ""), impact: Number(body.impact ?? 0), uncertainty: Number(body.uncertainty ?? 0), irreversibility: Number(body.irreversibility ?? 0), urgency: Number(body.urgency ?? 0), userEffort: Number(body.userEffort ?? 0), affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets.map(String) : [], recommendation: String(body.recommendation ?? ""), reversible: body.reversible === true, threshold: Number(body.threshold ?? 0.2) });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/question-sessions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const session = createQuestionSession({ projectId: project.slug, questions: Array.isArray(req.body?.questions) ? req.body.questions : [] });
    res.status(201).json({ session });
  }));

  app.post("/api/novel/projects/:projectId/runtime/question-sessions/:questionId/classify", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const question = req.body?.question; if (!question || question.questionId !== req.params.questionId) return res.status(404).json({ error: "QUESTION_NOT_FOUND" });
    res.json({ answer: classifyQuestionAnswer(question, String(req.body?.text ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/collaboration-messages/parse", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ result: parseCollaborationMessage(String(req.body?.text ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/question-governance", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const governance = createQuestionGovernance({ projectId: project.slug, maxBlockingQuestions: Number(body.maxBlockingQuestions ?? 3), policy: body.policy ?? { decideForMe: [], alwaysAsk: [], askLess: false } });
    res.status(201).json({ governance });
  }));

  app.post("/api/novel/projects/:projectId/runtime/question-governance/register", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ governance: registerQuestion(req.body?.governance, req.body?.question) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/question-governance/policy", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ governance: updateCollaborationPolicy(req.body?.governance, req.body?.policy) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/collaboration-progress", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ progress: createCollaborationProgress({ understood: Array.isArray(body.understood) ? body.understood.map(String) : [], progressing: Array.isArray(body.progressing) ? body.progressing.map(String) : [], changedAssets: Array.isArray(body.changedAssets) ? body.changedAssets.map(String) : [], risks: Array.isArray(body.risks) ? body.risks.map(String) : [], nextAutoAction: String(body.nextAutoAction ?? ""), authorDecisionNeeded: Array.isArray(body.authorDecisionNeeded) ? body.authorDecisionNeeded.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/intent-corrections", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ correction: createIntentCorrection({ correctionId: String(body.correctionId ?? ""), priorInterpretation: String(body.priorInterpretation ?? ""), correctedInterpretation: String(body.correctedInterpretation ?? ""), affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets.map(String) : [], recommendation: String(body.recommendation ?? ""), status: body.status === "accepted" ? "accepted" : "proposed" }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/intent-corrections/propagate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const correction = body.correction;
    if (!correction || typeof correction !== "object") return res.status(400).json({ error: "INTENT_CORRECTION_REQUIRED" });
    const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is { id: string; affectedAssets: string[]; status: string } => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && Array.isArray((item as { affectedAssets?: unknown }).affectedAssets) && typeof (item as { status?: unknown }).status === "string")).map((item) => ({ id: item.id, affectedAssets: item.affectedAssets.map(String), status: item.status })) : [];
    res.json({ propagation: propagateIntentCorrection(correction, { understanding: list(body.understanding), questions: list(body.questions), plans: list(body.plans), candidates: list(body.candidates), tasks: list(body.tasks), patches: list(body.patches) }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/exploratory-drafts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ draft: createExploratoryDraft({ draftId: String(body.draftId ?? ""), text: String(body.text ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/capture", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ utterance: captureAuthorUtterance({ projectId: project.slug, text: String(body.text ?? ""), idempotencyKey: String(body.idempotencyKey ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/frame", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ frame: buildStorySeedFrame({ utterance: body.utterance, facets: Array.isArray(body.facets) ? body.facets : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/interpretations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ interpretationSet: createSeedInterpretationSet({ frame: body.frame, interpretations: Array.isArray(body.interpretations) ? body.interpretations : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/explorations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ exploration: createSafeSeedExploration({ interpretationIds: Array.isArray(body.interpretationIds) ? body.interpretationIds.map(String) : [], scope: String(body.scope ?? ""), invalidationConditions: Array.isArray(body.invalidationConditions) ? body.invalidationConditions.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/readiness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ readiness: evaluateStoryContractReadiness({ target: String(body.target ?? ""), facets: body.facets ?? {} }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/confidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ confidence: assessSeedConfidence({ facets: Array.isArray(body.facets) ? body.facets : [], conflicts: Array.isArray(body.conflicts) ? body.conflicts.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/reversible-defaults", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ default: applyReversibleDefault({ field: String(body.field ?? ""), value: String(body.value ?? ""), source: String(body.source ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/branch-questions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ question: evaluateSeedBranchQuestion({ questionId: String(body.questionId ?? ""), answers: Array.isArray(body.answers) ? body.answers : [], ignoredQuestions: Array.isArray(body.ignoredQuestions) ? body.ignoredQuestions.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/candidates", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ candidates: createSeedContractCandidates({ sharedFacts: Array.isArray(body.sharedFacts) ? body.sharedFacts.map(String) : [], candidates: Array.isArray(body.candidates) ? body.candidates : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/adoption", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ adoption: adoptSeedFields({ existing: Array.isArray(body.existing) ? body.existing : [], decisions: Array.isArray(body.decisions) ? body.decisions : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/recompile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ recompile: recompileSeedIncrementally({ fields: Array.isArray(body.fields) ? body.fields : [], changedFields: Array.isArray(body.changedFields) ? body.changedFields.map(String) : [], dependencyMap: body.dependencyMap ?? {} }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/state", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ state: createSeedCompilationState({ projectId: project.slug, status: body.status, stableUnderstandingFingerprint: typeof body.stableUnderstandingFingerprint === "string" ? body.stableUnderstandingFingerprint : undefined }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/state/failure", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ state: recordSeedCompilationFailure(req.body?.state, req.body?.failure) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/legacy-shadow", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ shadow: compileLegacySeedShadow({ projectId: project.slug, materials: Array.isArray(req.body?.materials) ? req.body.materials : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/replay", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ replay: replaySeedCompilation({ compilerVersion: String(req.body?.compilerVersion ?? ""), inputFingerprint: String(req.body?.inputFingerprint ?? ""), output: req.body?.output }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/readiness-proof", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ proof: createStoryContractReadinessProof({ target: String(body.target ?? ""), requiredFields: Array.isArray(body.requiredFields) ? body.requiredFields.map(String) : [], evidenceCovered: Array.isArray(body.evidenceCovered) ? body.evidenceCovered.map(String) : [], unresolved: Array.isArray(body.unresolved) ? body.unresolved.map(String) : [], provisionalAssumptions: Array.isArray(body.provisionalAssumptions) ? body.provisionalAssumptions.map(String) : [], authorAdopted: Array.isArray(body.authorAdopted) ? body.authorAdopted.map(String) : [], conflicts: Array.isArray(body.conflicts) ? body.conflicts.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/utterances", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ utterance: createDialogueUtterance({ projectId: project.slug, sessionId: String(body.sessionId ?? ""), turn: Number(body.turn ?? 0), authorId: String(body.authorId ?? ""), text: String(body.text ?? ""), clientTimestamp: String(body.clientTimestamp ?? ""), language: String(body.language ?? ""), attachmentRefs: Array.isArray(body.attachmentRefs) ? body.attachmentRefs.map(String) : [], idempotencyKey: String(body.idempotencyKey ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/intents", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ atoms: atomizeIntent({ utteranceId: String(req.body?.utteranceId ?? ""), text: String(req.body?.text ?? ""), atoms: Array.isArray(req.body?.atoms) ? req.body.atoms : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/understanding-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ snapshot: createUnderstandingSnapshot({ snapshotId: String(body.snapshotId ?? ""), sourceUtteranceIds: Array.isArray(body.sourceUtteranceIds) ? body.sourceUtteranceIds.map(String) : [], explicit: Array.isArray(body.explicit) ? body.explicit.map(String) : [], inferred: Array.isArray(body.inferred) ? body.inferred.map(String) : [], provisional: Array.isArray(body.provisional) ? body.provisional.map(String) : [], unknown: Array.isArray(body.unknown) ? body.unknown.map(String) : [], conflicted: Array.isArray(body.conflicted) ? body.conflicted.map(String) : [], nextAction: String(body.nextAction ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/understanding-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ evidence: evaluateUnderstandingEvidence({ status: body.status, confidence: Number(body.confidence ?? 0), supportingEvidence: Array.isArray(body.supportingEvidence) ? body.supportingEvidence.map(String) : [], opposingEvidence: Array.isArray(body.opposingEvidence) ? body.opposingEvidence.map(String) : [], interpreterVersion: String(body.interpreterVersion ?? ""), alternatives: Array.isArray(body.alternatives) ? body.alternatives.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/question-ranking", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ ranking: rankDialogueQuestions(Array.isArray(req.body?.questions) ? req.body.questions : []) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/non-leading-question", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ question: renderNonLeadingQuestion({ questionId: String(body.questionId ?? ""), knownEvidence: Array.isArray(body.knownEvidence) ? body.knownEvidence.map(String) : [], whyNow: String(body.whyNow ?? ""), options: Array.isArray(body.options) ? body.options : [], recommendation: String(body.recommendation ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/provisional-assumptions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ assumption: createProvisionalAssumption(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/delegation-grants", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ grant: createDelegationGrant(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/answer-classification", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ answer: classifyDialogueAnswer({ questionId: String(req.body?.questionId ?? ""), text: String(req.body?.text ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/answer-application", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ application: applyDialogueAnswerSegments({ openQuestions: Array.isArray(req.body?.openQuestions) ? req.body.openQuestions : [], segments: Array.isArray(req.body?.segments) ? req.body.segments : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/preference-probes", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ probe: createPreferenceProbe(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/memory", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ memory: compressDialogueMemory(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/preference-probes/select", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ selection: createPreferenceProbeSelection({ probe: body.probe, selectedVariantId: String(body.selectedVariantId ?? ""), reason: String(body.reason ?? ""), scope: body.scope, validationContexts: Array.isArray(body.validationContexts) ? body.validationContexts.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/preference-probes/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ selection: acceptPreferenceProbeSelection(req.body?.selection, { action: "revoke", reason: String(req.body?.reason ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/memory-records", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ memory: createDialogueMemoryRecord({ ...(req.body ?? {}), projectSlug: project.slug, sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.map(String) : [], derivedCanonRefs: Array.isArray(req.body?.derivedCanonRefs) ? req.body.derivedCanonRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/memory-records/revise", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ memory: reviseDialogueMemory(req.body?.memory, { correctedContent: String(req.body?.correctedContent ?? ""), correctionRef: String(req.body?.correctionRef ?? ""), reason: String(req.body?.reason ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/memory-records/forget", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ memory: forgetDialogueMemory(req.body?.memory, String(req.body?.reason ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/misunderstanding-incidents", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ incident: createMisunderstandingIncidentRecord({ incidentId: String(body.incidentId ?? ""), projectSlug: project.slug, signal: body.signal, errorLayer: body.errorLayer, priorInterpretation: String(body.priorInterpretation ?? ""), correctedInterpretation: String(body.correctedInterpretation ?? ""), affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets.map(String) : [], repairPlan: String(body.repairPlan ?? ""), regressionCase: String(body.regressionCase ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/misunderstanding-incidents/resolve", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ incident: resolveMisunderstandingIncident(req.body?.incident, { repairEvidence: Array.isArray(req.body?.repairEvidence) ? req.body.repairEvidence.map(String) : [], regressionResult: String(req.body?.regressionResult ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/runtime-interruptions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ interruption: classifyRuntimeInterruption({ messageId: String(req.body?.messageId ?? ""), taskId: String(req.body?.taskId ?? ""), text: String(req.body?.text ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/runtime-interruptions/advance", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ interruption: advanceRuntimeInterruption(req.body?.interruption, req.body?.target, String(req.body?.reason ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/recovery", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(200).json({ recovery: reconcileDialogueSession({ serverCursor: Number(body.serverCursor ?? 0), localCursor: Number(body.localCursor ?? 0), authoritativeEvents: Array.isArray(body.authoritativeEvents) ? body.authoritativeEvents.map(String) : [], activeQuestionId: typeof body.activeQuestionId === "string" ? body.activeQuestionId : undefined, localDraftMessageId: typeof body.localDraftMessageId === "string" ? body.localDraftMessageId : undefined }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/setup-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ evidence: createSetupEvidence({ obligationId: String(body.obligationId ?? ""), manuscriptVersion: String(body.manuscriptVersion ?? ""), start: Number(body.start ?? -1), end: Number(body.end ?? 0), visibleText: String(body.visibleText ?? ""), narrativeFunction: String(body.narrativeFunction ?? ""), salience: body.salience ?? {} }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/knowledge-boundary", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ boundary: createObligationKnowledgeBoundary(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/payoff-contract", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ contract: createPayoffContract(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/payoff-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ result: evaluatePayoffEvidence({ contract: body.contract, setupRefs: Array.isArray(body.setupRefs) ? body.setupRefs.map(String) : [], reminderRefs: Array.isArray(body.reminderRefs) ? body.reminderRefs.map(String) : [], payoffRef: String(body.payoffRef ?? ""), semanticReason: String(body.semanticReason ?? ""), confidence: Number(body.confidence ?? 0), observableChanges: Array.isArray(body.observableChanges) ? body.observableChanges.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/partial-payoff", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ payoff: recordPartialPayoff(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/transform", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ transformation: transformObligation(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/merge-proposal", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ proposal: proposeObligationMerge(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/conflicts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ conflict: detectObligationConflict(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/source-coverage", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ coverage: assessObligationSourceCoverage(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/window", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ window: evaluateObligationWindow(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/repair-plan", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ plan: planObligationRepair(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/intentional-open", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ open: authorizeIntentionalOpen(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/visibility", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ projection: projectObligationVisibility(req.body?.obligation ?? {}, req.body?.role) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/editor-markers", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ markers: createObligationEditorMarkers(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/publication-freeze", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ publication: freezeObligationPublication(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/completion-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateObligationCompletionGate(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/legacy-migration", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ migration: migrateLegacyObligations(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/admission", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ admission: admitNarrativeObligation(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/reader-expectation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ expectation: calibrateReaderExpectation(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/hypothesis-graphs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ graph: createHypothesisGraph(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/clue-claims", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ claim: createClueClaim(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/clue-independence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ independence: validateClueIndependence({ claims: Array.isArray(req.body?.claims) ? req.body.claims : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/fairness-bundles", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ bundle: createFairnessBundle(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/schedules", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ schedule: createClosureSchedule(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/payoff-reservations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ reservation: reservePayoffCapacity(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/adaptive-reminders", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ reminder: planAdaptiveReminder(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/exposure-risk", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ risk: detectExposureRisk(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/scene-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ contract: createClosureSceneContract(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/closure/outcomes", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ outcome: propagateClosureOutcome(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ contract: createReaderExperienceContract(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/hypotheses", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ hypothesis: createReaderExperienceHypothesis(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/cold-read-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ snapshot: createColdReadSnapshot(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/knowledge-states", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ state: createReaderKnowledgeState(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/cognitive-load", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ load: assessReaderCognitiveLoad(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/payoffs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ payoff: evaluateReaderPayoff(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/scene-necessity", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ assessment: assessSceneNecessity(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/surprise-fairness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ assessment: evaluateSurpriseFairness(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/timelines", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ timeline: createExperienceTimeline({ projectId: project.slug, windows: Array.isArray(req.body?.windows) ? req.body.windows : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/divergence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ divergence: preserveReaderDivergence({ claims: Array.isArray(req.body?.claims) ? req.body.claims : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/reviewers", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ reviewer: calibrateReaderReviewer(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/reader/dossiers", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ dossier: createReaderExperienceDossier(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/obligations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ obligation: identifyResearchObligation(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/source-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ source: createResearchSourceSnapshot(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/claims", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ claim: createResearchClaim(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/consumption-receipts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ receipt: createResearchConsumptionReceipt(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/settlements", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ settlement: settleResearchClaim(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/text/profiles", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ profile: createTextProfile(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/text/structures", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ structure: parseTextStructure({ profile: String(req.body?.profile ?? ""), version: String(req.body?.version ?? ""), text: String(req.body?.text ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/text/diagnostics", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ diagnostic: createTextDiagnostic(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/text/settlements", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ settlement: settleTextRoundTrip(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/durability/backup-policy", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ policy: createBackupPolicy(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/durability/backup-verification", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ verification: createBackupVerification(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/durability/restore-plans", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ plan: createRestorePlan(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/durability/recovery-settlements", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ settlement: settleRecovery(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ foreshadowing: createForeshadowing({ ...(req.body ?? {}), projectId: project.slug }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/transition", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ foreshadowing: transitionForeshadowing(req.body?.item, req.body?.to, String(req.body?.reason ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ foreshadowing: recordForeshadowingEvidence(req.body?.item, req.body?.evidence) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/false-clue-fairness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ fairness: createFalseClueFairness(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/transform", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ transformation: transformForeshadowing(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/conflicts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ conflict: detectForeshadowingConflict(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/windows", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ window: evaluateForeshadowingWindow(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/repair-plans", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ plan: planForeshadowingRepair(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/waivers", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ waiver: authorizeForeshadowingWaiver(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/visibility", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ projection: projectForeshadowingVisibility(req.body?.item ?? {}, req.body?.role) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/publication-freeze", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ publication: freezeForeshadowingPublication(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/legacy-migration", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ migration: migrateLegacyForeshadowing(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/delivery/capability-manifest", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ manifest: createProjectCapabilityManifest({ ...(req.body ?? {}), projectId: project.slug }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/delivery/dependency-proof", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ proof: createCapabilityDependencyProof(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/delivery/requirement-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ link: createRequirementEvidenceLink(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/delivery/write-authority", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ authority: enforceSingleWriteAuthority(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/proof", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ proof: createKernelProof(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/mutation-validation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ validation: validateMutationPlan(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/candidate-boundary", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ boundary: createCandidateBoundary(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/obligation-core", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ proof: createObligationCoreProof(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/ai-safety", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: createAISafetyGate(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/long-memory", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ proof: createLongMemoryProof(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/suites", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ suite: createEvaluationSuite(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/frozen-inputs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ input: freezeEvaluationInput(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/blind-pairs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ pair: createBlindPair(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/calibrations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ calibration: calibrateEvaluator(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/contamination", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ contamination: detectEvaluationContamination(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/drift", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ drift: monitorEvaluatorDrift(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/release-decisions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ decision: createReleaseDecision(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/surfaces/registry", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const registry = body.registry && typeof body.registry === "object" ? body.registry : createSurfaceCapabilityRegistry(project.slug);
    const result = registerSurfaceCapability(registry, body.capability ?? {});
    res.status(201).json(result);
  }));

  app.post("/api/novel/projects/:projectId/runtime/surfaces/authorize", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ authorization: authorizeSurfaceCommand(body.registry ?? createSurfaceCapabilityRegistry(project.slug), body.request ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/command-receipts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ receipt: createAuthorCommandReceipt({ ...(body.receipt ?? body), projectSlug: project.slug }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/command-receipts/authorize", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ authorization: authorizeReceiptAction(req.body?.receipt, String(req.body?.action ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/continuity-token", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ token: createWorkspaceContinuityToken({ ...(req.body ?? {}), projectSlug: project.slug }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/continuity-token/reconcile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ reconciliation: reconcileWorkspaceContinuity(req.body?.token, req.body?.current ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/primary-action", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ decision: createPrimaryActionDecision(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/primary-action/validate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ validation: validatePrimaryActionSubmission(req.body?.decision, req.body?.submission ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/primary-action/advance", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ decision: advancePrimaryAction(req.body?.decision, req.body?.next) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/effort-budget", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const budget = createAuthorEffortBudget({ projectSlug: project.slug, phase: req.body?.phase === "writing" || req.body?.phase === "audit" ? req.body.phase : "exploration" });
    await writeAuthorEffortBudget(projectRoot(project.slug), budget);
    res.status(201).json({ budget });
  }));

  app.get("/api/novel/projects/:projectId/runtime/session/effort-budget", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const budget = await readAuthorEffortBudget(projectRoot(project.slug));
    if (!budget) return res.status(404).json({ error: "EFFORT_BUDGET_NOT_FOUND" });
    res.json({ budget });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/effort-budget/preference", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const current = req.body?.budget ?? await readAuthorEffortBudget(projectRoot(project.slug));
    if (!current) return res.status(404).json({ error: "EFFORT_BUDGET_NOT_FOUND" });
    const budget = applyAuthorEffortPreference(current, req.body?.preference === "more-detail" ? "more-detail" : "less-questioning");
    await writeAuthorEffortBudget(projectRoot(project.slug), budget);
    res.json({ budget });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/effort-budget/consume", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const current = req.body?.budget ?? await readAuthorEffortBudget(projectRoot(project.slug));
    if (!current) return res.status(404).json({ error: "EFFORT_BUDGET_NOT_FOUND" });
    const result = consumeAuthorEffort(current, req.body?.usage ?? {});
    if (result.status === "allowed") await writeAuthorEffortBudget(projectRoot(project.slug), result.budget);
    res.json(result);
  }));

  app.get("/api/novel/projects/:projectId/runtime/session/model-invocations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ records: await readModelInvocations(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-invocations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const record = createModelInvocationRecord({ ...body, usage: body.usage ?? {}, cost: body.cost ?? {}, cache: body.cache ?? { hit: false } });
    await appendModelInvocation(projectRoot(project.slug), record);
    res.status(201).json({ record });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-invocations/budget-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateInvocationBudget({ hardLimit: Number(req.body?.hardLimit), committed: Number(req.body?.committed), reserved: Number(req.body?.reserved), nextEstimate: Number(req.body?.nextEstimate) }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-route", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ decision: routeModelCapability({ taskType: String(body.taskType ?? ""), impact: body.impact, requiredCapabilityTier: body.requiredCapabilityTier, authorPreference: body.authorPreference, estimatedCost: Number(body.estimatedCost), remainingBudget: Number(body.remainingBudget), capabilities: Array.isArray(body.capabilities) ? body.capabilities : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/independent-review-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateIndependentReviewGate({ taskId: String(body.taskId ?? ""), inputFingerprint: String(body.inputFingerprint ?? ""), generatorInvocationId: String(body.generatorInvocationId ?? ""), evaluatorInvocationId: String(body.evaluatorInvocationId ?? ""), evaluatorModelCapabilityRef: String(body.evaluatorModelCapabilityRef ?? ""), generatorModelCapabilityRef: String(body.generatorModelCapabilityRef ?? ""), firstOutputVisibility: body.firstOutputVisibility, hardGuardsPassed: body.hardGuardsPassed === true, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/decision-bundles", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ bundle: createDecisionBundle({ bundleId: String(body.bundleId ?? ""), items: Array.isArray(body.items) ? body.items : [], recommendation: String(body.recommendation ?? ""), strongestCounterargument: String(body.strongestCounterargument ?? ""), nearTermOutcome: String(body.nearTermOutcome ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/decision-bundles/accept", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ bundle: acceptDecisionBundle(req.body?.bundle) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/debate-decisions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ decision: createDebateDecision({ ...body, affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [], disagreements: Array.isArray(body.disagreements) ? body.disagreements : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/debate-decisions/accept", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ decision: acceptDebateDecision(body.decision, body.approval) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/decision-escalations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ escalation: createDecisionEscalation({ ...(req.body ?? {}), projectSlug: project.slug }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/autonomy-receipts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ receipt: createAutonomyReceipt({ ...(req.body ?? {}), projectSlug: project.slug }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/autonomy-receipts/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ receipt: revokeAutonomyReceipt(req.body?.receipt, String(req.body?.phrase ?? "")) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/timeout", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ decision: evaluateDialogueTimeout({ questionId: String(body.questionId ?? ""), elapsedMs: Number(body.elapsedMs ?? 0), timeoutMs: Number(body.timeoutMs ?? 0), impact: body.impact === "high" || body.impact === "medium" ? body.impact : "low", pendingWrite: body.pendingWrite === true, validDelegation: body.validDelegation === true }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/runs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ run: createSeedCompilationRun({ projectSlug: project.slug, idempotencyKey: String(body.idempotencyKey ?? ""), inputFingerprint: String(body.inputFingerprint ?? ""), compilerVersion: String(body.compilerVersion ?? ""), sourceMessageIds: Array.isArray(body.sourceMessageIds) ? body.sourceMessageIds.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/runs/transition", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ run: transitionSeedCompilationRun(req.body?.run, req.body?.next, req.body?.input ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/runs/replay", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ replay: replaySeedCompilationRun(req.body?.run, req.body?.input ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-time-events", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const categories = ["event", "journey", "training", "healing", "manufacture", "communication", "cooldown", "institutional-response", "other"] as const;
    const category = categories.includes(body.category) ? body.category : "other";
    const event = await createStoryTimeEvent({ root: projectRoot(project.slug), projectSlug: project.slug, eventId: String(body.eventId ?? ""), label: String(body.label ?? ""), timelineId: String(body.timelineId ?? ""), category, start: String(body.start ?? ""), end: String(body.end ?? ""), duration: String(body.duration ?? ""), uncertainty: body.uncertainty === "approximate" || body.uncertainty === "unknown" ? body.uncertainty : "exact", parallelLine: String(body.parallelLine ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ event });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-time-events", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ events: await listStoryTimeEvents(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-time-events/:eventId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const event = await readStoryTimeEvent(projectRoot(project.slug), req.params.eventId);
    if (!event || event.projectSlug !== project.slug) return res.status(404).json({ error: "STORY_TIME_EVENT_NOT_FOUND" }); res.json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-time-events/compare", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const left = await readStoryTimeEvent(projectRoot(project.slug), String(req.body?.leftEventId ?? "")); const right = await readStoryTimeEvent(projectRoot(project.slug), String(req.body?.rightEventId ?? ""));
    if (!left || !right || left.projectSlug !== project.slug || right.projectSlug !== project.slug) return res.status(404).json({ error: "STORY_TIME_EVENT_NOT_FOUND" }); res.json({ relation: compareStoryTime(left, right) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/causality-edges", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const edge = await createCausalityEdge({ root: projectRoot(project.slug), projectSlug: project.slug, edgeId: String(body.edgeId ?? ""), sourceNodeId: String(body.sourceNodeId ?? ""), targetNodeId: String(body.targetNodeId ?? ""), relation: body.relation, trigger: String(body.trigger ?? ""), consequence: String(body.consequence ?? ""), delayedConsequence: String(body.delayedConsequence ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ edge });
  }));

  app.get("/api/novel/projects/:projectId/runtime/causality-edges", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ edges: await listCausalityEdges(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/causality-edges/:edgeId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const edge = await readCausalityEdge(projectRoot(project.slug), req.params.edgeId);
    if (!edge || edge.projectSlug !== project.slug) return res.status(404).json({ error: "CAUSALITY_EDGE_NOT_FOUND" }); res.json({ edge });
  }));

  app.get("/api/novel/projects/:projectId/runtime/causality-graph/validation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ report: await validateCausalityGraph(projectRoot(project.slug), project.slug) });
  }));
  app.get("/api/novel/projects/:projectId/runtime/structure-validation", asyncRoute(async (req, res) => {
    const project = await requireProject(req, res); if (!project) return;
    res.json(await validateNarrativeStructure(project.rootPath, project.slug));
  }));
  app.post("/api/novel/projects/:projectId/runtime/semantic-nodes", asyncRoute(async (req, res) => {
    const project = await requireProject(req, res); if (!project) return;
    res.status(201).json(await createSemanticNode({ root: project.rootPath, projectSlug: project.slug, semanticId: String(req.body.semanticId || ""), kind: req.body.kind, label: String(req.body.label || ""), displayChapter: String(req.body.displayChapter || ""), parentId: req.body.parentId ?? null, sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [] }));
  }));
  app.get("/api/novel/projects/:projectId/runtime/semantic-nodes", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.json(await listSemanticNodes(project.rootPath, project.slug)); }));
  app.get("/api/novel/projects/:projectId/runtime/semantic-nodes/:semanticId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const node = await readSemanticNode(project.rootPath, req.params.semanticId); if (!node) return res.status(404).json({ error: "SEMANTIC_NODE_NOT_FOUND" }); res.json(node); }));
  app.post("/api/novel/projects/:projectId/runtime/semantic-nodes/projection", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.json(await projectSemanticNodeOrder(project.rootPath, project.slug, Array.isArray(req.body.semanticIds) ? req.body.semanticIds : [])); }));
  app.post("/api/novel/projects/:projectId/runtime/outline/impact-analyses", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.status(201).json(await createImpactAnalysis({ root: project.rootPath, projectSlug: project.slug, rootNodeIds: Array.isArray(req.body.rootNodeIds) ? req.body.rootNodeIds : [], protectedNodeIds: Array.isArray(req.body.protectedNodeIds) ? req.body.protectedNodeIds : [], reason: String(req.body.reason || ""), sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/outline/impact-analyses/:analysisId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const analysis = await readImpactAnalysis(project.rootPath, req.params.analysisId); if (!analysis) return res.status(404).json({ error: "IMPACT_ANALYSIS_NOT_FOUND" }); res.json(analysis); }));
  app.post("/api/novel/projects/:projectId/runtime/emergence-candidates", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.status(201).json(await createEmergenceCandidate({ root: project.rootPath, projectSlug: project.slug, chapterId: String(req.body.chapterId || ""), observation: String(req.body.observation || ""), emergenceType: req.body.emergenceType, level: req.body.level, competingInterpretations: Array.isArray(req.body.competingInterpretations) ? req.body.competingInterpretations : [], affectedNodeIds: Array.isArray(req.body.affectedNodeIds) ? req.body.affectedNodeIds : [], protectedNodeIds: Array.isArray(req.body.protectedNodeIds) ? req.body.protectedNodeIds : [], sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/emergence-candidates/:candidateId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const candidate = await readEmergenceCandidate(project.rootPath, req.params.candidateId); if (!candidate) return res.status(404).json({ error: "EMERGENCE_CANDIDATE_NOT_FOUND" }); res.json(candidate); }));
  app.post("/api/novel/projects/:projectId/runtime/emergence-candidates/:candidateId/adopt", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.json(await adoptEmergenceCandidate(project.rootPath, req.params.candidateId, { authorization: req.body.authorization === "author" ? "author" : "none", regressionFingerprint: String(req.body.regressionFingerprint || "") })); }));
  app.post("/api/novel/projects/:projectId/runtime/execution-ready/gate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateExecutionReadyGate({ projectSlug: project.slug, outlineVersionId: String(body.outlineVersionId || ""), nearHorizon: Array.isArray(body.nearHorizon) ? body.nearHorizon : [], arcObligationLinks: Array.isArray(body.arcObligationLinks) ? body.arcObligationLinks : [], causalReachable: body.causalReachable === true, contextComplete: body.contextComplete === true, blockingConflictsResolved: body.blockingConflictsResolved === true, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-segments", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createProseSegment({ root: project.rootPath, projectSlug: project.slug, sceneId: String(body.sceneId || ""), beatId: String(body.beatId || ""), text: String(body.text || ""), beforeText: String(body.beforeText || ""), afterText: String(body.afterText || ""), sourceCandidateId: String(body.sourceCandidateId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/prose-segments/:semanticId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const segment = await readProseSegment(project.rootPath, req.params.semanticId); if (!segment) return res.status(404).json({ error: "PROSE_SEGMENT_NOT_FOUND" }); res.json(segment); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-segments/:semanticId/patch", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await applyProseSegmentPatch(project.rootPath, req.params.semanticId, { beforeBoundaryFingerprint: String(body.beforeBoundaryFingerprint || ""), afterBoundaryFingerprint: String(body.afterBoundaryFingerprint || ""), replacementText: String(body.replacementText || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/scene-execution-ledgers", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; const sceneCard = await readSceneCardContract(project.rootPath, String(body.sceneId || "")); if (!sceneCard) return res.status(404).json({ error: "SCENE_CARD_NOT_FOUND" }); res.status(201).json(await createSceneExecutionLedger({ root: project.rootPath, sceneCard, obligationIds: Array.isArray(body.obligationIds) ? body.obligationIds : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/scene-execution-ledgers/:ledgerId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const ledger = await readSceneExecutionLedger(project.rootPath, req.params.ledgerId); if (!ledger) return res.status(404).json({ error: "SCENE_LEDGER_NOT_FOUND" }); res.json(ledger); }));
  app.post("/api/novel/projects/:projectId/runtime/scene-execution-ledgers/:ledgerId/evidence", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await appendSceneExecutionEvidence(project.rootPath, req.params.ledgerId, { kind: body.kind, value: String(body.value || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/beat-fulfillment", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createBeatFulfillmentLedger({ root: project.rootPath, projectSlug: project.slug, sceneId: String(body.sceneId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], beats: Array.isArray(body.beats) ? body.beats : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/beat-fulfillment/:ledgerId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const ledger = await readBeatFulfillmentLedger(project.rootPath, req.params.ledgerId); if (!ledger) return res.status(404).json({ error: "BEAT_LEDGER_NOT_FOUND" }); res.json(ledger); }));
  app.post("/api/novel/projects/:projectId/runtime/beat-fulfillment/:ledgerId/:beatId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await transitionBeatFulfillment(project.rootPath, req.params.ledgerId, req.params.beatId, { status: body.status, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], reason: body.reason })); }));
  app.post("/api/novel/projects/:projectId/runtime/agency-chains", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createAgencyChain({ root: project.rootPath, projectSlug: project.slug, sceneId: String(body.sceneId || ""), characterId: String(body.characterId || ""), perception: String(body.perception || ""), desire: String(body.desire || ""), availableStrategies: Array.isArray(body.availableStrategies) ? body.availableStrategies : [], actualChoice: String(body.actualChoice || ""), immediateReason: String(body.immediateReason || ""), cost: String(body.cost || ""), consequence: String(body.consequence || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], keyScene: body.keyScene !== false })); }));
  app.get("/api/novel/projects/:projectId/runtime/agency-chains/:chainId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const chain = await readAgencyChain(project.rootPath, req.params.chainId); if (!chain) return res.status(404).json({ error: "AGENCY_CHAIN_NOT_FOUND" }); res.json(chain); }));
  app.post("/api/novel/projects/:projectId/runtime/voice-consistency", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateVoiceConsistency({ characterId: String(body.characterId || ""), voiceVersion: String(body.voiceVersion || ""), previousVoiceVersion: body.previousVoiceVersion, voiceChangeMilestone: body.voiceChangeMilestone, voiceChangeEvidenceRefs: Array.isArray(body.voiceChangeEvidenceRefs) ? body.voiceChangeEvidenceRefs : [], emotion: String(body.emotion || ""), relationshipState: String(body.relationshipState || ""), powerState: String(body.powerState || ""), knowledgeBoundary: Array.isArray(body.knowledgeBoundary) ? body.knowledgeBoundary : [], utterance: String(body.utterance || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue-action", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateDialogueAction({ dialogueId: String(body.dialogueId || ""), sceneId: String(body.sceneId || ""), participants: Array.isArray(body.participants) ? body.participants : [], informationAsymmetry: Array.isArray(body.informationAsymmetry) ? body.informationAsymmetry : [], postChange: { power: String(body.postChange?.power || ""), relationship: String(body.postChange?.relationship || "") }, exchangeRefs: Array.isArray(body.exchangeRefs) ? body.exchangeRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/information-state", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createInformationStateTrace({ root: project.rootPath, projectSlug: project.slug, sceneId: String(body.sceneId || ""), povCharacterId: String(body.povCharacterId || ""), authorTruth: Array.isArray(body.authorTruth) ? body.authorTruth : [], readerKnown: Array.isArray(body.readerKnown) ? body.readerKnown : [], povKnown: Array.isArray(body.povKnown) ? body.povKnown : [], povBeliefs: Array.isArray(body.povBeliefs) ? body.povBeliefs : [], otherPrivate: Array.isArray(body.otherPrivate) ? body.otherPrivate : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/information-state/:traceId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const trace = await readInformationStateTrace(project.rootPath, req.params.traceId); if (!trace) return res.status(404).json({ error: "INFORMATION_TRACE_NOT_FOUND" }); res.json(trace); }));
  app.post("/api/novel/projects/:projectId/runtime/information-state/:traceId/events", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await appendInformationEvent(project.rootPath, req.params.traceId, { kind: body.kind, factId: String(body.factId || ""), target: body.target, inferenceBasis: Array.isArray(body.inferenceBasis) ? body.inferenceBasis : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/narrative-distance", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateNarrativeDistance({ sceneId: String(body.sceneId || ""), povCharacterId: String(body.povCharacterId || ""), declaredDistance: body.declaredDistance, allowedChanges: Array.isArray(body.allowedChanges) ? body.allowedChanges : [], segments: Array.isArray(body.segments) ? body.segments : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/emotion-causality", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateEmotionCausality({ sceneId: String(body.sceneId || ""), characterId: String(body.characterId || ""), intensity: body.intensity, trigger: String(body.trigger || ""), bodyAttention: String(body.bodyAttention || ""), interpretation: String(body.interpretation || ""), choice: String(body.choice || ""), aftermath: { character: String(body.aftermath?.character || ""), relationship: String(body.aftermath?.relationship || ""), nextAction: String(body.aftermath?.nextAction || "") }, proseEvidenceRefs: Array.isArray(body.proseEvidenceRefs) ? body.proseEvidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-specificity", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateProseSpecificity({ sceneId: String(body.sceneId || ""), blocks: Array.isArray(body.blocks) ? body.blocks : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/cognitive-budget", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateCognitiveBudget({ sceneId: String(body.sceneId || ""), budget: body.budget || { maxNewUnits: 0, maxNamedEntities: 0, maxRules: 0, maxClues: 0 }, units: Array.isArray(body.units) ? body.units : [], answerClaims: Array.isArray(body.answerClaims) ? body.answerClaims : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/micro-rhythm", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateMicroRhythm({ sceneId: String(body.sceneId || ""), paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/scene-seam", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateSceneSeam({ leftSceneId: String(body.leftSceneId || ""), rightSceneId: String(body.rightSceneId || ""), left: body.left, right: body.right, leftVerifiedBeatIds: Array.isArray(body.leftVerifiedBeatIds) ? body.leftVerifiedBeatIds : [], rightVerifiedBeatIds: Array.isArray(body.rightVerifiedBeatIds) ? body.rightVerifiedBeatIds : [], repair: body.repair || null, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/chapter-continuations", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createChapterContinuationRun({ root: project.rootPath, projectSlug: project.slug, chapterId: String(body.chapterId || ""), inputManifest: body.inputManifest, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/chapter-continuations/:runId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const run = await readChapterContinuationRun(project.rootPath, req.params.runId); if (!run) return res.status(404).json({ error: "CONTINUATION_RUN_NOT_FOUND" }); res.json(run); }));
  app.post("/api/novel/projects/:projectId/runtime/chapter-continuations/:runId/checkpoints", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await saveContinuationCheckpoint(project.rootPath, req.params.runId, { baselineTail: String(body.baselineTail || ""), fulfilledBeatIds: Array.isArray(body.fulfilledBeatIds) ? body.fulfilledBeatIds : [], pendingBeatIds: Array.isArray(body.pendingBeatIds) ? body.pendingBeatIds : [], candidateText: String(body.candidateText || ""), validationStatus: body.validationStatus, validationRefs: Array.isArray(body.validationRefs) ? body.validationRefs : [], continuationToken: String(body.continuationToken || "") })); }));
  app.post("/api/novel/projects/:projectId/runtime/chapter-continuations/:runId/resume", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.json(await resumeFromVerifiedCheckpoint(project.rootPath, req.params.runId)); }));
  app.post("/api/novel/projects/:projectId/runtime/candidate-convergence", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createCandidateConvergence({ root: project.rootPath, projectSlug: project.slug, assetId: String(body.assetId || ""), targetProblem: String(body.targetProblem || ""), stopAfterUnimproved: Number(body.stopAfterUnimproved || 3), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/candidate-convergence/:runId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const run = await readCandidateConvergence(project.rootPath, req.params.runId); if (!run) return res.status(404).json({ error: "CONVERGENCE_RUN_NOT_FOUND" }); res.json(run); }));
  app.post("/api/novel/projects/:projectId/runtime/candidate-convergence/:runId/iterations", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await recordCandidateIteration(project.rootPath, req.params.runId, { candidateId: String(body.candidateId || ""), similarityFingerprint: String(body.similarityFingerprint || ""), problemScore: Number(body.problemScore), preserved: Array.isArray(body.preserved) ? body.preserved : [], regressions: Array.isArray(body.regressions) ? body.regressions : [], authorJudgment: String(body.authorJudgment || ""), reviewVerdict: body.reviewVerdict, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/review-isolation", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createReviewIsolationSession({ root: project.rootPath, projectSlug: project.slug, candidateId: String(body.candidateId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), generatedSelfClaims: Array.isArray(body.generatedSelfClaims) ? body.generatedSelfClaims : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/review-isolation/:sessionId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const session = await readReviewIsolationSession(project.rootPath, req.params.sessionId); if (!session) return res.status(404).json({ error: "REVIEW_SESSION_NOT_FOUND" }); res.json(session); }));
  app.post("/api/novel/projects/:projectId/runtime/review-isolation/:sessionId/reviews", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await submitReview(project.rootPath, req.params.sessionId, { side: body.side, verdict: String(body.verdict || ""), findings: Array.isArray(body.findings) ? body.findings : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/review-isolation/:sessionId/synthesize", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(await synthesizeReview(project.rootPath, req.params.sessionId, { decision: String(body.decision || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-validation-dossier", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(buildProseValidationDossier({ projectSlug: project.slug, candidateId: String(body.candidateId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), domains: Array.isArray(body.domains) ? body.domains : [], overallScore: Number(body.overallScore || 0), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-repair-plans", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createEvidenceRepairPlan({ projectSlug: project.slug, candidateId: String(body.candidateId || ""), maturity: body.maturity, issues: Array.isArray(body.issues) ? body.issues : [], immutableItems: Array.isArray(body.immutableItems) ? body.immutableItems : [], affectedSegmentIds: Array.isArray(body.affectedSegmentIds) ? body.affectedSegmentIds : [], verificationMethod: String(body.verificationMethod || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-regression-proof", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(buildProseRegressionProof({ candidateId: String(body.candidateId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), candidateFingerprint: String(body.candidateFingerprint || ""), targetScoreBefore: Number(body.targetScoreBefore), targetScoreAfter: Number(body.targetScoreAfter), qualityScoresBefore: Array.isArray(body.qualityScoresBefore) ? body.qualityScoresBefore : [], qualityScoresAfter: Array.isArray(body.qualityScoresAfter) ? body.qualityScoresAfter : [], guards: body.guards || {}, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-adoption-transactions", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createProseCanon({ root: project.rootPath, projectSlug: project.slug, segmentId: String(body.segmentId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), currentText: String(body.currentText || ""), maturity: body.maturity, authorLockIds: Array.isArray(body.authorLockIds) ? body.authorLockIds : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] }, { expectedBaselineFingerprint: String(body.expectedBaselineFingerprint || ""), replacementText: String(body.replacementText || ""), authority: body.authority, lockCheckPassed: body.lockCheckPassed === true, validationFingerprint: String(body.validationFingerprint || ""), derivedCandidates: Array.isArray(body.derivedCandidates) ? body.derivedCandidates : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/derived-settlement", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(settleDerivedChanges({ adoptionStatus: body.adoptionStatus, anchorRebuildStatus: body.anchorRebuildStatus, evidenceStatus: body.evidenceStatus, derivedChanges: Array.isArray(body.derivedChanges) ? body.derivedChanges : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-maturity", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createProseMaturity({ projectSlug: project.slug, chapterId: String(body.chapterId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-maturity/advance", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(advanceProseMaturity(body.state, { event: String(body.event || ""), target: body.target, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], gates: body.gates || {} })); }));
  app.post("/api/novel/projects/:projectId/runtime/source-material", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createSourceMaterialRecord({ root: project.rootPath, projectSlug: project.slug, platform: String(body.platform || ""), stableLocator: String(body.stableLocator || ""), capturedAt: String(body.capturedAt || ""), contentFingerprint: String(body.contentFingerprint || ""), sourceFamily: String(body.sourceFamily || ""), accessClass: body.accessClass, processingPurpose: String(body.processingPurpose || ""), retainableEvidenceScope: String(body.retainableEvidenceScope || ""), projectScope: String(body.projectScope || ""), platformScope: String(body.platformScope || ""), refreshPolicy: String(body.refreshPolicy || ""), expiresAt: String(body.expiresAt || ""), deletionPolicy: String(body.deletionPolicy || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/source-material/:recordId", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const record = await readSourceMaterialRecord(project.rootPath, req.params.recordId); if (!record) return res.status(404).json({ error: "SOURCE_MATERIAL_NOT_FOUND" }); res.json(record); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-pattern-explanations", asyncRoute(async (req, res) => { const project = await requireProject(req, res); const body = req.body || {}; res.status(201).json(await createCraftPattern({ root: projectRoot(project.slug), projectSlug: project.slug, name: String(body.name || ""), structuralMechanism: String(body.structuralMechanism || ""), readerEffect: String(body.readerEffect || ""), applicableScenes: Array.isArray(body.applicableScenes) ? body.applicableScenes : [], minimalPositiveExample: String(body.minimalPositiveExample || ""), counterExample: String(body.counterExample || ""), failureConditions: Array.isArray(body.failureConditions) ? body.failureConditions : [], genreBoundaries: Array.isArray(body.genreBoundaries) ? body.genreBoundaries : [], sourceRecordId: String(body.sourceRecordId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));

  app.post("/api/novel/projects/:projectId/runtime/volume-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const volume = await createVolumeContract({ root: projectRoot(project.slug), projectSlug: project.slug, volumeId: String(body.volumeId ?? ""), title: String(body.title ?? ""), openingState: String(body.openingState ?? ""), stageGoals: Array.isArray(body.stageGoals) ? body.stageGoals.map(String) : [], primaryConflict: String(body.primaryConflict ?? ""), rolePositions: Array.isArray(body.rolePositions) ? body.rolePositions.map(String) : [], irreversibleDuties: Array.isArray(body.irreversibleDuties) ? body.irreversibleDuties.map(String) : [], climaxChoice: String(body.climaxChoice ?? ""), stagePayoffs: Array.isArray(body.stagePayoffs) ? body.stagePayoffs.map(String) : [], endPressure: String(body.endPressure ?? ""), capacityBudget: body.capacityBudget ?? { chapters: 0, words: 0 }, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ volume });
  }));

  app.get("/api/novel/projects/:projectId/runtime/volume-contracts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ volumes: await listVolumeContracts(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/volume-contracts/:volumeId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const volume = await readVolumeContract(projectRoot(project.slug), req.params.volumeId);
    if (!volume || volume.projectSlug !== project.slug) return res.status(404).json({ error: "VOLUME_CONTRACT_NOT_FOUND" }); res.json({ volume });
  }));

  app.post("/api/novel/projects/:projectId/runtime/chapter-functions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const chapter = await createChapterFunctionContract({ root: projectRoot(project.slug), projectSlug: project.slug, chapterId: String(body.chapterId ?? ""), primaryFunction: String(body.primaryFunction ?? ""), secondaryFunctions: Array.isArray(body.secondaryFunctions) ? body.secondaryFunctions.map(String) : [], sceneState: String(body.sceneState ?? ""), localGoal: String(body.localGoal ?? ""), obstacle: String(body.obstacle ?? ""), choice: String(body.choice ?? ""), observableChange: String(body.observableChange ?? ""), readerPayoff: String(body.readerPayoff ?? ""), mustRemember: Array.isArray(body.mustRemember) ? body.mustRemember.map(String) : [], mustNotReveal: Array.isArray(body.mustNotReveal) ? body.mustNotReveal.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ chapter });
  }));

  app.get("/api/novel/projects/:projectId/runtime/chapter-functions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ chapters: await listChapterFunctionContracts(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/chapter-functions/:chapterId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const chapter = await readChapterFunctionContract(projectRoot(project.slug), req.params.chapterId);
    if (!chapter || chapter.projectSlug !== project.slug) return res.status(404).json({ error: "CHAPTER_FUNCTION_NOT_FOUND" }); res.json({ chapter });
  }));

  app.post("/api/novel/projects/:projectId/runtime/scene-cards", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const scene = await createSceneCardContract({ root: projectRoot(project.slug), projectSlug: project.slug, sceneId: String(body.sceneId ?? ""), chapterId: String(body.chapterId ?? ""), trigger: String(body.trigger ?? ""), povCharacterId: String(body.povCharacterId ?? ""), roleGoal: String(body.roleGoal ?? ""), conflictStrategy: String(body.conflictStrategy ?? ""), turningPoint: String(body.turningPoint ?? ""), informationChange: String(body.informationChange ?? ""), emotionChange: String(body.emotionChange ?? ""), relationshipChange: String(body.relationshipChange ?? ""), resourceChange: String(body.resourceChange ?? ""), entryState: String(body.entryState ?? ""), exitState: String(body.exitState ?? ""), nextSceneHook: String(body.nextSceneHook ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ scene });
  }));

  app.get("/api/novel/projects/:projectId/runtime/scene-cards", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ scenes: await listSceneCardContracts(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/scene-cards/:sceneId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const scene = await readSceneCardContract(projectRoot(project.slug), req.params.sceneId);
    if (!scene || scene.projectSlug !== project.slug) return res.status(404).json({ error: "SCENE_CARD_NOT_FOUND" }); res.json({ scene });
  }));

  app.post("/api/novel/projects/:projectId/runtime/narrative-trace-links", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const link = await createNarrativeTraceLink({ root: projectRoot(project.slug), projectSlug: project.slug, linkId: String(body.linkId ?? ""), sourceLayer: String(body.sourceLayer ?? ""), sourceId: String(body.sourceId ?? ""), targetLayer: String(body.targetLayer ?? ""), targetId: String(body.targetId ?? ""), relation: body.relation, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ link });
  }));

  app.get("/api/novel/projects/:projectId/runtime/narrative-trace-links", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ links: await listNarrativeTraceLinks(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/narrative-trace-links/:linkId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const link = await readNarrativeTraceLink(projectRoot(project.slug), req.params.linkId);
    if (!link || link.projectSlug !== project.slug) return res.status(404).json({ error: "NARRATIVE_TRACE_NOT_FOUND" }); res.json({ link });
  }));

  app.get("/api/novel/projects/:projectId/runtime/narrative-trace/validation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ report: await validateNarrativeTrace(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/obligation-load", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const raw = typeof req.query.chapterIds === "string" ? req.query.chapterIds.split(",").filter(Boolean) : [];
    res.json({ report: await buildObligationLoadReport(projectRoot(project.slug), project.slug, raw) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/narrative-curve-points", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const point = await createNarrativeCurvePoint({ root: projectRoot(project.slug), projectSlug: project.slug, pointId: String(body.pointId ?? ""), chapterId: String(body.chapterId ?? ""), sceneId: String(body.sceneId ?? ""), dimensions: body.dimensions ?? {}, whiteSpace: Array.isArray(body.whiteSpace) ? body.whiteSpace.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
    res.status(201).json({ point });
  }));

  app.get("/api/novel/projects/:projectId/runtime/narrative-curve-points", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ points: await listNarrativeCurvePoints(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/narrative-curve-points/:pointId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const point = await readNarrativeCurvePoint(projectRoot(project.slug), req.params.pointId);
    if (!point || point.projectSlug !== project.slug) return res.status(404).json({ error: "NARRATIVE_CURVE_POINT_NOT_FOUND" }); res.json({ point });
  }));

  app.post("/api/novel/projects/:projectId/runtime/planning-nodes", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const node = await createPlanningNode({ root: projectRoot(project.slug), projectSlug: project.slug, nodeId: String(body.nodeId ?? ""), layer: String(body.layer ?? ""), title: String(body.title ?? ""), status: body.status === "committed" || body.status === "rolling" || body.status === "exploratory" ? body.status : "tentative", commitments: Array.isArray(body.commitments) ? body.commitments.map(String) : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ node });
  }));

  app.get("/api/novel/projects/:projectId/runtime/planning-nodes/:nodeId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const node = await readPlanningNode(projectRoot(project.slug), req.params.nodeId);
    if (!node || node.projectSlug !== project.slug) return res.status(404).json({ error: "PLANNING_NODE_NOT_FOUND" }); res.json({ node });
  }));

  app.post("/api/novel/projects/:projectId/runtime/planning-nodes/:nodeId/transition", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const node = await transitionPlanningNode({ root: projectRoot(project.slug), nodeId: req.params.nodeId, toStatus: body.toStatus, actor: String(body.actor ?? ""), reason: String(body.reason ?? "") });
    res.json({ node });
  }));

  app.post("/api/novel/projects/:projectId/runtime/structure-alternatives", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const body = req.body ?? {};
    const set = await createStructureAlternativeSet({ root: projectRoot(project.slug), projectSlug: project.slug, setId: String(body.setId ?? ""), contractFingerprint: String(body.contractFingerprint ?? ""), alternatives: Array.isArray(body.alternatives) ? body.alternatives : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ set });
  }));

  app.get("/api/novel/projects/:projectId/runtime/structure-alternatives", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); res.json({ sets: await listStructureAlternativeSets(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/structure-alternatives/:setId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); const set = await readStructureAlternativeSet(projectRoot(project.slug), req.params.setId);
    if (!set || set.projectSlug !== project.slug) return res.status(404).json({ error: "STRUCTURE_ALTERNATIVES_NOT_FOUND" }); res.json({ set });
  }));

  app.get("/api/novel/projects/:projectId/runtime/craft-patterns/:patternId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const pattern = await readCraftPattern(projectRoot(project.slug), req.params.patternId);
    if (!pattern || pattern.projectSlug !== project.slug) { res.status(404).json({ error: "Craft pattern not found" }); return; }
    res.json({ pattern });
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-patterns/:patternId/approve", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const pattern = await approveCraftPattern({ root: projectRoot(project.slug), patternId: req.params.patternId, actor: typeof req.body?.actor === "string" ? req.body.actor : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ pattern });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/similarity-guards", asyncRoute(async (req, res) => {
    try {
      const guard = evaluateSimilarityGuard({ sourceText: typeof req.body?.sourceText === "string" ? req.body.sourceText : "", targetText: typeof req.body?.targetText === "string" ? req.body.targetText : "", maxTokenOverlap: Number(req.body?.maxTokenOverlap), sourceVersion: typeof req.body?.sourceVersion === "string" ? req.body.sourceVersion : "", targetVersion: typeof req.body?.targetVersion === "string" ? req.body.targetVersion : "" });
      res.status(201).json({ guard });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/pattern-transfer-plans", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const pattern = await readCraftPattern(projectRoot(project.slug), typeof req.body?.patternId === "string" ? req.body.patternId : "");
    if (!pattern) { res.status(404).json({ error: "Craft pattern not found" }); return; }
    try {
      const plan = await createPatternTransferPlan({ root: projectRoot(project.slug), projectSlug: project.slug, pattern, sourceEnvelopeId: typeof req.body?.sourceEnvelopeId === "string" ? req.body.sourceEnvelopeId : "", guard: req.body?.guard, targetChapterId: typeof req.body?.targetChapterId === "string" ? req.body.targetChapterId : "", intendedEffect: typeof req.body?.intendedEffect === "string" ? req.body.intendedEffect : "" });
      res.status(201).json({ plan });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/pattern-transfer-plans/:planId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readPatternTransferPlan(projectRoot(project.slug), req.params.planId);
    if (!plan || plan.projectSlug !== project.slug) { res.status(404).json({ error: "Pattern transfer plan not found" }); return; }
    res.json({ plan });
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readPatternTransferPlan(projectRoot(project.slug), typeof req.body?.transferPlanId === "string" ? req.body.transferPlanId : "");
    if (!plan) { res.status(404).json({ error: "Pattern transfer plan not found" }); return; }
    try {
      const experiment = await createCraftExperiment({ root: projectRoot(project.slug), projectSlug: project.slug, transferPlan: plan, baselineCandidateId: typeof req.body?.baselineCandidateId === "string" ? req.body.baselineCandidateId : "", treatmentCandidateId: typeof req.body?.treatmentCandidateId === "string" ? req.body.treatmentCandidateId : "", holdoutSceneIds: Array.isArray(req.body?.holdoutSceneIds) ? req.body.holdoutSceneIds : [], targetMetrics: Array.isArray(req.body?.targetMetrics) ? req.body.targetMetrics : [], budgetId: typeof req.body?.budgetId === "string" ? req.body.budgetId : "" });
      res.status(201).json({ experiment });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/craft-experiments", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId);
    res.json({ experiments: await listCraftExperiments(projectRoot(project.slug), project.slug) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/start", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const experiment = await startCraftExperiment({ root: projectRoot(project.slug), experimentId: req.params.experimentId, runnerId: typeof req.body?.runnerId === "string" ? req.body.runnerId : "" });
      res.status(200).json({ experiment });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/judge", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const experiment = await judgeCraftExperiment({ root: projectRoot(project.slug), experimentId: req.params.experimentId, evaluatorId: typeof req.body?.evaluatorId === "string" ? req.body.evaluatorId : "", evaluatorKind: req.body?.evaluatorKind, winner: req.body?.winner, hardGuardsPassed: req.body?.hardGuardsPassed === true, authorReason: typeof req.body?.authorReason === "string" ? req.body.authorReason : "" });
      res.status(200).json({ experiment });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const experiment = await readCraftExperiment(projectRoot(project.slug), req.params.experimentId);
    if (!experiment || experiment.projectSlug !== project.slug) { res.status(404).json({ error: "Craft experiment not found" }); return; }
    res.json({ experiment });
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-patterns/:patternId/promote-from-experiment", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const pattern = await promoteCraftPatternFromExperiment({ root: projectRoot(project.slug), patternId: req.params.patternId, experiment: req.body?.experiment, actor: typeof req.body?.actor === "string" ? req.body.actor : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ pattern });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-patterns/:patternId/validate-from-experiment", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const pattern = await validateCraftPatternFromExperiment({ root: projectRoot(project.slug), patternId: req.params.patternId, experiment: req.body?.experiment, actor: typeof req.body?.actor === "string" ? req.body.actor : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ pattern });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/chapters/:chapterId/settlements/:settlementId/derived", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const writes = Array.isArray(req.body?.writes) ? req.body.writes.filter((item: unknown): item is { relativePath: string; content: string } => Boolean(item && typeof item === "object" && typeof (item as { relativePath?: unknown }).relativePath === "string" && typeof (item as { content?: unknown }).content === "string")) : [];
    try {
      const transaction = await publishDerivedAssets({ root: projectRoot(project.slug), projectSlug: project.slug, chapterId: req.params.chapterId, settlementId: req.params.settlementId, writes, faultAfterWrites: typeof req.body?.faultAfterWrites === "number" ? req.body.faultAfterWrites : undefined });
      res.status(transaction.status === "committed" ? 201 : 409).json({ transaction });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/derived-publications/:transactionId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const transaction = await readDerivedPublicationTransaction(projectRoot(project.slug), req.params.transactionId);
    if (!transaction || transaction.projectSlug !== project.slug) { res.status(404).json({ error: "Derived publication transaction not found" }); return; }
    res.json({ transaction });
  }));

  app.post("/api/novel/projects/:projectId/runtime/work-graph", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const chapterIds = Array.isArray(req.body?.chapterIds) ? req.body.chapterIds.filter((item: unknown): item is string => typeof item === "string") : project.chapters.map((chapter) => chapter.id);
    res.status(201).json({ graph: await createBookWorkGraph(projectRoot(project.slug), project.slug, chapterIds) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/work-graph/refresh", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const scheduled = await scheduleReadyExecutionWork(root, project.slug);
    res.json({ graph: scheduled.graph, scheduled: scheduled.scheduled });
  }));

  app.get("/api/novel/projects/:projectId/runtime/work-graph", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const graph = await readBookWorkGraph(projectRoot(project.slug));
    if (!graph) { res.status(404).json({ error: "Book work graph not found" }); return; }
    res.json({ graph });
  }));

  app.get("/api/novel/projects/:projectId/runtime/status", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ status: runtimeStatus(project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/events", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 2000\n\n");
    let lastId = Number(req.query.after || req.header("last-event-id") || 0) || 0;
    const send = () => {
      const events = listRuntimeEvents(project.slug, lastId, 50);
      for (const event of events) {
        lastId = event.id;
        res.write(`id: ${event.id}\n`);
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };
    send();
    const interval = setInterval(send, 1500);
    req.on("close", () => {
      clearInterval(interval);
      res.end();
    });
  }));

  function resolveRuntimeRunForControl(projectSlug: string, input: Record<string, unknown>) {
    const runId = typeof input.runId === "string" ? input.runId : undefined;
    return runId ? getRuntimeRun(runId) : latestActiveRun(projectSlug);
  }

  async function enqueueRuntimeControl(projectId: string, type: "pause" | "resume" | "stop" | "rewrite" | "accept" | "direction", body: Record<string, unknown>) {
    const project = await readProject(projectId);
    const run = resolveRuntimeRunForControl(project.slug, body);
    if (!run) {
      throw new Error("Runtime run not found");
    }
    if (type === "pause") {
      updateRuntimeRun(run.id, { status: "paused" });
    } else if (type === "stop") {
      updateRuntimeRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString() });
    } else if (type === "resume" || type === "rewrite") {
      updateRuntimeRun(run.id, { status: "queued", error: undefined, finishedAt: undefined });
    } else if (type === "accept") {
      updateRuntimeRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    }
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type,
      payload: body || {}
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "command",
      message: `Runtime ${type} queued`,
      payload: { commandId: command.id }
    });
    return { run: getRuntimeRun(run.id), command };
  }

  app.post("/api/novel/projects/:projectId/runtime/pause", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "pause", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/resume", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "resume", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/stop", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "stop", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/review/accept", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (governedProjectionMutationRequired(project)) {
      res.status(409).json({
        error: {
          code: "PROSE_ADOPTION_REQUIRED",
          message: "Governed runtime prose must be adopted through ProseAdoptionTransaction."
        }
      });
      return;
    }
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "accept", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/review/rewrite", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "rewrite", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/direction", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "direction", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/derivatives", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const branch = createRuntimeBranch({
      projectSlug: project.slug,
      baseRunId: typeof req.body.baseRunId === "string" ? req.body.baseRunId : undefined,
      sourceChapterId: typeof req.body.sourceChapterId === "string" ? req.body.sourceChapterId : undefined,
      type: req.body.type === "adaptation" || req.body.type === "branch" ? req.body.type : "side_story",
      title: String(req.body.title || "Derivative branch"),
      payload: req.body || {}
    });
    const run = createRuntimeRun({
      projectSlug: project.slug,
      chapterId: branch.sourceChapterId,
      branchId: branch.id,
      command: "derivative",
      payload: { ...req.body, branchId: branch.id, mode: "derivative" }
    });
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type: "derivative",
      payload: { ...req.body, branchId: branch.id }
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "system",
      message: "Derivative branch queued",
      payload: { branchId: branch.id, commandId: command.id }
    });
    res.status(202).json({ branch, run, command });
  }));

  app.post("/api/novel/projects/:projectId/runtime/derivatives/:branchId/merge", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (governedProjectionMutationRequired(project)) {
      res.status(409).json({
        error: {
          code: "PROSE_ADOPTION_REQUIRED",
          message: "Governed derivative prose must be changed through ProseAdoptionTransaction."
        }
      });
      return;
    }
    const root = projectRoot(project.slug);
    const branch = getRuntimeBranch(req.params.branchId);
    if (!branch || branch.projectSlug !== project.slug) {
      res.status(404).json({ error: "Runtime branch not found" });
      return;
    }
    const mode = req.body.mode === "replace_source_chapter" ? "replace_source_chapter" : "new_chapter";
    const draftPath = typeof branch.payload.draftPath === "string" ? branch.payload.draftPath : "";
    let draftContent = typeof req.body.draftContent === "string" ? req.body.draftContent : "";
    if (!draftContent && draftPath) {
      draftContent = await fs.readFile(resolveInside(root, assertSafeNovelPath(draftPath)), "utf8");
    }
    if (!draftContent.trim()) {
      res.status(409).json({ error: "Runtime branch has no generated draft to merge", branch });
      return;
    }

    const mergedAt = new Date().toISOString();
    const sourceChapter = branch.sourceChapterId ? project.chapters.find((chapter) => chapter.id === branch.sourceChapterId) : undefined;
    if (mode === "replace_source_chapter" && !sourceChapter) {
      res.status(409).json({ error: "Replacing source chapter requires an existing sourceChapterId", branch });
      return;
    }
    const mergeRun = createRuntimeRun({
      projectSlug: project.slug,
      chapterId: sourceChapter?.id,
      branchId: branch.id,
      command: "accept",
      payload: { branchId: branch.id, mode, note: req.body.note }
    });
    updateRuntimeRun(mergeRun.id, { status: "running", currentStage: "checkpoint_before_run", startedAt: mergedAt });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: mergeRun.id,
      type: "command",
      stage: "checkpoint_before_run",
      message: "Derivative merge accepted by user",
      payload: { branchId: branch.id, mode }
    });
    const checkpoint = await createRuntimeCheckpoint({
      root,
      project,
      run: mergeRun,
      chapterId: sourceChapter?.id,
      label: `Before merging derivative ${branch.title}`
    });

    const nextProject = { ...project, chapters: project.chapters.map((chapter) => ({ ...chapter })) };
    let mergedChapterId = sourceChapter?.id || "";
    let contentPath = sourceChapter?.contentPath || "";
    let outlinePath = sourceChapter?.outlinePath || "";
    const writes: Array<{ relativePath: string; content: string; failIfExists?: boolean }> = [];
    if (mode === "replace_source_chapter" && sourceChapter) {
      const index = nextProject.chapters.findIndex((chapter) => chapter.id === sourceChapter.id);
      nextProject.chapters[index] = { ...nextProject.chapters[index], status: "drafted" };
      mergedChapterId = sourceChapter.id;
      contentPath = sourceChapter.contentPath;
      outlinePath = sourceChapter.outlinePath;
      writes.push({ relativePath: contentPath, content: draftContent.endsWith("\n") ? draftContent : `${draftContent}\n` });
    } else {
      const seed = branch.id.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 28) || String(Date.now());
      let chapterId = `derivative-${seed}`;
      let suffix = 2;
      while (nextProject.chapters.some((chapter) => chapter.id === chapterId)) {
        chapterId = `derivative-${seed}-${suffix}`;
        suffix += 1;
      }
      const sourceIndex = sourceChapter ? nextProject.chapters.findIndex((chapter) => chapter.id === sourceChapter.id) : -1;
      const maxOrder = nextProject.chapters.reduce((max, chapter, index) => Math.max(max, chapter.order ?? index + 1), 0);
      contentPath = `chapters/${chapterId}.md`;
      outlinePath = `outline/${chapterId}.md`;
      mergedChapterId = chapterId;
      const newChapter = {
        id: chapterId,
        title: branch.title,
        outlinePath,
        contentPath,
        status: "drafted" as const,
        order: maxOrder + 1,
        volumeId: sourceChapter?.volumeId,
        volumeTitle: sourceChapter?.volumeTitle,
        volumeOrder: sourceChapter?.volumeOrder
      };
      if (sourceIndex >= 0) nextProject.chapters.splice(sourceIndex + 1, 0, newChapter);
      else nextProject.chapters.push(newChapter);
      writes.push(
        {
          relativePath: outlinePath,
          failIfExists: true,
          content: [
            `# ${branch.title}`,
            "",
            `Merged from derivative branch: ${branch.id}`,
            `Source chapter: ${sourceChapter?.id || "none"}`,
            `Merge note: ${typeof req.body.note === "string" ? req.body.note : ""}`,
            ""
          ].join("\n")
        },
        { relativePath: contentPath, content: draftContent.endsWith("\n") ? draftContent : `${draftContent}\n`, failIfExists: true }
      );
    }

    nextProject.lastOpenedChapterId = mergedChapterId;
    nextProject.updatedAt = mergedAt;
    writes.push({ relativePath: "project.json", content: `${JSON.stringify(nextProject, null, 2)}\n` });
    try {
      updateRuntimeRun(mergeRun.id, { currentStage: "finalize_or_gate" });
      await dispatchRuntimeWrites({
        root,
        project,
        run: mergeRun,
        reason: "derivative_merge",
        checkpoint,
        allowProjectJson: true,
        writes
      });
    } catch (error) {
      if (error instanceof RuntimeWriteConflictError) {
        const reviewRun = updateRuntimeRun(mergeRun.id, {
          status: "review_required",
          result: {
            branchId: branch.id,
            reason: "runtime_write_conflict",
            path: error.relativePath,
            expectedSha256: error.expectedSha256,
            actualSha256: error.actualSha256
          },
          finishedAt: new Date().toISOString()
        });
        appendRuntimeEvent({
          projectSlug: project.slug,
          runId: mergeRun.id,
          type: "review",
          stage: "finalize_or_gate",
          message: "Derivative merge paused because target files changed after checkpoint",
          payload: { branchId: branch.id, path: error.relativePath }
        });
        res.status(409).json({ branch, run: reviewRun || mergeRun, merged: false, conflict: error.relativePath });
        return;
      }
      throw error;
    }
    upsertProjectRecord(nextProject, root);
    const updated = updateRuntimeBranch(branch.id, {
      status: "merged",
      payload: {
        ...branch.payload,
        mergeAcceptedAt: mergedAt,
        mergeNote: typeof req.body.note === "string" ? req.body.note : undefined,
        mergeMode: mode,
        mergedChapterId,
        contentPath,
        outlinePath,
        checkpointId: checkpoint.id,
        canonPolicy: "accepted_for_canon"
      }
    });
    const completedRun = updateRuntimeRun(mergeRun.id, {
      status: "completed",
      result: { branchId: branch.id, mergedChapterId, contentPath, outlinePath, checkpointId: checkpoint.id, mode },
      finishedAt: new Date().toISOString()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: mergeRun.id,
      type: "system",
      message: "Derivative branch accepted for canon merge",
      payload: { branchId: branch.id, mergedAt, mergedChapterId, contentPath, outlinePath, checkpointId: checkpoint.id, mode }
    });
    res.json({ branch: updated || branch, run: completedRun || mergeRun, merged: true, chapterId: mergedChapterId });
  }));

  app.get("/api/novel/projects/:projectId/runtime/checkpoints", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ checkpoints: runtimeStatus(project.slug).checkpoints });
  }));

  app.post("/api/novel/projects/:projectId/runtime/checkpoints/:checkpointId/restore", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (governedProjectionMutationRequired(project)) {
      res.status(409).json({
        error: {
          code: "CANON_RESTORE_REQUIRES_ADOPTION",
          message: "Governed checkpoint restore would replace canon or projections; create an adoption proposal instead."
        }
      });
      return;
    }
    const checkpoint = getRuntimeCheckpoint(req.params.checkpointId);
    if (!checkpoint || checkpoint.projectSlug !== project.slug) {
      res.status(404).json({ error: "Runtime checkpoint not found" });
      return;
    }
    await restoreRuntimeCheckpoint(projectRoot(project.slug), checkpoint);
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ checkpoint, restored: true });
  }));

  app.get("/api/novel/projects/:projectId/runtime/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const snapshot = await buildCreationRuntimeSnapshot(projectRoot(project.slug), project, req.params.chapterId);
    res.json({ snapshot });
  }));

  app.put("/api/novel/projects/:projectId/dashboard/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const dashboardInput = req.body.dashboard || req.body || {};
    const dashboard = await saveChapterDashboard(projectRoot(project.slug), {
      ...dashboardInput,
      chapterId: req.params.chapterId
    });
    res.json({ dashboard });
  }));

  app.get("/api/novel/projects/:projectId/scenes/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const scenes = await readSceneCards(projectRoot(project.slug), req.params.chapterId);
    res.json({ scenes });
  }));

  app.put("/api/novel/projects/:projectId/scenes/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const scenesInput = Array.isArray(req.body.scenes) ? req.body.scenes : [];
    const scenes = await saveSceneCards(projectRoot(project.slug), req.params.chapterId, scenesInput);
    res.json({ scenes });
  }));

  app.get("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const summary = await readChapterSummary(projectRoot(project.slug), req.params.chapterId);
    res.json({ summary });
  }));

  app.put("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const summaryInput = req.body.summary || req.body || {};
    const summary = await saveChapterSummary(projectRoot(project.slug), {
      ...summaryInput,
      chapterId: req.params.chapterId
    });
    res.json({ summary });
  }));

  app.get("/api/novel/projects/:projectId/quality/series-metrics", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const seriesMetrics = await readSeriesQualityMetrics(projectRoot(project.slug), project);
    res.json({ seriesMetrics });
  }));

  app.get("/api/novel/projects/:projectId/quality/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await readChapterQualityReport(projectRoot(project.slug), req.params.chapterId);
    res.json({ report });
  }));

  app.put("/api/novel/projects/:projectId/quality/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const reportInput = req.body.report || req.body || {};
    const report = await saveChapterQualityReport(projectRoot(project.slug), {
      ...reportInput,
      chapterId: req.params.chapterId
    });
    const seriesMetrics = await buildSeriesQualityMetrics(projectRoot(project.slug), project);
    res.json({ report, seriesMetrics });
  }));

  app.post("/api/novel/projects/:projectId/recaps/accept", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const summary = await acceptWritingRecapPatches(projectRoot(project.slug), req.body.recap || req.body || {});
    res.json({ summary });
  }));

  app.get("/api/novel/projects/:projectId/knowledge/index", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const index = await readKnowledgeIndex(projectRoot(project.slug), project);
    res.json({ index });
  }));

  app.post("/api/novel/projects/:projectId/knowledge/index/rebuild", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (governedProjectionMutationRequired(project)) {
      res.status(409).json({
        error: {
          code: "PROJECTION_REBUILD_REQUIRED",
          message: "Governed knowledge projections must be rebuilt through the invalidation receipt flow."
        }
      });
      return;
    }
    const index = await rebuildKnowledgeIndex(projectRoot(project.slug), project);
    res.json({ index });
  }));

  app.post("/api/novel/projects/:projectId/knowledge/search", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await searchKnowledgeIndex(projectRoot(project.slug), project, (req.body || {}) as KnowledgeSearchQuery);
    res.json({ result });
  }));

  app.get("/api/novel/projects/:projectId/jobs", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ jobs: await listProjectBackgroundJobs(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/jobs/:jobId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const job = await readBackgroundJob(projectRoot(project.slug), project.slug, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Background job not found" });
      return;
    }
    res.json({ job });
  }));

  app.post("/api/novel/projects/:projectId/jobs", asyncRoute(async (req, res) => {
    const type = String(req.body.type || "");
    if (!isBackgroundJobType(type)) {
      res.status(400).json({ error: `Unsupported background job type: ${type}` });
      return;
    }

    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    if (["knowledge.index.rebuild", "quality.series.rebuild", "story.graph.rebuild"].includes(type) && governedProjectionMutationRequired(project)) {
      res.status(409).json({
        error: {
          code: "PROJECTION_REBUILD_REQUIRED",
          message: "Governed knowledge projections must be rebuilt through the invalidation receipt flow."
        }
      });
      return;
    }
    const job = await enqueueProjectBackgroundJob(project, root, type, JSON.stringify(req.body.payload || {}).slice(0, 500), createBackgroundJobHandler(project, root, type));

    res.status(202).json({ job });
  }));

  app.post("/api/novel/projects/:projectId/jobs/:jobId/cancel", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const job = await cancelBackgroundJob(projectRoot(project.slug), project.slug, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Background job not found" });
      return;
    }
    res.json({ job });
  }));

  app.post("/api/novel/projects/:projectId/jobs/:jobId/retry", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    if (governedProjectionMutationRequired(project)) {
      const failedJob = await readBackgroundJob(root, project.slug, req.params.jobId);
      if (failedJob && ["knowledge.index.rebuild", "quality.series.rebuild", "story.graph.rebuild"].includes(failedJob.type)) {
        res.status(409).json({
          error: {
            code: "PROJECTION_REBUILD_REQUIRED",
            message: "Governed knowledge projections must be rebuilt through the invalidation receipt flow."
          }
        });
        return;
      }
    }
    try {
      const job = await retryBackgroundJob(project, root, req.params.jobId, (failedJob) => createBackgroundJobHandler(project, root, failedJob.type, failedJob.inputSummary));
      if (!job) {
        res.status(404).json({ error: "Background job not found" });
        return;
      }
      res.status(202).json({ job });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }));

  app.get("/api/novel/projects/:projectId/ledger/:kind", asyncRoute(async (req, res) => {
    if (!isLedgerKind(req.params.kind)) {
      res.status(400).json({ error: `Unsupported ledger kind: ${req.params.kind}` });
      return;
    }

    const project = await readProject(req.params.projectId);
    const entries = await readLedgerEntries(projectRoot(project.slug), req.params.kind);
    res.json({ entries });
  }));

  app.put("/api/novel/projects/:projectId/ledger/:kind", asyncRoute(async (req, res) => {
    if (!isLedgerKind(req.params.kind)) {
      res.status(400).json({ error: `Unsupported ledger kind: ${req.params.kind}` });
      return;
    }

    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const entriesInput = Array.isArray(req.body.entries) ? req.body.entries : [];
    const entries = await saveLedgerEntries(projectRoot(project.slug), req.params.kind, entriesInput);
    res.json({ entries });
  }));

  app.get("/api/novel/projects/:projectId/file-versions/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    res.json({ filePath: relativePath, versions: await listWritingFileVersions(projectRoot(project.slug), relativePath) });
  }));

  app.get("/api/novel/projects/:projectId/file-diff/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    const versionId = String(req.query.from || "").trim();
    if (!versionId) {
      res.status(400).json({ error: "from version id is required" });
      return;
    }
    res.json({ diff: await readWritingFileDiff(projectRoot(project.slug), relativePath, versionId) });
  }));

  app.post("/api/novel/projects/:projectId/editor/suggestion", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const input = (req.body || {}) as EditorSuggestionRequest;
    const filePath = assertSafeNovelPath(String(input.filePath || ""));
    const chapter = project.chapters.find((item) => item.id === input.chapterId || item.contentPath === filePath || item.outlinePath === filePath);
    if (!chapter) {
      res.status(400).json({ error: `Unknown chapter file: ${filePath}` });
      return;
    }
    const documentKind: EditorSuggestionRequest["documentKind"] = input.documentKind === "outline" ? "outline" : "content";
    const expectedPath = documentKind === "outline" ? chapter.outlinePath : chapter.contentPath;
    if (expectedPath !== filePath) {
      res.status(400).json({ error: `File does not match ${documentKind} for chapter ${chapter.id}` });
      return;
    }
    const suggestionInput: EditorSuggestionRequest = {
      ...input,
      filePath,
      chapterId: chapter.id,
      documentKind,
      beforeText: String(input.beforeText || "").slice(-1600),
      afterText: String(input.afterText || "").slice(0, 800),
      selectedText: typeof input.selectedText === "string" ? input.selectedText.slice(0, 800) : undefined
    };
    const fallback = buildEditorSuggestion(suggestionInput);
    res.json({ suggestion: await buildAiBackedEditorSuggestion(project.slug, suggestionInput, fallback) });
  }));

  app.get("/api/novel/projects/:projectId/files/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    const content = await fs.readFile(resolveInside(projectRoot(project.slug), relativePath), "utf8");
    res.json({ path: relativePath, content });
  }));

  app.put("/api/novel/projects/:projectId/files/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    if (governedProseMutationRequired(project, relativePath)) {
      res.status(409).json({ error: { code: "PROSE_ADOPTION_REQUIRED", message: "Governed prose must be changed through ProseAdoptionTransaction." } });
      return;
    }
    if (governedLegacyFileMutationRequired(project, relativePath)) {
      res.status(409).json({ error: { code: "GOVERNED_LEGACY_WRITE_REQUIRED", message: "Governed legacy assets are read-only projections; use the corresponding domain adoption command." } });
      return;
    }
    if (governedProjectionMutationRequired(project)) {
      res.status(409).json({ error: { code: "GOVERNED_LEGACY_WRITE_REQUIRED", message: "Governed project files are read-only; use the corresponding adoption or projection command." } });
      return;
    }
    if (isProtectedWritePath(relativePath)) {
      res.status(403).json({ error: "Protected project metadata cannot be edited through file saves" });
      return;
    }

    const nextContent = String(req.body.content || "");
    const snapshot = await createWritingFileSnapshot(projectRoot(project.slug), project, relativePath, nextContent);
    await fs.writeFile(resolveInside(projectRoot(project.slug), relativePath), nextContent, "utf8");
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ path: relativePath, saved: true, version: snapshot });
  }));

  app.post("/api/novel/projects/:projectId/tasks", asyncRoute(async (req, res) => {
    const type = req.body.type as CodexTaskType;
    if (!taskTypes.includes(type)) {
      res.status(400).json({ error: `Unsupported task type: ${type}` });
      return;
    }
    res.json({ task: await runNovelTask(req.params.projectId, type, req.body.payload || {}) });
  }));

  app.get("/api/novel/projects/:projectId/tasks", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ tasks: await readTaskHistory(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/tasks/async", asyncRoute(async (req, res) => {
    const type = req.body.type as CodexTaskType;
    if (!taskTypes.includes(type)) {
      res.status(400).json({ error: `Unsupported task type: ${type}` });
      return;
    }
    res.status(202).json({ task: await startNovelTaskAsync(req.params.projectId, type, req.body.payload || {}) });
  }));

  app.get("/api/novel/projects/:projectId/tasks/invocations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const invocations = await readInvocationSessions(projectRoot(project.slug));
    res.json({ invocations });
  }));

  app.get("/api/novel/projects/:projectId/tasks/:taskId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const task = await readNovelTask(projectRoot(project.slug), req.params.taskId);
    if (!task || task.projectId !== project.slug) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  }));

  app.post("/api/novel/projects/:projectId/tasks/:taskId/cancel", asyncRoute(async (req, res) => {
    const task = await cancelNovelTask(req.params.projectId, req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  }));

  app.get("/api/novel/projects/:projectId/audit-report", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await buildProjectAuditReport(projectRoot(project.slug), project);
    res.json({ report });
  }));

  app.get("/api/novel/projects/:projectId/capability-baseline", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const baseline = await buildCapabilityBaseline(projectRoot(project.slug), project);
    res.json({ baseline });
  }));

  app.get("/api/novel/projects/:projectId/durability-baseline", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const durability = await buildDurabilityBaseline(projectRoot(project.slug), project);
    res.json({ durability });
  }));

  app.get("/api/novel/projects/:projectId/obligations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ obligations: await listNarrativeObligations(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/revision-intents", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ intents: await listRevisionIntents(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/revision-intents", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const intent = await createRevisionIntent(projectRoot(project.slug), {
        projectSlug: project.slug,
        authorText: typeof req.body?.authorText === "string" ? req.body.authorText : "",
        type: req.body?.type as RevisionIntentType,
        maturity: req.body?.maturity as RevisionMaturity,
        scope: { chapterIds: Array.isArray(req.body?.scope?.chapterIds) ? req.body.scope.chapterIds.filter((value: unknown): value is string => typeof value === "string") : [], sceneIds: Array.isArray(req.body?.scope?.sceneIds) ? req.body.scope.sceneIds.filter((value: unknown): value is string => typeof value === "string") : undefined },
        requestedChanges: Array.isArray(req.body?.requestedChanges) ? req.body.requestedChanges.filter((value: unknown): value is string => typeof value === "string") : [],
        protectedItems: Array.isArray(req.body?.protectedItems) ? req.body.protectedItems.filter((value: unknown): value is string => typeof value === "string") : [],
        mode: req.body?.mode as RevisionIntentMode,
        actor: req.body?.actor
      });
      res.status(201).json({ intent });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVISION_INTENT_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/revision-intents/:intentId/impact", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const report = await buildRevisionImpactReport(projectRoot(project.slug), req.params.intentId);
      res.json({ report });
    } catch (error) {
      res.status(404).json({ error: { code: error instanceof Error ? error.message : "REVISION_INTENT_NOT_FOUND" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/revision-intents/:intentId/change-sets", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const operations = Array.isArray(req.body?.operations) ? req.body.operations as RevisionChangeOperation[] : [];
      const changeSet = await createRevisionChangeSet(projectRoot(project.slug), req.params.intentId, typeof req.body?.expectedIntentFingerprint === "string" ? req.body.expectedIntentFingerprint : "", operations);
      res.status(201).json({ changeSet });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVISION_CHANGESET_INVALID" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/revision-change-sets/:changeSetId/reviews", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const review = await reviewRevisionChangeSet(projectRoot(project.slug), req.params.changeSetId, typeof req.body?.expectedChangeSetFingerprint === "string" ? req.body.expectedChangeSetFingerprint : "", { decision: req.body?.decision, note: typeof req.body?.note === "string" ? req.body.note : "", actor: req.body?.actor } as RevisionReviewInput);
      res.status(201).json({ review });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVISION_REVIEW_INVALID" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/revision-change-sets/:changeSetId/adoption-proposals", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const proposal = await createRevisionAdoptionProposal(projectRoot(project.slug), req.params.changeSetId, typeof req.body?.expectedChangeSetFingerprint === "string" ? req.body.expectedChangeSetFingerprint : "", typeof req.body?.reviewId === "string" ? req.body.reviewId : "", typeof req.body?.baseCanonFingerprint === "string" ? req.body.baseCanonFingerprint : "");
      res.status(201).json({ proposal });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVISION_ADOPTION_INVALID" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/revision-adoption-proposals/:proposalId/receipts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const receipt = await recordRevisionAdoptionReceipt(projectRoot(project.slug), req.params.proposalId, typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : "", typeof req.body?.proseAdoptionTransactionId === "string" ? req.body.proseAdoptionTransactionId : "");
      res.status(201).json({ receipt });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVISION_ADOPTION_RECEIPT_INVALID" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/revision-adoption-receipts/:receiptId/settlements", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const chapterSettlementIds = Array.isArray(req.body?.chapterSettlementIds) ? req.body.chapterSettlementIds.filter((value: unknown): value is string => typeof value === "string") : [];
      const settlement = await settleRevision(projectRoot(project.slug), req.params.receiptId, typeof req.body?.expectedReceiptFingerprint === "string" ? req.body.expectedReceiptFingerprint : "", chapterSettlementIds);
      res.status(201).json({ settlement });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVISION_SETTLEMENT_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/obligation-coverage", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await auditNarrativeObligationCoverage(projectRoot(project.slug), project.chapters.map((chapter) => chapter.id));
    res.json({ report });
  }));

  app.get("/api/novel/projects/:projectId/obligation-candidates/preview", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidates = await buildNarrativeObligationCandidates(projectRoot(project.slug), project.chapters.map((chapter) => chapter.id));
    res.json({ candidates });
  }));

  app.post("/api/novel/projects/:projectId/obligation-coverage/certificate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const certificate = await issueObligationCoverageCertificate(projectRoot(project.slug), project.chapters.map((chapter) => chapter.id), typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "");
      res.status(201).json({ certificate });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/obligation-coverage/certificate/validate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const result = await assertObligationCoverageCertificateCurrent(projectRoot(project.slug), typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "");
      res.json(result);
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "OBLIGATION_COVERAGE_CERTIFICATE_STALE" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/obligation-coverage/certificate/invalidate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const invalidation = await invalidateObligationCoverageCertificate(projectRoot(project.slug), typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "");
      res.json({ invalidation });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "OBLIGATION_COVERAGE_INVALIDATION_FAILED" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/obligations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const obligation = await createNarrativeObligation(projectRoot(project.slug), {
        projectSlug: project.slug,
        type: req.body?.type as ObligationType,
        title: typeof req.body?.title === "string" ? req.body.title : "",
        questionOrPromise: typeof req.body?.questionOrPromise === "string" ? req.body.questionOrPromise : "",
        importance: req.body?.importance,
        sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.filter((value: unknown): value is string => typeof value === "string") : [],
        entityRefs: Array.isArray(req.body?.entityRefs) ? req.body.entityRefs.filter((value: unknown): value is string => typeof value === "string") : []
      });
      res.status(201).json({ obligation });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "OBLIGATION_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/obligations/:obligationId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const obligation = await readNarrativeObligation(projectRoot(project.slug), req.params.obligationId);
    if (!obligation) { res.status(404).json({ error: "Obligation not found" }); return; }
    res.json({ obligation });
  }));

  app.post("/api/novel/projects/:projectId/obligations/:obligationId/events", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const result = await appendObligationEvent(projectRoot(project.slug), req.params.obligationId, {
        toStatus: req.body?.toStatus as ObligationStatus,
        evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.filter((value: unknown): value is string => typeof value === "string") : [],
        reason: typeof req.body?.reason === "string" ? req.body.reason : "",
        actor: req.body?.actor,
        expectedVersion: Number(req.body?.expectedVersion)
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "OBLIGATION_EVENT_INVALID" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/backups", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await createProjectBackup(projectRoot(project.slug), project.slug);
    res.status(201).json({ manifest });
  }));

  app.get("/api/novel/projects/:projectId/backups", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const backups = await listProjectBackups(projectRoot(project.slug), project.slug);
    res.json({ backups });
  }));

  app.get("/api/novel/projects/:projectId/backups/:backupId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await readProjectBackup(projectRoot(project.slug), req.params.backupId);
    if (!manifest) {
      res.status(404).json({ error: "Project backup not found" });
      return;
    }
    res.json({ manifest });
  }));

  app.post("/api/novel/projects/:projectId/backups/:backupId/verify", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await verifyProjectBackup(projectRoot(project.slug), req.params.backupId);
    res.json({ verification });
  }));

  app.post("/api/novel/projects/:projectId/selection/polish", asyncRoute(async (req, res) => {
    res.json({
      task: await runNovelTask(req.params.projectId, "selection.polish", {
        selection: req.body
      })
    });
  }));

  app.post("/api/novel/projects/:projectId/continuity/check", asyncRoute(async (req, res) => {
    res.json({ task: await runNovelTask(req.params.projectId, "continuity.check", req.body || {}) });
  }));

  app.post("/api/novel/projects/:projectId/patches", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const task = typeof req.body.taskId === "string" ? await readNovelTask(root, req.body.taskId) : null;
    const patches = normalizeQualityRewritePatches(task, (req.body.patches || []) as NovelFilePatch[]);
    const governedTarget = patches.find((patch) => governedProseMutationRequired(project, patch.target));
    if (governedTarget) {
      res.status(409).json({ error: { code: "PROSE_ADOPTION_REQUIRED", target: governedTarget.target, message: "Governed prose must be changed through ProseAdoptionTransaction." } });
      return;
    }
    for (const patch of patches) {
      await createPatchSnapshotBeforeApply(root, project, patch);
      await applyPatch(root, patch);
    }
    const acceptedTargets = patches.map((patch) => patch.target);
    const invocationUpdate =
      typeof req.body.taskId === "string"
        ? await markInvocationPatchesAccepted(root, req.body.taskId, acceptedTargets)
        : { updated: false };
    res.json({ applied: patches.length, invocationUpdated: invocationUpdate.updated, invocationId: invocationUpdate.invocationId });
  }));

  app.use(errorHandler);

  app.post("/api/novel/projects/:projectId/runtime/negative-preferences", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(await createNegativePreference({ root: project.rootPath, projectSlug: project.slug, preferenceId: String(body.preferenceId || ""), scope: String(body.scope || ""), rejectedPattern: String(body.rejectedPattern || ""), rationale: String(body.rationale || ""), confidence: Number(body.confidence), triggerConditions: Array.isArray(body.triggerConditions) ? body.triggerConditions : [], counterexamples: Array.isArray(body.counterexamples) ? body.counterexamples : [], rejectedMechanism: typeof body.rejectedMechanism === "string" ? body.rejectedMechanism : undefined, exceptions: Array.isArray(body.exceptions) ? body.exceptions : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/negative-preferences/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateNegativePreferenceSuggestion(body.preference, { proposedPattern: String(body.proposedPattern || ""), proposedMechanism: typeof body.proposedMechanism === "string" ? body.proposedMechanism : undefined, newScene: String(body.newScene || ""), differenceExplanation: String(body.differenceExplanation || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/source-lineage", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(createSourceLineage({ sourceId: String(body.sourceId || ""), projectSlug: project.slug, accessClass: body.accessClass, derivedPatternIds: Array.isArray(body.derivedPatternIds) ? body.derivedPatternIds : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/source-lineage/revoke", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(revokeSourceLineage(body.lineage, { mode: body.mode, actor: String(body.actor || ""), reason: String(body.reason || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-pattern-publication-gate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluatePatternPublication({ patternId: String(body.patternId || ""), sourceEligibility: body.sourceEligibility, abstractMechanism: body.abstractMechanism === true, containsPrivateExpression: body.containsPrivateExpression === true, canReconstructOriginal: body.canReconstructOriginal === true, sourceRegistered: body.sourceRegistered === true, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/untrusted-samples/isolate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(isolateUntrustedSample({ sampleId: String(body.sampleId || ""), sourceId: String(body.sourceId || ""), content: String(body.content || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], legacy: body.legacy === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-mechanism-units", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftMechanismUnit({ unitId: String(body.unitId || ""), triggerCondition: String(body.triggerCondition || ""), characterGoal: String(body.characterGoal || ""), narrativeFunction: String(body.narrativeFunction || ""), readerExpectation: String(body.readerExpectation || ""), actionChange: String(body.actionChange || ""), informationChange: String(body.informationChange || ""), cost: String(body.cost || ""), applicableScenes: Array.isArray(body.applicableScenes) ? body.applicableScenes : [], failureModes: Array.isArray(body.failureModes) ? body.failureModes : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/surface-mechanism-patterns", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createSeparatedPattern({ patternId: String(body.patternId || ""), projectSlug: project.slug, surface: body.surface, mechanism: body.mechanism, abstractionProof: String(body.abstractionProof || ""), antiImitationPassed: body.antiImitationPassed === true, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/surface-mechanism-patterns/transfer-gate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateCrossProjectTransfer({ ...body.pattern, targetProjectSlug: String(body.targetProjectSlug || ""), reuseSurface: body.reuseSurface === true, identifiableSourceCombination: body.identifiableSourceCombination === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-effect-evidence", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftEffectEvidence({ patternId: String(body.patternId || ""), readerProblem: String(body.readerProblem || ""), context: String(body.context || ""), prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites : [], cost: String(body.cost || ""), failureChapters: Array.isArray(body.failureChapters) ? body.failureChapters : [], evidence: body.evidence || { proseAnchors: [], comparisonSamples: [], authorJudgment: "" }, modelClaim: String(body.modelClaim || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-boundaries", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftBoundary({ patternId: String(body.patternId || ""), genres: Array.isArray(body.genres) ? body.genres : [], chapterFunctions: Array.isArray(body.chapterFunctions) ? body.chapterFunctions : [], narrativeDistances: Array.isArray(body.narrativeDistances) ? body.narrativeDistances : [], characterStages: Array.isArray(body.characterStages) ? body.characterStages : [], targetReaders: Array.isArray(body.targetReaders) ? body.targetReaders : [], forbiddenConditions: Array.isArray(body.forbiddenConditions) ? body.forbiddenConditions : [], counterexamples: Array.isArray(body.counterexamples) ? body.counterexamples : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-boundaries/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(evaluateCraftBoundaryMatch(body.boundary, body.context)); }));
  app.post("/api/novel/projects/:projectId/runtime/abstraction-transfer", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(compileAbstractTransfer({ patternId: String(body.patternId || ""), sourceProject: body.sourceProject, targetStory: body.targetStory, mechanism: String(body.mechanism || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/anti-imitation-guard", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(runAntiImitationGuard({ authorizedSourceIds: Array.isArray(body.authorizedSourceIds) ? body.authorizedSourceIds : [], sourceEntities: Array.isArray(body.sourceEntities) ? body.sourceEntities : [], distinctiveImagery: Array.isArray(body.distinctiveImagery) ? body.distinctiveImagery : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], beforeContext: Array.isArray(body.beforeContext) ? body.beforeContext : [], generatedText: String(body.generatedText || ""), generatedNgrams: Array.isArray(body.generatedNgrams) ? body.generatedNgrams : [], generatedSemanticNeighbors: Array.isArray(body.generatedSemanticNeighbors) ? body.generatedSemanticNeighbors : [], sourceStructuralSignature: body.sourceStructuralSignature, generatedStructuralSignature: body.generatedStructuralSignature, bypassRequested: body.bypassRequested === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/task-pattern-retrieval", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(buildTaskPatternRetrieval({ projectSlug: project.slug, sceneFunction: String(body.sceneFunction || ""), targetGap: String(body.targetGap || ""), genreProfile: String(body.genreProfile || ""), authorPreferences: Array.isArray(body.authorPreferences) ? body.authorPreferences : [], sourceEligibility: body.sourceEligibility, applicablePatternIds: Array.isArray(body.applicablePatternIds) ? body.applicablePatternIds : [], sourceFamilies: Array.isArray(body.sourceFamilies) ? body.sourceFamilies : [], evidenceSnapshots: Array.isArray(body.evidenceSnapshots) ? body.evidenceSnapshots : [], budget: body.budget || { maxPatterns: 0, timeWindowMs: 0 }, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-context-budget", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(buildCraftContextBudget({ taskId: String(body.taskId || ""), requiredFunctions: Array.isArray(body.requiredFunctions) ? body.requiredFunctions : [], tokenBudget: Number(body.tokenBudget || 0), items: Array.isArray(body.items) ? body.items : [], forbiddenItems: Array.isArray(body.forbiddenItems) ? body.forbiddenItems : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-conflicts/resolve", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(resolveCraftConflicts({ taskId: String(body.taskId || ""), sceneId: String(body.sceneId || ""), rules: Array.isArray(body.rules) ? body.rules : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-holdout/validate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(validateCraftHoldout({ experimentId: String(body.experimentId || ""), extractionSceneIds: Array.isArray(body.extractionSceneIds) ? body.extractionSceneIds : [], cases: Array.isArray(body.cases) ? body.cases : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-attributions", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftAttribution({ candidateId: String(body.candidateId || ""), patternId: String(body.patternId || ""), projectSlug: project.slug, authorId: String(body.authorId || ""), judgment: body.judgment, scope: String(body.scope || ""), rationale: String(body.rationale || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-attributions/:attributionId/events", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(transitionCraftAttribution(body.record, { target: body.target, actor: String(body.actor || ""), reason: String(body.reason || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-provenance", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftProvenanceBundle({ candidateId: String(body.candidateId || ""), patternId: String(body.patternId || ""), sceneId: String(body.sceneId || ""), sources: Array.isArray(body.sources) ? body.sources : [], transformations: Array.isArray(body.transformations) ? body.transformations : [], evaluationRefs: Array.isArray(body.evaluationRefs) ? body.evaluationRefs : [], adoptionChangeSetRefs: Array.isArray(body.adoptionChangeSetRefs) ? body.adoptionChangeSetRefs : [], proseVersionRefs: Array.isArray(body.proseVersionRefs) ? body.proseVersionRefs : [], qualityReportRefs: Array.isArray(body.qualityReportRefs) ? body.qualityReportRefs : [], releaseSnapshotRefs: Array.isArray(body.releaseSnapshotRefs) ? body.releaseSnapshotRefs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-provenance/project", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.json(projectCraftProvenance(req.body?.bundle, req.body?.audience === "author-audit" ? "author-audit" : "reader")); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-revocation/propagate", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(propagateCraftSourceRevocation({ sourceId: String(body.sourceId || ""), eventId: String(body.eventId || ""), reason: String(body.reason || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], sourceFingerprint: String(body.sourceFingerprint || ""), artifacts: Array.isArray(body.artifacts) ? body.artifacts : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-identities", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.status(201).json(registerCharacterIdentity({ projectSlug: project.slug, entityId: String(body.entityId || ""), displayName: String(body.displayName || ""), aliases: Array.isArray(body.aliases) ? body.aliases : [], narrativeIdentity: String(body.narrativeIdentity || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-identities/admit", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; res.json(admitCharacterToCast(req.body?.identity)); }));
  app.post("/api/novel/projects/:projectId/runtime/character-documents/classify", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(classifyCharacterDocument({ path: String(body.path || ""), title: String(body.title || ""), category: body.category, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-truth/resolve", asyncRoute(async (req, res) => { const project = await requireProject(req, res); if (!project) return; const body = req.body || {}; res.json(resolveCharacterFieldTruth(String(body.field || ""), Array.isArray(body.assertions) ? body.assertions : [])); }));
  return app;
}
