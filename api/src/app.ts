import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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
import { getDataRoot, getNovelsRoot, getRepoRoot } from "./workspace.js";
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
import { buildMemoryRetrievalPreview, persistMemoryRetrievalPreview, readMemoryRetrievalPreview } from "./memoryRetrievalPreview.js";
import { buildMemoryHealthReport, persistMemoryHealthReport, readMemoryHealthReport } from "./memoryHealthReport.js";
import { buildMemoryReadyProof, persistMemoryReadyProof, readMemoryReadyProof } from "./memoryReadyProof.js";
import { buildLongContinuityAudit, persistLongContinuityAudit, readLongContinuityAudit } from "./longContinuityAudit.js";
import { evaluateMemoryProjectionFreshness } from "./memoryProjectionGate.js";
import { buildMemoryConflictPreflight } from "./memoryConflictPreflight.js";
import { buildMemoryContradictionSets, createMemoryClaim, createMemoryClaimRelation, evaluateMemoryClaimTemporal, listMemoryClaimRelations, listMemoryClaims, persistMemoryClaim, persistMemoryClaimRelation, persistMemoryClaimRelationRevocation, readMemoryClaim, retconMemoryClaim, settleMemoryClaim } from "./memoryClaim.js";
import { calculateChapterAssetCoverage, createChapterMemoryPatch, evaluateMemoryPatchAdoption, persistChapterMemoryPatch, readChapterMemoryPatch } from "./chapterMemoryPatch.js";
import { persistMemoryClaimCandidates } from "./memoryClaimCandidate.js";
import { commitMutationPlan, createMutationPlan, evaluateMutationPlan, persistMutationPlan, readMutationPlan as readRuntimeMutationPlan, recoverMutationPlan, rollbackMutationPlan } from "./mutationPlan.js";
import { confirmAliasAssertion, createAliasAssertion, createMemoryEntityIdentity, listAliasAssertions, listMemoryEntities, mergeMemoryEntities, persistAliasAssertion, persistMemoryEntity, replayPersistedMemoryEntities, resolveMemoryAlias, splitMemoryEntity, type MemoryEntityIdentity, type MemoryEntityKind } from "./memoryEntity.js";
import { createCharacterKnowledgeState, createReaderKnowledgeState as createMemoryReaderKnowledgeState, evaluateCharacterKnowledge, evaluateReaderKnowledge, listCharacterKnowledgeStates, listReaderKnowledgeStates, persistCharacterKnowledgeState, persistReaderKnowledgeState } from "./memoryKnowledge.js";
import { hasSettledChapterSettlement } from "./chapterSettlement.js";
import { buildMemoryRetconImpactReport } from "./memoryRetconImpact.js";
import { executeMemoryRetconRebuild } from "./memoryRetconRebuild.js";
import { buildCreationRuntimeSnapshot } from "./runtimeSnapshot.js";
import { buildProjectAuditReport } from "./auditReport.js";
import { buildCapabilityBaseline } from "./capabilityBaseline.js";
import { buildProjectInventory } from "./projectInventory.js";
import { buildRp0EvaluationSuite } from "./evaluationFixtures.js";
import { buildDurabilityBaseline } from "./durabilityBaseline.js";
import { appendObligationEvent, createNarrativeObligation, listNarrativeObligations, readNarrativeObligation, type ObligationStatus, type ObligationType } from "./narrativeObligation.js";
import { auditNarrativeObligationCoverage } from "./obligationCoverage.js";
import { createLegacyLedgerMigrationReceipt, persistLegacyLedgerMigration } from "./legacyLedgerMigration.js";
import { buildNarrativeObligationCandidates } from "./obligationCandidates.js";
import { adoptNarrativeObligationCandidate } from "./obligationCandidateAdoption.js";
import { assertObligationCoverageCertificateCurrent, invalidateObligationCoverageCertificate, issueObligationCoverageCertificate } from "./obligationCertificate.js";
import { createRevisionIntent, listRevisionIntents, type RevisionIntentType, type RevisionMaturity, type RevisionIntentMode } from "./revisionIntent.js";
import { buildRevisionImpactReport } from "./revisionImpact.js";
import { createRevisionChangeSet, type RevisionChangeOperation } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet, type RevisionReviewInput } from "./revisionReview.js";
import { createRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { recordRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";
import { settleRevision } from "./revisionSettlement.js";
import { createProjectBackup, listProjectBackups, readBackupVerification, readProjectBackup, verifyProjectBackup } from "./projectBackup.js";
import { readRestoreDrill, runRestoreDrill } from "./restoreDrill.js";
import { listRecoverySettlements, readRecoverySettlement, settleRecovery } from "./recoverySettlement.js";
import { advanceSteeringEvent, createSteeringEvent, readSteeringEvent } from "./steeringEvent.js";
import { assertRuntimeControlFreshness } from "./runtimeControlFence.js";
import { createRestorePlan, readRestorePlan } from "./restorePlan.js";
import { readBackupPolicy, saveBackupPolicy } from "./backupPolicy.js";
import { appendAuthorMessage, appendSessionMessage, readCreativeSession, updateCreativeSessionState } from "./creativeSession.js";
import { buildAuthorResumeBrief } from "./authorResumeBrief.js";
import { buildCreativeJourneyProjection } from "./creativeJourney.js";
import { persistCreativeJourneyProjection, readCreativeJourneyProjection } from "./creativeJourneyStore.js";
import { buildUnderstandingPreview } from "./understandingPreview.js";
import { buildCreativeTimelineProjection } from "./creativeTimeline.js";
import { persistCreativeTimelineProjection, readCreativeTimelineProjection } from "./creativeTimelineStore.js";
import { fingerprintCreativeSession, freezeContextManifest, readContextManifest } from "./contextManifest.js";
import { evaluateTaskContextManifestFreshness, readTaskContextManifest } from "./taskContextManifest.js";
import { evaluateContextPlan } from "./contextPlanGate.js";
import { evaluateContextSources } from "./contextSourceGate.js";
import { evaluateContextPrivacy } from "./contextPrivacyGate.js";
import { auditContextRecords } from "./contextIntegrityGate.js";
import { evaluateContextFacts } from "./contextConflictGate.js";
import { evaluateContextReplay, evaluatePostCallEvidence } from "./contextEvidenceGate.js";
import { evaluateRunPreflight, persistRunPreflight, readRunPreflight } from "./runPreflight.js";
import { evaluateCircuitDecision, evaluateRetryDecision } from "./executionResilience.js";
import { createModelCallFingerprint, evaluateModelCallReplay } from "./modelCallFingerprint.js";
import { evaluateCompletionEvidence, evaluateStructuredOutput } from "./aiOutputGovernance.js";
import { buildAuthorExecutionStrategy, buildCostSavingPlan, evaluateExecutorFailover } from "./executionStrategy.js";
import { compareCandidates } from "./candidateComparison.js";
import { persistCandidateComparison, readCandidateComparison } from "./candidateComparisonStore.js";
import { createDecisionCostPreview, createReviewCompression } from "./contractDecisionPresentation.js";
import { evaluateObjectiveContribution, resolveObjectiveHierarchy } from "./objectiveHierarchy.js";
import { createQ003Profile, createStageObjectiveWeights, evaluateAntiGoalGuard } from "./draftingGovernance.js";
import { createStableDeepLink, resolveStableDeepLink } from "./stableDeepLink.js";
import { analyzeObjectiveChange, monitorObjectiveDrift } from "./objectiveEvolution.js";
import { appendModelInvocation, createModelInvocationRecord, evaluateInvocationBudget, readModelInvocations } from "./modelInvocationLedger.js";
import { settlePersistedModelInvocation } from "./modelInvocationSettlement.js";
import { verifyModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";
import { evaluateProviderRun } from "./providerEvaluation.js";
import { runProviderProbe } from "./providerProbe.js";
import { evaluateRp3ContractAcceptance } from "./rp3ContractAcceptance.js";
import { persistRp3AuthorAcceptance, readRp3AuthorAcceptance } from "./rp3AuthorAcceptance.js";
import { evaluateOutlineReleaseGate } from "./outlineReleaseGate.js";
import { evaluateRp4OutlineAcceptance } from "./rp4OutlineAcceptance.js";
import { routeModelCapability } from "./modelRoutingPolicy.js";
import { evaluateProviderFailover } from "./providerFailover.js";
import { evaluateIndependentReviewGate } from "./independentReviewGate.js";
import { acceptDebateDecision, createDebateDecision } from "./debateDecision.js";
import { evaluateUnderstandingPreflight } from "./understandingPreflight.js";
import { readUnderstandingBudget, reserveUnderstandingBudget } from "./understandingBudget.js";
import { authorizeUnderstandingCapability, readUnderstandingCapabilityAuthorization } from "./understandingAuthorization.js";
import { buildUnderstandingRiskProfile } from "./understandingRiskProfile.js";
import { createDialogueQuestion, readDecisionRecords, readDialogueQuestions } from "./dialogueQuestions.js";
import { UNDERSTANDING_QUESTION_SEQUENCE, nextUnansweredQuestion } from "./understandingQuestionSequence.js";
import { advanceUnderstandingAfterConfirmedAnswer } from "./understandingJourneyService.js";
import { createDialogueRedBlueCase, persistDialogueRedBlueCase, readDialogueRedBlueCase } from "./dialogueRedBlue.js";
import { readDecisionImpactReport } from "./decisionImpact.js";
import { projectDecisionRecords } from "./decisionProjection.js";
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
import { enqueueExecutionWorkItem, listExecutionWorkItems, readExecutionWorkItem } from "./executionQueue.js";
import { checkExecutionReadiness } from "./executionReadiness.js";
import { listProseCandidates, readProseCandidate, validateProseCandidate } from "./proseCandidate.js";
import { validateAndPersistProseCandidate, readProseValidationBundle } from "./proseValidation.js";
import { listRedBlueReviews, readRedBlueReview, reviewProseCandidateById } from "./proseReview.js";
import { createProseRepairPlan, readProseRepairPlan } from "./proseRepairPlan.js";
import { createProseRepairCandidate, readProseRepairCandidate } from "./proseRepairCandidate.js";
import { evaluateProseRepairRegression, readProseRepairRegression } from "./proseRepairRegression.js";
import { readAuthorFeedbackEvent, recordAuthorFeedback } from "./authorFeedback.js";
import { createFeedbackAttribution, derivePreferenceHypothesis, promotePreferenceHypothesis, readFeedbackAttribution, readPreferenceHypothesis, recordPreferenceOpposition, revokePreferenceHypothesis } from "./feedbackLearning.js";
import { createCraftFeedbackAttribution, deriveCraftFeedbackPreference } from "./craftFeedbackLearning.js";
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
import { persistCraftRevocationRecord, readCraftRevocationRecord } from "./craftRevocationStore.js";
import { admitCharacterToCast, classifyCharacterDocument, registerCharacterIdentity } from "./characterIdentity.js";
import { resolveCharacterFieldTruth } from "./characterTruth.js";
import { createPatternTransferPlan, evaluateSimilarityGuard, readPatternTransferPlan } from "./patternTransfer.js";
import { attachCraftProviderEvaluation, attachCraftReaderCalibration, createCraftExperiment, judgeCraftExperiment, listCraftExperiments, readCraftExperiment, recordCraftExperimentDecision, startCraftExperiment } from "./craftExperiment.js";
import { listCraftFeedbackEvents, recordCraftFeedback } from "./craftFeedback.js";
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
import { evaluateReminderProgression } from "./reminderProgression.js";
import { evaluateObligationMemoryRisk } from "./obligationMemoryRisk.js";
import { evaluateTransformationClosure } from "./transformationClosureGate.js";
import { evaluateMultiObligationPayoff } from "./multiObligationPayoff.js";
import { evaluateObligationConflictGate } from "./obligationConflictGate.js";
import { createChapterIntent, validateChapterContinuity } from "./chapterContinuityValidator.js";
import { createLongChapterCheckpoint, resumeLongChapter } from "./longChapterRecovery.js";
import { evaluateAuthorParagraphLocks } from "./authorParagraphLock.js";
import { evaluateCrossChapterTemplate } from "./crossChapterTemplateGuard.js";
import { createLocalRepairPlan, validateLocalRepairPlan } from "./localRepairPlanner.js";
import { composeWritingCandidates } from "./candidateComposition.js";
import { evaluateWritingStopCondition } from "./writingStopCondition.js";
import { createProseGenerationManifest, evaluateProseCandidateFreshness, persistProseGenerationManifest, readProseGenerationManifest } from "./proseGenerationManifest.js";
import { readCandidateFreshness, recordCandidateFreshness } from "./candidateFreshness.js";
import { createIntentDraft } from "./intentDraft.js";
import { evaluateQuestionValue } from "./questionValueGate.js";
import { createQuestionSession, classifyQuestionAnswer } from "./questionInteraction.js";
import { closeQuestionsWithEvidence } from "./answerEvidenceClosure.js";
import { applyCorrectionBeforeContinue } from "./correctionBeforeContinue.js";
import { reaskWithNewPremise } from "./questionReask.js";
import { reconcileOfflineAnswer } from "./staleAnswerReconciliation.js";
import { evaluateScopedPreferenceApplication } from "./scopedPreferenceApplication.js";
import { auditCompressedMemory } from "./memoryCompressionAudit.js";
import { propagateMemoryForget } from "./memoryForgetPropagation.js";
import { persistMemoryForget } from "./memoryForgetStore.js";
import { gateRuntimeResult } from "./runtimeResultGate.js";
import { evaluateQuestionTimeout } from "./questionTimeoutGate.js";
import { rebuildAfterRestart } from "./restartRecoveryProjection.js";
import { reconcileOfflineMessages } from "./offlineMessageReconciliation.js";
import { applyCoreferenceRepair, createCoreferenceRepair } from "./coreferenceRepair.js";
import { importLegacyQuestions } from "./legacyQuestionImport.js";
import { auditOpenContract } from "./openContractAudit.js";
import { compileObjectiveSentence } from "./objectiveSentenceCompiler.js";
import { evaluateObjectiveCandidate } from "./objectiveCandidateGuard.js";
import { resolveScopedObjective } from "./objectiveScopeOverride.js";
import { buildObjectiveConflictOptions } from "./objectiveConflictOptions.js";
import { createObjectiveWeightRelease, explainCandidateWithRelease } from "./objectiveWeightRelease.js";
import { evaluateNearFarCandidate } from "./longTermCandidateGate.js";
import { detectAbstractAntiGoal } from "./antiGoalSemanticGuard.js";
import { reportAestheticEvidence } from "./aestheticEvidence.js";
import { classifyObjectiveTargetImpact } from "./objectiveTargetImpact.js";
import { proposeObjectiveCalibration } from "./objectiveCalibration.js";
import { buildQ003DualTrackReport } from "./q003DualTrackReport.js";
import { attributePartialAdoption } from "./partialAdoptionAttribution.js";
import { attributeManualRevision } from "./manualRevisionAttribution.js";
import { proposeFeedbackScope } from "./feedbackScopeProposal.js";
import { classifyPreferenceRevocation } from "./preferenceRevocationCause.js";
import { updatePreferenceHypothesis } from "./preferenceHypothesis.js";
import { classifyFeedbackEvidence } from "./feedbackEvidenceWeight.js";
import { createConfoundedFeedbackProbe } from "./confoundedFeedbackProbe.js";
import { consumeSafeExploration } from "./safeExplorationBudget.js";
import { isolateFeedbackProject } from "./feedbackProjectIsolation.js";
import { evaluateLearningRelease } from "./learningReleaseGate.js";
import { assertCraftPatternReleaseRefs, createLearningRelease, readLearningRelease, rollbackLearningRelease, rollbackLearningReleaseForRegression, rollbackLearningReleasesForRegression } from "./learningRelease.js";
import { auditFirstSlice } from "./firstSliceReadiness.js";
import { auditRuntimeReuse } from "./runtimeReuseAudit.js";
import { classifyQuestionCapability } from "./capabilityQuestionGate.js";
import { checkDialogueQuestionSchema } from "./schemaCompatibilityGate.js";
import { enforceServerCapability } from "./serverCapabilityGate.js";
import { evaluateLegacyProjectOpen } from "./legacyProjectOpenGate.js";
import { evaluateWriteAuthority } from "./writeAuthorityGate.js";
import { evaluateForwardReadOnly } from "./forwardReadOnlyGate.js";
import { evaluateMigrationActivation } from "./migrationActivationGate.js";
import { evaluateSliceEvidence } from "./sliceEvidenceGate.js";
import { evaluatePartnerJourney } from "./partnerJourneyGate.js";
import { evaluateUpstreamRepair } from "./upstreamRepairGate.js";
import { quarantineUnresolvedSource } from "./sourceQualificationQuarantine.js";
import { migrateLegacyStyleSample } from "./styleSampleMigrationGate.js";
import { evaluateCraftPattern } from "./craftPatternGate.js";
import { evaluateGenerationAntiImitation } from "./generationAntiImitationGate.js";
import { evaluatePatternEvidence } from "./patternEvidenceGate.js";
import { evaluatePatternApplicability } from "./patternApplicabilityGate.js";
import { evaluateCrossProjectSurface } from "./crossProjectSurfaceGate.js";
import { selectResearchForGap, evaluateEvidenceMinimum, resolveCraftConflict, evaluatePatternExperiment } from "./researchSelectionGates.js";
import { evaluateStructuralSimilarity, applyPatternScope, detectNegativePattern, createCraftLineageAudit, invalidateDerivedEvidence } from "./patternLifecycleGates.js";
import { compileFuzzyIdea, separateStoryQuestions, validateEndingPrerequisites, validateArcGraph, detectDependencyCycle } from "./storyEngineGates.js";
import { evaluateVolumeContract, reviewChapterFunction, locateSceneSeam, evaluateCrossLayerOrphans } from "./chapterStructureGates.js";
import { evaluatePlannedObligations, detectPacingFatigue, evaluateChapterCapacity, classifyPlanHorizon } from "./planningLoadGates.js";
import { evaluateOutlineCandidateAdoption, compareStructureCandidates, validateStaticOutline, preserveSemanticReferences, planImpactSubgraph, settleEmergenceCandidate } from "./outlineGovernanceGates.js";
import { evaluateExecutionReadiness, freezeProseTaskInput, evaluateAutonomousCanonWrite, relocateSemanticPatch, evaluateSceneLedger, evaluateBeatEvidence as evaluateExecutionBeatEvidence } from "./executionGovernanceGates.js";
import { evaluateAgencyChain as evaluateNarrativeAgencyChain, evaluateVoiceDrift as evaluateNarrativeVoiceDrift, evaluateDialogueAction as evaluateNarrativeDialogueAction, evaluatePovKnowledge as evaluateNarrativePovKnowledge, evaluateNarrativeDistance as evaluateNarrativeDistanceGate, evaluateEmotionalAftermath as evaluateNarrativeEmotionalAftermath } from "./narrativeIntegrityGates.js";
import { evaluateSettingActionability, evaluateCognitiveBudget as evaluateCraftCognitiveBudget, detectRhythmMonotony, validateSegmentSeam, recoverLongChapter, detectStagnation as detectCraftStagnation, synthesizeRedBlue, evaluateMultiDomainValidation } from "./craftExecutionGates.js";
import { createLocalRepairPlan as createRevisionLocalRepairPlan, evaluateRegressionAdoption, commitPartialAdoption, rejectCandidateDerivatives, evaluateChapterSettlement } from "./revisionSettlementGates.js";
import { classifyObjectObligation, evaluateReaderExpectation, updateHypothesisGraph, classifyClueDirection, clusterEvidenceSources, evaluateFairnessBundle } from "./fairnessEvidenceGates.js";
import { scheduleClosure, resolveWindowConflict, adaptReminder, detectAnswerLeak, settleSharedObject, evaluatePayoffForm, evaluateClosureScene, propagateClosure, evaluateNarrativeInterest } from "./closureSchedulingGates.js";
import { propagateClosureDamage, issueCoverageCertificate, issueClosureCertificate as issueIntegrityClosureCertificate, evaluateFirstInput, allocateQuestionBudget, escalateDecision, recordReversibleDefault, classifyDecisionLevel } from "./closureIntegrityGates.js";
import { settleDerivedAnswer, createDecisionBundle as createAuthorDecisionBundle, presentChoice, summarizeStoryCost, scopeDelegation, resolveContinue, handleOffline, reuseConfirmedFact, propagateCorrection } from "./authorInteractionGates.js";
import { buildReviewFirstScreen, throttleTaskNotifications, buildResumeBrief, evaluateCollaborationPreference, presentUserLanguage, evaluateClickValue, evaluateKernelValue } from "./collaborationUxGates.js";
import { checkSchemaCompatibility, executeMutationPlan, unifyCandidateKernel, createMinimalObligation, isolateLegacySamples, enforceDependencyProof } from "./kernelCapabilityGates.js";
import { evaluateShadowParser, enforceCanonAuthority, evaluateLegacyRetirement } from "./authorityMigrationGates.js";
import { applyQualityStrategy, advanceEvidenceStatus, classifyClaimAuthority, enforceCharacterVisibility, resolveTemporalKnowledge, keepSameNameSeparate, preserveContradiction, supersedeClaim, transferCharacterKnowledge, preserveCharacterBelief, separateReaderAndPov, filterEligibility, buildRetconImpactReport, propagateEvidenceDeletion, preserveBodyTruthOverSummary, validateLossyCompression, rankEligibleClaims, constrainKnowledgeQuery, groupEvidenceFamily, reportEvidenceGap, gateGenerationOnConflict, keepNewFactsCandidate, assessMemoryHealth, deterministicRebuild, preserveEligibilityOnEmbeddingFallback, auditContinuity, activateK5 } from "./knowledgeTruthGates.js";
import { evaluateExperienceContract, classifyReaderHypothesis, sealColdRead, preserveCompetingReaderQuestions, classifyAmbiguity, assessAttachmentEvidence, separateEmotionAndReaderImpact, settleCuriosity, evaluateReaderPayoffEvidence } from "./experienceDecisionGates.js";
import { assessCounterfactualScene, classifySurprise, assessLongitudinalExperience, preserveReaderDivergence as preserveExperienceReaderDivergence, gateReviewerCalibration, invalidateAfterRevision, preserveRepairAdvantages, revokeReaderFeedback, boundExperienceDossier } from "./experienceReviewGates.js";
import { arbitratePrimaryAction, assessJourneyEvidence, deduplicateAction, gateShellShadow, isolateProjectContinuation, isolateTaskChapter, parseAuthorReceipt, preserveStageOnViewSwitch, prioritizeSafety, reconcileWorkspace, recoverFailedCard, registerSurfaces } from "./interactionOrchestrationGates.js";
import { classifyCharacterSource, detectAgencyBreak, evaluateCharacterArc, ignoreCoPresenceWithoutChange, modelBeliefPhases, preserveAsymmetricRelation, preserveCharacterUnknowns, preserveSourceConflict } from "./characterCausalityGates.js";
import { assessCharacterFunction, assessEnsembleAttention, assessIndependentOpponent, assessMisunderstandingRepair, buildIdentityBreakImpact, issueArcCertificate, preserveRelapseProgress, scopeCharacterChange, validateOffscreenAction, validateRelationalVoice } from "./relationshipCausalityGates.js";
import { allowCompatibleExploration, applyPartialAdoption, applyScopedDefault, assessReadinessScope, authorizeReadinessScope, blockGenreInference, captureSeed, dedupeCandidates, describeCandidateDifference, deterministicCompile, extractSeedFields, preserveCompileFailure, preserveInterpretations, prioritizeQuestion, recommendEvidenceCandidate, recompileAffected, requireProvenance, separateProjectState, shadowLegacyCompile } from "./seedCompilationGates.js";
import { applyRegionalRule, assessContextualVictory, checkTravelFeasibility, conserveResource, enforceAbilityPrerequisites, enforceBodyAndCooldown, enforceRuleBoundary, preserveInstitutionBelief, projectStoryClock, scanWorldDocument, scheduleInstitutionResponse, settleTemporaryBoost, assessRuleConsequences, gateDeusExRule, recordRuleException, preserveRuleInteractionCandidates, minimizeRuleExposition, scopeRuleChange, assessWorldHealth, issueWorldCertificate } from "./worldCausalityGates.js";
import { classifyNormativeStrength, gateConvergenceExpansion, preserveSemanticLint, requireDeferDecision, separateReleaseVision, validateFirstSlice } from "./requirementGovernanceGates.js";
import { compareReadModel, enforceCaptureConvergence, guardUnderstandingVersion, preserveAuthorUtterance, preserveSemanticDowngrade, publishJourneyProjection, resolveCaptureCrash, resolveControlCommand } from "./journeyProjectionGates.js";
import { buildPurposeManifest, enforceK4, guardLateUnderstanding, recoverUnderstandingTask, replayContextManifest, validateT0Coverage, validateUnderstandingEvidence } from "./understandingGates.js";
import { freezeEdition, renderDeterministically, replayCompletionAudit, settleDelivery, summarizeObligationBadges } from "./publicationGates.js";
import { compareSourceScope, planResearch, propagateSourceCorrection, quarantineSource } from "./researchGovernanceGates.js";
import { diagnoseImport, gatePunctuationRepair, isolateModelPackaging, settleRoundTrip } from "./textIntegrityGates.js";
import { createBackupSlice, restoreIsolated, settleDisasterRecovery, verifyBackupCatalog } from "./backupRecoveryGates.js";
import { parseCollaborationMessage } from "./collaborationMessage.js";
import { createQuestionGovernance, registerQuestion, updateCollaborationPolicy } from "./questionGovernance.js";
import { createCollaborationProgress } from "./collaborationProgress.js";
import { createIntentCorrection, propagateIntentCorrection } from "./intentCorrection.js";
import { createExploratoryDraft } from "./exploratoryDraft.js";
import { buildStorySeedFrame, captureAuthorUtterance, createSeedInterpretationSet, persistAuthorUtterance, persistSeedInterpretationSet, persistStorySeedFrame, readAuthorUtterances, readSeedInterpretationSets, readStorySeedFrames } from "./storySeed.js";
import { applyReversibleDefault, assessSeedConfidence, createSafeSeedExploration, evaluateStoryContractReadiness } from "./seedReadiness.js";
import { createSeedContractCandidates, evaluateSeedBranchQuestion } from "./seedBranchQuestion.js";
import { adoptSeedFields, createSeedRecompileReceipt, persistSeedAdoption, persistSeedAdoptionRevocation, persistSeedRecompileReceipt, readSeedAdoption, readSeedAdoptionRevocations, readSeedRecompileReceipts, recompileSeedIncrementally, revokeSeedAdoption } from "./seedAdoption.js";
import { advanceSeedCompilationAfterInterpretation, createSeedCompilationState, deriveSeedStateAfterAdoption, deriveSeedStateAfterRevocation, persistSeedCompilationState, readSeedCompilationState, recordSeedCompilationFailure } from "./seedCompilationState.js";
import { createSeedAssetImpactReport, persistSeedAssetImpactReport } from "./seedAssetImpact.js";
import { compileLegacySeedShadow, createStoryContractReadinessProof, replaySeedCompilation } from "./seedDurability.js";
import { atomizeIntent, createDialogueUtterance, createUnderstandingSnapshot, evaluateUnderstandingEvidence } from "./dialogueUnderstanding.js";
import { appendDialogueUtterance, readDialogueUtterances } from "./dialogueUtteranceStore.js";
import { appendDialogueIntentAtoms, readDialogueIntentAtoms } from "./dialogueIntentStore.js";
import { evaluateUnderstandingEvidenceBundle } from "./understandingEvidenceBundle.js";
import { createMisunderstandingIncident as createMisunderstandingIncidentRecord, resolveMisunderstandingIncident } from "./misunderstandingIncident.js";
import { createDelegationGrant, createProvisionalAssumption, rankDialogueQuestions, renderNonLeadingQuestion } from "./dialoguePolicy.js";
import { applyDialogueAnswerSegments, classifyDialogueAnswer, compressDialogueMemory, createMisunderstandingIncident, createPreferenceProbe } from "./dialogueLifecycle.js";
import { acceptPreferenceProbeSelection, createDialogueMemoryRecord, createPreferenceProbeSelection, forgetDialogueMemory, reviseDialogueMemory } from "./dialogueMemoryGovernance.js";
import { createCreativeObjectiveProfile, evaluateObjectiveConflict } from "./creativeObjective.js";
import { advanceRuntimeInterruption, classifyRuntimeInterruption, reconcileDialogueSession } from "./dialogueRuntime.js";
import { createObligationKnowledgeBoundary, createPayoffContract, createSetupEvidence, evaluatePayoffEvidence } from "./obligationEvidence.js";
import { detectObligationConflict, proposeObligationMerge, recordPartialPayoff, transformObligation } from "./obligationResolution.js";
import { assessObligationSourceCoverage, authorizeIntentionalOpen, evaluateObligationWindow, planObligationRepair, projectObligationExit, projectObligationVisibility } from "./obligationGovernance.js";
import { evaluateObligationEvidenceInvalidation } from "./obligationEvidenceInvalidation.js";
import { evaluateObligationReviewDisagreement } from "./obligationReviewDisagreement.js";
import { createObligationEditorMarkers, evaluateObligationCompletionGate, exportObligationManuscript, freezeObligationPublication, migrateLegacyObligations } from "./obligationPublication.js";
import { auditObligationPublication, persistObligationPublication, readObligationPublication } from "./obligationPublicationArchive.js";
import { evaluateObligationClosureGate } from "./obligationClosureGate.js";
import { createUnderstandingVersion, reviseUnderstandingVersion } from "./understandingVersion.js";
import { captureMultiIntent } from "./multiIntentCapture.js";
import { projectInferenceSafety } from "./inferenceSafety.js";
import { applyScopedAssumptionRepair } from "./reversibleAssumptionRepair.js";
import { evaluateAmbiguityImpactGate } from "./ambiguityImpactGate.js";
import { authorizeBoundedDelegation, createBoundedDelegationGrant, revokeBoundedDelegation } from "./boundedDelegation.js";
import { createAmbiguousAnswerState } from "./ambiguousAnswerState.js";
import { admitNarrativeObligation, calibrateReaderExpectation, createClueClaim, createFairnessBundle, createHypothesisGraph, validateClueIndependence } from "./closureGovernance.js";
import { createClosureSceneContract, createClosureSchedule, detectExposureRisk, planAdaptiveReminder, propagateClosureOutcome, reservePayoffCapacity } from "./closureExecution.js";
import { assessReaderCognitiveLoad, createColdReadSnapshot, createReaderExperienceContract, createReaderExperienceHypothesis, createReaderKnowledgeState, evaluateReaderPayoff } from "./readerExperience.js";
import { assessSceneNecessity, calibrateReaderReviewer, createExperienceTimeline, createReaderExperienceDossier, evaluateSurpriseFairness, preserveReaderDivergence } from "./readerReview.js";
import { createResearchClaim, createResearchConsumptionReceipt, createResearchSourceSnapshot, evaluateResearchClaim, evaluateResearchConsumption, evaluateResearchPublicationGate, identifyResearchObligation, persistResearchClaim, persistResearchConsumptionReceipt, persistResearchSettlement, persistResearchSourceSnapshot, persistResearchObligation, propagateResearchClaimAssessment, propagateResearchClaimCorrection, propagateResearchSourceRevocation, readResearchClaim, readResearchConsumptionReceipt, readResearchSettlement, readResearchSourceRevocation, readResearchSourceSnapshot, readResearchObligation, revokeResearchSource, correctResearchClaim, settleResearchClaim } from "./researchGrounding.js";
import { createResearchConflictCase, persistResearchConflictCase, persistResearchConflictResolution, readResearchConflictCase, resolveResearchConflictCase } from "./researchConflict.js";
import { evaluateResearchSourceReliability } from "./researchReliability.js";
import { evaluateResearchFactCheck, persistResearchFactCheck, readResearchFactCheck } from "./researchFactCheck.js";
import { createTextDiagnostic, createTextProfile, parseTextStructure, settleTextRoundTrip } from "./textProfile.js";
import { createBackupPolicy, createBackupVerification, createRestorePlan as createDurabilityRestorePlan, settleRecovery as settleDurabilityRecovery } from "./durabilityGovernance.js";
import { createFalseClueFairness, createForeshadowing, recordForeshadowingEvidence, transitionForeshadowing } from "./foreshadowing.js";
import { authorizeForeshadowingWaiver, detectForeshadowingConflict, evaluateForeshadowingWindow, freezeForeshadowingPublication, migrateLegacyForeshadowing, planForeshadowingRepair, projectForeshadowingVisibility, transformForeshadowing } from "./foreshadowingGovernance.js";
import { createCapabilityDependencyProof, createProjectCapabilityManifest, createRequirementEvidenceLink, enforceSingleWriteAuthority } from "./deliveryGovernance.js";
import { readProjectCapabilityManifest, writeProjectCapabilityManifest } from "./projectCapabilityManifest.js";
import { assertCapabilityWriteAllowed } from "./capabilityWriteGate.js";
import { readRequirementEvidenceLink, writeRequirementEvidenceLink } from "./requirementEvidenceStore.js";
import { readCapabilityDependencyProof, writeCapabilityDependencyProof } from "./capabilityDependencyStore.js";
import { readKernelProof, writeKernelProof } from "./kernelProofStore.js";
import { createAISafetyGate, createCandidateBoundary, createKernelProof, createLongMemoryProof, createObligationCoreProof, validateMutationPlan } from "./kernelGovernance.js";
import { calibrateEvaluator, createBlindPair, createEvaluationSuite, createReleaseDecision, detectEvaluationContamination, freezeEvaluationInput, monitorEvaluatorDrift, persistReleaseDecision, readReleaseDecision } from "./evaluationGovernance.js";
import { persistBlindPair, persistContaminationResult, persistEvaluationSuite, persistEvaluatorCalibration, persistEvaluatorDrift, persistFrozenEvaluationInput, readBlindPairRecord, readContaminationResult, readEvaluationSuiteRecord, readEvaluatorCalibrationRecord, readEvaluatorDrift, readFrozenEvaluationInputRecord } from "./evaluationArtifactStore.js";
import { createEvaluationRunArchive, persistEvaluationRunArchive, readEvaluationRunArchive } from "./evaluationRunArchive.js";
import { createShadowCanaryValidation } from "./shadowCanaryValidation.js";
import { createEvaluationCase, persistEvaluationCase, readEvaluationCase } from "./evaluationCase.js";
import { createStyleSignature, detectStyleDrift } from "./styleDrift.js";
import { createEvaluationSliceBudget, evaluateEvaluationSlice } from "./evaluationSliceBudget.js";
import { assertEvidenceAnchoredEvaluationCurrent, createEvidenceAnchoredEvaluation } from "./evidenceAnchoredEvaluation.js";
import { persistEvidenceAnchoredEvaluation, readEvidenceAnchoredEvaluation } from "./evaluationEvidenceStore.js";
import { decideEvaluationDisagreement } from "./evaluationDisagreement.js";
import { persistEvaluationDisagreement, readPersistedEvaluationDisagreement } from "./evaluationDisagreementStore.js";
import { receiveRunDirection } from "./runDirection.js";
import { detectStagnation } from "./stagnationDetection.js";
import { persistStagnationIncident, readStagnationIncident } from "./stagnationIncidentStore.js";
import { acceptReviewItem, createReviewBatch, persistReviewBatch, readReviewBatch, withdrawReviewItem } from "./reviewBatch.js";
import { createDecisionConsumptionReceipt, persistDecisionConsumptionReceipt, readDecisionConsumptionReceipt } from "./decisionConsumption.js";
import { planRunNotifications, persistNotificationPlan, readNotificationPlan, type NotificationKind, type NotificationLevel } from "./notificationPolicy.js";
import { createEvaluationSamplingPlan, evaluateMultiScaleRegression, summarizeEvaluationSampling } from "./evaluationSampling.js";
import { persistEvaluationSamplingPlan, persistEvaluationSamplingSummary, readEvaluationSamplingPlan, readEvaluationSamplingSummary } from "./evaluationSamplingStore.js";
import { persistEvaluationRegression, readEvaluationRegression } from "./evaluationRegressionStore.js";
import { compareEvaluationCandidate } from "./evaluationPareto.js";
import { persistEvaluationPareto, readEvaluationPareto } from "./evaluationParetoStore.js";
import { persistEvaluationSliceBudget, persistEvaluationSliceResult, readEvaluationSliceBudget, readEvaluationSliceResult } from "./evaluationSliceStore.js";
import { assertAdaptiveEvaluationScaleIntegrity, buildAdaptiveEvaluationScale } from "./adaptiveEvaluationScale.js";
import { assertEvaluationAccessGrantCurrent, createEvaluationAccessGrant, persistEvaluationAccessGrant, readEvaluationAccessGrant, revokeEvaluationAccessGrant } from "./evaluationAccess.js";
import { acquirePersistedWorkLease, readWorkLease, releasePersistedWorkLease, renewPersistedWorkLease } from "./workLeaseStore.js";
import { authorizeSurfaceCommand, createSurfaceCapabilityRegistry, registerSurfaceCapability, type SurfaceCapabilityRegistry } from "./surfaceCapability.js";
import { readSurfaceCapabilityRegistry, writeSurfaceCapabilityRegistry } from "./surfaceCapabilityStore.js";
import { authorizeReceiptAction, createAuthorCommandReceipt } from "./authorCommandReceipt.js";
import { createWorkspaceContinuityToken, reconcileWorkspaceContinuity } from "./workspaceContinuity.js";
import { advancePrimaryAction, createPrimaryActionDecision, resolvePrimaryActionDecision, validatePrimaryActionSubmission } from "./primaryActionDecision.js";
  import { applyAuthorEffortPreference, consumeAuthorEffort, createAuthorEffortBudget } from "./authorEffortBudget.js";
  import { readAuthorEffortBudget, writeAuthorEffortBudget } from "./authorEffortBudgetStore.js";
import { createAutonomyReceipt, createDecisionEscalation, revokeAutonomyReceipt } from "./decisionGovernance.js";
import { acceptDecisionBundle, createDecisionBundle } from "./decisionBundle.js";
import { evaluateDialogueTimeout } from "./dialogueTimeout.js";
import { createSeedCompilationRun, persistSeedCompilationRun, readSeedCompilationRun, replaySeedCompilationRun, transitionSeedCompilationRun } from "./seedCompilationRun.js";
import { createWorldLocation, evaluateLocationReachability, listWorldLocations, readWorldLocation } from "./worldLocation.js";
import { recordWorldTravel } from "./worldTravel.js";
import { buildStoryTimeEventOrder, compareStoryTime, createStoryTimeEvent, listStoryTimeEvents, readStoryTimeEvent } from "./storyTime.js";
import { createCausalityEdge, listCausalityEdges, readCausalityEdge, validateCausalityGraph } from "./causalityGraph.js";
import { validateNarrativeStructure } from "./structureValidation.js";
import { createSemanticNode, listSemanticNodes, projectSemanticNodeOrder, readSemanticNode } from "./semanticNodes.js";
import { createImpactAnalysis, readImpactAnalysis } from "./impactAnalysis.js";
import { createReplanDecision } from "./replanDecision.js";
import { evaluateGraphExpansion, type GraphExpansionChoice } from "./graphExpansionGate.js";
import { evaluateBeatEvidence } from "./beatEvidenceGate.js";
import { evaluateSetupFairness } from "./obligationEvidence.js";
import { adoptEmergenceCandidate, createEmergenceCandidate, readEmergenceCandidate } from "./emergenceCandidate.js";
import { evaluateExecutionReadyGate } from "./executionReadyGate.js";
import { persistExecutionReadyGateReport, readExecutionReadyGateReport } from "./executionReadyGateStore.js";
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
import { createSceneCardContract, listSceneCardContracts } from "./sceneCard.js";
import { createNarrativeTraceLink, listNarrativeTraceLinks, readNarrativeTraceLink, validateNarrativeTrace } from "./narrativeTrace.js";
import { buildObligationLoadReport } from "./obligationLoad.js";
import { createNarrativeCurvePoint, listNarrativeCurvePoints, readNarrativeCurvePoint } from "./narrativeCurve.js";
import { createPlanningNode, readPlanningNode, transitionPlanningNode } from "./planningNode.js";
import { createStructureAlternativeSet, listStructureAlternativeSets, readStructureAlternativeSet } from "./structureAlternatives.js";
import { publishDerivedAssets, readDerivedPublicationTransaction, revalidateDerivedPublication } from "./derivedPublication.js";
import { adoptProseCandidate, listProseAdoptionTransactions, readProseAdoptionTransaction } from "./proseAdoption.js";
import { readChapterSettlement, settleChapter } from "./chapterSettlement.js";
import { assertDraftingExecutionReceipt, createDraftingExecutionReceipt, type DraftingRiskTier } from "./draftingPolicy.js";
import { readChapterExecutionPlan } from "./chapterExecutionPlan.js";
import { readChapterExecutionProof } from "./chapterExecutionProof.js";
import { assertAdaptivePauseDecision, evaluateAdaptivePause } from "./adaptivePausePolicy.js";
import { createAdaptivePauseRecap, persistAdaptivePauseRecap } from "./adaptivePauseRecap.js";
import { createRunReadinessProof, persistRunReadinessProof } from "./runReadiness.js";
import { createBudgetReservation, persistBudgetReservation, readBudgetReservation, settleBudgetReservation } from "./budgetReservation.js";
import { createBookWorkGraph, readBookWorkGraph } from "./bookWorkGraph.js";
import { createPublicationDependencyGraph, readPublicationDependencyGraph } from "./publicationDependencyGraph.js";
import { readFrozenPublicationScope } from "./frozenPublicationScope.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";
import { advanceBookRun, controlBookRun, evaluateBookRunQuiescence, listBookRuns, readBookRun, refreshBookRunDependencyGraph, retryBookRun, startBookRun } from "./bookRun.js";
import { readAutonomyGrant, revokeAutonomyGrant } from "./autonomyGrant.js";
import { evaluateBookRunClosure } from "./bookRunClosure.js";
import { createMilestoneRepairPlan, readMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { recordMilestoneRepairCompletion, readMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";
import { auditMilestoneRepair, readMilestoneAudit } from "./milestoneAudit.js";
import { readCompletionAudit, runBookCompletionAudit } from "./completionAudit.js";
import { buildLengthForecast, createLengthContract, decideLengthVariance, readLengthContract } from "./lengthPlanning.js";
import { previewProjectMigration, readMigrationPreview } from "./migrationPreview.js";
import { activateProjectMigration, readMigrationActivation, readMigrationRollback, readMigrationValidation, rollbackProjectMigration, validateMigrationPreview } from "./migrationValidation.js";
import { readMigrationResolution, resolveMigrationConflicts, type OutlineAuthority } from "./migrationResolution.js";
import { evaluateMigrationCutover } from "./migrationCutover.js";
import { previewAllProjectMigrations, validateAllProjectMigrations } from "./migrationBatchPreview.js";
import { recordReleaseE2EAcceptance, readReleaseE2EAcceptance } from "./releaseE2EAcceptance.js";
import { evaluateReleaseAcceptance, persistReleaseAcceptance, readPersistedReleaseAcceptance } from "./releaseAcceptance.js";
import { activateRelease, readReleaseActivation } from "./releaseActivation.js";
import { createEditionManifest, readEditionManifest } from "./editionManifest.js";
import { compileAndPersistPublicationTree, readPublicationTree } from "./publicationTree.js";
import { readPublicationArtifactSet, renderPublicationArtifacts, type PublicationFormat } from "./publicationArtifacts.js";
import { issueDeliveryProof, revokeDeliveryProof, supersedeDeliveryProof, verifyDeliveryProof } from "./deliveryProof.js";
import { issueDeliveryAccessGrant, revokeDeliveryAccessGrant, verifyDeliveryAccessGrant } from "./deliveryAccessGrant.js";
import { readAuthorizedPublicationArtifact, readDeliveryAccessReceipt, recordDeliveryAccessReceipt } from "./deliveryAccessReceipt.js";
import { createManuscriptRelease, readManuscriptRelease, transitionManuscriptRelease } from "./manuscriptRelease.js";
import { buildReleasePreflight } from "./releasePreflight.js";
import { assertClosureCertificateCurrent, issueClosureCertificate, readClosureCertificate } from "./closureCertificate.js";
import { buildStoryContractReadinessProof, readStoryContractReadinessProof } from "./contractReadiness.js";
import { executeDeterministicUnderstanding, executeShadowUnderstanding, readUnderstandingSnapshot } from "./understandingExecutor.js";
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
import { assertQualityReportCurrent } from "./qualityReportEvidence.js";
import { evaluateQualityGate, persistQualityGateDecision, readQualityGateDecision } from "./qualityGateDecision.js";
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
const protectedSessionWritePaths = new Set([
  "sessions/creative-session.json",
  "sessions/context-manifest.json",
  "sessions/dialogue-question-events.jsonl",
  "sessions/decision-records.jsonl"
]);
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

  if (message === "RUNTIME_CONTROL_STALE") {
    res.status(409).json({ error: { code: message, message: "Runtime control targets a stale run version." } });
    return;
  }
  if (message === "MEMORY_CLAIM_RELATION_VERSION_REQUIRED") {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (message === "MEMORY_CLAIM_ID_CONFLICT") {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (message === "SCENE_LEDGER_EVIDENCE_REQUIRED") {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (message === "SCENE_LEDGER_SCENE_CARD_STALE") {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (message === "RELEASE_E2E_PROOF_STALE") {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (["CALIBRATION_EVIDENCE_INTEGRITY_FAILED", "CALIBRATION_EVIDENCE_SEMANTIC_INVALID", "CALIBRATION_EVIDENCE_HISTORY_INVALID"].includes(message)) {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (message.startsWith("CAPABILITY_WRITE_NOT_AUTHORIZED:")) {
    res.status(409).json({ error: { code: "CAPABILITY_WRITE_NOT_AUTHORIZED", sliceId: message.slice("CAPABILITY_WRITE_NOT_AUTHORIZED:".length) } });
    return;
  }
  if (message === "CAPABILITY_MANIFEST_EXPECTED_FINGERPRINT_REQUIRED" || message === "CAPABILITY_MANIFEST_STALE") {
    res.status(409).json({ error: { code: message } });
    return;
  }
  if (message.startsWith("CAPABILITY_DEPENDENCY_REQUIRED:") || message.startsWith("CAPABILITY_DEPENDENCY_BLOCKED:")) {
    const separator = message.indexOf(":");
    res.status(409).json({ error: { code: message.slice(0, separator), sliceId: message.slice(separator + 1) } });
    return;
  }
  if (message === "CAPABILITY_DEPENDENCY_EXPECTED_FINGERPRINT_REQUIRED" || message === "CAPABILITY_DEPENDENCY_STALE") {
    res.status(409).json({ error: { code: message } });
    return;
  }

  res.status(status).json({ error: message });
};

export function createApp() {
  const app = express();
  const surfaceRegistries = new Map<string, SurfaceCapabilityRegistry>();
  const requireProject = async (projectId: string) => {
    try {
      return await readProject(projectId);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") throw new Error(`Project not found: ${projectId}`);
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

  // Every project-scoped runtime mutation crosses the capability gate.
  // The delivery control-plane endpoints are excluded because they are the
  // authority used to create and update the manifest/dependency proof itself.
  app.use(asyncRoute(async (req, _res, next) => {
    if (!["POST", "PUT", "DELETE"].includes(req.method) || req.path.includes("/runtime/delivery/")) {
      next();
      return;
    }
    const match = req.path.match(/^\/api\/novel\/projects\/([^/]+)\/runtime(?:\/|$)/);
    if (!match) {
      next();
      return;
    }
    const project = await readProject(match[1]);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    next();
  }));

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
    const roughIdea = typeof req.body.roughIdea === "string" ? req.body.roughIdea.trim() : "";
    const idempotencyKey = typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const capture = roughIdea && idempotencyKey
      ? await appendAuthorMessage({
          root: projectRoot(project.slug),
          projectSlug: project.slug,
          clientMessageId: `project-create:${idempotencyKey}`,
          text: roughIdea
        })
      : undefined;
    const compilationRun = roughIdea && capture
      ? await persistSeedCompilationRun(projectRoot(project.slug), createSeedCompilationRun({
          projectSlug: project.slug,
          idempotencyKey,
          inputFingerprint: crypto.createHash("sha256").update(roughIdea, "utf8").digest("hex"),
          compilerVersion: "seed-compiler-v1",
          sourceMessageIds: capture.session.messages.filter((message) => message.role === "author").map((message) => message.id).slice(-1)
        }))
      : undefined;
    res.status(201).json({ project, result: fallbackProjectCreateResult(project.title), ...(capture ? { capture } : {}), ...(compilationRun ? { compilationRun } : {}) });
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

  app.get("/api/novel/release-acceptance/record", asyncRoute(async (_req, res) => {
    const decision = await readPersistedReleaseAcceptance(getDataRoot());
    if (!decision) { res.status(404).json({ error: "Release acceptance record not found" }); return; }
    res.json({ decision });
  }));

  app.get("/api/novel/rp3-contract-acceptance", asyncRoute(async (_req, res) => {
    const repoRoot = getRepoRoot();
    const profilePath = resolveInside(repoRoot, "docs/spec-governance/release-profiles/RP3-contract.json");
    const auditPath = resolveInside(repoRoot, "docs/spec-governance/audits/rp3-contract-slice-acceptance-2026-07-31.json");
    const profile = JSON.parse(await fs.readFile(profilePath, "utf8")) as { mustRequirementIds?: unknown };
    const audit = JSON.parse(await fs.readFile(auditPath, "utf8")) as { scope?: { verifiedRequirements?: unknown } };
    const expectedRequirementIds = Array.isArray(profile.mustRequirementIds)
      ? profile.mustRequirementIds.filter((id): id is string => typeof id === "string")
      : [];
    const verifiedRequirementIds = Array.isArray(audit.scope?.verifiedRequirements)
      ? audit.scope.verifiedRequirements.filter((id): id is string => typeof id === "string")
      : [];
    const authorAcceptance = await readRp3AuthorAcceptance(getDataRoot());
    const decision = evaluateRp3ContractAcceptance({ expectedRequirementIds, verifiedRequirementIds, authorAcceptance });
    res.json({ decision, sources: { profile: "RP3-contract.json", audit: "rp3-contract-slice-acceptance-2026-07-31.json" } });
  }));

  app.post("/api/novel/rp3-contract-acceptance/author", asyncRoute(async (req, res) => {
    try {
      const status: "accepted" | "rejected" | "" = req.body?.status === "rejected" ? "rejected" : req.body?.status === "accepted" ? "accepted" : "";
      if (!status) throw new Error("RP3_AUTHOR_ACCEPTANCE_INPUT_INVALID");
      const record = await persistRp3AuthorAcceptance(getDataRoot(), {
        status,
        actorId: typeof req.body?.actorId === "string" ? req.body.actorId : "",
        authorizationId: typeof req.body?.authorizationId === "string" ? req.body.authorizationId : "",
        evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.filter((value: unknown): value is string => typeof value === "string") : []
      });
      res.status(201).json({ acceptance: record });
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      res.status(code === "RP3_AUTHOR_ACCEPTANCE_ALREADY_RECORDED" ? 409 : 400).json({ error: { code } });
    }
  }));

  app.get("/api/novel/rp4-outline-acceptance", asyncRoute(async (_req, res) => {
    const repoRoot = getRepoRoot();
    const rp4Profile = JSON.parse(await fs.readFile(resolveInside(repoRoot, "docs/spec-governance/release-profiles/RP4-outline.json"), "utf8")) as { mustRequirementIds?: unknown };
    const evidenceMap = JSON.parse(await fs.readFile(resolveInside(repoRoot, "docs/spec-governance/requirement-evidence.json"), "utf8")) as { requirements?: Array<{ requirementId?: unknown; releaseProfile?: unknown; implementationStatus?: unknown; releaseStatus?: unknown }> };
    const rp3Profile = JSON.parse(await fs.readFile(resolveInside(repoRoot, "docs/spec-governance/release-profiles/RP3-contract.json"), "utf8")) as { mustRequirementIds?: unknown };
    const rp3Audit = JSON.parse(await fs.readFile(resolveInside(repoRoot, "docs/spec-governance/audits/rp3-contract-slice-acceptance-2026-07-31.json"), "utf8")) as { scope?: { verifiedRequirements?: unknown } };
    const expectedRequirementIds = Array.isArray(rp4Profile.mustRequirementIds) ? rp4Profile.mustRequirementIds.filter((id): id is string => typeof id === "string") : [];
    const verifiedRequirementIds = Array.isArray(evidenceMap.requirements) ? evidenceMap.requirements.filter((item) => item.releaseProfile === "RP4-outline" && item.implementationStatus === "verified" && item.releaseStatus === "verified").map((item) => item.requirementId).filter((id): id is string => typeof id === "string") : [];
    const rp3Expected = Array.isArray(rp3Profile.mustRequirementIds) ? rp3Profile.mustRequirementIds.filter((id): id is string => typeof id === "string") : [];
    const rp3Verified = Array.isArray(rp3Audit.scope?.verifiedRequirements) ? rp3Audit.scope.verifiedRequirements.filter((id): id is string => typeof id === "string") : [];
    const rp3Decision = evaluateRp3ContractAcceptance({ expectedRequirementIds: rp3Expected, verifiedRequirementIds: rp3Verified });
    const decision = evaluateRp4OutlineAcceptance({ expectedRequirementIds, verifiedRequirementIds, rp3Status: rp3Decision.status });
    res.json({ decision, dependency: rp3Decision, sources: { profile: "RP4-outline.json", evidence: "requirement-evidence.json" } });
  }));

  app.get("/api/novel/release-activation", asyncRoute(async (_req, res) => {
    const activation = await readReleaseActivation(getDataRoot());
    if (!activation) { res.status(404).json({ error: "Release activation not found" }); return; }
    res.json({ activation });
  }));

  app.post("/api/novel/release-activation", asyncRoute(async (_req, res) => {
    const decision = await evaluateReleaseAcceptance();
    try {
      await persistReleaseAcceptance(getDataRoot(), decision);
      const activation = await activateRelease(getDataRoot(), decision);
      res.status(201).json({ activation, decision });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : String(error), decision } });
    }
  }));

  app.post("/api/novel/projects/:projectId/book-runs", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const preflightId = typeof req.body?.preflightId === "string" ? req.body.preflightId.trim() : "";
      if (preflightId) {
        const preflight = await readRunPreflight(projectRoot(project.slug), preflightId);
        if (!preflight) throw new Error("RUN_PREFLIGHT_REQUIRED");
        if (preflight.status !== "ready") throw new Error("RUN_PREFLIGHT_BLOCKED");
        const requestedLimits = req.body?.limits && typeof req.body.limits === "object" ? req.body.limits : {};
        for (const [key, value] of Object.entries(requestedLimits)) {
          if (value === undefined || value === null) continue;
          const frozenValue = (preflight.limits as unknown as Record<string, unknown>)[key];
          if (frozenValue !== undefined && Number(value) !== Number(frozenValue)) throw new Error("RUN_PREFLIGHT_LIMIT_MISMATCH");
        }
      }
      const run = await startBookRun(projectRoot(project.slug), {
        projectSlug: project.slug,
        chapterIds: Array.isArray(req.body?.chapterIds) ? req.body.chapterIds : project.chapters.map((chapter) => chapter.id),
        objective: typeof req.body?.objective === "string" ? req.body.objective : undefined,
        parentRunId: typeof req.body?.parentRunId === "string" ? req.body.parentRunId : undefined,
        storyContractRef: typeof req.body?.storyContractRef === "string" ? req.body.storyContractRef : undefined,
        preflightId: typeof req.body?.preflightId === "string" ? req.body.preflightId : undefined,
        autoContinue: req.body?.autoContinue !== false,
        autonomyLevel: req.body?.autonomyLevel === "L2" ? "L2" : req.body?.autonomyLevel === "L0" ? "L0" : "L1",
        autonomyExpiresAt: typeof req.body?.autonomyExpiresAt === "string" ? req.body.autonomyExpiresAt : undefined,
        limits: req.body?.limits && typeof req.body.limits === "object" ? req.body.limits : {}
      });
      res.status(201).json({ run });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/book-runs/preflight", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const body = req.body ?? {};
    const preflight = evaluateRunPreflight({
      runId: String(body.runId ?? `book-run-preflight-${project.slug}`), objective: String(body.objective ?? ""),
      estimatedChapters: Number(body.estimatedChapters ?? (Array.isArray(body.chapterIds) ? body.chapterIds.length : project.chapters.length)), estimatedWorkItems: Number(body.estimatedWorkItems ?? project.chapters.length), estimatedWallClockMs: Number(body.estimatedWallClockMs ?? 0), estimatedCostCents: Number(body.estimatedCostCents ?? 0),
      missingAssets: Array.isArray(body.missingAssets) ? body.missingAssets.map(String) : [], pausePoints: Array.isArray(body.pausePoints) ? body.pausePoints.map(String) : [], authorizationScope: String(body.authorizationScope ?? ""), worstCaseRecoveryBoundary: String(body.worstCaseRecoveryBoundary ?? ""),
      limits: body.limits && typeof body.limits === "object" ? body.limits : undefined,
      storyContractConfirmed: body.storyContractConfirmed === true, migrationComplete: body.migrationComplete === true, budgetAvailable: body.budgetAvailable === true, workerOnline: body.workerOnline === true, conflictingRun: body.conflictingRun === true
    });
    try {
      const persisted = await persistRunPreflight(projectRoot(project.slug), preflight);
      res.status(preflight.status === "ready" ? 200 : 409).json({ preflight: persisted.preflight, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message === "RUN_PREFLIGHT_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/book-runs/preflight/:runId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const preflight = await readRunPreflight(projectRoot(project.slug), req.params.runId);
    if (!preflight) { res.status(404).json({ error: "Run preflight not found" }); return; }
    res.json({ preflight });
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
    if (!contract || contract.projectSlug !== project.slug) { res.status(404).json({ error: "Length contract not found" }); return; }
    res.json({ contract });
  }));

  app.get("/api/novel/projects/:projectId/length-forecast", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const contract = await readLengthContract(projectRoot(project.slug));
    if (!contract || contract.projectSlug !== project.slug) { res.status(409).json({ error: { code: "LENGTH_CONTRACT_REQUIRED" } }); return; }
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
    const runs = await listBookRuns(projectRoot(project.slug));
    res.json({ runs: runs.filter((run) => run.projectSlug === project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId/autonomy-grant", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const run = await readBookRun(root, req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    const grant = await readAutonomyGrant(root, path.basename(run.autonomyGrantRef, ".json"));
    if (!grant || grant.projectSlug !== project.slug || grant.bookRunId !== run.bookRunId) { res.status(404).json({ error: "AUTONOMY_GRANT_NOT_FOUND" }); return; }
    res.json({ grant });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/autonomy-grant/revoke", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const run = await readBookRun(root, req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    try { const grant = await revokeAutonomyGrant(root, path.basename(run.autonomyGrantRef, ".json"), String(req.body?.reason || "")); res.status(201).json({ grant }); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "AUTONOMY_GRANT_REVOKE_FAILED" } }); }
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/readiness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    let run = await readBookRun(root, req.params.runId);
    if (!run) { res.status(404).json({ error: "Book run not found" }); return; }
    if (run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    const graph = await readBookWorkGraph(root);
    let dependencyGraph = run.publicationDependencyGraphRef ? await readPublicationDependencyGraph(root, path.basename(run.publicationDependencyGraphRef, ".json")) : null;
    if (dependencyGraph?.status === "blocked" && run.publicationDependencyGraphRef) {
      const scope = run.frozenPublicationScopeRef ? await readFrozenPublicationScope(root, path.basename(run.frozenPublicationScopeRef, ".json")) : null;
      if (scope) {
        const refreshedGraph = await createPublicationDependencyGraph({ root, projectSlug: project.slug, frozenScope: scope });
        if (refreshedGraph.fingerprint !== run.publicationDependencyGraphFingerprint) {
          run = await refreshBookRunDependencyGraph(root, run.bookRunId, refreshedGraph.fingerprint);
        }
        dependencyGraph = refreshedGraph;
      }
    }
    const contextManifest = await readContextManifest(root);
    const reservation = await readBudgetReservation(root, `budget-${run.bookRunId}-v${run.version}`);
    const proof = createRunReadinessProof({
      bookRunId: run.bookRunId,
      projectSlug: run.projectSlug,
      runVersion: run.version,
      scopeFingerprint: run.scope.scopeFingerprint,
      frozenPublicationScope: run.scope.chapterIds.length > 0,
      storyContract: typeof run.storyContractRef === "string" && run.storyContractRef.trim().length > 0,
      workGraph: Boolean(graph && graph.fingerprint === run.workGraphFingerprint),
      dependencyGraphStatus: dependencyGraph && dependencyGraph.fingerprint === run.publicationDependencyGraphFingerprint ? dependencyGraph.status : "missing",
      contextManifest: Boolean(contextManifest),
      budgetReservation: Boolean(reservation && reservation.bookRunId === run.bookRunId && reservation.projectSlug === run.projectSlug && reservation.runVersion === run.version && reservation.status === "reserved" && reservation.reservedCents > reservation.consumedCents)
    });
    const persisted = await persistRunReadinessProof(root, proof);
    res.json({ proof: persisted });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/budget-reservations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const run = await readBookRun(root, req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    const limitCents = run.limits.maxBudgetCents;
    if (typeof limitCents !== "number" || !Number.isInteger(limitCents) || limitCents <= 0) { res.status(409).json({ error: { code: "BOOK_RUN_BUDGET_LIMIT_REQUIRED" } }); return; }
    try {
      const reservation = createBudgetReservation({ bookRunId: run.bookRunId, projectSlug: run.projectSlug, runVersion: run.version, limitCents, reservedCents: req.body?.reservedCents === undefined ? undefined : Number(req.body.reservedCents) });
      const persisted = await persistBudgetReservation(root, reservation);
      res.status(201).json({ reservation: persisted });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BUDGET_RESERVATION_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/budget-reservations/settle", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const run = await readBookRun(root, req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    try {
      const reservation = await readBudgetReservation(root, `budget-${run.bookRunId}-v${run.version}`);
      if (!reservation || reservation.bookRunId !== run.bookRunId || reservation.projectSlug !== run.projectSlug || reservation.runVersion !== run.version) throw new Error("BUDGET_RESERVATION_NOT_FOUND");
      const governedInvocations = (await readModelInvocations(root)).filter((record) => record.bookRunId === run.bookRunId && record.budgetReservationId === reservation.reservationId);
      if (governedInvocations.length) throw new Error("BUDGET_SETTLEMENT_REQUIRES_INVOCATION_RECEIPTS");
      const settled = await persistBudgetReservation(root, settleBudgetReservation(reservation, Number(req.body?.consumedCents)));
      res.status(201).json({ reservation: settled });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BUDGET_RESERVATION_SETTLEMENT_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/backups/:backupId/restore-drill", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const receipt = await runRestoreDrill(projectRoot(project.slug), project.slug, req.params.backupId);
      res.status(receipt.status === "verified" ? 201 : 422).json({ receipt });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "RESTORE_DRILL_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/restore-drills/:drillId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const receipt = await readRestoreDrill(projectRoot(project.slug), req.params.drillId);
    if (!receipt || receipt.projectSlug !== project.slug) { res.status(404).json({ error: "Restore drill not found" }); return; }
    res.json({ receipt });
  }));

  app.post("/api/novel/projects/:projectId/recovery-settlements", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const settlement = await settleRecovery({
        root: projectRoot(project.slug), projectSlug: project.slug,
        backupId: String(req.body?.backupId || ""), drillId: String(req.body?.drillId || ""), planId: String(req.body?.planId || ""),
        mode: req.body?.mode === "replace" || req.body?.mode === "repair_missing" || req.body?.mode === "point_in_time" || req.body?.mode === "disaster_failover" ? req.body.mode : "new_project",
        authorConfirmation: typeof req.body?.authorConfirmation === "string" ? req.body.authorConfirmation : "",
        expectedSourceFingerprint: typeof req.body?.expectedSourceFingerprint === "string" ? req.body.expectedSourceFingerprint : ""
      });
      res.status(201).json({ settlement });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "RECOVERY_SETTLEMENT_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/restore-plans", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const plan = await createRestorePlan({ root: projectRoot(project.slug), projectSlug: project.slug, backupId: String(req.body?.backupId || ""), mode: req.body?.mode === "replace" || req.body?.mode === "repair_missing" || req.body?.mode === "point_in_time" || req.body?.mode === "disaster_failover" ? req.body.mode : "new_project", targetWorkspace: String(req.body?.targetWorkspace || ""), estimatedLossWindow: typeof req.body?.estimatedLossWindow === "string" ? req.body.estimatedLossWindow : undefined });
      res.status(201).json({ plan });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "RESTORE_PLAN_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/restore-plans/:planId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readRestorePlan(projectRoot(project.slug), req.params.planId);
    if (!plan || plan.projectSlug !== project.slug) { res.status(404).json({ error: "Restore plan not found" }); return; }
    res.json({ plan });
  }));

  app.get("/api/novel/projects/:projectId/backup-policy", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const policy = await readBackupPolicy(projectRoot(project.slug));
    res.json({ policy });
  }));

  app.put("/api/novel/projects/:projectId/backup-policy", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const body = req.body || {};
      const policy = await saveBackupPolicy(projectRoot(project.slug), { projectSlug: project.slug, trigger: body.trigger === "automatic" || body.trigger === "milestone" ? body.trigger : "manual", maxRpoMinutes: Number(body.maxRpoMinutes), targetRtoMinutes: Number(body.targetRtoMinutes), minimumCopies: Number(body.minimumCopies), faultDomains: Array.isArray(body.faultDomains) ? body.faultDomains.map(String) : [], externalCopyRequired: body.externalCopyRequired === true, maxUnverifiedAgeMinutes: Number(body.maxUnverifiedAgeMinutes) });
      res.status(201).json({ policy });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BACKUP_POLICY_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/recovery-settlements/:settlementId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const settlement = await readRecoverySettlement(projectRoot(project.slug), req.params.settlementId);
    if (!settlement || settlement.projectSlug !== project.slug) { res.status(404).json({ error: "Recovery settlement not found" }); return; }
    res.json({ settlement });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const run = await readBookRun(projectRoot(project.slug), req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    res.json({ run, quiescence: await evaluateBookRunQuiescence(projectRoot(project.slug), run.bookRunId) });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId/closure-readiness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const run = await readBookRun(projectRoot(project.slug), req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "Book run not found" }); return; }
    const sourceFingerprint = typeof req.query.sourceFingerprint === "string" ? req.query.sourceFingerprint : "";
    res.json({ readiness: await evaluateBookRunClosure(projectRoot(project.slug), req.params.runId, sourceFingerprint) });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/repair-plans", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const run = await readBookRun(projectRoot(project.slug), req.params.runId);
    if (!run || run.projectSlug !== project.slug) { res.status(404).json({ error: "BookRun not found" }); return; }
    const issues = Array.isArray(req.body?.issues) ? req.body.issues.filter((issue: unknown): issue is { kind: string; targetId: string; reason: string; evidenceRefs: string[] } => Boolean(issue && typeof issue === "object" && typeof (issue as { kind?: unknown }).kind === "string" && typeof (issue as { targetId?: unknown }).targetId === "string" && typeof (issue as { reason?: unknown }).reason === "string" && Array.isArray((issue as { evidenceRefs?: unknown }).evidenceRefs))).map((issue: { kind: string; targetId: string; reason: string; evidenceRefs: string[] }) => ({ kind: issue.kind as "continuity" | "memory" | "pacing" | "obligation" | "character" | "world" | "projection", targetId: issue.targetId, reason: issue.reason, evidenceRefs: issue.evidenceRefs.map(String) })) : [];
    const plan = await createMilestoneRepairPlan({ root: projectRoot(project.slug), projectSlug: project.slug, bookRunId: run.bookRunId, runVersion: run.version, sourceFingerprint: typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "", scopedChapterIds: run.scope.chapterIds, issues });
    res.status(201).json({ plan });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readMilestoneRepairPlan(projectRoot(project.slug), req.params.planId);
    if (!plan || plan.projectSlug !== project.slug || plan.bookRunId !== req.params.runId) { res.status(404).json({ error: "Repair plan not found" }); return; }
    res.json({ plan });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId/actions/:actionId/complete", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const run = await readBookRun(root, req.params.runId);
    const plan = await readMilestoneRepairPlan(root, req.params.planId);
    if (!run || !plan || run.projectSlug !== project.slug || plan.projectSlug !== project.slug || plan.bookRunId !== run.bookRunId) { res.status(404).json({ error: "Repair plan not found" }); return; }
    const evidenceRefs = Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [];
    const receipt = await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: req.params.actionId, projectSlug: project.slug, bookRunId: run.bookRunId, runVersion: run.version, workItemId: typeof req.body?.workItemId === "string" ? req.body.workItemId : `book-repair-${req.params.actionId}`, evidenceRefs });
    res.status(201).json({ receipt });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId/actions/:actionId/completion", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const receipt = await readMilestoneRepairCompletion(projectRoot(project.slug), `repair-completion-${req.params.planId}-${req.params.actionId}`);
    if (!receipt || receipt.projectSlug !== project.slug || receipt.bookRunId !== req.params.runId || receipt.planId !== req.params.planId || receipt.actionId !== req.params.actionId) { res.status(404).json({ error: "Repair completion not found" }); return; }
    res.json({ receipt });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId/audit", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const plan = await readMilestoneRepairPlan(root, req.params.planId);
    if (!plan || plan.projectSlug !== project.slug || plan.bookRunId !== req.params.runId) { res.status(404).json({ error: "Repair plan not found" }); return; }
    const audit = await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "" });
    res.status(201).json({ audit });
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId/repair-plans/:planId/audits/:auditId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const audit = await readMilestoneAudit(projectRoot(project.slug), req.params.auditId);
    if (!audit || audit.projectSlug !== project.slug || audit.bookRunId !== req.params.runId || audit.planId !== req.params.planId) { res.status(404).json({ error: "Milestone audit not found" }); return; }
    res.json({ audit });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/advance", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try { res.status(201).json(await advanceBookRun(projectRoot(project.slug), req.params.runId, { requireReadiness: true })); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_ADVANCE_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/completion-audits", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const audit = await runBookCompletionAudit(projectRoot(project.slug), req.params.runId, { sourceFingerprint: typeof req.body?.sourceFingerprint === "string" ? req.body.sourceFingerprint : "" });
      res.status(201).json({ audit });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "COMPLETION_AUDIT_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/book-runs/:runId/completion-audits", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const requestedSourceFingerprint = typeof req.query.sourceFingerprint === "string" ? req.query.sourceFingerprint.trim() : "";
    if (requestedSourceFingerprint) {
      try {
        const audit = await runBookCompletionAudit(root, req.params.runId, { sourceFingerprint: requestedSourceFingerprint });
        res.json({ audit, revalidated: true });
      } catch (error) {
        res.status(409).json({ error: { code: error instanceof Error ? error.message : "COMPLETION_AUDIT_INVALID" } });
      }
      return;
    }
    const run = await readBookRun(root, req.params.runId);
    if (!run || run.projectSlug !== project.slug || !run.completionAuditRef) {
      res.status(404).json({ error: "COMPLETION_AUDIT_NOT_FOUND" });
      return;
    }
    const auditId = path.basename(run.completionAuditRef, ".json");
    const audit = await readCompletionAudit(root, auditId);
    if (!audit || audit.bookRunId !== run.bookRunId) {
      res.status(404).json({ error: "COMPLETION_AUDIT_NOT_FOUND" });
      return;
    }
    res.json({ audit });
  }));

  app.post("/api/novel/projects/:projectId/book-runs/:runId/retry", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      res.status(201).json(await retryBookRun(projectRoot(project.slug), req.params.runId, { expectedVersion: Number(req.body?.expectedVersion) }));
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_RETRY_INVALID" } }); }
  }));

  const controlRoute = (action: "pause" | "resume" | "stop") => asyncRoute(async (req: any, res: any) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const run = await controlBookRun(projectRoot(project.slug), req.params.runId, { action, expectedVersion: Number(req.body?.expectedVersion) });
      res.status(201).json({ run, quiescence: await evaluateBookRunQuiescence(projectRoot(project.slug), run.bookRunId) });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_CONTROL_INVALID" } }); }
  });
  app.post("/api/novel/projects/:projectId/book-runs/:runId/pause", controlRoute("pause"));
  app.post("/api/novel/projects/:projectId/book-runs/:runId/resume", controlRoute("resume"));
  app.post("/api/novel/projects/:projectId/book-runs/:runId/stop", controlRoute("stop"));

  app.post("/api/novel/projects/:projectId/publication-editions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const manifest = await createEditionManifest({
        root: projectRoot(project.slug),
        projectSlug: project.slug,
        canonCommitFingerprint: typeof req.body?.canonCommitFingerprint === "string" ? req.body.canonCommitFingerprint : "",
        title: typeof req.body?.title === "string" ? req.body.title : project.title,
        author: typeof req.body?.author === "string" ? req.body.author : "",
        language: typeof req.body?.language === "string" ? req.body.language : "",
        supersedesEditionId: typeof req.body?.supersedesEditionId === "string" ? req.body.supersedesEditionId : undefined,
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
    if (!manifest || manifest.projectSlug !== project.slug) { res.status(404).json({ error: "Publication edition not found" }); return; }
    res.json({ manifest });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/closure-certificate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readEditionManifest(root, req.params.editionId);
    if (!manifest || manifest.projectSlug !== project.slug) { res.status(404).json({ error: "Publication edition not found" }); return; }
    try {
      const certificate = await issueClosureCertificate(root, { projectSlug: project.slug, chapterIds: manifest.chapters.map((chapter) => chapter.chapterId), sourceFingerprint: manifest.canonCommitFingerprint });
      res.status(201).json({ certificate });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "CLOSURE_CERTIFICATE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/closure-certificate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readEditionManifest(root, req.params.editionId);
    const certificate = await readClosureCertificate(root);
    if (!manifest || manifest.projectSlug !== project.slug || !certificate || certificate.projectSlug !== project.slug || certificate.sourceFingerprint !== manifest.canonCommitFingerprint || JSON.stringify([...certificate.chapterIds].sort()) !== JSON.stringify(manifest.chapters.map((chapter) => chapter.chapterId).sort())) { res.status(404).json({ error: "CLOSURE_CERTIFICATE_NOT_FOUND" }); return; }
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
    if (!manifest || manifest.projectSlug !== project.slug) { res.status(404).json({ error: "Publication edition not found" }); return; }
    try { res.status(201).json({ tree: await compileAndPersistPublicationTree(root, manifest) }); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PUBLICATION_TREE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/tree", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const tree = await readPublicationTree(projectRoot(project.slug), req.params.editionId);
    if (!tree || tree.projectSlug !== project.slug) { res.status(404).json({ error: "Publication tree not found" }); return; }
    res.json({ tree });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/artifacts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const manifest = await readEditionManifest(root, req.params.editionId);
    const tree = await readPublicationTree(root, req.params.editionId);
    if (!manifest || manifest.projectSlug !== project.slug || !tree || tree.projectSlug !== project.slug) { res.status(404).json({ error: "Publication tree or edition not found" }); return; }
    try {
      const formats = Array.isArray(req.body?.formats) ? req.body.formats : [];
      const artifacts = await renderPublicationArtifacts(root, manifest, tree, formats as PublicationFormat[]);
      res.status(201).json({ artifacts });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PUBLICATION_ARTIFACT_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/artifacts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const artifacts = await readPublicationArtifactSet(projectRoot(project.slug), req.params.editionId);
    if (!artifacts || artifacts.projectSlug !== project.slug) { res.status(404).json({ error: "Publication artifacts not found" }); return; }
    res.json({ artifacts });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    await assertCapabilityWriteAllowed(root, project.slug, "runtime");
    const manifest = await readEditionManifest(root, req.params.editionId);
    if (!manifest || manifest.projectSlug !== project.slug) { res.status(404).json({ error: "Publication edition not found" }); return; }
    try {
      const closure = await assertClosureCertificateCurrent(root, manifest.canonCommitFingerprint);
      const expectedChapterIds = manifest.chapters.map((chapter) => chapter.chapterId).sort();
      if (closure.certificate.projectSlug !== project.slug || JSON.stringify(closure.certificate.chapterIds) !== JSON.stringify(expectedChapterIds)) throw new Error("DELIVERY_CLOSURE_CERTIFICATE_REQUIRED");
      const proof = await issueDeliveryProof(root, {
        editionId: req.params.editionId,
        approvalId: typeof req.body?.approvalId === "string" ? req.body.approvalId : "",
        approverKind: req.body?.approverKind === "author" ? "author" : "system",
        expectedArtifactSetFingerprint: typeof req.body?.expectedArtifactSetFingerprint === "string" ? req.body.expectedArtifactSetFingerprint : ""
      });
      res.status(201).json({ proof });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error && error.message === "CLOSURE_CERTIFICATE_STALE" ? "DELIVERY_CLOSURE_CERTIFICATE_REQUIRED" : error instanceof Error ? error.message : "DELIVERY_PROOF_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/delivery-proof", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await verifyDeliveryProof(projectRoot(project.slug), req.params.editionId);
    if (!verification.proof || verification.proof.projectSlug !== project.slug || verification.proof.editionId !== req.params.editionId) { res.status(404).json({ verification }); return; }
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

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/access-grants/:grantId/receipts", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await verifyDeliveryAccessGrant(projectRoot(project.slug), req.params.grantId);
    if (!verification.grant || verification.grant.editionId !== req.params.editionId || verification.grant.projectSlug !== project.slug) { res.status(404).json({ error: { code: "ACCESS_RECEIPT_GRANT_NOT_FOUND" } }); return; }
    try {
      const receipt = await recordDeliveryAccessReceipt(projectRoot(project.slug), req.params.grantId, { receiptId: typeof req.body?.receiptId === "string" ? req.body.receiptId : undefined, accessedAt: typeof req.body?.accessedAt === "string" ? req.body.accessedAt : undefined });
      res.status(201).json({ receipt });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "ACCESS_RECEIPT_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/access-grants/:grantId/receipts/:receiptId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const receipt = await readDeliveryAccessReceipt(projectRoot(project.slug), req.params.receiptId);
    if (!receipt || receipt.projectSlug !== project.slug || receipt.editionId !== req.params.editionId || receipt.grantId !== req.params.grantId) { res.status(404).json({ error: { code: "ACCESS_RECEIPT_NOT_FOUND" } }); return; }
    res.json({ receipt });
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/access-grants/:grantId/download/:format", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await verifyDeliveryAccessGrant(projectRoot(project.slug), req.params.grantId);
    if (!verification.grant || verification.grant.editionId !== req.params.editionId || verification.grant.projectSlug !== project.slug) { res.status(404).json({ error: { code: "ACCESS_DOWNLOAD_GRANT_NOT_FOUND" } }); return; }
    if (req.params.format !== "markdown" && req.params.format !== "txt") { res.status(404).json({ error: { code: "ACCESS_DOWNLOAD_FORMAT_NOT_FOUND" } }); return; }
    try {
      const artifact = await readAuthorizedPublicationArtifact(projectRoot(project.slug), req.params.grantId, req.params.format);
      res.type(artifact.mime).setHeader("X-Delivery-Receipt-Id", artifact.receipt.receiptId).send(artifact.bytes);
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "ACCESS_DOWNLOAD_INVALID" } }); }
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/manuscript-release", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const release = await createManuscriptRelease(projectRoot(project.slug), { releaseId: typeof req.body?.releaseId === "string" ? req.body.releaseId : "", editionId: req.params.editionId, projectSlug: project.slug, canonCommitFingerprint: typeof req.body?.canonCommitFingerprint === "string" ? req.body.canonCommitFingerprint : "", parentReleaseId: typeof req.body?.parentReleaseId === "string" ? req.body.parentReleaseId : undefined, supersedesEditionId: typeof req.body?.supersedesEditionId === "string" ? req.body.supersedesEditionId : undefined });
      res.status(201).json({ release });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "MANUSCRIPT_RELEASE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/publication-editions/:editionId/manuscript-release/:releaseId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); const release = await readManuscriptRelease(projectRoot(project.slug), req.params.releaseId);
    if (!release || release.projectSlug !== project.slug || release.editionId !== req.params.editionId) { res.status(404).json({ error: { code: "MANUSCRIPT_RELEASE_NOT_FOUND" } }); return; }
    res.json({ release });
  }));

  app.post("/api/novel/projects/:projectId/publication-editions/:editionId/manuscript-release/:releaseId/transition", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const current = await readManuscriptRelease(projectRoot(project.slug), req.params.releaseId);
      if (!current || current.editionId !== req.params.editionId || current.projectSlug !== project.slug) { res.status(404).json({ error: { code: "MANUSCRIPT_RELEASE_NOT_FOUND" } }); return; }
      const release = await transitionManuscriptRelease(projectRoot(project.slug), req.params.releaseId, { target: req.body?.target, actor: "author", authorApprovalId: typeof req.body?.authorApprovalId === "string" ? req.body.authorApprovalId : undefined, reason: typeof req.body?.reason === "string" ? req.body.reason : undefined, deliveryProofEditionId: typeof req.body?.deliveryProofEditionId === "string" ? req.body.deliveryProofEditionId : undefined });
      res.status(201).json({ release });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "MANUSCRIPT_RELEASE_TRANSITION_INVALID" } }); }
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

  app.get("/api/novel/projects/:projectId/session/resume-brief", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const [session, questions, decisions] = await Promise.all([
      readCreativeSession(root, project.slug),
      readDialogueQuestions(root),
      readDecisionRecords(root)
    ]);
    res.json({ brief: buildAuthorResumeBrief({ session, questions, decisions }) });
  }));

  app.get("/api/novel/projects/:projectId/session/journey", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const session = await readCreativeSession(root, project.slug);
    const [questions, decisions, adoptionProposal] = await Promise.all([readDialogueQuestions(root), readDecisionRecords(root), readContractAdoptionProposal(root)]);
    const activeQuestion = questions.find((question) => question.status === "active");
    const current = buildCreativeJourneyProjection(session, {
      ...(activeQuestion ? { activeQuestion: { questionId: activeQuestion.questionId, text: activeQuestion.text, impact: activeQuestion.impact, source: "deterministic-gap" as const } } : {}),
      answeredQuestionIds: decisions.filter((decision) => decision.status === "recorded").map((decision) => decision.questionId),
      readyForOutline: adoptionProposal?.status === "committed"
    });
    const stored = await readCreativeJourneyProjection(root, project.slug);
    const journey = stored && stored.sourceFingerprint === current.sourceFingerprint && stored.projectionVersion === current.projectionVersion && stored.fingerprint === current.fingerprint ? stored : await persistCreativeJourneyProjection(root, current);
    res.json({ journey });
  }));

  app.get("/api/novel/projects/:projectId/session/timeline", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const session = await readCreativeSession(root, project.slug);
    const workItems = await listExecutionWorkItems(root);
    const backgroundJobs = await listProjectBackgroundJobs(root, project.slug);
    const taskCards = [...workItems, ...backgroundJobs.map((job) => ({ workItemId: job.id, chapterId: job.type, status: job.status, createdAt: job.startedAt }))];
    const [reviews, adoptions, recoveries, decisions] = await Promise.all([listRedBlueReviews(root), listProseAdoptionTransactions(root), listRecoverySettlements(root), readDecisionRecords(root)]);
    const activities = [
      ...reviews.map((review) => ({ activityId: review.reviewId, kind: "review-card" as const, text: `Review ${review.recommendation}: ${review.verdict}`, createdAt: review.createdAt, sourceRef: `review://${review.reviewId}` })),
      ...adoptions.map((adoption) => ({ activityId: adoption.transactionId, kind: "adoption-event" as const, text: `Adoption ${adoption.status}: ${adoption.candidateId}`, createdAt: adoption.createdAt, sourceRef: `adoption://${adoption.transactionId}` })),
      ...recoveries.map((recovery) => ({ activityId: recovery.settlementId, kind: "recovery-event" as const, text: `Recovery settled: ${recovery.mode}`, createdAt: recovery.createdAt, sourceRef: `recovery://${recovery.settlementId}` })),
      ...decisions.filter((decision) => Boolean(decision.answerText?.trim())).map((decision) => ({ activityId: decision.decisionId, kind: "question-event" as const, text: `Question answered: ${decision.answerText}`, createdAt: decision.createdAt, sourceRef: `decision://${decision.decisionId}` }))
    ];
    const current = buildCreativeTimelineProjection(session, taskCards, activities);
    const stored = await readCreativeTimelineProjection(root, project.slug);
    const timeline = stored && stored.sessionFingerprint === current.sessionFingerprint && stored.taskFingerprint === current.taskFingerprint && stored.activityFingerprint === current.activityFingerprint ? stored : await persistCreativeTimelineProjection(root, current);
    res.json({ timeline });
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

  app.post("/api/novel/projects/:projectId/session/context-conflict-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const facts = Array.isArray(body.facts) ? body.facts.map((fact: any) => ({ factKey: String(fact?.factKey ?? ""), value: fact?.value, sourceRef: String(fact?.sourceRef ?? ""), sourceVersion: String(fact?.sourceVersion ?? ""), authority: fact?.authority === "canon" || fact?.authority === "projection" ? fact.authority : "summary", valid: fact?.valid !== false })) : [];
    res.json({ conflicts: evaluateContextFacts({ facts }) });
  }));

  app.post("/api/novel/projects/:projectId/session/context-replay-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const manifest = await readContextManifest(projectRoot(project.slug));
    if (!manifest) { res.status(409).json({ error: { code: "CONTEXT_MANIFEST_REQUIRED" } }); return; }
    const body = req.body ?? {};
    res.json({ replay: evaluateContextReplay({ manifest, expectedManifestId: String(body.expectedManifestId ?? ""), expectedSourceFingerprint: String(body.expectedSourceFingerprint ?? ""), expectedSchemaVersion: "context-manifest.v1", route: String(body.route ?? ""), deterministic: { temperature: Number(body.temperature), seed: Number(body.seed), topP: Number(body.topP) } }) });
  }));

  app.post("/api/novel/projects/:projectId/session/context-evidence-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const manifest = await readContextManifest(projectRoot(project.slug));
    if (!manifest) { res.status(409).json({ error: { code: "CONTEXT_MANIFEST_REQUIRED" } }); return; }
    const body = req.body ?? {};
    const claims = Array.isArray(body.claims) ? body.claims.map((claim: any) => ({
      claimId: String(claim?.claimId ?? ""), text: String(claim?.text ?? ""),
      contractRefs: Array.isArray(claim?.contractRefs) ? claim.contractRefs.map(String) : [],
      chapterIntentRefs: Array.isArray(claim?.chapterIntentRefs) ? claim.chapterIntentRefs.map(String) : [],
      keyFactRefs: Array.isArray(claim?.keyFactRefs) ? claim.keyFactRefs.map(String) : [],
      evidenceRefs: Array.isArray(claim?.evidenceRefs) ? claim.evidenceRefs.map(String) : [],
      scope: claim?.scope === "inferred" ? "inferred" as const : "supported" as const
    })) : undefined;
    res.json({ evidence: evaluatePostCallEvidence({ manifest, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [], sourceVersions: body.sourceVersions && typeof body.sourceVersions === "object" ? body.sourceVersions : undefined, requiredContractRefs: Array.isArray(body.requiredContractRefs) ? body.requiredContractRefs.map(String) : undefined, requiredChapterIntentRefs: Array.isArray(body.requiredChapterIntentRefs) ? body.requiredChapterIntentRefs.map(String) : undefined, claims }) });
  }));

  app.post("/api/novel/projects/:projectId/session/execution-retry-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ retry: evaluateRetryDecision({ retryChainId: String(body.retryChainId ?? ""), attempt: Number(body.attempt), maxAttempts: Number(body.maxAttempts), errorCode: String(body.errorCode ?? ""), structuredOutputInvalid: body.structuredOutputInvalid === true, repairCallAlreadyUsed: body.repairCallAlreadyUsed === true, retryAfterMs: Number(body.retryAfterMs ?? 0) }) });
  }));

  app.post("/api/novel/projects/:projectId/session/execution-circuit-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ circuit: evaluateCircuitDecision({ consecutiveFailures: Number(body.consecutiveFailures), failureThreshold: Number(body.failureThreshold), now: String(body.now ?? new Date().toISOString()), openedAt: typeof body.openedAt === "string" ? body.openedAt : undefined, cooldownMs: Number(body.cooldownMs), halfOpenProbeInFlight: body.halfOpenProbeInFlight === true }) });
  }));

  app.post("/api/novel/projects/:projectId/session/model-call-fingerprint", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ fingerprint: createModelCallFingerprint({ businessInputFingerprint: String(body.businessInputFingerprint ?? ""), contextManifestFingerprint: String(body.contextManifestFingerprint ?? ""), routePolicyFingerprint: String(body.routePolicyFingerprint ?? ""), promptSchemaVersion: String(body.promptSchemaVersion ?? ""), outputSchemaVersion: String(body.outputSchemaVersion ?? ""), modelCapabilityRef: String(body.modelCapabilityRef ?? ""), modelParameters: { temperature: Number(body.modelParameters?.temperature), topP: Number(body.modelParameters?.topP), seed: body.modelParameters?.seed === undefined ? undefined : Number(body.modelParameters.seed) }, toolPermissions: Array.isArray(body.toolPermissions) ? body.toolPermissions.map(String) : [], parentFingerprint: typeof body.parentFingerprint === "string" ? body.parentFingerprint : undefined }) });
  }));

  app.post("/api/novel/projects/:projectId/session/model-call-replay-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ replay: evaluateModelCallReplay({ expected: body.expected, actual: body.actual }) });
  }));

  app.post("/api/novel/projects/:projectId/session/structured-output-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ output: evaluateStructuredOutput({ rawOutput: String(body.rawOutput ?? ""), requiredFields: Array.isArray(body.requiredFields) ? body.requiredFields.map(String) : [], repairAttempted: body.repairAttempted === true }) });
  }));

  app.post("/api/novel/projects/:projectId/session/completion-evidence-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ completion: evaluateCompletionEvidence({ selfClaims: Array.isArray(body.selfClaims) ? body.selfClaims.map(String) : [], externalEvidenceRefs: Array.isArray(body.externalEvidenceRefs) ? body.externalEvidenceRefs.map(String) : [], stateMachineProofRefs: Array.isArray(body.stateMachineProofRefs) ? body.stateMachineProofRefs.map(String) : [], independentReviewPassed: body.independentReviewPassed === true }) });
  }));

  app.post("/api/novel/projects/:projectId/session/cost-saving-plan", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ plan: buildCostSavingPlan({ budgetPressure: body.budgetPressure === "tight" ? "tight" : "normal", cacheAvailable: body.cacheAvailable === true, duplicateContext: body.duplicateContext === true, optionalAudit: body.optionalAudit === true, t0Protected: body.t0Protected === true, highImpactReviewProtected: body.highImpactReviewProtected === true }) });
  }));

  app.post("/api/novel/projects/:projectId/session/executor-failover-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ failover: evaluateExecutorFailover({ currentCapabilityRef: String(body.currentCapabilityRef ?? ""), candidateCapabilityRef: String(body.candidateCapabilityRef ?? ""), taskType: String(body.taskType ?? ""), requiredTier: body.requiredTier === "high" || body.requiredTier === "balanced" ? body.requiredTier : "economy", candidateTier: body.candidateTier === "high" || body.candidateTier === "balanced" ? body.candidateTier : "economy", contextCapacityOk: body.contextCapacityOk === true, structuredOutput: body.structuredOutput === true, privacyOk: body.privacyOk === true, rightsOk: body.rightsOk === true, residencyOk: body.residencyOk === true, inputFingerprint: String(body.inputFingerprint ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/session/author-execution-strategy", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId); if (!project) return;
    const preference = req.body?.preference === "fast" || req.body?.preference === "quality" ? req.body.preference : "balanced";
    res.json({ strategy: buildAuthorExecutionStrategy(preference) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/candidate-comparison", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const comparison = compareCandidates({ objectiveIds: Array.isArray(body.objectiveIds) ? body.objectiveIds.map(String) : [], candidates: Array.isArray(body.candidates) ? body.candidates.map((candidate: any) => ({ candidateId: String(candidate.candidateId ?? ""), hardConstraintFailures: Array.isArray(candidate.hardConstraintFailures) ? candidate.hardConstraintFailures.map(String) : [], objectiveEvidence: Array.isArray(candidate.objectiveEvidence) ? candidate.objectiveEvidence.map((item: any) => ({ objectiveId: String(item.objectiveId ?? ""), gap: Number(item.gap), evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [] })) : [], unresolvedRisks: Array.isArray(candidate.unresolvedRisks) ? candidate.unresolvedRisks.map(String) : [] })) : [] });
    const record = await persistCandidateComparison(projectRoot(project.slug), project.slug, comparison);
    res.json({ comparison, record });
  }));

  app.get("/api/novel/projects/:projectId/runtime/candidate-comparison/:comparisonId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readCandidateComparison(projectRoot(project.slug), req.params.comparisonId, project.slug);
    if (!record) return res.status(404).json({ error: "CANDIDATE_COMPARISON_NOT_FOUND" });
    res.json({ record, comparison: record.comparison });
  }));

  app.post("/api/novel/projects/:projectId/runtime/decision-cost-preview", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ preview: createDecisionCostPreview({ optionId: String(body.optionId ?? ""), storyEffect: String(body.storyEffect ?? ""), affectedChapters: Array.isArray(body.affectedChapters) ? body.affectedChapters.map(String) : [], expectedRework: String(body.expectedRework ?? ""), reversibility: body.reversibility === "easy" || body.reversibility === "hard" ? body.reversibility : "bounded", setupPayoffCost: String(body.setupPayoffCost ?? ""), waitingCost: String(body.waitingCost ?? ""), technicalDetails: Array.isArray(body.technicalDetails) ? body.technicalDetails.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/review-compression", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ review: createReviewCompression({ objective: String(body.objective ?? ""), recommendation: String(body.recommendation ?? ""), mustKeep: Array.isArray(body.mustKeep) ? body.mustKeep.map(String) : [], strongestRedRisk: String(body.strongestRedRisk ?? ""), actualChanges: Array.isArray(body.actualChanges) ? body.actualChanges.map(String) : [], decisionRequired: Array.isArray(body.decisionRequired) ? body.decisionRequired.map(String) : [], passedSummary: { count: Number(body.passedSummary?.count ?? 0), evidenceRefs: Array.isArray(body.passedSummary?.evidenceRefs) ? body.passedSummary.evidenceRefs.map(String) : [] } }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/objective-hierarchy", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ hierarchy: resolveObjectiveHierarchy({ scope: body.scope ?? "chapter", ancestors: Array.isArray(body.ancestors) ? body.ancestors : [], local: Array.isArray(body.local) ? body.local : [], overrides: Array.isArray(body.overrides) ? body.overrides : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/objective-contribution", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ contribution: evaluateObjectiveContribution({ workItemId: String(body.workItemId ?? ""), nearTermOutcome: String(body.nearTermOutcome ?? ""), nearTermSatisfied: body.nearTermSatisfied === true, nearTermEvidenceRefs: Array.isArray(body.nearTermEvidenceRefs) ? body.nearTermEvidenceRefs.map(String) : [], longTermTargets: Array.isArray(body.longTermTargets) ? body.longTermTargets.map(String) : [], contributesLongTerm: body.contributesLongTerm === true, longTermEvidenceRefs: Array.isArray(body.longTermEvidenceRefs) ? body.longTermEvidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/drafting/stage-weights", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ weights: createStageObjectiveWeights({ stage: body.stage === "contract" || body.stage === "outline" || body.stage === "revision" ? body.stage : "drafting", strategyVersion: String(body.strategyVersion ?? ""), weights: body.weights && typeof body.weights === "object" ? body.weights : {}, hardConstraints: Array.isArray(body.hardConstraints) ? body.hardConstraints.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/drafting/anti-goal-guard", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ guard: evaluateAntiGoalGuard({ text: String(body.text ?? ""), antiGoals: Array.isArray(body.antiGoals) ? body.antiGoals : [], repairScope: Array.isArray(body.repairScope) ? body.repairScope.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/drafting/q003-profile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ profile: createQ003Profile({ status: body.status === "confirmed" ? "confirmed" : "unconfirmed", speedPreference: body.speedPreference === undefined ? undefined : Number(body.speedPreference), qualityPreference: body.qualityPreference === undefined ? undefined : Number(body.qualityPreference), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/stable-deep-links", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const kind = ["question", "decision", "candidate", "chapter-evidence", "obligation", "audit"].includes(body.kind) ? body.kind : "question";
    res.json({ link: createStableDeepLink({ projectSlug: project.slug, kind, assetId: String(body.assetId ?? ""), assetVersion: String(body.assetVersion ?? "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/stable-deep-links/resolve", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ resolution: resolveStableDeepLink({ link: body.link, authorized: body.authorized === true, currentVersion: typeof body.currentVersion === "string" ? body.currentVersion : undefined, fallbackAssetId: typeof body.fallbackAssetId === "string" ? body.fallbackAssetId : undefined, fallbackVersion: typeof body.fallbackVersion === "string" ? body.fallbackVersion : undefined }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/objective-change-impact", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ impact: analyzeObjectiveChange({ oldVersion: Number(body.oldVersion), newVersion: Number(body.newVersion), oldItems: Array.isArray(body.oldItems) ? body.oldItems : [], newItems: Array.isArray(body.newItems) ? body.newItems : [], affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets.map(String) : [], retroactiveRequested: body.retroactiveRequested === true, authorizationGranted: body.authorizationGranted === true }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/objective-drift", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ drift: monitorObjectiveDrift({ targetVersion: Number(body.targetVersion), observations: Array.isArray(body.observations) ? body.observations : [] }) });
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
    const journeyRoot = projectRoot(project.slug);
    const [journeyQuestions, journeyDecisions] = await Promise.all([readDialogueQuestions(journeyRoot), readDecisionRecords(journeyRoot)]);
    const journeyActiveQuestion = journeyQuestions.find((question) => question.status === "active");
    const journeyProjection = buildCreativeJourneyProjection(result.session, {
      ...(journeyActiveQuestion ? { activeQuestion: { questionId: journeyActiveQuestion.questionId, text: journeyActiveQuestion.text, impact: journeyActiveQuestion.impact, source: "deterministic-gap" as const } } : {}),
      answeredQuestionIds: journeyDecisions.filter((decision) => decision.status === "recorded").map((decision) => decision.questionId)
    });
    await persistCreativeJourneyProjection(journeyRoot, journeyProjection);
    await persistCreativeTimelineProjection(projectRoot(project.slug), buildCreativeTimelineProjection(result.session));
    const collaboration = kind ? undefined : parseCollaborationMessage(typeof req.body?.text === "string" ? req.body.text : "", journeyActiveQuestion ? { activeQuestionId: journeyActiveQuestion.questionId } : {});
    let primaryAction: ReturnType<typeof resolvePrimaryActionDecision> | undefined;
    if (collaboration?.events.some((event) => ["continue", "answer", "delegate-decision"].includes(event.type))) {
      primaryAction = resolvePrimaryActionDecision({ journeyVersion: journeyProjection.projectionVersion, sourceFingerprint: journeyProjection.sourceFingerprint, stage: journeyProjection.stage, ...(journeyActiveQuestion ? { activeQuestionId: journeyActiveQuestion.questionId } : {}) });
    }
    res.status(result.created ? 201 : 200).json({ ...result, ...(collaboration ? { collaboration } : {}), ...(primaryAction ? { primaryAction } : {}) });
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
    const journeyRoot = projectRoot(project.slug);
    const [journeyQuestions, journeyDecisions] = await Promise.all([readDialogueQuestions(journeyRoot), readDecisionRecords(journeyRoot)]);
    const journeyActiveQuestion = journeyQuestions.find((question) => question.status === "active");
    await persistCreativeJourneyProjection(journeyRoot, buildCreativeJourneyProjection(result.session, {
      ...(journeyActiveQuestion ? { activeQuestion: { questionId: journeyActiveQuestion.questionId, text: journeyActiveQuestion.text, impact: journeyActiveQuestion.impact, source: "deterministic-gap" as const } } : {}),
      answeredQuestionIds: journeyDecisions.filter((decision) => decision.status === "recorded").map((decision) => decision.questionId)
    }));
    await persistCreativeTimelineProjection(projectRoot(project.slug), buildCreativeTimelineProjection(result.session));
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
    if (req.body?.mode === "shadow" && contextManifest && contextManifest.sourceFingerprint === fingerprintCreativeSession(session)) {
      const result = preflight.modelCallAllowed && budgetReservation && capabilityAuthorization
        ? await executeShadowUnderstanding({
          root,
          projectSlug: project.slug,
          session,
          manifest: contextManifest,
          riskProfile: buildUnderstandingRiskProfile(),
          budget: budgetReservation,
          capability: capabilityAuthorization
        })
        : await executeDeterministicUnderstanding({ root, projectSlug: project.slug, session, manifest: contextManifest });
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
        "请理解作者的创作输入，但不得写入正式设定。",
        "只返回 JSON；当存在两种实质不同的解释时，需包含 coreExplicit、inferred、unknowns、question 和 interpretationSet 字段。",
        "每条主张必须包含 id、text、认识状态，以及指向所给消息 ID 的证据位置。",
        "如包含 interpretationSet，至少给出两种候选解释、它们的差异、支持/反证、后续影响，并将 activeQuestionId 设为 question-primary-desire。",
        JSON.stringify({ sourceMessageIds: session.messages.map((message) => message.id), messages: session.messages })
      ].join("\n");
      const task = await startModelUnderstandingTask(
        {
          root,
          projectSlug: project.slug,
          sourceFingerprint: contextManifest.sourceFingerprint,
          sourceMessageIds: session.messages.map((message) => message.id),
          contextManifestFingerprint: contextManifest.fingerprint || contextManifest.sourceFingerprint,
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
    const root = projectRoot(project.slug);
    const questions = (await readDialogueQuestions(root)).filter((question) => question.projectSlug === project.slug);
    const enriched = await Promise.all(questions.map(async (question) => {
      const redBlueCase = await readDialogueRedBlueCase(root, `red-blue-${question.questionId}-${question.questionVersion}`);
      return redBlueCase ? { ...question, redBlueCase } : question;
    }));
    res.json({ questions: enriched });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/decisions/:decisionId/impact", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await readDecisionImpactReport(projectRoot(project.slug), `decision-impact-${req.params.decisionId}`);
    if (!report) {
      res.status(404).json({ error: { code: "DECISION_IMPACT_REPORT_NOT_FOUND" } });
      return;
    }
    res.json({ report });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/questions/:questionId/red-blue", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const question = (await readDialogueQuestions(root)).find((candidate) => candidate.questionId === req.params.questionId && candidate.projectSlug === project.slug);
    if (!question) {
      res.status(404).json({ error: { code: "QUESTION_NOT_FOUND" } });
      return;
    }
    try {
      const value = createDialogueRedBlueCase(question);
      const result = await persistDialogueRedBlueCase(root, value);
      res.status(result.created ? 201 : 200).json({ redBlueCase: result.redBlueCase, created: result.created });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "RED_BLUE_CASE_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/questions/:questionId/red-blue", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const question = (await readDialogueQuestions(projectRoot(project.slug))).find((candidate) => candidate.questionId === req.params.questionId && candidate.projectSlug === project.slug);
    const value = question ? await readDialogueRedBlueCase(projectRoot(project.slug), `red-blue-${req.params.questionId}-${question.questionVersion}`) : null;
    if (!value) {
      res.status(404).json({ error: { code: "RED_BLUE_CASE_NOT_FOUND" } });
      return;
    }
    res.json({ redBlueCase: value });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/decisions", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const decisions = await readDecisionRecords(projectRoot(project.slug));
    res.json({ decisions, projection: projectDecisionRecords(decisions, project.slug) });
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
    const next = nextUnansweredQuestion(decisions);
    if (!next) {
      res.status(409).json({ error: { code: "UNDERSTANDING_QUESTIONS_EXHAUSTED" } });
      return;
    }
    const active = existingQuestions.find((question) => question.questionId === next.questionId && question.status === "active");
    const question = await createDialogueQuestion(root, {
      projectSlug: project.slug,
      questionId: next.questionId,
      questionVersion: 1,
      text: typeof req.body?.text === "string" && req.body.text.trim().length > 0 ? req.body.text : next.questionId === snapshot.question.id ? snapshot.question.text : next.text,
      whyNow: typeof req.body?.whyNow === "string" && req.body.whyNow.trim().length > 0 ? req.body.whyNow : next.whyNow,
      impact: next.impact,
      ambiguity: 0.8,
      errorCost: next.errorCost,
      reversibility: next.reversibility,
      delayCost: next.delayCost,
      options: Array.isArray(req.body?.options) ? req.body.options.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 3) : [],
      recommendation: typeof req.body?.recommendation === "string" && req.body.recommendation.trim().length > 0 ? req.body.recommendation : next.recommendation,
      snapshotFingerprint: snapshot.sourceFingerprint
    });
    let redBlueCase: Awaited<ReturnType<typeof createDialogueRedBlueCase>> | undefined;
    if (question.question.options.length >= 2) {
      redBlueCase = (await persistDialogueRedBlueCase(root, createDialogueRedBlueCase(question.question))).redBlueCase;
    }
    res.status(question.created && !active ? 201 : 200).json({ ...question, ...(redBlueCase ? { redBlueCase } : {}) });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/questions/:questionId/answers", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const currentQuestion = (await readDialogueQuestions(root)).find((candidate) => candidate.questionId === req.params.questionId);
    const automaticRedBlueCaseId = currentQuestion?.options.length && currentQuestion.options.length >= 2 ? `red-blue-${currentQuestion.questionId}-${currentQuestion.questionVersion}` : undefined;
    const advanced = await advanceUnderstandingAfterConfirmedAnswer({
      root,
      projectSlug: project.slug,
      answer: {
        questionId: req.params.questionId,
        questionVersion: Number(req.body?.questionVersion),
        expectedSnapshotFingerprint: typeof req.body?.expectedSnapshotFingerprint === "string" ? req.body.expectedSnapshotFingerprint : "",
        idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "",
        answerText: typeof req.body?.answerText === "string" ? req.body.answerText : "",
        answerStatus: req.body?.answerStatus === "tentative" || req.body?.answerStatus === "delegated" ? req.body.answerStatus : "confirmed",
        ...(typeof req.body?.redBlueCaseId === "string" ? { redBlueCaseId: req.body.redBlueCaseId } : automaticRedBlueCaseId ? { redBlueCaseId: automaticRedBlueCaseId } : {})
      }
    });
    if (!advanced.answer.accepted) {
      res.status(409).json({ error: advanced.answer.conflict, conflict: advanced.answer.conflict });
      return;
    }
    const [questions, decisions, session] = await Promise.all([readDialogueQuestions(root), readDecisionRecords(root), readCreativeSession(root, project.slug)]);
    const activeQuestion = questions.find((question) => question.status === "active");
    const journey = buildCreativeJourneyProjection(session, {
      ...(activeQuestion ? { activeQuestion: { questionId: activeQuestion.questionId, text: activeQuestion.text, impact: activeQuestion.impact, source: "deterministic-gap" as const } } : {}),
      answeredQuestionIds: decisions.filter((decision) => decision.status === "recorded").map((decision) => decision.questionId)
    });
    await persistCreativeJourneyProjection(root, journey);
    res.status(advanced.answer.replayed ? 200 : 201).json({
      ...advanced.answer,
      ...(advanced.nextQuestion ? { nextQuestion: advanced.nextQuestion } : {}),
      ...(advanced.contractCandidate ? { contractCandidate: advanced.contractCandidate } : {}),
      ...(advanced.consumption ? { consumption: advanced.consumption } : {}),
      completed: advanced.completed,
      journey
    });
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
      const decision = (await readDecisionRecords(projectRoot(project.slug))).find((record) => record.decisionId === result.candidate.sourceDecisionId);
      if (!decision) {
        res.status(409).json({ error: { code: "DECISION_NOT_FOUND" } });
        return;
      }
      const receiptId = `decision-consumption-${result.candidate.candidateId}`;
      const existingConsumption = await readDecisionConsumptionReceipt(projectRoot(project.slug), receiptId);
      const consumption = existingConsumption ? { created: false, receipt: existingConsumption } : await persistDecisionConsumptionReceipt(projectRoot(project.slug), createDecisionConsumptionReceipt({
        receiptId,
        projectSlug: project.slug,
        decisionId: decision.decisionId,
        decisionVersion: decision.questionVersion,
        consumer: "story-contract",
        consumerRef: result.candidate.candidateId,
        sourceFingerprint: result.candidate.sourceFingerprint
      }));
      res.status(result.created ? 201 : 200).json({ ...result, consumption });
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
      const sourceCandidate = await readContractCandidate(projectRoot(project.slug), result.outline.sourceCandidateId);
      const decision = sourceCandidate ? (await readDecisionRecords(projectRoot(project.slug))).find((record) => record.decisionId === sourceCandidate.sourceDecisionId) : undefined;
      if (!sourceCandidate || !decision) {
        res.status(409).json({ error: { code: "DECISION_NOT_FOUND" } });
        return;
      }
      const receiptId = `decision-consumption-${result.outline.outlineId}`;
      const existingConsumption = await readDecisionConsumptionReceipt(projectRoot(project.slug), receiptId);
      const consumption = existingConsumption ? { created: false, receipt: existingConsumption } : await persistDecisionConsumptionReceipt(projectRoot(project.slug), createDecisionConsumptionReceipt({
        receiptId,
        projectSlug: project.slug,
        decisionId: decision.decisionId,
        decisionVersion: decision.questionVersion,
        consumer: "outline",
        consumerRef: result.outline.outlineId,
        sourceFingerprint: sourceCandidate.sourceFingerprint
      }));
      res.status(result.created ? 201 : 200).json({ ...result, consumption });
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
    const proposal = await createOutlineAdoptionProposal(projectRoot(project.slug), { outlineId, expectedOutlineFingerprint, adoptionMode: ["whole", "partial", "fusion", "reject"].includes(req.body?.adoptionMode) ? req.body.adoptionMode : undefined, selectedChapterIds: Array.isArray(req.body?.selectedChapterIds) ? req.body.selectedChapterIds.filter((value: unknown): value is string => typeof value === "string") : undefined, unadoptedChapterIds: Array.isArray(req.body?.unadoptedChapterIds) ? req.body.unadoptedChapterIds.filter((value: unknown): value is string => typeof value === "string") : undefined, sourceCandidateIds: Array.isArray(req.body?.sourceCandidateIds) ? req.body.sourceCandidateIds.filter((value: unknown): value is string => typeof value === "string") : undefined, comparisonFingerprint: typeof req.body?.comparisonFingerprint === "string" ? req.body.comparisonFingerprint : undefined });
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
    if (!proposal || proposal.projectSlug !== project.slug) {
      res.status(404).json({ error: "Outline adoption proposal not found" });
      return;
    }
    res.json({ proposal });
  }));

  app.post("/api/novel/projects/:projectId/session/understanding/outline-adoption", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const researchGate = await evaluateResearchPublicationGate(projectRoot(project.slug));
    if (!researchGate.allowed) { res.status(409).json({ error: { code: "RESEARCH_PUBLICATION_GATE_BLOCKED", gate: researchGate } }); return; }
    const result = await commitOutlineAdoption(projectRoot(project.slug), { expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : "", ...(req.body?.faultAt === "after-project-write" ? { faultAt: req.body.faultAt } : {}) });
    res.status(result.status === "committed" ? 201 : result.status === "blocked" ? 409 : 500).json(result);
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/outline-version/:outlineId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const version = await readOutlineVersion(projectRoot(project.slug), req.params.outlineId);
    if (!version || version.projectSlug !== project.slug) { res.status(404).json({ error: "Outline version not found" }); return; }
    res.json({ version });
  }));

  app.get("/api/novel/projects/:projectId/session/understanding/execution-ready-proof", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await readExecutionReadyProof(projectRoot(project.slug));
    if (!proof || proof.projectSlug !== project.slug) { res.status(404).json({ error: "Execution-ready proof not found" }); return; }
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const generationManifestId = typeof req.body?.generationManifestId === "string" ? req.body.generationManifestId.trim() : "";
    if (generationManifestId) {
      const root = projectRoot(project.slug);
      const manifest = await readProseGenerationManifest(root, generationManifestId);
      const receipt = manifest ? await readDecisionConsumptionReceipt(root, manifest.decisionConsumptionReceiptRef) : null;
      if (!manifest || !receipt || receipt.projectSlug !== project.slug || receipt.consumer !== "prose" || receipt.consumerRef !== manifest.manifestId) {
        res.status(409).json({ error: { code: "PROSE_GENERATION_MANIFEST_REQUIRED" } });
        return;
      }
      try { await assertCraftPatternReleaseRefs(root, project.slug, manifest.craftPatternRefs); }
      catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED" } }); return; }
    }
    if (req.body?.autoContinue === true) {
      const chapterIds = Array.isArray(req.body.chapterIds)
        ? req.body.chapterIds.filter((value: unknown): value is string => typeof value === "string")
        : project.chapters.map((chapter) => chapter.id);
      const limits = req.body.limits && typeof req.body.limits === "object"
        ? req.body.limits
        : { maxWorkItems: Math.max(1, chapterIds.length) };
      try {
        const preflightId = typeof req.body.preflightId === "string" ? req.body.preflightId.trim() : "";
        if (preflightId) {
          const preflight = await readRunPreflight(projectRoot(project.slug), preflightId);
          if (!preflight) throw new Error("RUN_PREFLIGHT_REQUIRED");
          if (preflight.status !== "ready") throw new Error("RUN_PREFLIGHT_BLOCKED");
          for (const [key, value] of Object.entries(limits)) {
            if (value === undefined || value === null) continue;
            const frozenValue = (preflight.limits as unknown as Record<string, unknown>)[key];
            if (frozenValue !== undefined && Number(value) !== Number(frozenValue)) throw new Error("RUN_PREFLIGHT_LIMIT_MISMATCH");
          }
        }
        const bookRun = await startBookRun(projectRoot(project.slug), {
          projectSlug: project.slug,
          chapterIds,
          objective: typeof req.body.objective === "string" ? req.body.objective : undefined,
          parentRunId: typeof req.body.parentRunId === "string" ? req.body.parentRunId : undefined,
          storyContractRef: typeof req.body.storyContractRef === "string" ? req.body.storyContractRef : undefined,
          preflightId: typeof req.body.preflightId === "string" ? req.body.preflightId : undefined,
          autoContinue: true,
          autonomyLevel: req.body.autonomyLevel === "L2" ? "L2" : req.body.autonomyLevel === "L0" ? "L0" : "L1",
          autonomyExpiresAt: typeof req.body.autonomyExpiresAt === "string" ? req.body.autonomyExpiresAt : undefined,
          limits
        });
        const advancement = await advanceBookRun(projectRoot(project.slug), bookRun.bookRunId, { requireReadiness: true });
        res.status(202).json({ bookRun: advancement.run, graph: advancement.graph, scheduled: advancement.scheduled, dispatched: advancement.dispatched });
      } catch (error) {
        res.status(409).json({ error: { code: error instanceof Error ? error.message : "BOOK_RUN_CONTINUOUS_START_INVALID" } });
      }
      return;
    }
    const chapterId = typeof req.body.chapterId === "string" ? req.body.chapterId : undefined;
    const governedProject = governedProjectionMutationRequired(project);
    let workItem;
    if (chapterId && (governedProject || req.body.requireExecutionReady === true)) {
      workItem = await enqueueExecutionWorkItem(projectRoot(project.slug), project.slug, chapterId, typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : `runtime-${chapterId}`, generationManifestId ? { generationManifestId } : undefined);
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

  app.post("/api/novel/projects/:projectId/runtime/pause-policy/evaluate", asyncRoute(async (req, res) => {
    await readProject(req.params.projectId);
    const body = req.body || {};
    const decision = evaluateAdaptivePause({
      pausePolicyVersion: "adaptive-risk-pause.v1",
      autonomyGrantValid: body.autonomyGrantValid === true,
      unresolvedHardTriggers: Array.isArray(body.unresolvedHardTriggers) ? body.unresolvedHardTriggers.map(String) : [],
      keyReviewDisagreement: body.keyReviewDisagreement === true,
      scopeExpansionRequested: body.scopeExpansionRequested === true,
      retryBudgetExhausted: body.retryBudgetExhausted === true,
      authorRequestedPause: body.authorRequestedPause === true,
      settledChapterCount: Number(body.settledChapterCount || 0),
      volumeBoundary: body.volumeBoundary === true,
      majorClosure: body.majorClosure === true,
      materialRiskChange: body.materialRiskChange === true
    });
    res.json({ decision });
  }));

  app.post("/api/novel/projects/:projectId/runtime/pause-policy/recaps", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const body = req.body || {};
    const recap = createAdaptivePauseRecap({
      projectSlug: project.slug,
      recapId: typeof body.recapId === "string" ? body.recapId : "",
      trigger: body.trigger,
      settledChapterCount: Number(body.settledChapterCount || 0),
      settledSummary: String(body.settledSummary || ""),
      changedSummary: String(body.changedSummary || ""),
      openRisks: Array.isArray(body.openRisks) ? body.openRisks.map(String) : [],
      qualityEvidence: Array.isArray(body.qualityEvidence) ? body.qualityEvidence.map(String) : [],
      costEvidence: Array.isArray(body.costEvidence) ? body.costEvidence.map(String) : [],
      paceEvidence: Array.isArray(body.paceEvidence) ? body.paceEvidence.map(String) : [],
      nextAuthorizedScope: String(body.nextAuthorizedScope || ""),
      continuationSafeReason: String(body.continuationSafeReason || "")
    });
    const persisted = await persistAdaptivePauseRecap(projectRoot(project.slug), recap);
    res.status(201).json({ recap: persisted });
  }));

  app.post("/api/novel/projects/:projectId/runtime/pause-policy/apply", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const body = req.body || {};
    const runId = typeof body.runId === "string" ? body.runId : "";
    const run = runId ? getRuntimeRun(runId) : undefined;
    if (!run || run.projectSlug !== project.slug) throw new Error("Runtime run not found");
    assertRuntimeControlFreshness(run.updatedAt, body.expectedRunUpdatedAt);
    const decision = assertAdaptivePauseDecision(body.decision);
    if (decision.status !== "hard_pause") throw new Error("ADAPTIVE_PAUSE_APPLY_REQUIRES_HARD_PAUSE");
    const existingResult = run.result && typeof run.result === "object" ? run.result : {};
    const pausedRun = updateRuntimeRun(run.id, {
      status: "paused",
      result: {
        ...existingResult,
        pauseDecisionFingerprint: decision.fingerprint,
        pauseReasons: decision.hardReasons
      }
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "command",
      message: "Runtime hard pause policy applied",
      payload: { decisionFingerprint: decision.fingerprint, hardReasons: decision.hardReasons }
    });
    res.status(202).json({ run: pausedRun, decision });
  }));

  app.get("/api/novel/projects/:projectId/runtime/execution-work-items", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const workItems = await listExecutionWorkItems(projectRoot(project.slug));
    res.json({ workItems: workItems.filter((workItem) => workItem.projectSlug === project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/execution-work-items/:workItemId/evidence", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const workItem = await readExecutionWorkItem(root, req.params.workItemId);
    if (!workItem || workItem.projectSlug !== project.slug) { res.status(404).json({ error: "EXECUTION_WORK_ITEM_NOT_FOUND" }); return; }
    const directory = resolveInside(root, "sessions/chapter-execution-proofs");
    const names = await fs.readdir(directory).catch(() => [] as string[]);
    const proofs = (await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readChapterExecutionProof(root, name.slice(0, -5)).catch(() => null))))
      .filter((proof): proof is NonNullable<typeof proof> => Boolean(proof && proof.projectSlug === project.slug && proof.chapterId === workItem.chapterId && proof.parentExecutionReadyProofFingerprint === workItem.proofFingerprint));
    res.json({ workItem, chapterExecutionProofs: proofs });
  }));

  app.get("/api/novel/projects/:projectId/runtime/execution-work-items/:workItemId/provenance", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const workItem = await readExecutionWorkItem(root, req.params.workItemId);
    if (!workItem || workItem.projectSlug !== project.slug) { res.status(404).json({ error: "EXECUTION_WORK_ITEM_NOT_FOUND" }); return; }
    const graph = await readBookWorkGraph(root);
    const source = workItem.sourceBookWorkItemId ? graph?.workItems.find((item) => item.workItemId === workItem.sourceBookWorkItemId) : undefined;
    res.json({
      workItem,
      provenance: {
        sourceBookWorkItemId: workItem.sourceBookWorkItemId || null,
        sourceGraphFingerprint: workItem.sourceGraphFingerprint || null,
        currentGraphFingerprint: graph?.fingerprint || null,
        sourceGraphCurrent: Boolean(graph && workItem.sourceGraphFingerprint && graph.fingerprint === workItem.sourceGraphFingerprint),
        sourceBookWorkItem: source || null,
        sourceBookWorkItemPresent: Boolean(source)
      }
    });
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const preview = await readMigrationPreview(projectRoot(project.slug), req.params.migrationId);
    if (!preview || preview.projectSlug !== project.slug) {
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
    if (!resolution || resolution.projectSlug !== project.slug) {
      res.status(404).json({ error: "Migration resolution not found" });
      return;
    }
    res.json({ resolution });
  }));

  app.get("/api/novel/projects/:projectId/migrations/:migrationId/validation", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const validation = await readMigrationValidation(projectRoot(project.slug), req.params.migrationId);
    if (!validation || validation.projectSlug !== project.slug) {
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
    if (!activation || activation.projectSlug !== project.slug) {
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
    if (!rollback || rollback.projectSlug !== project.slug) {
      res.status(404).json({ error: "Migration rollback has not been created" });
      return;
    }
    res.json({ rollback });
  }));

  app.get("/api/novel/projects/:projectId/runtime/execution-readiness/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ readiness: await checkExecutionReadiness(projectRoot(project.slug), req.params.chapterId) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/chapter-execution-plans/:planId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readChapterExecutionPlan(projectRoot(project.slug), req.params.planId);
    if (!plan || plan.projectSlug !== project.slug) { res.status(404).json({ error: "Chapter execution plan not found" }); return; }
    res.json({ plan });
  }));

  app.get("/api/novel/projects/:projectId/runtime/chapter-execution-proofs/:proofId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await readChapterExecutionProof(projectRoot(project.slug), req.params.proofId);
    if (!proof || proof.projectSlug !== project.slug) { res.status(404).json({ error: "Chapter execution proof not found" }); return; }
    res.json({ proof });
  }));

  app.get("/api/novel/projects/:projectId/runtime/outline-release-gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const repoRoot = getRepoRoot();
    const profile = JSON.parse(await fs.readFile(resolveInside(repoRoot, "docs/spec-governance/release-profiles/RP3-contract.json"), "utf8")) as { mustRequirementIds?: unknown };
    const audit = JSON.parse(await fs.readFile(resolveInside(repoRoot, "docs/spec-governance/audits/rp3-contract-slice-acceptance-2026-07-31.json"), "utf8")) as { scope?: { verifiedRequirements?: unknown } };
    const expectedRequirementIds = Array.isArray(profile.mustRequirementIds) ? profile.mustRequirementIds.filter((id): id is string => typeof id === "string") : [];
    const verifiedRequirementIds = Array.isArray(audit.scope?.verifiedRequirements) ? audit.scope.verifiedRequirements.filter((id): id is string => typeof id === "string") : [];
    const rp3Decision = evaluateRp3ContractAcceptance({ expectedRequirementIds, verifiedRequirementIds });
    const outlinePointer = (project as typeof project & { outlineVersion?: { outlineId?: string; selectedChapterIds?: string[] } }).outlineVersion;
    const outlineId = outlinePointer?.outlineId || "";
    const validation = outlineId ? await readOutlineValidationReport(root, outlineId) : null;
    const version = outlineId ? await readOutlineVersion(root, outlineId) : null;
    const proof = await readExecutionReadyProof(root);
    const decision = evaluateOutlineReleaseGate({
      rp3Status: rp3Decision.status,
      outlineValidationStatus: validation?.status || "missing",
      outlineVersionStatus: version?.status || "missing",
      executionProofStatus: proof?.status || "missing",
      selectedChapterCount: version?.selectedChapterIds.length || 0,
      strongFreezeCount: version?.strongFreezeCount || 0
    });
    res.json({ decision, dependency: rp3Decision });
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

  app.post("/api/novel/projects/:projectId/runtime/prose-candidates/:candidateId/freshness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const candidate = await readProseCandidate(projectRoot(project.slug), req.params.candidateId);
    if (!candidate) return res.status(404).json({ error: "PROSE_CANDIDATE_NOT_FOUND" });
    const body = req.body ?? {};
    const receipt = await recordCandidateFreshness({ root: projectRoot(project.slug), projectSlug: project.slug, candidateId: candidate.candidateId, candidateSourceFingerprint: candidate.sourceFingerprint, currentUpstreamFingerprint: String(body.currentUpstreamFingerprint ?? ""), executionState: body.executionState === "running" || body.executionState === "completed" ? body.executionState : "not-started", chapterSettled: body.chapterSettled === true });
    res.json({ receipt });
  }));

  app.get("/api/novel/projects/:projectId/runtime/candidate-freshness/:receiptId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const receipt = await readCandidateFreshness(projectRoot(project.slug), req.params.receiptId);
    if (!receipt) return res.status(404).json({ error: "CANDIDATE_FRESHNESS_NOT_FOUND" });
    res.json({ receipt });
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
    const validationBundle = await validateAndPersistProseCandidate(projectRoot(project.slug), candidate, { antiGoals: Array.isArray(req.body?.antiGoals) ? req.body.antiGoals : undefined, repairScope: Array.isArray(req.body?.repairScope) ? req.body.repairScope.map(String) : undefined });
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const researchGate = await evaluateResearchPublicationGate(projectRoot(project.slug));
    if (!researchGate.allowed) { res.status(409).json({ error: { code: "RESEARCH_PUBLICATION_GATE_BLOCKED", gate: researchGate } }); return; }
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const researchGate = await evaluateResearchPublicationGate(projectRoot(project.slug));
    if (!researchGate.allowed) { res.status(409).json({ error: { code: "RESEARCH_PUBLICATION_GATE_BLOCKED", gate: researchGate } }); return; }
    const chapter = project.chapters.find((item) => item.id === req.params.chapterId);
    const adoptionTransactionId = typeof req.body?.adoptionTransactionId === "string" ? req.body.adoptionTransactionId : "";
    if (!chapter || !adoptionTransactionId) {
      res.status(400).json({ error: "chapter and adoptionTransactionId are required" });
      return;
    }
    const qualityGateDecisionId = typeof req.body?.qualityGateDecisionId === "string" ? req.body.qualityGateDecisionId.trim() : "";
    if (governedProjectionMutationRequired(project) && !qualityGateDecisionId) {
      res.status(409).json({ error: "CHAPTER_SETTLEMENT_QUALITY_GATE_REQUIRED" });
      return;
    }
    try {
      const settlementEvidence = req.body?.evidence && typeof req.body.evidence === "object" ? {
        summaryRef: typeof req.body.evidence.summaryRef === "string" ? req.body.evidence.summaryRef : undefined,
        obligationDeltaRef: typeof req.body.evidence.obligationDeltaRef === "string" ? req.body.evidence.obligationDeltaRef : undefined,
        projectionRef: typeof req.body.evidence.projectionRef === "string" ? req.body.evidence.projectionRef : undefined,
        feedbackRef: typeof req.body.evidence.feedbackRef === "string" ? req.body.evidence.feedbackRef : undefined,
        costRef: typeof req.body.evidence.costRef === "string" ? req.body.evidence.costRef : undefined
      } : undefined;
      const settlement = await settleChapter({ root: projectRoot(project.slug), projectSlug: project.slug, chapterId: chapter.id, adoptionTransactionId, targetPath: chapter.contentPath, qualityGateDecisionId: qualityGateDecisionId || undefined, qualityGateSourceFingerprint: typeof req.body?.qualityGateSourceFingerprint === "string" ? req.body.qualityGateSourceFingerprint : undefined, strictEvidence: req.body?.strictEvidence === true, evidence: settlementEvidence, chapterExecutionProofId: typeof req.body?.chapterExecutionProofId === "string" ? req.body.chapterExecutionProofId : undefined, chapterExecutionProofFingerprint: typeof req.body?.chapterExecutionProofFingerprint === "string" ? req.body.chapterExecutionProofFingerprint : undefined });
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
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
  app.post("/api/novel/projects/:projectId/runtime/preference-hypotheses/:hypothesisId/promote", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const current = await readPreferenceHypothesis(projectRoot(project.slug), req.params.hypothesisId);
      if (!current || current.projectSlug !== project.slug) { res.status(404).json({ error: "Preference hypothesis not found" }); return; }
      const hypothesis = await promotePreferenceHypothesis({ root: projectRoot(project.slug), hypothesisId: req.params.hypothesisId, actor: typeof req.body?.actor === "string" ? req.body.actor : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ hypothesis });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
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
  app.post("/api/novel/projects/:projectId/runtime/character-beliefs", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createBeliefLifecycle({ beliefId: String(body.beliefId || ""), characterId: String(body.characterId || ""), belief: String(body.belief || ""), protectiveFunction: String(body.protectiveFunction || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-beliefs/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(recordBeliefEvent(body.record, { type: body.type, description: String(body.description || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], pressureRefs: Array.isArray(body.pressureRefs) ? body.pressureRefs : [], costRefs: Array.isArray(body.costRefs) ? body.costRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/relationship-misreads", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createRelationshipMisread({ relationshipId: String(body.relationshipId || ""), sourceCharacterId: String(body.sourceCharacterId || ""), targetCharacterId: String(body.targetCharacterId || ""), sourceDefinition: String(body.sourceDefinition || ""), targetDefinition: String(body.targetDefinition || ""), publicState: String(body.publicState || ""), sourceSecret: String(body.sourceSecret || ""), targetSecret: String(body.targetSecret || ""), misunderstanding: String(body.misunderstanding || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/relationship-misreads/resolve", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(resolveRelationshipMisread(body.record, { sourceInterpretation: String(body.sourceInterpretation || ""), targetInterpretation: String(body.targetInterpretation || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], compensationProvided: body.compensationProvided === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/value-opponents", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createValueOpponentContract({ contractId: String(body.contractId || ""), protagonistId: String(body.protagonistId || ""), opponentId: String(body.opponentId || ""), opponentDesire: String(body.opponentDesire || ""), valueLogic: String(body.valueLogic || ""), viableWinPath: String(body.viableWinPath || ""), pressureOnFalseBelief: String(body.pressureOnFalseBelief || ""), concreteConflict: String(body.concreteConflict || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/offpage-character-plans", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createOffPageCharacterPlan({ planId: String(body.planId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), independentGoal: String(body.independentGoal || ""), resources: Array.isArray(body.resources) ? body.resources : [], constraints: Array.isArray(body.constraints) ? body.constraints : [], nearTermPlan: String(body.nearTermPlan || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/offpage-character-plans/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(recordOffPageEvent(body.plan, { eventId: String(body.eventId || ""), action: String(body.action || ""), consequence: String(body.consequence || ""), causalEvidenceRefs: Array.isArray(body.causalEvidenceRefs) ? body.causalEvidenceRefs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-presence-plans", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCharacterPresencePlan({ planId: String(body.planId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), arcRefs: Array.isArray(body.arcRefs) ? body.arcRefs : [], relationshipRefs: Array.isArray(body.relationshipRefs) ? body.relationshipRefs : [], obligationRefs: Array.isArray(body.obligationRefs) ? body.obligationRefs : [], resourceDependencies: Array.isArray(body.resourceDependencies) ? body.resourceDependencies : [], sceneCapacity: Number(body.sceneCapacity || 0), entries: Array.isArray(body.entries) ? body.entries : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-presence-plans/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateCharacterPresence(body.plan, { observed: Array.isArray(body.observed) ? body.observed : [], requiredSceneIds: Array.isArray(body.requiredSceneIds) ? body.requiredSceneIds : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/ensemble-attention/chapters", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(recordEnsembleChapter({ chapterId: String(body.chapterId || ""), projectSlug: project.slug, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], characters: Array.isArray(body.characters) ? body.characters : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/ensemble-attention/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateEnsembleAttention(Array.isArray(body.chapters) ? body.chapters : [], { minimumActiveChapters: Number(body.minimumActiveChapters || 1) })); }));

  app.post("/api/novel/projects/:projectId/runtime/character-voice-profiles", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCharacterVoiceProfile({ characterId: String(body.characterId || ""), version: String(body.version || ""), attentionFocus: String(body.attentionFocus || ""), desireAndAvoidance: String(body.desireAndAvoidance || ""), vocabularyRange: String(body.vocabularyRange || ""), syntaxAndPauses: String(body.syntaxAndPauses || ""), addressHabits: String(body.addressHabits || ""), lyingStyle: String(body.lyingStyle || ""), emotionalLeak: String(body.emotionalLeak || ""), powerExpression: String(body.powerExpression || ""), forbiddenDrift: Array.isArray(body.forbiddenDrift) ? body.forbiddenDrift : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-voice-profiles/compile", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(compileCharacterVoiceVariant(body.profile, { previousVersion: body.previousVersion, changeMilestone: body.changeMilestone, changeEvidenceRefs: Array.isArray(body.changeEvidenceRefs) ? body.changeEvidenceRefs : [], emotion: String(body.emotion || ""), relationshipStage: String(body.relationshipStage || ""), powerPosition: String(body.powerPosition || ""), knowledgeBoundary: Array.isArray(body.knowledgeBoundary) ? body.knowledgeBoundary : [], utterance: String(body.utterance || ""), variantEvidenceRefs: Array.isArray(body.variantEvidenceRefs) ? body.variantEvidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-arc-rhythm/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(recordArcRhythmEvent(body.record, { chapterId: String(body.chapterId || ""), phase: body.phase, pressure: String(body.pressure || ""), choice: String(body.choice || ""), cost: String(body.cost || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-arc-rhythm/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateCharacterArcRhythm(body.record, { minimumNovelPressure: Number(body.minimumNovelPressure || 1) })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-continuity", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCharacterContinuity({ projectSlug: project.slug, characterId: String(body.characterId || ""), identityVersion: String(body.identityVersion || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-continuity/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(recordCharacterContinuityEvent(body.record, { type: body.type, description: String(body.description || ""), cause: body.cause, mechanism: body.mechanism, cost: body.cost, identityChange: body.identityChange, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-revision-impact", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(analyzeCharacterRevisionImpact({ revisionId: String(body.revisionId || ""), projectSlug: project.slug, characterId: String(body.characterId || ""), changedFields: Array.isArray(body.changedFields) ? body.changedFields : [], oldValues: body.oldValues || {}, newValues: body.newValues || {}, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], dependencies: Array.isArray(body.dependencies) ? body.dependencies : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-arc-certificate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(issueCharacterArcCertificate({ arcId: String(body.arcId || ""), characterId: String(body.characterId || ""), startState: String(body.startState || ""), targetChange: String(body.targetChange || ""), currentBeliefOrValue: String(body.currentBeliefOrValue || ""), openBoundaries: Array.isArray(body.openBoundaries) ? body.openBoundaries : [], publicationFingerprint: String(body.publicationFingerprint || ""), milestones: Array.isArray(body.milestones) ? body.milestones : [], staleDependencyIds: Array.isArray(body.staleDependencyIds) ? body.staleDependencyIds : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
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
    const result = evaluatePovKnowledgeGate({ gateId: String(body.gateId ?? ""), sceneId: String(body.sceneId ?? ""), povCharacterId: String(body.povCharacterId ?? ""), narrativeDistance, knownFacts: Array.isArray(body.knownFacts) ? body.knownFacts.map(String) : [], unknownFacts: Array.isArray(body.unknownFacts) ? body.unknownFacts.map(String) : [], misbeliefs: Array.isArray(body.misbeliefs) ? body.misbeliefs.map(String) : [], prohibitedDisclosure: Array.isArray(body.prohibitedDisclosure) ? body.prohibitedDisclosure.map(String) : [], claims: Array.isArray(body.claims) ? body.claims : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
    res.status(201).json({ result });
  }));
  app.post("/api/novel/projects/:projectId/runtime/reminder-progression", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ progression: evaluateReminderProgression({ priorText: String(body.priorText || ""), currentText: String(body.currentText || ""), newInformation: typeof body.newInformation === "string" ? body.newInformation : undefined, newCost: typeof body.newCost === "string" ? body.newCost : undefined, relationshipChange: typeof body.relationshipChange === "string" ? body.relationshipChange : undefined }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/obligation-memory-risk", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ risk: evaluateObligationMemoryRisk({ obligationId: String(body.obligationId || ""), setupChapter: Number(body.setupChapter), currentChapter: Number(body.currentChapter), targetWindowChapter: Number(body.targetWindowChapter), lastReminderChapter: body.lastReminderChapter === undefined ? undefined : Number(body.lastReminderChapter), importance: body.importance === "low" || body.importance === "medium" ? body.importance : "high", reminderGapThreshold: body.reminderGapThreshold === undefined ? undefined : Number(body.reminderGapThreshold) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/foreshadowing/transformation-closure", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ gate: evaluateTransformationClosure({ transformationId: String(body.transformationId || ""), priorStatus: ["within", "risk", "overdue", "resolved"].includes(body.priorStatus) ? body.priorStatus : "overdue", mainlineSubclaimsAnswered: body.mainlineSubclaimsAnswered === true, readerFairnessEvidence: Array.isArray(body.readerFairnessEvidence) ? body.readerFairnessEvidence.map(String) : [], sequelInheritanceVerified: body.sequelInheritanceVerified === true, authorAuthorized: body.authorAuthorized === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/obligations/multi-payoff", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json({ result: evaluateMultiObligationPayoff({ payoffRef: String(body.payoffRef || ""), contracts: Array.isArray(body.contracts) ? body.contracts : [], setupRefsByObligation: body.setupRefsByObligation || {}, reminderRefsByObligation: body.reminderRefsByObligation || {}, answeredSubclaimsByObligation: body.answeredSubclaimsByObligation || {}, semanticReasonsByObligation: body.semanticReasonsByObligation || {}, observableChangesByObligation: body.observableChangesByObligation || {}, confidenceByObligation: body.confidenceByObligation || {} }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/obligations/conflict-gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ gate: evaluateObligationConflictGate({ gateId: String(body.gateId || ""), affectedWorkItemIds: Array.isArray(body.affectedWorkItemIds) ? body.affectedWorkItemIds.map(String) : [], alternatives: Array.isArray(body.alternatives) ? body.alternatives.map(String) : [], selectedAlternative: typeof body.selectedAlternative === "string" ? body.selectedAlternative : undefined, authorizationGranted: body.authorizationGranted === true }) }); }));

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

  app.get("/api/novel/projects/:projectId/runtime/prose-generation-manifests/:manifestId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const manifest = await readProseGenerationManifest(projectRoot(project.slug), req.params.manifestId);
    if (!manifest) { res.status(404).json({ error: "Prose generation manifest not found" }); return; }
    const receipt = await readDecisionConsumptionReceipt(projectRoot(project.slug), manifest.decisionConsumptionReceiptRef);
    if (!receipt || receipt.projectSlug !== project.slug || receipt.consumer !== "prose" || receipt.consumerRef !== manifest.manifestId) { res.status(404).json({ error: "Prose generation manifest not found" }); return; }
    res.json({ manifest });
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-generation-manifests", asyncRoute(async (req, res) => {
    try {
      const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
      const decisionConsumptionReceiptRef = String(body.decisionConsumptionReceiptRef ?? "").trim();
      const receipt = decisionConsumptionReceiptRef ? await readDecisionConsumptionReceipt(projectRoot(project.slug), decisionConsumptionReceiptRef) : null;
      const manifestId = String(body.manifestId ?? "").trim();
      if (!receipt || receipt.projectSlug !== project.slug || receipt.consumer !== "prose" || receipt.consumerRef !== manifestId) throw new Error("PROSE_MANIFEST_DECISION_RECEIPT_INVALID");
      const craftPatternRefs = Array.isArray(body.craftPatternRefs) ? body.craftPatternRefs.map(String) : [];
      await assertCraftPatternReleaseRefs(projectRoot(project.slug), project.slug, craftPatternRefs);
      const manifest = createProseGenerationManifest({ manifestId, decisionConsumptionReceiptRef, storyContractRef: String(body.storyContractRef ?? ""), outlineVersion: String(body.outlineVersion ?? ""), chapterIntentRef: String(body.chapterIntentRef ?? ""), sceneCardRefs: Array.isArray(body.sceneCardRefs) ? body.sceneCardRefs.map(String) : [], characterStateRefs: Array.isArray(body.characterStateRefs) ? body.characterStateRefs.map(String) : [], povStateRef: String(body.povStateRef ?? ""), obligationRefs: Array.isArray(body.obligationRefs) ? body.obligationRefs.map(String) : [], authorLockRefs: Array.isArray(body.authorLockRefs) ? body.authorLockRefs.map(String) : [], craftPatternRefs, latestAuthorDirection: String(body.latestAuthorDirection ?? ""), proseBaselineRef: String(body.proseBaselineRef ?? ""), planningHorizonRef: String(body.planningHorizonRef ?? ""), contextManifestRef: String(body.contextManifestRef ?? ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [] });
      const persisted = await persistProseGenerationManifest(projectRoot(project.slug), manifest);
      res.status(persisted.created ? 201 : 200).json({ manifest: persisted.manifest, created: persisted.created });
    } catch (error) {
      res.status(409).json({ error: { code: error instanceof Error ? error.message : "PROSE_MANIFEST_INVALID" } });
    }
  }));

  app.post("/api/novel/projects/:projectId/runtime/prose-generation-manifests/:manifestId/freshness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const manifest = await readProseGenerationManifest(projectRoot(project.slug), req.params.manifestId);
    if (!manifest) { res.status(404).json({ error: "Prose generation manifest not found" }); return; }
    const receipt = await readDecisionConsumptionReceipt(projectRoot(project.slug), manifest.decisionConsumptionReceiptRef);
    if (!receipt || receipt.projectSlug !== project.slug || receipt.consumer !== "prose" || receipt.consumerRef !== manifest.manifestId) { res.status(404).json({ error: "Prose generation manifest not found" }); return; }
    res.json({ status: evaluateProseCandidateFreshness(manifest, String(req.body?.candidateManifestFingerprint ?? "")) });
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
    const activeQuestion = (await readDialogueQuestions(projectRoot(project.slug))).find((question) => question.status === "active");
    res.json({ result: parseCollaborationMessage(String(req.body?.text ?? ""), activeQuestion ? { activeQuestionId: activeQuestion.questionId } : {}) });
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
    const utterance = captureAuthorUtterance({ projectId: project.slug, text: String(body.text ?? ""), idempotencyKey: String(body.idempotencyKey ?? "") });
    const persisted = await persistAuthorUtterance(projectRoot(project.slug), utterance);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/capture", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ utterances: await readAuthorUtterances(projectRoot(project.slug), project.slug) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/frame", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const requestedUtterance = body.utterance;
    const idempotencyKey = requestedUtterance && typeof requestedUtterance === "object" && typeof requestedUtterance.idempotencyKey === "string" ? requestedUtterance.idempotencyKey : "";
    const persistedUtterance = idempotencyKey
      ? (await readAuthorUtterances(projectRoot(project.slug), project.slug)).find((item) => item.idempotencyKey === idempotencyKey)
      : undefined;
    const frame = buildStorySeedFrame({ utterance: persistedUtterance || requestedUtterance, facets: Array.isArray(body.facets) ? body.facets : [] });
    const persisted = await persistStorySeedFrame(projectRoot(project.slug), frame);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/frame", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ frames: await readStorySeedFrames(projectRoot(project.slug), project.slug) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/interpretations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const frameFingerprint = body.frame && typeof body.frame === "object" && typeof body.frame.fingerprint === "string" ? body.frame.fingerprint : "";
    const persistedFrame = frameFingerprint
      ? (await readStorySeedFrames(projectRoot(project.slug), project.slug)).find((item) => item.fingerprint === frameFingerprint)
      : undefined;
    if (!persistedFrame) { res.status(409).json({ error: "SEED_FRAME_PERSISTENCE_REQUIRED" }); return; }
    const set = createSeedInterpretationSet({ frame: persistedFrame, interpretations: Array.isArray(body.interpretations) ? body.interpretations : [] });
    const persisted = await persistSeedInterpretationSet(projectRoot(project.slug), set);
    const currentState = await readSeedCompilationState(projectRoot(project.slug), project.slug);
    const nextState = currentState ? advanceSeedCompilationAfterInterpretation(currentState, persisted.set.status) : undefined;
    if (nextState && nextState.fingerprint !== currentState?.fingerprint) await persistSeedCompilationState(projectRoot(project.slug), nextState);
    res.status(persisted.created ? 201 : 200).json({ interpretationSet: persisted.set, created: persisted.created, ...(nextState ? { state: nextState } : {}) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/interpretations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ interpretationSets: await readSeedInterpretationSets(projectRoot(project.slug), project.slug) });
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
    const currentState = await readSeedCompilationState(projectRoot(project.slug), project.slug);
    if (!currentState) { res.status(409).json({ error: "SEED_COMPILATION_STATE_REQUIRED" }); return; }
    if (currentState.status !== "clarification_required" && currentState.status !== "contract_candidate_ready") { res.status(409).json({ error: "SEED_ADOPTION_STATE_INVALID" }); return; }
    const adoption = adoptSeedFields({ existing: Array.isArray(body.existing) ? body.existing : [], decisions: Array.isArray(body.decisions) ? body.decisions : [] });
    const persisted = await persistSeedAdoption(projectRoot(project.slug), adoption);
    const nextState = deriveSeedStateAfterAdoption(currentState, persisted.result.fields.some((field) => field.status === "adopted"));
    await persistSeedCompilationState(projectRoot(project.slug), nextState);
    res.status(persisted.created ? 201 : 200).json({ adoption: persisted.result, created: persisted.created, state: nextState });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/adoption", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const adoption = await readSeedAdoption(projectRoot(project.slug));
    if (!adoption) { res.status(404).json({ error: "SEED_ADOPTION_NOT_FOUND" }); return; }
    res.json({ adoption });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/adoption/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const adoption = await readSeedAdoption(root);
    const state = await readSeedCompilationState(root, project.slug);
    if (!adoption) { res.status(409).json({ error: "SEED_ADOPTION_REQUIRED" }); return; }
    if (!state || state.status !== "contract_partially_adopted") { res.status(409).json({ error: "SEED_REVOCATION_STATE_INVALID" }); return; }
    const dependencyMap = req.body?.dependencyMap && typeof req.body.dependencyMap === "object" ? Object.fromEntries(Object.entries(req.body.dependencyMap).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : []])) : {};
    const receipt = revokeSeedAdoption({ adoption, field: String(req.body?.field ?? ""), reason: String(req.body?.reason ?? ""), dependencyMap, protectedFields: Array.isArray(req.body?.protectedFields) ? req.body.protectedFields.map(String) : [] });
    const persisted = await persistSeedAdoptionRevocation(root, receipt);
    if (receipt.blockers.length) { res.status(409).json({ error: receipt.blockers[0], receipt: persisted.receipt, created: persisted.created, state }); return; }
    const nextState = deriveSeedStateAfterRevocation(state);
    await persistSeedCompilationState(root, nextState);
    res.status(persisted.created ? 201 : 200).json({ receipt: persisted.receipt, created: persisted.created, state: nextState });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/adoption/revocations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ revocations: await readSeedAdoptionRevocations(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/recompile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const input = { fields: Array.isArray(body.fields) ? body.fields : [], changedFields: Array.isArray(body.changedFields) ? body.changedFields.map(String) : [], dependencyMap: body.dependencyMap ?? {} };
    const recompile = recompileSeedIncrementally(input);
    const adoption = await readSeedAdoption(projectRoot(project.slug));
    if (!adoption) { res.status(201).json({ recompile }); return; }
    const receipt = await persistSeedRecompileReceipt(projectRoot(project.slug), createSeedRecompileReceipt({ ...input, adoptionFingerprint: adoption.fingerprint, targetVersionId: typeof body.targetVersionId === "string" ? body.targetVersionId : undefined }));
    const rawAssetMap = body.assetMap && typeof body.assetMap === "object" ? body.assetMap : {};
    const assetMap = Object.fromEntries(Object.entries(rawAssetMap).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : []]));
    const impact = Object.keys(assetMap).length
      ? await persistSeedAssetImpactReport(projectRoot(project.slug), createSeedAssetImpactReport({ receipt: receipt.receipt, assetMap, protectedAssetIds: Array.isArray(body.protectedAssetIds) ? body.protectedAssetIds.map(String) : [] }))
      : undefined;
    const unifiedImpact = Array.isArray(body.assetNodeIds) && body.assetNodeIds.length
      ? await createImpactAnalysis({ root: projectRoot(project.slug), projectSlug: project.slug, rootNodeIds: body.assetNodeIds.map(String), protectedNodeIds: Array.isArray(body.protectedNodeIds) ? body.protectedNodeIds.map(String) : [], reason: String(body.impactReason || "seed recompile"), sourceRefs: Array.isArray(body.impactSourceRefs) ? body.impactSourceRefs.map(String) : ["seed-recompile://" + receipt.receipt.fingerprint] })
      : undefined;
    if (impact?.status === "blocked" || unifiedImpact?.status === "blocked") { res.status(409).json({ error: impact?.blockers[0] || unifiedImpact?.blockers[0], recompile, receipt: receipt.receipt, created: receipt.created, ...(impact ? { impact } : {}), ...(unifiedImpact ? { unifiedImpact } : {}) }); return; }
    res.status(receipt.created ? 201 : 200).json({ recompile, receipt: receipt.receipt, created: receipt.created, ...(impact ? { impact } : {}), ...(unifiedImpact ? { unifiedImpact } : {}) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/recompile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ receipts: await readSeedRecompileReceipts(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/state", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    const state = createSeedCompilationState({ projectId: project.slug, status: body.status, stableUnderstandingFingerprint: typeof body.stableUnderstandingFingerprint === "string" ? body.stableUnderstandingFingerprint : undefined });
    await persistSeedCompilationState(projectRoot(project.slug), state);
    res.status(201).json({ state });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/state", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const state = await readSeedCompilationState(projectRoot(project.slug), project.slug);
    if (!state) { res.status(404).json({ error: "SEED_COMPILATION_STATE_NOT_FOUND" }); return; }
    res.json({ state });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/state/failure", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const current = req.body?.state;
    if (!current || current.projectId !== project.slug) { res.status(409).json({ error: "SEED_COMPILATION_STATE_PROJECT_MISMATCH" }); return; }
    const state = recordSeedCompilationFailure(current, req.body?.failure);
    await persistSeedCompilationState(projectRoot(project.slug), state);
    res.status(201).json({ state });
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
    const utterance = createDialogueUtterance({ projectId: project.slug, sessionId: String(body.sessionId ?? ""), turn: Number(body.turn ?? 0), authorId: String(body.authorId ?? ""), text: String(body.text ?? ""), clientTimestamp: String(body.clientTimestamp ?? ""), language: String(body.language ?? ""), attachmentRefs: Array.isArray(body.attachmentRefs) ? body.attachmentRefs.map(String) : [], idempotencyKey: String(body.idempotencyKey ?? "") });
    const persisted = await appendDialogueUtterance(projectRoot(project.slug), utterance);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.get("/api/novel/projects/:projectId/runtime/dialogue/utterances", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ utterances: await readDialogueUtterances(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/intents", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const atoms = atomizeIntent({ utteranceId: String(req.body?.utteranceId ?? ""), text: String(req.body?.text ?? ""), atoms: Array.isArray(req.body?.atoms) ? req.body.atoms : [] });
    const persisted = await appendDialogueIntentAtoms(projectRoot(project.slug), atoms);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.get("/api/novel/projects/:projectId/runtime/dialogue/intents", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ atoms: await readDialogueIntentAtoms(projectRoot(project.slug)) });
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

  app.post("/api/novel/projects/:projectId/runtime/dialogue/understanding-evidence-bundles", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ evidence: evaluateUnderstandingEvidenceBundle({ claimId: String(body.claimId ?? ""), status: body.status, confidenceInterval: Array.isArray(body.confidenceInterval) ? [Number(body.confidenceInterval[0]), Number(body.confidenceInterval[1])] : [Number.NaN, Number.NaN], supportingEvidenceRefs: Array.isArray(body.supportingEvidenceRefs) ? body.supportingEvidenceRefs.map(String) : [], opposingEvidenceRefs: Array.isArray(body.opposingEvidenceRefs) ? body.opposingEvidenceRefs.map(String) : [], interpreterVersion: String(body.interpreterVersion ?? ""), promptVersion: String(body.promptVersion ?? ""), alternatives: Array.isArray(body.alternatives) ? body.alternatives.map(String) : [], sourceMessageIds: Array.isArray(body.sourceMessageIds) ? body.sourceMessageIds.map(String) : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/question-ranking", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ ranking: rankDialogueQuestions(Array.isArray(req.body?.questions) ? req.body.questions : []) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/dialogue/non-leading-question", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {};
    res.status(201).json({ question: renderNonLeadingQuestion({ questionId: String(body.questionId ?? ""), knownEvidence: Array.isArray(body.knownEvidence) ? body.knownEvidence.map(String) : [], whyNow: String(body.whyNow ?? ""), options: Array.isArray(body.options) ? body.options : [], recommendation: String(body.recommendation ?? ""), recommendationEvidenceRefs: Array.isArray(body.recommendationEvidenceRefs) ? body.recommendationEvidenceRefs.map(String) : [] }) });
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

  app.post("/api/novel/projects/:projectId/runtime/objectives/profile", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ profile: createCreativeObjectiveProfile({ ...body, projectSlug: project.slug, items: Array.isArray(body.items) ? body.items : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/objectives/conflicts/evaluate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ conflict: evaluateObjectiveConflict({ ...body, benefits: Array.isArray(body.benefits) ? body.benefits.map(String) : [], costs: Array.isArray(body.costs) ? body.costs.map(String) : [], affectedScopes: Array.isArray(body.affectedScopes) ? body.affectedScopes.map(String) : [], compromises: Array.isArray(body.compromises) ? body.compromises.map(String) : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) });
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
    res.status(201).json({ result: evaluatePayoffEvidence({ contract: body.contract, setupRefs: Array.isArray(body.setupRefs) ? body.setupRefs.map(String) : [], reminderRefs: Array.isArray(body.reminderRefs) ? body.reminderRefs.map(String) : [], payoffRef: String(body.payoffRef ?? ""), semanticReason: String(body.semanticReason ?? ""), confidence: Number(body.confidence ?? 0), observableChanges: Array.isArray(body.observableChanges) ? body.observableChanges.map(String) : [], answeredSubclaims: Array.isArray(body.answeredSubclaims) ? body.answeredSubclaims.map(String) : undefined }) });
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

  app.post("/api/novel/projects/:projectId/runtime/obligations/legacy-ledger-migrations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const root = projectRoot(project.slug);
      const obligation = await readNarrativeObligation(root, String(req.body?.obligationId || ""));
      if (!obligation) { res.status(404).json({ error: "OBLIGATION_NOT_FOUND" }); return; }
      const receipt = createLegacyLedgerMigrationReceipt({ legacyId: String(req.body?.legacyId || ""), obligationId: obligation.obligationId, evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [], confirmer: String(req.body?.confirmer || ""), reason: String(req.body?.reason || "") });
      const persisted = await persistLegacyLedgerMigration(root, receipt);
      res.status(persisted.created ? 201 : 200).json(persisted);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/window", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ window: evaluateObligationWindow(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/evidence-invalidation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ invalidation: evaluateObligationEvidenceInvalidation({ obligationId: String(body.obligationId || ""), priorStatus: body.priorStatus, setupEvidenceRefs: Array.isArray(body.setupEvidenceRefs) ? body.setupEvidenceRefs.map(String) : [], currentEvidenceRefs: Array.isArray(body.currentEvidenceRefs) ? body.currentEvidenceRefs.map(String) : [], sameTermRefs: Array.isArray(body.sameTermRefs) ? body.sameTermRefs.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/obligations/review-disagreement", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ review: evaluateObligationReviewDisagreement({ obligationId: String(body.obligationId || ""), payoffRef: String(body.payoffRef || ""), reviewerVerdicts: Array.isArray(body.reviewerVerdicts) ? body.reviewerVerdicts : [], missingSubclaims: Array.isArray(body.missingSubclaims) ? body.missingSubclaims.map(String) : [] }) });
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

  app.post("/api/novel/projects/:projectId/runtime/obligations/visibility-exit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ projection: projectObligationExit({ obligationId: String(body.obligationId || ""), authorSecret: String(body.authorSecret || ""), readerVisible: String(body.readerVisible || ""), publicMetadata: String(body.publicMetadata || ""), authorSecretAuthorized: body.authorSecretAuthorized === true, exit: body.exit }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/editor-markers", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ markers: createObligationEditorMarkers(req.body ?? {}) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/obligations/editor-export", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ export: exportObligationManuscript({ manuscriptText: String(body.manuscriptText ?? ""), markers: Array.isArray(body.markers) ? body.markers : [], mode: body.mode === "markdown" || body.mode === "publication" ? body.mode : "copy" }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/publication-freeze", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const publication = freezeObligationPublication(req.body ?? {}); await persistObligationPublication(projectRoot(project.slug), publication);
    res.status(201).json({ publication, audit: auditObligationPublication(publication) });
  }));
  app.get("/api/novel/projects/:projectId/runtime/obligations/publication-freeze/:publicationId/:version/audit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const publication = await readObligationPublication(projectRoot(project.slug), req.params.publicationId, req.params.version);
    if (!publication) { res.status(404).json({ error: "OBLIGATION_PUBLICATION_NOT_FOUND" }); return; }
    res.json({ audit: auditObligationPublication(publication) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/obligations/completion-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateObligationCompletionGate(req.body ?? {}) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/obligations/closure-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateObligationClosureGate({ obligations: Array.isArray(body.obligations) ? body.obligations : [], sourceCoverageComplete: body.sourceCoverageComplete === true, unresolvedCandidateCount: Number(body.unresolvedCandidateCount ?? 0), conflictCount: Number(body.conflictCount ?? 0), intentionalOpen: Array.isArray(body.intentionalOpen) ? body.intentionalOpen : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/versions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ version: createUnderstandingVersion({ versionId: String(body.versionId || ""), rawInput: String(body.rawInput || ""), items: Array.isArray(body.items) ? body.items : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/versions/revise", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ version: reviseUnderstandingVersion(body.previous, { versionId: String(body.versionId || ""), rawInput: String(body.rawInput || ""), additions: Array.isArray(body.additions) ? body.additions : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/multi-intent", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ capture: captureMultiIntent({ messageId: String(body.messageId || ""), rawText: String(body.rawText || ""), intents: Array.isArray(body.intents) ? body.intents : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/inference-safety", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ projection: projectInferenceSafety({ fields: Array.isArray(req.body?.fields) ? req.body.fields : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/reversible-assumption-repair", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ repair: applyScopedAssumptionRepair({ assumptionId: String(body.assumptionId || ""), defaultValue: String(body.defaultValue || ""), affectedAssetIds: Array.isArray(body.affectedAssetIds) ? body.affectedAssetIds.map(String) : [], authorOverride: body.authorOverride && typeof body.authorOverride === "object" ? { value: String(body.authorOverride.value || ""), affectedAssetIds: Array.isArray(body.authorOverride.affectedAssetIds) ? body.authorOverride.affectedAssetIds.map(String) : [] } : undefined }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/ambiguity-impact-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ gate: evaluateAmbiguityImpactGate({ questionId: String(body.questionId || ""), impact: Number(body.impact), ambiguity: Number(body.ambiguity), confidence: Number(body.confidence), alternatives: Array.isArray(body.alternatives) ? body.alternatives.map(String) : [], irreversible: body.irreversible === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/bounded-delegation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ grant: createBoundedDelegationGrant({ grantId: String(body.grantId || ""), scope: Array.isArray(body.scope) ? body.scope.map(String) : [], allowedActions: Array.isArray(body.allowedActions) ? body.allowedActions.map(String) : [], expiresAt: String(body.expiresAt || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/bounded-delegation/authorize", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ authorization: authorizeBoundedDelegation(req.body?.grant, String(req.body?.action || ""), String(req.body?.now || new Date().toISOString())) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/bounded-delegation/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ grant: revokeBoundedDelegation(req.body?.grant, String(req.body?.reason || "")) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/ambiguous-answer", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ state: createAmbiguousAnswerState({ questionId: String(body.questionId || ""), answer: String(body.answer || ""), alternatives: Array.isArray(body.alternatives) ? body.alternatives.map(String) : [], affectedDecision: String(body.affectedDecision || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/answer-evidence-closure", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ closure: closeQuestionsWithEvidence({ questions: Array.isArray(body.questions) ? body.questions : [], answer: { questionId: String(body.answer?.questionId || ""), text: String(body.answer?.text || ""), evidenceRefs: Array.isArray(body.answer?.evidenceRefs) ? body.answer.evidenceRefs.map(String) : [] } }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/correction-before-continue", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ continuation: applyCorrectionBeforeContinue(body.correction, { ...(body.artifacts ?? {}), recomputedConstraintAssets: Array.isArray(body.recomputedConstraintAssets) ? body.recomputedConstraintAssets : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/question-reask", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ reask: reaskWithNewPremise({ previous: body.previous, text: String(body.text || ""), newPremise: String(body.newPremise || ""), premiseEvidenceRefs: Array.isArray(body.premiseEvidenceRefs) ? body.premiseEvidenceRefs.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/stale-answer-reconciliation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ reconciliation: reconcileOfflineAnswer({ submittedQuestion: body.submittedQuestion, answerText: String(body.answerText || ""), currentQuestions: Array.isArray(body.currentQuestions) ? body.currentQuestions : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/preference-probes/apply-scope", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ application: evaluateScopedPreferenceApplication(req.body?.selection, { targetContext: String(req.body?.targetContext || ""), hasScopeEvidence: req.body?.hasScopeEvidence === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/memory/compression-audit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ audit: auditCompressedMemory({ endingStatus: body.endingStatus, opposingEvidence: Array.isArray(body.opposingEvidence) ? body.opposingEvidence.map(String) : [], withdrawnDirections: Array.isArray(body.withdrawnDirections) ? body.withdrawnDirections.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/memory/forget-propagation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const publishedVersionRefs = Array.isArray(body.publishedVersionRefs) ? body.publishedVersionRefs.map(String) : [];
    const propagation = propagateMemoryForget({ memory: body.memory, reason: String(body.reason || ""), indexContains: body.indexContains === true, cacheContains: body.cacheContains === true, publishedVersionRefs });
    const tombstone = await persistMemoryForget(projectRoot(project.slug), project.slug, propagation, publishedVersionRefs);
    res.status(201).json({ propagation, tombstone });
  }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/runtime-result-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: gateRuntimeResult({ interruption: req.body?.interruption, resultText: String(req.body?.resultText || ""), nowMs: Number(req.body?.nowMs), interruptionMs: Number(req.body?.interruptionMs) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/question-timeout-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateQuestionTimeout({ questionId: String(body.questionId || ""), level: body.level, waitedDays: Number(body.waitedDays), grant: body.grant, now: String(body.now || new Date().toISOString()), requestedAction: String(body.requestedAction || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/restart-recovery", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ recovery: rebuildAfterRestart(Array.isArray(req.body?.events) ? req.body.events : []) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/offline-reconciliation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ reconciliation: reconcileOfflineMessages({ serverCursor: Number(body.serverCursor), localCursor: Number(body.localCursor), pending: Array.isArray(body.pending) ? body.pending : [], serverMessageIds: Array.isArray(body.serverMessageIds) ? body.serverMessageIds.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/coreference-repair", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const repair = createCoreferenceRepair({ incidentId: String(body.incidentId || ""), pronoun: String(body.pronoun || ""), priorEntityId: String(body.priorEntityId || ""), correctedEntityId: String(body.correctedEntityId || ""), correctionCount: Number(body.correctionCount), regressionCaseId: String(body.regressionCaseId || "") });
    res.status(201).json({ repair, resolution: body.candidateEntityIds ? applyCoreferenceRepair(repair, { pronoun: String(body.pronoun || ""), candidateEntityIds: Array.isArray(body.candidateEntityIds) ? body.candidateEntityIds.map(String) : [] }) : undefined });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/legacy-question-import", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ questions: importLegacyQuestions({ taskId: String(req.body?.taskId || ""), questions: Array.isArray(req.body?.questions) ? req.body.questions.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/obligations/open-contract-audit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ audit: auditOpenContract({ obligationId: String(body.obligationId || ""), coreConflictDependsOnAnswer: body.coreConflictDependsOnAnswer === true, authorMarkedSequelHook: body.authorMarkedSequelHook === true, fairnessEvidence: Array.isArray(body.fairnessEvidence) ? body.fairnessEvidence.map(String) : [], answeredSubclaims: Array.isArray(body.answeredSubclaims) ? body.answeredSubclaims.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/compile-sentence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json({ items: compileObjectiveSentence({ rawText: String(req.body?.rawText || ""), sourceRef: String(req.body?.sourceRef || ""), profileId: String(req.body?.profileId || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/candidate-guard", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ evaluation: evaluateObjectiveCandidate({ candidateId: String(req.body?.candidateId || ""), preferenceScore: Number(req.body?.preferenceScore), hardFactsPassed: req.body?.hardFactsPassed === true, povKnowledgePassed: req.body?.povKnowledgePassed === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/scope-resolve", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ objective: resolveScopedObjective({ basePreference: String(req.body?.basePreference || ""), chapterId: String(req.body?.chapterId || ""), requestedChapterId: String(req.body?.requestedChapterId || ""), override: req.body?.override }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/conflict-options", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ options: buildObjectiveConflictOptions({ left: String(req.body?.left || ""), right: String(req.body?.right || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/weight-release", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.status(201).json({ release: createObjectiveWeightRelease({ releaseId: String(body.releaseId || ""), version: Number(body.version), stage: String(body.stage || ""), weights: body.weights && typeof body.weights === "object" ? body.weights : {}, basisRefs: Array.isArray(body.basisRefs) ? body.basisRefs.map(String) : [], publishedAt: String(body.publishedAt || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/explain-candidate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ explanation: explainCandidateWithRelease({ candidateId: String(req.body?.candidateId || ""), candidateCreatedVersion: Number(req.body?.candidateCreatedVersion), release: req.body?.release }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/near-far-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateNearFarCandidate({ candidateId: String(req.body?.candidateId || ""), nearTermQuality: Number(req.body?.nearTermQuality), longTermEvidenceRefs: Array.isArray(req.body?.longTermEvidenceRefs) ? req.body.longTermEvidenceRefs.map(String) : [], povKnowledgePassed: req.body?.povKnowledgePassed === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/anti-goal-semantic", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ guard: detectAbstractAntiGoal({ text: String(req.body?.text || ""), antiGoal: "命运齿轮模板钩子", evidenceRef: String(req.body?.evidenceRef || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/aesthetic-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ report: reportAestheticEvidence({ dimension: String(req.body?.dimension || ""), blindSelectionEvidence: Array.isArray(req.body?.blindSelectionEvidence) ? req.body.blindSelectionEvidence.map(String) : [], proseEvidence: Array.isArray(req.body?.proseEvidence) ? req.body.proseEvidence.map(String) : [], stableScale: req.body?.stableScale === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/target-impact", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ impact: classifyObjectiveTargetImpact({ changedObjectiveId: String(req.body?.changedObjectiveId || ""), affectedAssets: Array.isArray(req.body?.affectedAssets) ? req.body.affectedAssets : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/calibration", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ calibration: proposeObjectiveCalibration({ observations: Array.isArray(req.body?.observations) ? req.body.observations : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/objectives/q003-report", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ report: buildQ003DualTrackReport({ q003Confirmed: body.q003Confirmed === true, latencyMs: Number(body.latencyMs), costCents: Number(body.costCents), reworkCount: Number(body.reworkCount), authorAcceptance: Number(body.authorAcceptance), hardGuardFailures: Array.isArray(body.hardGuardFailures) ? body.hardGuardFailures.map(String) : [], qualityEvidenceRefs: Array.isArray(body.qualityEvidenceRefs) ? body.qualityEvidenceRefs.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/partial-adoption", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ attribution: attributePartialAdoption({ candidateId: String(body.candidateId || ""), keptDimensions: Array.isArray(body.keptDimensions) ? body.keptDimensions.map(String) : [], rejectedDimensions: Array.isArray(body.rejectedDimensions) ? body.rejectedDimensions.map(String) : [], authorRewrite: String(body.authorRewrite || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/manual-revision-attribution", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ attribution: attributeManualRevision({ revisionId: String(body.revisionId || ""), sceneId: String(body.sceneId || ""), compressedFrom: String(body.compressedFrom || ""), repeatedSceneIds: Array.isArray(body.repeatedSceneIds) ? body.repeatedSceneIds.map(String) : [], probeValidated: body.probeValidated === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/scope-proposal", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ proposal: proposeFeedbackScope({ text: String(req.body?.text || ""), currentSceneId: String(req.body?.currentSceneId || ""), repeatedSceneIds: Array.isArray(req.body?.repeatedSceneIds) ? req.body.repeatedSceneIds.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/revocation-cause", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ cause: classifyPreferenceRevocation({ preferenceId: String(req.body?.preferenceId || ""), reason: String(req.body?.reason || ""), canonChanged: req.body?.canonChanged === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/hypothesis-update", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ hypothesis: updatePreferenceHypothesis({ hypothesis: req.body?.hypothesis, evidenceRef: String(req.body?.evidenceRef || ""), evidenceKind: req.body?.evidenceKind === "counter" ? "counter" : "support", context: String(req.body?.context || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/evidence-weight", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ evidence: classifyFeedbackEvidence({ decision: req.body?.decision === "rejected" ? "rejected" : "accepted", reason: String(req.body?.reason || ""), sourceRef: String(req.body?.sourceRef || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/confounded-probe", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ probe: createConfoundedFeedbackProbe({ candidateId: String(req.body?.candidateId || ""), changedDimensions: Array.isArray(req.body?.changedDimensions) ? req.body.changedDimensions.map(String) : [], authorRejected: req.body?.authorRejected === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/safe-exploration", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ exploration: consumeSafeExploration({ budget: Number(req.body?.budget), used: Number(req.body?.used), sceneCritical: req.body?.sceneCritical === true, canonWrite: req.body?.canonWrite === true, authorRejected: req.body?.authorRejected === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/project-isolation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ isolation: isolateFeedbackProject({ projectSlug: String(req.body?.projectSlug || ""), requestedProjectSlug: String(req.body?.requestedProjectSlug || ""), forgotten: req.body?.forgotten === true, publishedAuditRefs: Array.isArray(req.body?.publishedAuditRefs) ? req.body.publishedAuditRefs.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/feedback/learning-release-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ release: evaluateLearningRelease({ shadowAcceptanceDelta: Number(req.body?.shadowAcceptanceDelta), hardVoiceFailuresDelta: Number(req.body?.hardVoiceFailuresDelta), reworkDelta: Number(req.body?.reworkDelta), canaryActive: req.body?.canaryActive === true, previousStableVersion: String(req.body?.previousStableVersion || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/learning-releases", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const release = await createLearningRelease({
        root: projectRoot(project.slug), projectSlug: project.slug,
        releaseId: typeof req.body?.releaseId === "string" ? req.body.releaseId.trim() : "",
        candidatePolicyRef: typeof req.body?.candidatePolicyRef === "string" ? req.body.candidatePolicyRef.trim() : "",
        candidatePatternId: typeof req.body?.candidatePatternId === "string" ? req.body.candidatePatternId.trim() : undefined,
        baselinePolicyRef: typeof req.body?.baselinePolicyRef === "string" ? req.body.baselinePolicyRef.trim() : "",
        evaluationRunRefs: Array.isArray(req.body?.evaluationRunRefs) ? req.body.evaluationRunRefs.filter((item: unknown): item is string => typeof item === "string").map((item: string) => item.trim()) : [],
        regressionCaseRefs: Array.isArray(req.body?.regressionCaseRefs) ? req.body.regressionCaseRefs.filter((item: unknown): item is string => typeof item === "string").map((item: string) => item.trim()) : undefined,
        shadowAcceptanceDelta: Number(req.body?.shadowAcceptanceDelta), hardVoiceFailuresDelta: Number(req.body?.hardVoiceFailuresDelta), reworkDelta: Number(req.body?.reworkDelta), canaryActive: req.body?.canaryActive === true,
        previousStableVersion: typeof req.body?.previousStableVersion === "string" ? req.body.previousStableVersion.trim() : "",
        approvedBy: typeof req.body?.approvedBy === "string" ? req.body.approvedBy.trim() : "",
        expiresAt: typeof req.body?.expiresAt === "string" ? req.body.expiresAt.trim() : undefined
      });
      res.status(201).json({ release });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/learning-releases/:releaseId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const release = await readLearningRelease(projectRoot(project.slug), req.params.releaseId);
    if (!release || release.projectSlug !== project.slug) { res.status(404).json({ error: "Learning release not found" }); return; }
    res.json({ release });
  }));
  app.post("/api/novel/projects/:projectId/runtime/learning-releases/:releaseId/rollback", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const existing = await readLearningRelease(projectRoot(project.slug), req.params.releaseId);
    if (!existing || existing.projectSlug !== project.slug) { res.status(404).json({ error: "Learning release not found" }); return; }
    try {
      const release = await rollbackLearningRelease({ root: projectRoot(project.slug), releaseId: req.params.releaseId, rolledBackBy: typeof req.body?.rolledBackBy === "string" ? req.body.rolledBackBy : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ release });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/learning-releases/:releaseId/rollback-for-regression", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const release = await rollbackLearningReleaseForRegression({ root: projectRoot(project.slug), projectSlug: project.slug, releaseId: req.params.releaseId, regressionCaseRef: typeof req.body?.regressionCaseRef === "string" ? req.body.regressionCaseRef.trim() : "", rolledBackBy: typeof req.body?.rolledBackBy === "string" ? req.body.rolledBackBy : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ release });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/journey/first-slice-readiness", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ readiness: auditFirstSlice({ authorUtterancePersisted: body.authorUtterancePersisted === true, sessionPersisted: body.sessionPersisted === true, understandingSnapshotPersisted: body.understandingSnapshotPersisted === true, uniqueQuestionCount: Number(body.uniqueQuestionCount), survivesRestart: body.survivesRestart === true, canonWritten: body.canonWritten === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/journey/runtime-reuse-audit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ audit: auditRuntimeReuse({ orchestratorExecutorRef: String(body.orchestratorExecutorRef || ""), existingExecutorRef: String(body.existingExecutorRef || ""), queueImplementations: Number(body.queueImplementations), progressEventsObserved: body.progressEventsObserved === true, cancellationSupported: body.cancellationSupported === true, checkpointSupported: body.checkpointSupported === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/question-capability", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ capability: classifyQuestionCapability({ capabilityQuestionStrings: Array.isArray(body.capabilityQuestionStrings) ? body.capabilityQuestionStrings.map(String) : [], hasDialogueQuestionSchema: body.hasDialogueQuestionSchema === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/schema-compatibility", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ compatibility: checkDialogueQuestionSchema({ apiStatuses: Array.isArray(body.apiStatuses) ? body.apiStatuses.map(String) : [], uiKnownStatuses: Array.isArray(body.uiKnownStatuses) ? body.uiKnownStatuses.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/capabilities/server-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: enforceServerCapability({ enabledCapabilities: Array.isArray(body.enabledCapabilities) ? body.enabledCapabilities.map(String) : [], requiredCapability: String(body.requiredCapability || ""), migrationPreviewRef: body.migrationPreviewRef ? String(body.migrationPreviewRef) : undefined }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/compatibility/legacy-open", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateLegacyProjectOpen({ schemaVersion: Number(body.schemaVersion), currentSchemaVersion: Number(body.currentSchemaVersion), implicitMigrationRequested: body.implicitMigrationRequested === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/write-authority", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateWriteAuthority({ writer: String(req.body?.writer || ""), authoritativeWriter: String(req.body?.authoritativeWriter || ""), operation: req.body?.operation === "replace" ? "replace" : "patch" }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/forward-read-only", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateForwardReadOnly({ eventType: String(req.body?.eventType || ""), degraded: req.body?.degraded === true, replayable: req.body?.replayable === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/compatibility/migration-activation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateMigrationActivation({ migrated: body.migrated === true, validationPassed: body.validationPassed === true, activationRequested: body.activationRequested === true, migrationRuns: Number(body.migrationRuns) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/journey/slice-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateSliceEvidence({ evidence: Array.isArray(req.body?.evidence) ? req.body.evidence.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/journey/partner-dod", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluatePartnerJourney({ ideaSubmitted: body.ideaSubmitted === true, questionAnswered: body.questionAnswered === true, diffViewed: body.diffViewed === true, contractAdopted: body.contractAdopted === true, requiredLegacyButton: body.requiredLegacyButton === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/journey/upstream-repair", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const snapshot = body.understandingSnapshot === "valid" || body.understandingSnapshot === "corrupt" ? body.understandingSnapshot : "missing";
    res.json({ gate: evaluateUpstreamRepair({ understandingSnapshot: snapshot, defaultStoryIntentUsed: body.defaultStoryIntentUsed === true, repairAvailable: body.repairAvailable === true, legacyEditingAvailable: body.legacyEditingAvailable === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/research/source-qualification", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ quarantine: quarantineUnresolvedSource({ sourceFamilyKnown: body.sourceFamilyKnown === true, accessCategoryKnown: body.accessCategoryKnown === true, deletionStatusKnown: body.deletionStatusKnown === true, rawText: String(body.rawText || ""), candidateCount: Number(body.candidateCount), qualificationResolved: body.qualificationResolved === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/legacy-sample-migration", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ migration: migrateLegacyStyleSample({ id: String(body.id || ""), tags: Array.isArray(body.tags) ? body.tags.map(String) : [], excerpt: String(body.excerpt || ""), useCase: String(body.useCase || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/craft-pattern", asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ pattern: evaluateCraftPattern({ trigger: String(body.trigger || ""), informationChange: String(body.informationChange || ""), characterChoice: String(body.characterChoice || ""), readerEffect: String(body.readerEffect || ""), cost: String(body.cost || ""), boundary: String(body.boundary || ""), counterexample: String(body.counterexample || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/cross-project-surface", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateCrossProjectSurface({ sourceProject: String(body.sourceProject || ""), targetProject: String(body.targetProject || project.slug), copiedSurface: body.copiedSurface === true, approvedAbstractMechanism: body.approvedAbstractMechanism === true, sourcePrivateFactPresent: body.sourcePrivateFactPresent === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/pattern-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluatePatternEvidence({ positiveEvidence: Array.isArray(body.positiveEvidence) ? body.positiveEvidence.map(String) : [], counterexamples: Array.isArray(body.counterexamples) ? body.counterexamples.map(String) : [], boundaries: Array.isArray(body.boundaries) ? body.boundaries.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/pattern-applicability", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluatePatternApplicability({ patternFunction: String(body.patternFunction || ""), chapterFunction: String(body.chapterFunction || ""), compatible: body.compatible === true, reason: String(body.reason || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/generation-anti-imitation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateGenerationAntiImitation({ beforeContext: Array.isArray(body.beforeContext) ? body.beforeContext.map(String) : [], isolatedSourcePresent: body.isolatedSourcePresent === true, promptInjectionPresent: body.promptInjectionPresent === true, approvedMechanismOnly: body.approvedMechanismOnly === true, semanticSimilarity: Number(body.semanticSimilarity), structuralSimilarity: Number(body.structuralSimilarity), ngramSimilarity: Number(body.ngramSimilarity) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/research/task-gap-selection", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ selection: selectResearchForGap({ taskGap: String(body.taskGap || ""), reusableMechanisms: Array.isArray(body.reusableMechanisms) ? body.reusableMechanisms.map(String) : [], candidates: Array.isArray(body.candidates) ? body.candidates : [], tokenBudget: Number(body.tokenBudget) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/research/evidence-minimum", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateEvidenceMinimum({ selectedMechanisms: Array.isArray(body.selectedMechanisms) ? body.selectedMechanisms.map(String) : [], omittedContents: Array.isArray(body.omittedContents) ? body.omittedContents.map(String) : [], omissionReasons: Array.isArray(body.omissionReasons) ? body.omissionReasons.map(String) : [], tokenRemaining: Number(body.tokenRemaining) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/conflict-resolution", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ resolution: resolveCraftConflict({ globalRule: String(req.body?.globalRule || ""), localGoal: String(req.body?.localGoal || ""), antiGoal: String(req.body?.antiGoal || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/pattern-experiment", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const currentStatus = body.currentStatus === "approved" ? "approved" : "probation";
    res.json({ experiment: evaluatePatternExperiment({ currentStatus, modelScore: Number(body.modelScore), blindBaselinePreferred: body.blindBaselinePreferred === true, reworkCount: Number(body.reworkCount), holdoutPassed: body.holdoutPassed === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/structural-similarity", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateStructuralSimilarity({ lexicalSimilarity: Number(body.lexicalSimilarity), relationshipSimilarity: Number(body.relationshipSimilarity), revealOrderSimilarity: Number(body.revealOrderSimilarity), signatureSacrificeMatch: body.signatureSacrificeMatch === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/pattern-scope", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ scope: applyPatternScope({ authorAccepted: req.body?.authorAccepted === true, scope: req.body?.scope === "project" ? "project" : "scene", sourceSurfacePresent: req.body?.sourceSurfacePresent === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/negative-pattern", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ detection: detectNegativePattern({ narrationAnnouncesThreat: req.body?.narrationAnnouncesThreat === true, concreteConsequence: req.body?.concreteConsequence === true, wordingChanged: req.body?.wordingChanged === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/craft-lineage-audit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ audit: createCraftLineageAudit({ patternId: String(body.patternId || ""), abstractMechanism: String(body.abstractMechanism || ""), sourceFamilies: Array.isArray(body.sourceFamilies) ? body.sourceFamilies.map(String) : [], evidenceSnapshots: Array.isArray(body.evidenceSnapshots) ? body.evidenceSnapshots.map(String) : [], transferPlanId: String(body.transferPlanId || ""), qualification: String(body.qualification || ""), similarityConclusion: String(body.similarityConclusion || ""), authorAdopted: body.authorAdopted === true, privateSourceNamesIncluded: body.privateSourceNamesIncluded === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/style/derived-evidence-invalidation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const statuses = ["current", "revoked", "changed", "unqualified"] as const;
    const status = statuses.includes(req.body?.sourceStatus) ? req.body.sourceStatus : "unqualified";
    res.json({ invalidation: invalidateDerivedEvidence({ sourceStatus: status, published: req.body?.published === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/story-engine/fuzzy-idea", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ candidate: compileFuzzyIdea({ premise: String(req.body?.premise || ""), killerIdentityKnown: req.body?.killerIdentityKnown === true, amnesiaCauseKnown: req.body?.amnesiaCauseKnown === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/story-engine/question-separation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ questions: separateStoryQuestions({ mainAnswered: body.mainAnswered === true, openSubquestionAuthorized: body.openSubquestionAuthorized === true, mainConsequences: Array.isArray(body.mainConsequences) ? body.mainConsequences.map(String) : [], subquestionConsequences: Array.isArray(body.subquestionConsequences) ? body.subquestionConsequences.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/story-engine/ending-prerequisites", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ validation: validateEndingPrerequisites({ endingChoice: String(body.endingChoice || ""), prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/story-engine/arc-graph", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ validation: validateArcGraph({ arcs: Array.isArray(body.arcs) ? body.arcs : [], references: Array.isArray(body.references) ? body.references : [], chapterRenumbering: body.chapterRenumbering && typeof body.chapterRenumbering === "object" ? body.chapterRenumbering : {} }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/story-engine/dependency-cycle", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ validation: detectDependencyCycle({ edges: Array.isArray(req.body?.edges) ? req.body.edges : [], terminal: String(req.body?.terminal || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/chapters/volume-contract", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ contract: evaluateVolumeContract({ promiseAnswered: body.promiseAnswered === true, characterChoice: body.characterChoice === true, costPaid: body.costPaid === true, authorizedOpenSubquestion: body.authorizedOpenSubquestion === true, newOrganizationNameOnly: body.newOrganizationNameOnly === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/chapters/function-review", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ review: reviewChapterFunction({ informationChange: body.informationChange === true, relationshipChange: body.relationshipChange === true, resourceChange: body.resourceChange === true, emotionChange: body.emotionChange === true, choiceChange: body.choiceChange === true, readerPayoff: body.readerPayoff === true, wordCountMet: body.wordCountMet === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/chapters/scene-seam", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ validation: locateSceneSeam({ scenes: Array.isArray(req.body?.scenes) ? req.body.scenes : [], transitions: Array.isArray(req.body?.transitions) ? req.body.transitions : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/chapters/cross-layer-orphans", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ validation: evaluateCrossLayerOrphans({ engineRefs: list(body.engineRefs), arcRefs: list(body.arcRefs), milestoneRefs: list(body.milestoneRefs), chapterFunctionRefs: list(body.chapterFunctionRefs), obligationRefs: list(body.obligationRefs), promisePlanRefs: list(body.promisePlanRefs) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/planning/obligation-load", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ load: evaluatePlannedObligations({ plannedSeeds: Number(body.plannedSeeds), factLedgerEntries: Number(body.factLedgerEntries), reveals: Number(body.reveals), relationshipReversals: Number(body.relationshipReversals), cognitiveCapacity: Number(body.cognitiveCapacity) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/planning/pacing-fatigue", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ analysis: detectPacingFatigue({ chapters: Array.isArray(req.body?.chapters) ? req.body.chapters : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/planning/chapter-capacity", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ capacity: evaluateChapterCapacity({ currentUnits: Number(body.currentUnits), requestedUnits: Number(body.requestedUnits), capacity: Number(body.capacity), acceptedRisk: body.acceptedRisk === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/planning/horizon-confidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ horizon: classifyPlanHorizon({ endingCommitted: body.endingCommitted === true, nearRolling: body.nearRolling === true, farTentative: body.farTentative === true, allyExploratory: body.allyExploratory === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/outline/candidate-adoption", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ adoption: evaluateOutlineCandidateAdoption({ candidates: Array.isArray(body.candidates) ? body.candidates : [], selectedId: body.selectedId ? String(body.selectedId) : undefined, affectedClosureComplete: body.affectedClosureComplete === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/outline/structure-compare", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ comparison: compareStructureCandidates(Array.isArray(req.body?.candidates) ? req.body.candidates : []) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/outline/static-validation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ validation: validateStaticOutline({ foreshadowChapter: Number(body.foreshadowChapter), payoffChapter: Number(body.payoffChapter), newRulesInEnding: body.newRulesInEnding === true, modelSelfScore: Number(body.modelSelfScore) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/outline/semantic-references", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ references: preserveSemanticReferences({ oldNodeId: String(body.oldNodeId || ""), insertedChapterNumber: Number(body.insertedChapterNumber), oldChapterNumber: Number(body.oldChapterNumber), references: Array.isArray(body.references) ? body.references : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/outline/impact-subgraph", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ plan: planImpactSubgraph({ direct: list(body.direct), transitive: list(body.transitive), unknown: list(body.unknown), protected: list(body.protected), unaffected: list(body.unaffected), l2DecisionRequired: body.l2DecisionRequired === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/outline/emergence-settlement", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ settlement: settleEmergenceCandidate({ accepted: body.accepted === true, changesCoreConflict: body.changesCoreConflict === true, changesCharacterFate: body.changesCharacterFate === true, authorization: body.authorization === true, validation: body.validation === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/execution/readiness-proof", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ proof: evaluateExecutionReadiness({ frozenChapters: Number(body.frozenChapters), requiredChapters: Number(body.requiredChapters), conflicts: Number(body.conflicts), nextContextComplete: body.nextContextComplete === true, structureVersion: String(body.structureVersion || ""), adoptionAuthority: String(body.adoptionAuthority || ""), changedSinceProof: body.changedSinceProof === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/execution/prose-input-freeze", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ freeze: freezeProseTaskInput({ ...body, storyVersion: String(body.storyVersion || ""), outlineVersion: String(body.outlineVersion || ""), sceneVersion: String(body.sceneVersion || ""), characterVersion: String(body.characterVersion || ""), obligationVersion: String(body.obligationVersion || ""), authorLockVersion: String(body.authorLockVersion || ""), craftVersion: String(body.craftVersion || ""), directionVersion: String(body.directionVersion || ""), proseBaseline: String(body.proseBaseline || ""), contextVersion: String(body.contextVersion || ""), currentPov: String(body.currentPov || ""), requestedPov: String(body.requestedPov || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/execution/autonomous-canon-write", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const targetStatus = body.targetStatus === "author_accepted" || body.targetStatus === "settled" ? body.targetStatus : "draft";
    res.json({ gate: evaluateAutonomousCanonWrite({ targetStatus, authorization: body.authorization === true, frozenBaseline: body.frozenBaseline === true, validationPassed: body.validationPassed === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/execution/semantic-patch-relocation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ relocation: relocateSemanticPatch({ semanticId: String(req.body?.semanticId || ""), textFingerprint: String(req.body?.textFingerprint || ""), candidatePositions: Number(req.body?.candidatePositions) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/execution/scene-ledger", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ ledger: evaluateSceneLedger({ requiredStrategies: list(body.requiredStrategies), evidencedStrategies: list(body.evidencedStrategies), choices: list(body.choices), costs: list(body.costs) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/execution/beat-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ evidence: evaluateExecutionBeatEvidence({ beatId: String(body.beatId || ""), summaryClaims: list(body.summaryClaims), proseEvidence: list(body.proseEvidence), semanticEvidence: list(body.semanticEvidence) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/narrative/agency-chain", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ gate: evaluateNarrativeAgencyChain({ knownFacts: list(body.knownFacts), options: list(body.options), evaluatedOptions: list(body.evaluatedOptions), choiceReason: String(body.choiceReason || ""), consequence: String(body.consequence || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/narrative/voice-drift", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ gate: evaluateNarrativeVoiceDrift({ priorVoice: String(body.priorVoice || ""), newVoice: String(body.newVoice || ""), relationshipMilestones: list(body.relationshipMilestones), arcEvidence: list(body.arcEvidence) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/narrative/dialogue-action", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateNarrativeDialogueAction({ speakerA: body.speakerA || { goal: "", action: "" }, speakerB: body.speakerB || { goal: "", action: "" }, powerShift: String(body.powerShift || ""), distinctStrategies: body.distinctStrategies === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/narrative/pov-knowledge", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ gate: evaluateNarrativePovKnowledge({ povKnownFacts: list(body.povKnownFacts), assertedFacts: list(body.assertedFacts), priorReaderFacts: list(body.priorReaderFacts), newConsequence: body.newConsequence === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/narrative/distance", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const current = body.current === "overview" ? "overview" : "close"; const next = body.next === "overview" ? "overview" : "close";
    res.json({ gate: evaluateNarrativeDistanceGate({ current, next, trigger: String(body.trigger || ""), entersOtherMind: body.entersOtherMind === true, secretNamed: body.secretNamed === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/narrative/emotional-aftermath", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateNarrativeEmotionalAftermath({ trigger: String(body.trigger || ""), externalManifestation: String(body.externalManifestation || ""), interpretation: String(body.interpretation || ""), choice: String(body.choice || ""), aftermath: String(body.aftermath || "") }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/setting-actionability", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateSettingActionability({ expositionUnits: Number(body.expositionUnits), currentActionInteractions: Number(body.currentActionInteractions), neededNow: Number(body.neededNow), delayed: Number(body.delayed), environmentPressure: Number(body.environmentPressure), misjudgmentCost: Number(body.misjudgmentCost) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/cognitive-budget", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ gate: evaluateCraftCognitiveBudget({ newInfoUnits: Number(body.newInfoUnits), similarNames: Number(body.similarNames), newRules: Number(body.newRules), clues: Number(body.clues), capacity: Number(body.capacity) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/rhythm-monotony", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: detectRhythmMonotony({ sentenceLengths: Array.isArray(req.body?.sentenceLengths) ? req.body.sentenceLengths.map(Number) : [], repeatedEndings: Number(req.body?.repeatedEndings), actionReactionJudgmentCost: req.body?.actionReactionJudgmentCost === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/segment-seam", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ gate: validateSegmentSeam({ priorInjuries: list(body.priorInjuries), priorItems: list(body.priorItems), nextActions: list(body.nextActions), nextItemsUsed: list(body.nextItemsUsed) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/recovery", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ recovery: recoverLongChapter({ frozenManifest: body.frozenManifest === true, verifiedSegments: Number(body.verifiedSegments), unfinishedBeats: Number(body.unfinishedBeats), baselineTail: body.baselineTail === true, workerCrashed: body.workerCrashed === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/stagnation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: detectCraftStagnation({ coreProblemUnchanged: req.body?.coreProblemUnchanged === true, versions: Number(req.body?.versions), maxSimilarVersions: Number(req.body?.maxSimilarVersions) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/red-blue", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ synthesis: synthesizeRedBlue({ blueValidOpening: body.blueValidOpening === true, redEvidence: list(body.redEvidence), selfScore: Number(body.selfScore), failures: list(body.failures) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft/multi-domain-validation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ validation: evaluateMultiDomainValidation({ score: Number(body.score), hardFailures: list(body.hardFailures), missedObligations: list(body.missedObligations), evaluatedDomains: list(body.evaluatedDomains) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/revision/local-repair", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ plan: createRevisionLocalRepairPlan({ issues: list(body.issues), protectedInvariants: list(body.protectedInvariants), canonFingerprint: String(body.canonFingerprint || ""), povFingerprint: String(body.povFingerprint || ""), authorLockFingerprint: String(body.authorLockFingerprint || ""), evidenceTargets: list(body.evidenceTargets), seamRisks: list(body.seamRisks) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/revision/regression-adoption", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ gate: evaluateRegressionAdoption({ baselineAdvantages: list(body.baselineAdvantages), candidateAdvantages: list(body.candidateAdvantages), regressions: list(body.regressions), scoreDelta: Number(body.scoreDelta) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/revision/partial-commit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ commit: commitPartialAdoption({ baselineCurrent: body.baselineCurrent === true, authorization: body.authorization === true, obligationWriteSucceeded: body.obligationWriteSucceeded === true, proseWriteSucceeded: body.proseWriteSucceeded === true, selectedScene: String(body.selectedScene || ""), recovery: body.recovery === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/revision/reject-derivatives", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ derivatives: rejectCandidateDerivatives({ authorRejected: req.body?.authorRejected === true, derivativePatchIds: Array.isArray(req.body?.derivativePatchIds) ? req.body.derivativePatchIds.map(String) : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/revision/settlement", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ settlement: evaluateChapterSettlement({ contentWords: Number(body.contentWords), score: Number(body.score), unverifiedScenes: Number(body.unverifiedScenes), unsettledObligations: Number(body.unsettledObligations), staleSummaries: Number(body.staleSummaries), currentFingerprintValid: body.currentFingerprintValid === true, anchorsComplete: body.anchorsComplete === true, derivativesConverged: body.derivativesConverged === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/fairness/object-obligation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ decision: classifyObjectObligation({ mentionCount: Number(body.mentionCount), characterReaction: body.characterReaction === true, narrativeEmphasis: body.narrativeEmphasis === true, causalRole: body.causalRole === true, authorPromise: body.authorPromise === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/fairness/reader-expectation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ signal: evaluateReaderExpectation({ backendImportance: body.backendImportance === "high" ? "high" : "low", visibleMentions: Number(body.visibleMentions), sensorySpecificity: Number(body.sensorySpecificity), readerRecall: Number(body.readerRecall) }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/fairness/hypothesis-graph", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ graph: updateHypothesisGraph({ hypotheses: Array.isArray(body.hypotheses) ? body.hypotheses.map(String) : [], clueSupports: body.clueSupports || {}, clueExcludes: body.clueExcludes || {}, authorTruthHidden: body.authorTruthHidden !== false }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/fairness/clue-direction", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    res.json({ clue: classifyClueDirection({ clue: String(body.clue || ""), supports: list(body.supports), excludes: list(body.excludes), affectsAction: body.affectsAction === true, motifOnly: body.motifOnly === true }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/fairness/source-clusters", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ evidence: clusterEvidenceSources({ clues: Array.isArray(req.body?.clues) ? req.body.clues : [] }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/fairness/bundle", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {}; const status = body.obligationStatus === "resolved" ? "resolved" : "payoff_candidate";
    res.json({ bundle: evaluateFairnessBundle({ anchorFingerprint: String(body.anchorFingerprint || ""), currentFingerprint: String(body.currentFingerprint || ""), obligationStatus: status }) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/closure/schedule", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ schedule: scheduleClosure({ chaptersToEnding: Number(body.chaptersToEnding), obligations: Array.isArray(body.obligations) ? body.obligations : [], climaxCapacity: Number(body.climaxCapacity) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/window-conflict", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ conflict: resolveWindowConflict({ reservedWindow: String(body.reservedWindow || ""), newPlotLoad: Number(body.newPlotLoad), capacity: Number(body.capacity), alternatives: Array.isArray(body.alternatives) ? body.alternatives.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/reminder", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ reminder: adaptReminder({ chaptersSince: Number(body.chaptersSince), chapterWords: Number(body.chapterWords), clueSalience: Number(body.clueSalience), readerRecall: Number(body.readerRecall) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/answer-leak", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ leak: detectAnswerLeak({ repeatedEmphasis: Number(body.repeatedEmphasis), competingHypotheses: Number(body.competingHypotheses), saturationThreshold: Number(body.saturationThreshold) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/shared-object", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ settlement: settleSharedObject({ subclaims: Array.isArray(req.body?.subclaims) ? req.body.subclaims : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/payoff-form", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; const form = ["choice", "object_function", "power_shift", "monologue"].includes(body.form) ? body.form : "monologue"; res.json({ evaluation: evaluatePayoffForm({ form, irreversibleConsequence: body.irreversibleConsequence === true, distinctFromPrior: body.distinctFromPrior === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/scene-contract", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ contract: evaluateClosureScene({ answerProvided: body.answerProvided === true, activeChoice: body.activeChoice === true, consequence: body.consequence === true, relationshipChanged: body.relationshipChanged === true, goalChanged: body.goalChanged === true, resourceChanged: body.resourceChanged === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/propagation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ propagation: propagateClosure({ obligationId: String(body.obligationId || ""), writes: Array.isArray(body.writes) ? body.writes : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/narrative-interest", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ analysis: evaluateNarrativeInterest({ strongPromises: Number(body.strongPromises), settledPromises: Number(body.settledPromises), postponements: Number(body.postponements), newValueAdded: Number(body.newValueAdded) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/damage", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; const list = (v: unknown) => Array.isArray(v) ? v.map(String) : []; res.json({ report: propagateClosureDamage({ deletedSetup: body.deletedSetup === true, linkedAnchors: list(body.linkedAnchors), linkedClues: list(body.linkedClues), readerJudgments: list(body.readerJudgments), affectedChapters: list(body.affectedChapters), decorativeOnly: body.decorativeOnly === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/coverage", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ certificate: issueCoverageCertificate({ plannedAssets: Number(body.plannedAssets), scannedAssets: Number(body.scannedAssets), parseFailures: Number(body.parseFailures), lowConfidence: Number(body.lowConfidence), obligations: Number(body.obligations) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/closure/certificate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ certificate: issueIntegrityClosureCertificate({ obligationsClosed: body.obligationsClosed === true, openItemsAuthorized: body.openItemsAuthorized === true, sourceCoverageApproved: body.sourceCoverageApproved === true, pendingCandidates: Number(body.pendingCandidates), auditedScope: String(body.auditedScope || "") }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/first-input", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ journey: evaluateFirstInput({ roughIdea: String(req.body?.roughIdea || ""), requiresToolChoice: req.body?.requiresToolChoice === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/question-budget", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ budget: allocateQuestionBudget({ unknowns: Array.isArray(body.unknowns) ? body.unknowns : [], activeLimit: Number(body.activeLimit), reviewableLimit: Number(body.reviewableLimit) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/decision-escalation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ decision: escalateDecision({ impact: Number(body.impact), errorCost: Number(body.errorCost), threshold: Number(body.threshold), reversible: body.reversible === true, questionId: String(body.questionId || "") }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/reversible-default", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ receipt: recordReversibleDefault({ field: String(body.field || ""), value: String(body.value || ""), scope: String(body.scope || "") }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/decision-level", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ level: classifyDecisionLevel({ uncertain: body.uncertain === true, affectsCanon: body.affectsCanon === true, affectsEnding: body.affectsEnding === true, ordinaryDetail: body.ordinaryDetail === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/derived-answer", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; const list = (v: unknown) => Array.isArray(v) ? v.map(String) : []; res.json({ settlement: settleDerivedAnswer({ answered: list(body.answered), unresolved: list(body.unresolved) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/decision-bundle", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ bundle: createAuthorDecisionBundle({ decisions: Array.isArray(body.decisions) ? body.decisions : [], revokeRequested: body.revokeRequested === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/present-choice", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ choice: presentChoice({ recommendation: String(body.recommendation || ""), recommendationFit: String(body.recommendationFit || ""), redRisk: String(body.redRisk || ""), options: Array.isArray(body.options) ? body.options.map(String) : [], freeAnswer: body.freeAnswer !== false }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/story-cost", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; const list = (v: unknown) => Array.isArray(v) ? v.map(String) : []; res.json({ cost: summarizeStoryCost({ arcs: list(body.arcs), foreshadowing: list(body.foreshadowing), chapters: list(body.chapters), reworkUnits: Number(body.reworkUnits), reversible: body.reversible === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/delegation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ delegation: scopeDelegation({ issueId: String(req.body?.issueId || ""), delegated: req.body?.delegated === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/continue", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ action: resolveContinue({ answered: body.answered === true, contractCandidateAvailable: body.contractCandidateAvailable === true, sameStateReplay: body.sameStateReplay === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/offline", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ state: handleOffline({ authorOffline: body.authorOffline === true, highImpactPending: body.highImpactPending === true, candidateCreated: body.candidateCreated === true, authorReturned: body.authorReturned === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/reuse-confirmed", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ decision: reuseConfirmedFact({ confirmed: body.confirmed === true, newConflict: body.newConflict === true, newEvidence: Array.isArray(body.newEvidence) ? body.newEvidence.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/author/correction", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ correction: propagateCorrection({ oldUnderstanding: String(body.oldUnderstanding || ""), corrected: String(body.corrected || ""), downstreamIds: Array.isArray(body.downstreamIds) ? body.downstreamIds.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/review-first-screen", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; const list = (v: unknown) => Array.isArray(v) ? v.map(String) : []; res.json({ screen: buildReviewFirstScreen({ goal: String(body.goal || ""), retained: list(body.retained), blockers: list(body.blockers), changes: list(body.changes), recommendation: String(body.recommendation || ""), passedChecks: Number(body.passedChecks) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/notifications", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ policy: throttleTaskNotifications({ stageUpdates: Number(body.stageUpdates), retries: Number(body.retries), candidateReady: body.candidateReady === true, hardStop: body.hardStop === true, l2Block: body.l2Block === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/resume-brief", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; const list = (v: unknown) => Array.isArray(v) ? v.map(String) : []; res.json({ brief: buildResumeBrief({ direction: String(body.direction || ""), adoptedChapters: list(body.adoptedChapters), lowRiskDecisions: list(body.lowRiskDecisions), rollbackItem: String(body.rollbackItem || ""), candidate: String(body.candidate || ""), question: String(body.question || "") }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/collaboration-preference", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ preference: evaluateCollaborationPreference({ skippedEvidenceCount: Number(body.skippedEvidenceCount), explicitConciseRequest: body.explicitConciseRequest === true, daysOffline: Number(body.daysOffline), majorGate: body.majorGate === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/user-language", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ presentation: presentUserLanguage({ userText: String(body.userText || ""), internalDetails: Array.isArray(body.internalDetails) ? body.internalDetails.map(String) : [], advancedOpen: body.advancedOpen === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/click-value", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ evaluation: evaluateClickValue({ confirmationReduction: Number(body.confirmationReduction), reworkIncrease: Number(body.reworkIncrease), revocationsIncrease: Number(body.revocationsIncrease), authorWritingTimeIncrease: Number(body.authorWritingTimeIncrease), qualityRegression: body.qualityRegression === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/ux/kernel-value", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ value: evaluateKernelValue({ kernelVerified: body.kernelVerified === true, oneSentenceJourneyWorking: body.oneSentenceJourneyWorking === true, recoveryWorking: body.recoveryWorking === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/schema-compatibility", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ gate: checkSchemaCompatibility({ apiVersion: String(body.apiVersion || ""), uiVersion: String(body.uiVersion || ""), generatedTypesMatch: body.generatedTypesMatch === true, unknownFields: Array.isArray(body.unknownFields) ? body.unknownFields.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/mutation-plan", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ plan: executeMutationPlan({ writes: Array.isArray(req.body?.writes) ? req.body.writes : [], recovered: req.body?.recovered === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/candidate-unification", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ kernel: unifyCandidateKernel({ parentBaseline: String(body.parentBaseline || ""), stableId: String(body.stableId || ""), statuses: Array.isArray(body.statuses) ? body.statuses : [], contractChanged: body.contractChanged === true, locks: Array.isArray(body.locks) ? body.locks.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/obligation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ obligation: createMinimalObligation({ obligationId: String(body.obligationId || ""), window: String(body.window || ""), status: body.status === "seeded" ? "seeded" : "planned", proseAnchors: Array.isArray(body.proseAnchors) ? body.proseAnchors.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/legacy-samples", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ isolation: isolateLegacySamples({ legacyExcerptCount: Number(body.legacyExcerptCount), contextManifest: String(body.contextManifest || ""), budget: Number(body.budget), permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/dependency-proof", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ proof: enforceDependencyProof({ required: Array.isArray(body.required) ? body.required.map(String) : [], present: Array.isArray(body.present) ? body.present.map(String) : [], requestedWrite: body.requestedWrite === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/shadow-parser", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ audit: evaluateShadowParser({ decorativeFalsePositiveRate: Number(body.decorativeFalsePositiveRate), fileFailures: Number(body.fileFailures), writesCanon: body.writesCanon === true, blockThreshold: Number(body.blockThreshold) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/canon-authority", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ gate: enforceCanonAuthority({ entry: String(body.entry || ""), mutationGateway: body.mutationGateway === true, proseTransaction: body.proseTransaction === true, derivesFromCommittedEvent: body.derivesFromCommittedEvent === true, bypassAttempt: body.bypassAttempt === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/kernel/legacy-retirement", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ retirement: evaluateLegacyRetirement({ callsRemaining: Number(body.callsRemaining), rollbackWindowOpen: body.rollbackWindowOpen === true, approved: body.approved === true, compatibilityGuarded: body.compatibilityGuarded === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/quality-strategy", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ strategy: applyQualityStrategy({ strategy: body.strategy === "quality" || body.strategy === "speed" ? body.strategy : "balanced", candidateCount: Number(body.candidateCount), reviewDepth: Number(body.reviewDepth), chapterThreshold: Number(body.chapterThreshold), schemaFingerprint: String(body.schemaFingerprint || "") }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/evidence-status", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body ?? {}; res.json({ status: advanceEvidenceStatus(body) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/claim-authority", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ authority: classifyClaimAuthority({ source: req.body?.source || "candidate", adopted: req.body?.adopted === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/visibility", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ visibility: enforceCharacterVisibility(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/temporal", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ state: resolveTemporalKnowledge(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/identity", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ identity: keepSameNameSeparate(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/contradiction", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ contradiction: preserveContradiction(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/supersede", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ claim: supersedeClaim(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/transfer", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ knowledge: transferCharacterKnowledge(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/belief", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ belief: preserveCharacterBelief(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/reader-pov", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ knowledge: separateReaderAndPov(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/eligibility", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ claimIds: filterEligibility({ claims: Array.isArray(req.body?.claims) ? req.body.claims : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/retcon-impact", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ report: buildRetconImpactReport(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/deletion-propagation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ propagation: propagateEvidenceDeletion(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/body-summary", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ truth: preserveBodyTruthOverSummary(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/compression", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ compression: validateLossyCompression(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/rank-eligible", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ claimIds: rankEligibleClaims({ claims: Array.isArray(req.body?.claims) ? req.body.claims : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/query-boundary", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ query: constrainKnowledgeQuery(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/evidence-family", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ evidence: groupEvidenceFamily({ sources: Array.isArray(req.body?.sources) ? req.body.sources : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/evidence-gap", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ gap: reportEvidenceGap(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/conflict-preflight", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ gate: gateGenerationOnConflict(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/new-fact", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ claim: keepNewFactsCandidate(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/health", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ health: assessMemoryHealth(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/rebuild", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ rebuild: deterministicRebuild(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/embedding-fallback", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ fallback: preserveEligibilityOnEmbeddingFallback(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/continuity-audit", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ audit: auditContinuity(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/knowledge/k5-activation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ activation: activateK5(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/contract", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ contract: evaluateExperienceContract(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/hypothesis", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ hypothesis: classifyReaderHypothesis(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/cold-read", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ snapshot: sealColdRead(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/questions", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ questions: preserveCompetingReaderQuestions({ questions: Array.isArray(req.body?.questions) ? req.body.questions : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/ambiguity", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ ambiguity: classifyAmbiguity(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/attachment", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ attachment: assessAttachmentEvidence(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/emotion-impact", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ impact: separateEmotionAndReaderImpact(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/curiosity", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ curiosity: settleCuriosity(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/payoff", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ payoff: evaluateReaderPayoffEvidence(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/scene-counterfactual", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ scene: assessCounterfactualScene(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/surprise", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ surprise: classifySurprise(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/longitudinal", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ experience: assessLongitudinalExperience(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/divergence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ divergence: preserveExperienceReaderDivergence({ samples: Array.isArray(req.body?.samples) ? req.body.samples : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/reviewer-calibration", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ calibration: gateReviewerCalibration(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/revision-invalidation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ invalidation: invalidateAfterRevision(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/repair", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ repair: preserveRepairAdvantages(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/feedback-revocation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ feedback: revokeReaderFeedback(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/experience/dossier-boundary", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ dossier: boundExperienceDossier(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/primary-action", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ arbitration: arbitratePrimaryAction(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/safety-priority", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ priority: prioritizeSafety(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/surface-registry", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ registry: registerSurfaces({ surfaces: Array.isArray(req.body?.surfaces) ? req.body.surfaces : [], expected: Number(req.body?.expected) }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/view-switch", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ state: preserveStageOnViewSwitch(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/author-receipt", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ receipt: parseAuthorReceipt(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/idempotency", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ action: deduplicateAction({ actionIds: Array.isArray(req.body?.actionIds) ? req.body.actionIds : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/task-chapter", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ task: isolateTaskChapter(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/workspace-reconcile", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ workspace: reconcileWorkspace(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/failure-recovery", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ recovery: recoverFailedCard(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/project-isolation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ isolation: isolateProjectContinuation(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/shell-shadow", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ shell: gateShellShadow(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/orchestration/journey-evidence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ evidence: assessJourneyEvidence(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/source-classification", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ source: classifyCharacterSource(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/unknowns", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ contract: preserveCharacterUnknowns(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/source-conflict", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ conflict: preserveSourceConflict(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/arc", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ arc: evaluateCharacterArc(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/agency", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ agency: detectAgencyBreak(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/belief-phases", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ phases: modelBeliefPhases(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/asymmetric-relation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ relation: preserveAsymmetricRelation(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/co-presence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ relation: ignoreCoPresenceWithoutChange(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/misunderstanding-repair", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ repair: assessMisunderstandingRepair(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/opponent-independence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ opponent: assessIndependentOpponent(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/offscreen-action", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ action: validateOffscreenAction(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/function", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ function: assessCharacterFunction(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/ensemble", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ ensemble: assessEnsembleAttention({ members: Array.isArray(req.body?.members) ? req.body.members : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/relational-voice", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ voice: validateRelationalVoice(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/relapse", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ arc: preserveRelapseProgress(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/identity-break", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ impact: buildIdentityBreakImpact(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/change-scope", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ scope: scopeCharacterChange(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/character/arc-certificate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ certificate: issueArcCertificate(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/capture", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ seed: captureSeed(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/extract", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ fields: extractSeedFields(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/provenance", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ provenance: requireProvenance(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/genre", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ genre: blockGenreInference(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/interpretations", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ interpretations: preserveInterpretations(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/exploration", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ exploration: allowCompatibleExploration(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/readiness", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ readiness: assessReadinessScope(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/recommend", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ candidateId: recommendEvidenceCandidate({ candidates: Array.isArray(req.body?.candidates) ? req.body.candidates : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/default", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ default: applyScopedDefault(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/question", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ questionId: prioritizeQuestion({ questions: Array.isArray(req.body?.questions) ? req.body.questions : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/dedupe", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ candidates: dedupeCandidates({ candidates: Array.isArray(req.body?.candidates) ? req.body.candidates : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/difference", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ difference: describeCandidateDifference(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/partial-adoption", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ adoption: applyPartialAdoption(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/recompile", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ compile: recompileAffected(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/project-state", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ state: separateProjectState(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/compile-failure", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ failure: preserveCompileFailure(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/legacy-shadow", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ shadow: shadowLegacyCompile(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/deterministic", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ compile: deterministicCompile(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/seed/scope-proof", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ proof: authorizeReadinessScope(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/scan", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ scan: scanWorldDocument(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/rule-boundary", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ rule: enforceRuleBoundary(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/institution-belief", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ belief: preserveInstitutionBelief(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/regional-rule", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ rule: applyRegionalRule(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/travel", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ travel: checkTravelFeasibility(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/story-clock", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ clock: projectStoryClock(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/ability-prerequisites", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ ability: enforceAbilityPrerequisites(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/temporary-boost", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ boost: settleTemporaryBoost(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/contextual-victory", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ victory: assessContextualVictory(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/resource-balance", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ resource: conserveResource(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/body-cooldown", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ state: enforceBodyAndCooldown(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/institution-response", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ response: scheduleInstitutionResponse(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/rule-consequences", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ consequences: assessRuleConsequences(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/deus-ex", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ gate: gateDeusExRule(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/rule-exception", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ exception: recordRuleException(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/rule-interaction", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ interaction: preserveRuleInteractionCandidates(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/minimal-exposition", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ exposition: minimizeRuleExposition(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/rule-change-scope", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ scope: scopeRuleChange(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/health", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ health: assessWorldHealth(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/world/certificate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ certificate: issueWorldCertificate(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/governance/normative-strength", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ requirement: classifyNormativeStrength(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/governance/first-slice", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ slice: validateFirstSlice(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/governance/release-vision", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ status: separateReleaseVision(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/governance/defer-decision", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ decision: requireDeferDecision(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/governance/semantic-lint", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ lint: preserveSemanticLint(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/governance/convergence-expansion", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ expansion: gateConvergenceExpansion(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/control-command", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ command: resolveControlCommand(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/utterance-trace", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ trace: preserveAuthorUtterance(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/read-model", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ model: compareReadModel(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/downgrade", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ downgrade: preserveSemanticDowngrade(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/capture-crash", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ recovery: resolveCaptureCrash(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/capture-convergence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ convergence: enforceCaptureConvergence({ entryPoints: Array.isArray(req.body?.entryPoints) ? req.body.entryPoints : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/projection", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ projection: publishJourneyProjection(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/journey/understanding-version", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ version: guardUnderstandingVersion(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/late-result", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ gate: guardLateUnderstanding(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/task-recovery", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ task: recoverUnderstandingTask(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/t0-coverage", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ coverage: validateT0Coverage(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/context-purpose", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ manifest: buildPurposeManifest(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/context-replay", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ replay: replayContextManifest(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/evidence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ evidence: validateUnderstandingEvidence(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/understanding/k4", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ gate: enforceK4(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/publication/obligation-badges", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ badges: summarizeObligationBadges(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/publication/completion-audit", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ audit: replayCompletionAudit(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/publication/freeze-edition", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ edition: freezeEdition(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/publication/render", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ render: renderDeterministically(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/publication/delivery", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ delivery: settleDelivery(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/research/plan", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ plan: planResearch(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/research/quarantine", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ source: quarantineSource(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/research/scope-compare", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ comparison: compareSourceScope({ sources: Array.isArray(req.body?.sources) ? req.body.sources : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/research/correction", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ correction: propagateSourceCorrection(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/text/import-diagnostics", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ diagnostics: diagnoseImport(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/text/punctuation-gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ gate: gatePunctuationRepair(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/text/model-packaging", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ packaging: isolateModelPackaging(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/text/round-trip", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ settlement: settleRoundTrip(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/backup/slice", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ backup: createBackupSlice(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/backup/verify", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ catalog: verifyBackupCatalog(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/backup/restore-isolated", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ restore: restoreIsolated(req.body || {}) }); }));
  app.post("/api/novel/projects/:projectId/runtime/backup/disaster-recovery", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json({ recovery: settleDisasterRecovery(req.body || {}) }); }));

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
    const obligation = identifyResearchObligation(req.body ?? {});
    try {
      const persisted = await persistResearchObligation(projectRoot(project.slug), obligation);
      res.status(persisted.created ? 201 : 200).json({ obligation: persisted.obligation, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_OBLIGATION_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/obligations/:obligationId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const obligation = await readResearchObligation(projectRoot(project.slug), req.params.obligationId);
    if (!obligation) { res.status(404).json({ error: "Research obligation not found" }); return; }
    res.json({ obligation });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/source-snapshots", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const source = createResearchSourceSnapshot(req.body ?? {});
    try {
      const persisted = await persistResearchSourceSnapshot(projectRoot(project.slug), source);
      res.status(persisted.created ? 201 : 200).json({ source: persisted.snapshot, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_SOURCE_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/source-snapshots/:sourceId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const source = await readResearchSourceSnapshot(projectRoot(project.slug), req.params.sourceId);
    if (!source) { res.status(404).json({ error: "Research source snapshot not found" }); return; }
    res.json({ source });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/source-snapshots/:sourceId/reliability", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const source = await readResearchSourceSnapshot(root, req.params.sourceId);
    if (!source) { res.status(404).json({ error: "Research source snapshot not found" }); return; }
    const sourceIds: string[] = Array.isArray(req.body?.corroboratingSourceIds) ? req.body.corroboratingSourceIds.filter((value: unknown): value is string => typeof value === "string") : [];
    const corroboratingSources = (await Promise.all(sourceIds.map((sourceId) => readResearchSourceSnapshot(root, sourceId)))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    res.json({ assessment: evaluateResearchSourceReliability({ source, corroboratingSources, requiredSignals: Array.isArray(req.body?.requiredSignals) ? req.body.requiredSignals.map(String) : [], minIndependentSources: Number(req.body?.minIndependentSources ?? 0) }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/source-snapshots/:sourceId/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const source = await readResearchSourceSnapshot(root, req.params.sourceId);
    if (!source) { res.status(404).json({ error: "Research source snapshot not found" }); return; }
    try {
      const revocation = await revokeResearchSource(root, source, typeof req.body?.reason === "string" ? req.body.reason : "");
      const propagation = await propagateResearchSourceRevocation(root, revocation);
      res.status(201).json({ revocation, propagation });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_REVOCATION_FINGERPRINT_MISMATCH") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/claims", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claim = createResearchClaim(req.body ?? {});
    const persisted = await persistResearchClaim(projectRoot(project.slug), claim);
    res.status(201).json({ claim: persisted.claim, created: persisted.created });
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/claims/:claimId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claim = await readResearchClaim(projectRoot(project.slug), req.params.claimId);
    if (!claim) { res.status(404).json({ error: "Research claim not found" }); return; }
    res.json({ claim });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/claims/evaluate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claim = createResearchClaim(req.body?.claim ?? req.body ?? {});
    const root = projectRoot(project.slug);
    const source = await readResearchSourceSnapshot(root, claim.sourceSnapshotId);
    const revocation = await readResearchSourceRevocation(root, claim.sourceSnapshotId);
    const sourceIds: string[] = Array.isArray(req.body?.sourceIds) ? req.body.sourceIds.filter((value: unknown): value is string => typeof value === "string") : claim.independentSourceIds;
    const independentSources = (await Promise.all([...new Set([claim.sourceSnapshotId, ...sourceIds])].map((sourceId) => readResearchSourceSnapshot(root, sourceId)))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const assessment = evaluateResearchClaim({ claim, source, independentSources, revoked: Boolean(revocation), now: typeof req.body?.now === "string" ? req.body.now : new Date().toISOString() });
    let factCheck = typeof req.body?.evidenceExcerpt === "string" ? evaluateResearchFactCheck({ claim, source, evidenceExcerpt: req.body.evidenceExcerpt }) : undefined;
    if (factCheck) {
      try { factCheck = (await persistResearchFactCheck(root, factCheck)).factCheck; }
      catch (error) { if (error instanceof Error && error.message === "RESEARCH_FACT_CHECK_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
    }
    res.json({ claim, assessment, ...(factCheck ? { factCheck } : {}) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/claims/:claimId/fact-check", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const factCheck = await readResearchFactCheck(projectRoot(project.slug), req.params.claimId);
    if (!factCheck) { res.status(404).json({ error: "Research fact check not found" }); return; }
    res.json({ factCheck });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/claims/:claimId/correct", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const correction = await correctResearchClaim(projectRoot(project.slug), { claimId: req.params.claimId, previousFingerprint: String(req.body?.previousFingerprint || ""), replacementFingerprint: String(req.body?.replacementFingerprint || ""), reason: String(req.body?.reason || "") });
      const propagation = await propagateResearchClaimCorrection(projectRoot(project.slug), correction);
      res.status(201).json({ correction, propagation });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_CLAIM_CORRECTION_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/claims/:claimId/propagate-assessment", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claim = createResearchClaim({ ...(req.body?.claim ?? {}), claimId: req.params.claimId });
    const root = projectRoot(project.slug);
    const source = await readResearchSourceSnapshot(root, claim.sourceSnapshotId);
    const revocation = await readResearchSourceRevocation(root, claim.sourceSnapshotId);
    const sourceIds = Array.isArray(req.body?.sourceIds) ? req.body.sourceIds.filter((value: unknown): value is string => typeof value === "string") : claim.independentSourceIds;
    const independentSources = (await Promise.all([...new Set([claim.sourceSnapshotId, ...sourceIds])].map((sourceId) => readResearchSourceSnapshot(root, sourceId)))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const assessment = evaluateResearchClaim({ claim, source, independentSources, revoked: Boolean(revocation), now: typeof req.body?.now === "string" ? req.body.now : new Date().toISOString() });
    const propagation = await propagateResearchClaimAssessment(root, claim.claimId, assessment);
    res.json({ claim, assessment, propagation });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/conflicts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const conflict = createResearchConflictCase(req.body ?? {});
    try {
      const persisted = await persistResearchConflictCase(projectRoot(project.slug), conflict);
      res.status(persisted.created ? 201 : 200).json({ conflict: persisted.conflict, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_CONFLICT_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/conflicts/:conflictId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const conflict = await readResearchConflictCase(projectRoot(project.slug), req.params.conflictId);
    if (!conflict) { res.status(404).json({ error: "Research conflict not found" }); return; }
    res.json({ conflict });
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/conflicts/:conflictId/resolve", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const current = await readResearchConflictCase(root, req.params.conflictId);
    if (!current) { res.status(404).json({ error: "Research conflict not found" }); return; }
    try {
      const resolved = resolveResearchConflictCase(current, req.body ?? {});
      const persisted = await persistResearchConflictResolution(root, resolved);
      res.status(persisted.created ? 201 : 200).json({ conflict: persisted.conflict, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("RESEARCH_CONFLICT_")) { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/consumption-receipts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const receipt = createResearchConsumptionReceipt(req.body ?? {});
    try {
      const persisted = await persistResearchConsumptionReceipt(projectRoot(project.slug), receipt);
      res.status(persisted.created ? 201 : 200).json({ receipt: persisted.receipt, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_RECEIPT_IMMUTABLE") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/consumption-receipts/:receiptId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const receipt = await readResearchConsumptionReceipt(projectRoot(project.slug), req.params.receiptId);
    if (!receipt) { res.status(404).json({ error: "Research consumption receipt not found" }); return; }
    res.json({ receipt });
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/settlements/:receiptId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const settlement = await readResearchSettlement(projectRoot(project.slug), req.params.receiptId);
      if (!settlement) { res.status(404).json({ error: "Research settlement not found" }); return; }
      res.json({ settlement });
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_SETTLEMENT_INTEGRITY_FAILED") { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.post("/api/novel/projects/:projectId/runtime/research/settlements", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      let settlementInput = req.body ?? {};
      if (req.body?.claimAssessment && req.body?.receipt) {
        const persistedReceipt = await readResearchConsumptionReceipt(projectRoot(project.slug), String(req.body.receipt.receiptId || ""));
        if (!persistedReceipt || persistedReceipt.fingerprint !== req.body.receipt.fingerprint) throw new Error("RESEARCH_RECEIPT_INTEGRITY_FAILED");
        settlementInput = { ...req.body, receipt: persistedReceipt };
        const persistedFactCheck = await readResearchFactCheck(projectRoot(project.slug), persistedReceipt.claimId);
        if (req.body.factCheck && !persistedFactCheck) throw new Error("RESEARCH_FACT_CHECK_REQUIRED");
        const factCheck = persistedFactCheck ? { status: persistedFactCheck.status, evidenceRefs: persistedFactCheck.sourceId ? [`source://${persistedFactCheck.sourceId}`] : [], checkedClaimFingerprint: persistedFactCheck.claimFingerprint } : undefined;
        const decision = evaluateResearchConsumption({ receipt: persistedReceipt, claimAssessment: req.body.claimAssessment, factCheck, currentClaimFingerprint: String(req.body.currentClaimFingerprint || ""), consumedClaimFingerprint: String(req.body.consumedClaimFingerprint || ""), authorWaiver: req.body.authorWaiver === true });
        if (!decision.allowed && decision.status === "blocked") { res.status(409).json({ decision }); return; }
      }
      const settlementDecision = settlementInput.decision === "rewrite" || settlementInput.decision === "waive" || settlementInput.decision === "current" ? settlementInput.decision : "current";
      const persisted = await persistResearchSettlement(projectRoot(project.slug), settleResearchClaim({ ...settlementInput, decision: settlementDecision }));
      res.status(200).json({ settlement: persisted.settlement, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && (error.message === "RESEARCH_SETTLEMENT_IMMUTABLE" || error.message === "RESEARCH_SETTLEMENT_INTEGRITY_FAILED" || error.message === "RESEARCH_RECEIPT_INTEGRITY_FAILED" || error.message === "RESEARCH_FACT_CHECK_REQUIRED")) { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/research/publication-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ decision: await evaluateResearchPublicationGate(projectRoot(project.slug)) });
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
    res.status(201).json({ plan: createDurabilityRestorePlan(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/durability/recovery-settlements", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ settlement: settleDurabilityRecovery(req.body ?? {}) });
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
    const body = req.body ?? {};
    const manifest = createProjectCapabilityManifest({ ...body, projectId: project.slug });
    res.status(201).json({ manifest: await writeProjectCapabilityManifest(projectRoot(project.slug), manifest, typeof body.expectedFingerprint === "string" ? body.expectedFingerprint : undefined) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/delivery/capability-manifest", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const manifest = await readProjectCapabilityManifest(projectRoot(project.slug), project.slug);
    if (!manifest) return res.status(404).json({ error: "CAPABILITY_MANIFEST_NOT_FOUND" });
    res.json({ manifest });
  }));

  const dependencyProofPostRoute = asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const proof = createCapabilityDependencyProof({ ...body, projectSlug: project.slug });
    res.status(201).json({ proof: await writeCapabilityDependencyProof(projectRoot(project.slug), proof, typeof body.expectedFingerprint === "string" ? body.expectedFingerprint : undefined) });
  });
  app.post("/api/novel/projects/:projectId/runtime/delivery/dependency-proof", dependencyProofPostRoute);
  app.post("/api/novel/projects/:projectId/runtime/delivery/dependency-proofs", dependencyProofPostRoute);

  const dependencyProofGetRoute = asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const proof = await readCapabilityDependencyProof(projectRoot(project.slug), req.params.sliceId, project.slug);
    if (!proof) return res.status(404).json({ error: "CAPABILITY_DEPENDENCY_NOT_FOUND" });
    res.json({ proof });
  });
  app.get("/api/novel/projects/:projectId/runtime/delivery/dependency-proof/:sliceId", dependencyProofGetRoute);
  app.get("/api/novel/projects/:projectId/runtime/delivery/dependency-proofs/:sliceId", dependencyProofGetRoute);

  app.post("/api/novel/projects/:projectId/runtime/delivery/requirement-evidence", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const link = createRequirementEvidenceLink({ ...(req.body ?? {}), projectSlug: project.slug });
    res.status(201).json({ link: await writeRequirementEvidenceLink(projectRoot(project.slug), link) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/delivery/requirement-evidence/:requirementId/:sliceId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const link = await readRequirementEvidenceLink(projectRoot(project.slug), req.params.requirementId, req.params.sliceId, project.slug);
    if (!link) return res.status(404).json({ error: "REQUIREMENT_EVIDENCE_NOT_FOUND" });
    res.json({ link });
  }));

  app.post("/api/novel/projects/:projectId/runtime/delivery/write-authority", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ authority: enforceSingleWriteAuthority(req.body ?? {}) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/kernels/proof", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const proof = createKernelProof({ ...(req.body ?? {}), projectSlug: project.slug });
    res.status(201).json({ proof: await writeKernelProof(projectRoot(project.slug), proof) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/kernels/proof/:kernelId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const proof = await readKernelProof(projectRoot(project.slug), req.params.kernelId, project.slug);
    if (!proof) return res.status(404).json({ error: "KERNEL_PROOF_NOT_FOUND" });
    res.json({ proof });
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
    const suite = createEvaluationSuite(req.body ?? {});
    const persisted = await persistEvaluationSuite(projectRoot(project.slug), project.slug, suite);
    res.status(201).json({ suite: persisted.record.suite, record: persisted.record, created: persisted.created });
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/suites/:suiteId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluationSuiteRecord(projectRoot(project.slug), req.params.suiteId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation suite not found" }); return; }
    res.json({ record, suite: record.suite });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/frozen-inputs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const input = freezeEvaluationInput(req.body ?? {});
    const persisted = await persistFrozenEvaluationInput(projectRoot(project.slug), project.slug, input);
    res.json({ input: persisted.record.input, record: persisted.record, created: persisted.created });
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/frozen-inputs/:inputFingerprint", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readFrozenEvaluationInputRecord(projectRoot(project.slug), req.params.inputFingerprint);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Frozen evaluation input not found" }); return; }
    res.json({ record, input: record.input });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/blind-pairs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const pair = createBlindPair(req.body ?? {});
    const persisted = await persistBlindPair(projectRoot(project.slug), project.slug, pair);
    res.json({ pair: persisted.record.pair, record: persisted.record, created: persisted.created });
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/blind-pairs/:comparisonId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readBlindPairRecord(projectRoot(project.slug), req.params.comparisonId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation blind pair not found" }); return; }
    res.json({ record, pair: record.pair });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/calibrations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const calibration = calibrateEvaluator(req.body ?? {});
    const persisted = await persistEvaluatorCalibration(projectRoot(project.slug), project.slug, calibration);
    res.json({ calibration: persisted.record.calibration, record: persisted.record, created: persisted.created });
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/calibrations/:evaluatorId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluatorCalibrationRecord(projectRoot(project.slug), req.params.evaluatorId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluator calibration not found" }); return; }
    res.json({ record, calibration: record.calibration });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/contamination", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const contamination = detectEvaluationContamination(req.body ?? {});
      const persisted = await persistContaminationResult(projectRoot(project.slug), project.slug, contamination);
      res.status(persisted.created ? 201 : 200).json({ contamination: persisted.record.contamination, record: persisted.record, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_CONTAMINATION_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/contamination/:holdoutId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readContaminationResult(projectRoot(project.slug), req.params.holdoutId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation contamination result not found" }); return; }
    res.json({ contamination: record.contamination, record });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/drift", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const drift = monitorEvaluatorDrift(req.body ?? {});
      const driftId = typeof req.body?.driftId === "string" && req.body.driftId.trim() ? req.body.driftId.trim() : `drift-${drift.fingerprint.slice(0, 24)}`;
      const persisted = await persistEvaluatorDrift(projectRoot(project.slug), project.slug, driftId, drift);
      res.status(persisted.created ? 201 : 200).json({ drift: persisted.record.drift, record: persisted.record, driftId, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_DRIFT_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/drift/:driftId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluatorDrift(projectRoot(project.slug), req.params.driftId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation drift result not found" }); return; }
    res.json({ drift: record.drift, record, driftId: record.driftId });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/disagreements", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    try {
      const impact = body.impact === "critical" || body.impact === "elevated" ? body.impact : "ordinary";
      const verdicts = Array.isArray(body.verdicts)
        ? body.verdicts.map((item: any) => ({ verdict: item?.verdict, confidence: Number(item?.confidence) }))
        : [];
      const decision = decideEvaluationDisagreement({ verdicts, impact, hardGatesPassed: body.hardGatesPassed === true, authorGoalMatched: body.authorGoalMatched === true, protectedItemRegression: body.protectedItemRegression === true, autonomyAuthorized: body.autonomyAuthorized === true });
      const disagreementId = typeof body.disagreementId === "string" && body.disagreementId.trim() ? body.disagreementId.trim() : `disagreement-${decision.fingerprint.slice(0, 24)}`;
      const persisted = await persistEvaluationDisagreement(projectRoot(project.slug), { disagreementId, projectSlug: project.slug, decision });
      res.status(persisted.created ? 201 : 200).json({ decision: persisted.record.decision, record: persisted.record, disagreementId, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("EVALUATION_DISAGREEMENT_")) { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/disagreements/:disagreementId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readPersistedEvaluationDisagreement(projectRoot(project.slug), req.params.disagreementId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation disagreement not found" }); return; }
    res.json({ decision: record.decision, record, disagreementId: record.disagreementId });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/sampling", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const body = req.body ?? {};
      const plan = createEvaluationSamplingPlan({ seeds: Array.isArray(body.seeds) ? body.seeds.map(Number) : [], temperature: Number(body.temperature), topP: Number(body.topP), minSamples: Number(body.minSamples), maxSamples: Number(body.maxSamples), stopRule: body.stopRule === "fixed-count" ? "fixed-count" : "threshold-stable" });
      const planId = typeof body.planId === "string" && body.planId.trim() ? body.planId.trim() : `plan-${plan.fingerprint.slice(0, 24)}`;
      const persisted = await persistEvaluationSamplingPlan(projectRoot(project.slug), { planId, projectSlug: project.slug, plan });
      res.status(persisted.created ? 201 : 200).json({ plan: persisted.record.plan, record: persisted.record, planId, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_SAMPLING_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/sampling/summary", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const body = req.body ?? {};
      const plan = createEvaluationSamplingPlan(body.plan ?? {});
      const outcomes = Array.isArray(body.outcomes) ? body.outcomes.map((item: any) => ({ valid: item?.valid === true, win: item?.win === true, failed: item?.failed === true })) : [];
      const summary = summarizeEvaluationSampling({ plan, outcomes });
      const summaryId = typeof body.summaryId === "string" && body.summaryId.trim() ? body.summaryId.trim() : `summary-${summary.fingerprint.slice(0, 24)}`;
      const persisted = await persistEvaluationSamplingSummary(projectRoot(project.slug), { summaryId, projectSlug: project.slug, planFingerprint: plan.fingerprint, summary });
      res.status(persisted.created ? 201 : 200).json({ summary: persisted.record.summary, record: persisted.record, summaryId, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_SAMPLING_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/sampling/:planId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluationSamplingPlan(projectRoot(project.slug), req.params.planId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation sampling plan not found" }); return; }
    res.json({ plan: record.plan, record, planId: record.planId });
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/sampling/summaries/:summaryId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluationSamplingSummary(projectRoot(project.slug), req.params.summaryId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation sampling summary not found" }); return; }
    res.json({ summary: record.summary, record, summaryId: record.summaryId });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/multi-scale-regression", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try { const body = req.body ?? {}; const result = evaluateMultiScaleRegression({ baseline: body.baseline && typeof body.baseline === "object" ? body.baseline : {}, candidate: body.candidate && typeof body.candidate === "object" ? body.candidate : {}, hardFailures: Array.isArray(body.hardFailures) ? body.hardFailures.map(String) : [], tolerance: body.tolerance === undefined ? undefined : Number(body.tolerance) }); const regressionId = typeof body.regressionId === "string" && body.regressionId.trim() ? body.regressionId.trim() : `regression-${result.fingerprint.slice(0, 24)}`; const persisted = await persistEvaluationRegression(projectRoot(project.slug), { regressionId, projectSlug: project.slug, result }); const rolledBackReleases = result.status === "regression" ? await rollbackLearningReleasesForRegression({ root: projectRoot(project.slug), projectSlug: project.slug, regressionCaseRef: regressionId, rolledBackBy: "regression-gate", reason: "Automatic regression propagation" }) : []; res.status(persisted.created ? 201 : 200).json({ result: persisted.record.result, record: persisted.record, regressionId, created: persisted.created, rolledBackReleases }); }
    catch (error) { if (error instanceof Error && error.message.startsWith("MULTI_SCALE_REGRESSION_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/multi-scale-regression/:regressionId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluationRegression(projectRoot(project.slug), req.params.regressionId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation regression result not found" }); return; }
    res.json({ result: record.result, record, regressionId: record.regressionId });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/pareto", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const body = req.body ?? {};
      const decision = compareEvaluationCandidate({ baseline: body.baseline, candidate: body.candidate, minimumWinRate: Number(body.minimumWinRate) });
      const decisionId = typeof body.decisionId === "string" && body.decisionId.trim() ? body.decisionId.trim() : `pareto-${decision.fingerprint.slice(0, 24)}`;
      const persisted = await persistEvaluationPareto(projectRoot(project.slug), { decisionId, projectSlug: project.slug, decision });
      res.status(persisted.created ? 201 : 200).json({ decision: persisted.record.decision, record: persisted.record, decisionId, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_PARETO_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/pareto/:decisionId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readEvaluationPareto(projectRoot(project.slug), req.params.decisionId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation Pareto decision not found" }); return; }
    res.json({ decision: record.decision, record, decisionId: record.decisionId });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/release-decisions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const decision = createReleaseDecision(req.body ?? {});
      const persisted = await persistReleaseDecision(projectRoot(project.slug), decision);
      res.status(persisted.created ? 201 : 200).json({ decision: persisted.decision, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("RELEASE_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/release-decisions/:releaseId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const decision = await readReleaseDecision(projectRoot(project.slug), req.params.releaseId);
    if (!decision) { res.status(404).json({ error: "Release decision not found" }); return; }
    res.json({ decision });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/runs", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      if (req.body?.evaluationScope === "platform-regression") {
        await assertEvaluationAccessGrantCurrent(projectRoot(project.slug), String(req.body?.accessGrantId || ""), { projectSlug: project.slug, use: "platform-regression" });
      }
      const archive = createEvaluationRunArchive(req.body ?? {});
      const persisted = await persistEvaluationRunArchive(projectRoot(project.slug), archive);
      res.status(201).json({ archive: persisted });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "EVALUATION_RUN_ARCHIVE_INVALID" } }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/runs/:runId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const archive = await readEvaluationRunArchive(projectRoot(project.slug), req.params.runId);
    if (!archive) { res.status(404).json({ error: "Evaluation run archive not found" }); return; }
    res.json({ archive });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/shadow-canary", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    try {
      const validation = createShadowCanaryValidation({ validationId: String(body.validationId ?? ""), candidateVersion: String(body.candidateVersion ?? ""), mode: body.mode === "canary" ? "canary" : "shadow", projectSlug: body.mode === "canary" ? project.slug : undefined, authorAuthorized: body.authorAuthorized === true, status: body.status === "failed" ? "failed" : body.status === "rolled-back" ? "rolled-back" : "passed", anomalyRefs: Array.isArray(body.anomalyRefs) ? body.anomalyRefs.map(String) : [], rollbackTarget: String(body.rollbackTarget ?? ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] });
      res.status(201).json({ validation });
    } catch (error) { if (error instanceof Error && error.message.startsWith("SHADOW_CANARY_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/cases", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const evaluationCase = createEvaluationCase(req.body ?? {});
      const persisted = await persistEvaluationCase(projectRoot(project.slug), evaluationCase);
      res.status(persisted.created ? 201 : 200).json({ evaluationCase: persisted.evaluationCase, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_CASE_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/cases/:caseId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const evaluationCase = await readEvaluationCase(projectRoot(project.slug), req.params.caseId);
    if (!evaluationCase) { res.status(404).json({ error: "Evaluation case not found" }); return; }
    res.json({ evaluationCase });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/style-drift", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const toSignature = (value: any) => createStyleSignature({ abstractWordRate: Number(value?.abstractWordRate ?? 0), processWordRate: Number(value?.processWordRate ?? 0), sentenceStartDistribution: value?.sentenceStartDistribution && typeof value.sentenceStartDistribution === "object" ? value.sentenceStartDistribution : {}, dialogueTurnRate: Number(value?.dialogueTurnRate ?? 0), hookTypeDistribution: value?.hookTypeDistribution && typeof value.hookTypeDistribution === "object" ? value.hookTypeDistribution : {}, sensoryChannelDistribution: value?.sensoryChannelDistribution && typeof value.sensoryChannelDistribution === "object" ? value.sensoryChannelDistribution : {}, characterVoiceDistance: Number(value?.characterVoiceDistance ?? 0), sceneFunctionDistribution: value?.sceneFunctionDistribution && typeof value.sceneFunctionDistribution === "object" ? value.sceneFunctionDistribution : {} });
    try {
      res.json({ drift: detectStyleDrift({ baseline: toSignature(body.baseline), candidate: toSignature(body.candidate), threshold: Number(body.threshold), intentionalMotifs: Array.isArray(body.intentionalMotifs) ? body.intentionalMotifs.map(String) : [] }) });
    } catch (error) { if (error instanceof Error && error.message.startsWith("STYLE_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/slice-budgets", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try { const budget = createEvaluationSliceBudget(req.body ?? {}); const budgetId = typeof req.body?.budgetId === "string" && req.body.budgetId.trim() ? req.body.budgetId.trim() : `budget-${budget.fingerprint.slice(0, 24)}`; const persisted = await persistEvaluationSliceBudget(projectRoot(project.slug), { budgetId, projectSlug: project.slug, budget }); res.status(persisted.created ? 201 : 200).json({ budget: persisted.record.budget, record: persisted.record, budgetId, created: persisted.created }); }
    catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_SLICE_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/slice-results", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const budget = createEvaluationSliceBudget(req.body?.budget ?? {});
      const result = evaluateEvaluationSlice({ budget, samples: Number(req.body?.samples), baselineScore: Number(req.body?.baselineScore), candidateScore: Number(req.body?.candidateScore), hardFailures: Array.isArray(req.body?.hardFailures) ? req.body.hardFailures.map(String) : [] }); const resultId = typeof req.body?.resultId === "string" && req.body.resultId.trim() ? req.body.resultId.trim() : `result-${result.fingerprint.slice(0, 24)}`; const persisted = await persistEvaluationSliceResult(projectRoot(project.slug), { resultId, projectSlug: project.slug, budgetFingerprint: budget.fingerprint, result }); res.status(persisted.created ? 201 : 200).json({ result: persisted.record.result, record: persisted.record, resultId, created: persisted.created });
    } catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_SLICE_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/slice-budgets/:budgetId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const record = await readEvaluationSliceBudget(projectRoot(project.slug), req.params.budgetId); if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation slice budget not found" }); return; } res.json({ budget: record.budget, record, budgetId: record.budgetId }); }));
  app.get("/api/novel/projects/:projectId/runtime/evaluation/slice-results/:resultId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const record = await readEvaluationSliceResult(projectRoot(project.slug), req.params.resultId); if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation slice result not found" }); return; } res.json({ result: record.result, record, resultId: record.resultId }); }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/evidence-anchors", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const persisted = await persistEvidenceAnchoredEvaluation(projectRoot(project.slug), createEvidenceAnchoredEvaluation(req.body ?? {}));
      res.status(persisted.created ? 201 : 200).json({ evaluation: persisted.evaluation, created: persisted.created });
    }
    catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.get("/api/novel/projects/:projectId/runtime/evaluation/evidence-anchors/:evaluationId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const evaluation = await readEvidenceAnchoredEvaluation(projectRoot(project.slug), req.params.evaluationId);
    if (!evaluation) { res.status(404).json({ error: "Evidence anchored evaluation not found" }); return; }
    res.json({ evaluation });
  }));

  app.post("/api/novel/projects/:projectId/runtime/evaluation/evidence-anchors/current", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try { assertEvidenceAnchoredEvaluationCurrent(req.body?.evaluation, { content: String(req.body?.content ?? ""), contractFingerprint: String(req.body?.contractFingerprint ?? ""), chapterIntentFingerprint: String(req.body?.chapterIntentFingerprint ?? "") }); res.json({ current: true }); }
    catch (error) { if (error instanceof Error && error.message.startsWith("EVALUATION_EVIDENCE_")) { res.status(409).json({ current: false, error: { code: error.message } }); return; } throw error; }
  }));
  app.post("/api/novel/projects/:projectId/runtime/evaluation/adaptive-scale", asyncRoute(async (req, res) => {
    try {
      const scale = buildAdaptiveEvaluationScale({ chapterFunction: req.body?.chapterFunction, scores: req.body?.scores ?? {} });
      assertAdaptiveEvaluationScaleIntegrity(scale);
      res.status(201).json({ scale });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "EVALUATION_SCALE_INVALID", message: "Adaptive evaluation scale is invalid." } });
    }
  }));
  app.post("/api/novel/projects/:projectId/runtime/evaluation/access-grants", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const grant = createEvaluationAccessGrant({ projectSlug: project.slug, use: req.body?.use, sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.map(String) : [], minimized: req.body?.minimized === true, anonymized: req.body?.anonymized === true });
      const persisted = await persistEvaluationAccessGrant(projectRoot(project.slug), grant);
      res.status(persisted.created ? 201 : 200).json({ grant: persisted.grant, created: persisted.created });
    } catch (error) { res.status(400).json({ error: { code: error instanceof Error ? error.message : "EVALUATION_ACCESS_GRANT_INVALID" } }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/evaluation/access-grants/:grantId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const grant = await readEvaluationAccessGrant(projectRoot(project.slug), req.params.grantId);
    if (!grant || grant.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation access grant not found" }); return; }
    res.json({ grant });
  }));
  app.post("/api/novel/projects/:projectId/runtime/evaluation/access-grants/:grantId/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const current = await readEvaluationAccessGrant(projectRoot(project.slug), req.params.grantId);
      if (!current || current.projectSlug !== project.slug) { res.status(404).json({ error: "Evaluation access grant not found" }); return; }
      const grant = await revokeEvaluationAccessGrant(projectRoot(project.slug), req.params.grantId, String(req.body?.reason || ""));
      res.json({ grant });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "EVALUATION_ACCESS_REVOKE_FAILED" } }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/work-leases/acquire", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const lease = await acquirePersistedWorkLease(projectRoot(project.slug), { workItemId: String(req.body?.workItemId || ""), writeSet: String(req.body?.writeSet || ""), ownerId: String(req.body?.ownerId || ""), nowMs: Number(req.body?.nowMs), ttlMs: Number(req.body?.ttlMs) });
      res.status(201).json({ lease });
    } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "WORK_LEASE_ACQUIRE_FAILED" } }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/work-leases/:workItemId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const lease = await readWorkLease(projectRoot(project.slug), req.params.workItemId);
    if (!lease) { res.status(404).json({ error: "Work lease not found" }); return; }
    res.json({ lease });
  }));
  app.post("/api/novel/projects/:projectId/runtime/work-leases/:workItemId/renew", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try { const lease = await renewPersistedWorkLease(projectRoot(project.slug), req.params.workItemId, { ownerId: String(req.body?.ownerId || ""), fencingToken: Number(req.body?.fencingToken), nowMs: Number(req.body?.nowMs), ttlMs: Number(req.body?.ttlMs) }); res.json({ lease }); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "WORK_LEASE_RENEW_FAILED" } }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/work-leases/:workItemId/release", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try { const lease = await releasePersistedWorkLease(projectRoot(project.slug), req.params.workItemId, { ownerId: String(req.body?.ownerId || ""), fencingToken: Number(req.body?.fencingToken), nowMs: Number(req.body?.nowMs) }); res.json({ lease }); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "WORK_LEASE_RELEASE_FAILED" } }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/stagnation-detection", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const body = req.body || {};
      const incident = detectStagnation({ workFingerprints: Array.isArray(body.workFingerprints) ? body.workFingerprints.map(String) : [], rewriteCount: Number(body.rewriteCount ?? 0), questionFingerprints: Array.isArray(body.questionFingerprints) ? body.questionFingerprints.map(String) : [], qualityScores: Array.isArray(body.qualityScores) ? body.qualityScores.map(Number) : [], newAssetCount: Number(body.newAssetCount ?? 0), completionSignals: Number(body.completionSignals ?? 0), openObligations: Number(body.openObligations ?? 0) });
      const incidentId = typeof body.incidentId === "string" && body.incidentId.trim() ? body.incidentId.trim() : `stagnation-${incident.threshold || "healthy"}-${incident.evidence.workFingerprints.slice(-1)[0] || "none"}`;
      const persisted = await persistStagnationIncident(projectRoot(project.slug), { incidentId, projectSlug: project.slug, bookRunId: typeof body.bookRunId === "string" ? body.bookRunId : undefined, incident });
      let bookRun;
      if (incident.status === "paused" && typeof body.bookRunId === "string" && body.bookRunId.trim()) {
        const currentRun = await readBookRun(projectRoot(project.slug), body.bookRunId.trim());
        if (!currentRun || currentRun.projectSlug !== project.slug) throw new Error("BOOK_RUN_NOT_FOUND");
        bookRun = await controlBookRun(projectRoot(project.slug), currentRun.bookRunId, { action: "pause", expectedVersion: Number(body.expectedVersion ?? currentRun.version) });
      }
      res.status(incident.status === "paused" ? 409 : 200).json({ incident, record: persisted.record, created: persisted.created, ...(bookRun ? { bookRun } : {}) });
    } catch (error) { res.status(400).json({ error: { code: error instanceof Error ? error.message : "STAGNATION_INPUT_INVALID" } }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/stagnation-incidents/:incidentId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const record = await readStagnationIncident(projectRoot(project.slug), req.params.incidentId);
    if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "STAGNATION_INCIDENT_NOT_FOUND" }); return; }
    res.json({ record });
  }));
  app.post("/api/novel/projects/:projectId/runtime/review-batches", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try { const body = req.body || {}; const batch = createReviewBatch({ batchId: String(body.batchId || ""), projectSlug: project.slug, items: Array.isArray(body.items) ? body.items.map((item: any) => ({ itemId: String(item?.itemId || ""), risk: item?.risk, summary: String(item?.summary || ""), evidenceRefs: Array.isArray(item?.evidenceRefs) ? item.evidenceRefs.map(String) : [] })) : [] }); const existing = await readReviewBatch(projectRoot(project.slug), batch.batchId); const persisted = await persistReviewBatch(projectRoot(project.slug), batch); res.status(existing ? 200 : 201).json({ batch: persisted, created: !existing }); }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVIEW_BATCH_INVALID" } }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/review-batches/:batchId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const batch = await readReviewBatch(projectRoot(project.slug), req.params.batchId); if (!batch || batch.projectSlug !== project.slug) { res.status(404).json({ error: "Review batch not found" }); return; } res.json({ batch }); }));
  app.post("/api/novel/projects/:projectId/runtime/review-batches/:batchId/items/:itemId/withdraw", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime"); try { res.json({ batch: await withdrawReviewItem(projectRoot(project.slug), req.params.batchId, req.params.itemId) }); } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVIEW_BATCH_WITHDRAW_FAILED" } }); } }));
  app.post("/api/novel/projects/:projectId/runtime/review-batches/:batchId/items/:itemId/accept", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime"); try { res.json({ batch: await acceptReviewItem(projectRoot(project.slug), req.params.batchId, req.params.itemId) }); } catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "REVIEW_BATCH_ACCEPT_FAILED" } }); } }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue/decision-consumption-receipts", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const body = req.body || {};
      const decisionId = String(body.decisionId || "");
      const decisionVersion = Number(body.decisionVersion);
      const sourceFingerprint = String(body.sourceFingerprint || "");
      const decision = (await readDecisionRecords(projectRoot(project.slug))).find((record) => record.decisionId === decisionId);
      if (!decision) throw new Error("DECISION_NOT_FOUND");
      if (decision.questionVersion !== decisionVersion) throw new Error("DECISION_VERSION_MISMATCH");
      if (decision.sourceFingerprint !== sourceFingerprint) throw new Error("DECISION_SOURCE_FINGERPRINT_MISMATCH");
      const receipt = createDecisionConsumptionReceipt({ receiptId: String(body.receiptId || ""), projectSlug: project.slug, decisionId, decisionVersion, consumer: body.consumer, consumerRef: String(body.consumerRef || ""), sourceFingerprint });
      const persisted = await persistDecisionConsumptionReceipt(projectRoot(project.slug), receipt);
      res.status(persisted.created ? 201 : 200).json(persisted);
    }
    catch (error) { res.status(409).json({ error: { code: error instanceof Error ? error.message : "DECISION_CONSUMPTION_INVALID" } }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/dialogue/decision-consumption-receipts/:receiptId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const receipt = await readDecisionConsumptionReceipt(projectRoot(project.slug), req.params.receiptId); if (!receipt || receipt.projectSlug !== project.slug) { res.status(404).json({ error: "Decision consumption receipt not found" }); return; } res.json({ receipt }); }));

  app.post("/api/novel/projects/:projectId/runtime/surfaces/registry", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const registry = surfaceRegistries.get(project.slug) || await readSurfaceCapabilityRegistry(projectRoot(project.slug), project.slug) || createSurfaceCapabilityRegistry(project.slug);
    const result = registerSurfaceCapability(registry, body.capability ?? {});
    surfaceRegistries.set(project.slug, result.registry);
    await writeSurfaceCapabilityRegistry(projectRoot(project.slug), result.registry);
    res.status(201).json(result);
  }));

  app.post("/api/novel/projects/:projectId/runtime/surfaces/authorize", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const registry = surfaceRegistries.get(project.slug) || await readSurfaceCapabilityRegistry(projectRoot(project.slug), project.slug) || createSurfaceCapabilityRegistry(project.slug);
    surfaceRegistries.set(project.slug, registry);
    res.json({ authorization: authorizeSurfaceCommand(registry, body.request ?? {}) });
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

  app.post("/api/novel/projects/:projectId/runtime/session/primary-action/resolve", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const session = await readCreativeSession(root, project.slug);
    const [questions, decisionRecords, adoptionProposal] = await Promise.all([readDialogueQuestions(root), readDecisionRecords(root), readContractAdoptionProposal(root)]);
    const activeQuestion = questions.find((question) => question.status === "active");
    const journey = buildCreativeJourneyProjection(session, {
      ...(activeQuestion ? { activeQuestion: { questionId: activeQuestion.questionId, text: activeQuestion.text, impact: activeQuestion.impact, source: "deterministic-gap" as const } } : {}),
      answeredQuestionIds: decisionRecords.filter((record) => record.status === "recorded").map((record) => record.questionId),
      readyForOutline: adoptionProposal?.status === "committed"
    });
    const understandingSnapshot = await readUnderstandingSnapshot(root);
    const understandingReview = await readUnderstandingReview(root);
    const latestDecision = decisionRecords
      .filter((decision) => !decisionRecords.some((other) => other.supersedesDecisionId === decision.decisionId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const latestContractCandidate = (await listContractCandidates(root)).find((candidate) => candidate.status === "candidate");
    const outlineCandidates = await listOutlineCandidates(root);
    const activeOutlineCandidate = outlineCandidates.find((outline) => outline.status === "candidate" && outline.sourceCandidateId === latestContractCandidate?.candidateId);
    const activeOutlineValidation = activeOutlineCandidate ? await readOutlineValidationReport(root, activeOutlineCandidate.outlineId) : null;
    const outlineAdoptionProposal = await readOutlineAdoptionProposal(root);
    const decision = resolvePrimaryActionDecision({
      journeyVersion: journey.projectionVersion,
      sourceFingerprint: journey.sourceFingerprint,
      stage: journey.stage,
      hasUnderstandingSnapshot: Boolean(understandingSnapshot),
      hasUnderstandingReviewPassed: understandingReview?.status === "passed",
      ...(latestDecision ? { contractDecisionId: latestDecision.decisionId } : {}),
      ...(latestContractCandidate ? { contractCandidateId: latestContractCandidate.candidateId } : {}),
      ...(adoptionProposal ? { contractAdoptionProposalId: adoptionProposal.proposalId } : {}),
      ...(adoptionProposal?.status === "committed" ? { contractAdoptionCommitted: true } : {}),
      ...(adoptionProposal?.status === "committed" ? { outlineSourceCandidateId: adoptionProposal.candidateId } : {}),
      ...(activeOutlineCandidate ? { outlineCandidateId: activeOutlineCandidate.outlineId } : {}),
      ...(activeOutlineValidation?.status === "passed" ? { outlineValidationPassed: true } : {}),
      ...(outlineAdoptionProposal ? { outlineAdoptionProposalId: outlineAdoptionProposal.proposalId, outlineAdoptionProposalStatus: outlineAdoptionProposal.status } : {}),
      ...(activeQuestion ? { activeQuestionId: activeQuestion.questionId } : {}),
      ...(typeof req.body?.reviewableActionId === "string" ? { reviewableActionId: req.body.reviewableActionId } : {})
    });
    res.status(201).json({ decision, journey });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/primary-action/execute", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const decision = req.body?.decision;
    const submission = req.body?.submission ?? { actionId: decision?.actionId, journeyVersion: decision?.journeyVersion, sourceFingerprint: decision?.sourceFingerprint };
    const validation = validatePrimaryActionSubmission(decision, submission);
    if (!validation.accepted) {
      res.status(409).json({ error: { code: "PRIMARY_ACTION_SUBMISSION_REJECTED", reason: validation.reason }, validation });
      return;
    }
    if (decision.actionId === "capture-idea") {
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const clientMessageId = typeof req.body?.clientMessageId === "string" && req.body.clientMessageId.trim() ? req.body.clientMessageId : decision.idempotencyKey;
      if (!text.trim()) {
        res.status(400).json({ error: { code: "AUTHOR_MESSAGE_TEXT_REQUIRED" } });
        return;
      }
      const result = await appendAuthorMessage({ root: projectRoot(project.slug), projectSlug: project.slug, clientMessageId, text });
      res.status(result.created ? 201 : 200).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: result.created }, session: result.session });
      return;
    }
    if (decision.actionId === "review-understanding") {
      const root = projectRoot(project.slug);
      const existingReview = await readUnderstandingReview(root);
      if (existingReview) {
        res.status(200).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: false }, review: existingReview });
        return;
      }
      const review = await reviewUnderstandingSnapshot(root, typeof req.body?.reviewerId === "string" ? req.body.reviewerId : undefined);
      if (!review) {
        res.status(404).json({ error: { code: "UNDERSTANDING_REVIEW_SNAPSHOT_NOT_FOUND" } });
        return;
      }
      res.status(201).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: true }, review });
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("generate-contract-candidate-")) {
      const decisionId = decision.actionId.slice("generate-contract-candidate-".length);
      if (!decisionId.trim()) {
        res.status(409).json({ error: { code: "PRIMARY_ACTION_TARGET_MISSING" } });
        return;
      }
      try {
        const result = await compileContractCandidate(projectRoot(project.slug), decisionId, typeof req.body?.interpretationId === "string" ? req.body.interpretationId : undefined);
        const sourceDecision = (await readDecisionRecords(root)).find((record) => record.decisionId === result.candidate.sourceDecisionId);
        if (!sourceDecision) {
          res.status(409).json({ error: { code: "DECISION_NOT_FOUND" } });
          return;
        }
        const receiptId = `decision-consumption-${result.candidate.candidateId}`;
        const existingConsumption = await readDecisionConsumptionReceipt(root, receiptId);
        const consumption = existingConsumption ? { created: false, receipt: existingConsumption } : await persistDecisionConsumptionReceipt(root, createDecisionConsumptionReceipt({
          receiptId,
          projectSlug: project.slug,
          decisionId: sourceDecision.decisionId,
          decisionVersion: sourceDecision.questionVersion,
          consumer: "story-contract",
          consumerRef: result.candidate.candidateId,
          sourceFingerprint: result.candidate.sourceFingerprint
        }));
        res.status(result.created ? 201 : 200).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: result.created }, candidate: result.candidate, consumption });
      } catch (error) {
        res.status(409).json({ error: { code: error instanceof Error ? error.message : "CONTRACT_CANDIDATE_COMPILATION_BLOCKED" } });
      }
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("generate-outline-candidate-")) {
      const sourceCandidateId = decision.actionId.slice("generate-outline-candidate-".length);
      if (!sourceCandidateId.trim()) {
        res.status(409).json({ error: { code: "PRIMARY_ACTION_TARGET_MISSING" } });
        return;
      }
      try {
        const result = await compileOutlineCandidate(projectRoot(project.slug), sourceCandidateId, {
          ...(Number.isInteger(req.body?.strongFreezeCount) ? { strongFreezeCount: req.body.strongFreezeCount } : {}),
          ...(Number.isInteger(req.body?.totalChapterCount) ? { totalChapterCount: req.body.totalChapterCount } : {})
        });
        const sourceCandidate = await readContractCandidate(root, result.outline.sourceCandidateId);
        const sourceDecision = sourceCandidate ? (await readDecisionRecords(root)).find((record) => record.decisionId === sourceCandidate.sourceDecisionId) : undefined;
        if (!sourceCandidate || !sourceDecision) {
          res.status(409).json({ error: { code: "DECISION_NOT_FOUND" } });
          return;
        }
        const receiptId = `decision-consumption-${result.outline.outlineId}`;
        const existingConsumption = await readDecisionConsumptionReceipt(root, receiptId);
        const consumption = existingConsumption ? { created: false, receipt: existingConsumption } : await persistDecisionConsumptionReceipt(root, createDecisionConsumptionReceipt({
          receiptId,
          projectSlug: project.slug,
          decisionId: sourceDecision.decisionId,
          decisionVersion: sourceDecision.questionVersion,
          consumer: "outline",
          consumerRef: result.outline.outlineId,
          sourceFingerprint: sourceCandidate.sourceFingerprint
        }));
        res.status(result.created ? 201 : 200).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: result.created }, outline: result.outline, consumption });
      } catch (error) {
        const code = error instanceof Error ? error.message : "OUTLINE_CANDIDATE_COMPILATION_BLOCKED";
        res.status(code === "CONTRACT_CANDIDATE_NOT_FOUND" ? 404 : 409).json({ error: { code } });
      }
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("review-outline-candidate-")) {
      const outlineId = decision.actionId.slice("review-outline-candidate-".length);
      const outline = await readOutlineCandidate(projectRoot(project.slug), outlineId);
      if (!outline) {
        res.status(404).json({ error: { code: "OUTLINE_CANDIDATE_NOT_FOUND" } });
        return;
      }
      const root = projectRoot(project.slug);
      const existingValidation = await readOutlineValidationReport(root, outlineId);
      const report = existingValidation || await validateOutlineCandidate(root, outlineId);
      res.status(existingValidation ? 200 : 201).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: !existingValidation }, outline, validation: report });
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("propose-outline-adoption-")) {
      const outlineId = decision.actionId.slice("propose-outline-adoption-".length);
      const outline = await readOutlineCandidate(projectRoot(project.slug), outlineId);
      if (!outline) {
        res.status(404).json({ error: { code: "OUTLINE_CANDIDATE_NOT_FOUND" } });
        return;
      }
      try {
        const proposal = await createOutlineAdoptionProposal(projectRoot(project.slug), {
          outlineId,
          expectedOutlineFingerprint: outline.fingerprint,
          selectedChapterIds: Array.isArray(req.body?.selectedChapterIds) ? req.body.selectedChapterIds.filter((value: unknown): value is string => typeof value === "string") : undefined
        });
        res.status(201).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: true }, proposal, outline });
      } catch (error) {
        res.status(409).json({ error: { code: error instanceof Error ? error.message : "OUTLINE_ADOPTION_PROPOSAL_BLOCKED" } });
      }
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("authorize-outline-adoption-")) {
      const proposalId = decision.actionId.slice("authorize-outline-adoption-".length);
      const current = await readOutlineAdoptionProposal(projectRoot(project.slug));
      if (!current || current.proposalId !== proposalId) {
        res.status(404).json({ error: { code: "OUTLINE_ADOPTION_PROPOSAL_NOT_FOUND" } });
        return;
      }
      try {
        const proposal = await authorizeOutlineAdoption(projectRoot(project.slug), {
          expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : current.fingerprint,
          authorization: { actorId: typeof req.body?.actorId === "string" ? req.body.actorId : "", authorizationId: typeof req.body?.authorizationId === "string" ? req.body.authorizationId : "" }
        });
        res.status(201).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: true }, proposal });
      } catch (error) {
        res.status(409).json({ error: { code: error instanceof Error ? error.message : "OUTLINE_ADOPTION_AUTHORIZATION_BLOCKED" } });
      }
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("commit-outline-adoption-")) {
      const current = await readOutlineAdoptionProposal(projectRoot(project.slug));
      const proposalId = decision.actionId.slice("commit-outline-adoption-".length);
      if (!current || current.proposalId !== proposalId) {
        res.status(404).json({ error: { code: "OUTLINE_ADOPTION_PROPOSAL_NOT_FOUND" } });
        return;
      }
      const result = await commitOutlineAdoption(projectRoot(project.slug), {
        expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : current.fingerprint,
        ...(req.body?.faultAt === "after-project-write" ? { faultAt: req.body.faultAt } : {})
      });
      res.status(result.status === "committed" ? 200 : result.status === "blocked" ? 409 : 500).json({ execution: { status: result.status === "committed" ? "completed" : "blocked", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: result.status === "committed" }, result });
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("review-contract-candidate-")) {
      const candidateId = decision.actionId.slice("review-contract-candidate-".length);
      const candidate = await readContractCandidate(projectRoot(project.slug), candidateId);
      if (!candidate) {
        res.status(404).json({ error: { code: "CONTRACT_CANDIDATE_NOT_FOUND" } });
        return;
      }
      if (Array.isArray(req.body?.fieldDecisions) && req.body.fieldDecisions.length > 0) {
        const result = await createContractAdoptionProposal(projectRoot(project.slug), {
          candidateId,
          expectedCandidateFingerprint: candidate.fingerprint,
          fieldDecisions: req.body.fieldDecisions,
          worldRuleContractId: typeof req.body?.worldRuleContractId === "string" ? req.body.worldRuleContractId : undefined
        });
        if (!result.proposal) {
          res.status(409).json({ error: { code: result.error || "CONTRACT_ADOPTION_PROPOSAL_BLOCKED" } });
          return;
        }
        res.status(201).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: true }, proposal: result.proposal, candidate });
        return;
      }
      res.status(200).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: false }, candidate });
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("commit-contract-adoption-")) {
      const result = await commitContractAdoption(projectRoot(project.slug), {
        expectedProposalFingerprint: typeof req.body?.expectedProposalFingerprint === "string" ? req.body.expectedProposalFingerprint : "",
        authorization: req.body?.authorization && typeof req.body.authorization.actorId === "string" && typeof req.body.authorization.authorizationId === "string"
          ? { actorId: req.body.authorization.actorId, authorizationId: req.body.authorization.authorizationId }
          : undefined
      });
      if (result.status !== "committed") {
        res.status(409).json({ error: { code: result.reason || "CONTRACT_ADOPTION_BLOCKED" }, execution: { status: "blocked", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey }, result });
        return;
      }
      res.status(200).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: true }, result });
      return;
    }
    if (decision.actionId === "continue-understanding") {
      const root = projectRoot(project.slug);
      const session = await readCreativeSession(root, project.slug);
      const contextManifest = await readContextManifest(root);
      const budgetReservation = await readUnderstandingBudget(root);
      const capabilityAuthorization = await readUnderstandingCapabilityAuthorization(root);
      const preflight = evaluateUnderstandingPreflight(contextManifest, budgetReservation, capabilityAuthorization, fingerprintCreativeSession(session));
      if (!preflight.modelCallAllowed || !contextManifest || !budgetReservation || !capabilityAuthorization) {
        res.status(409).json({ error: { code: "CONTINUE_UNDERSTANDING_BLOCKED", preflight, modelCallIssued: false, understandingWritten: false }, execution: { status: "blocked", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey } });
        return;
      }
      const job = await enqueueProjectBackgroundJob(
        project,
        root,
        "understanding.shadow",
        JSON.stringify({ sourceFingerprint: contextManifest.sourceFingerprint, sourceMessageIds: session.messages.map((message) => message.id) }),
        createBackgroundJobHandler(project, root, "understanding.shadow", JSON.stringify({ sourceFingerprint: contextManifest.sourceFingerprint }))
      );
      res.status(202).json({ execution: { status: "accepted", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, command: "understanding.shadow" }, job, preflight, modelCallIssued: false, understandingWritten: false });
      return;
    }
    if (typeof decision.actionId === "string" && decision.actionId.startsWith("answer-")) {
      const questionId = decision.actionId.slice("answer-".length);
      if (typeof req.body?.answerQuestionId === "string" && req.body.answerQuestionId !== questionId) {
        res.status(409).json({ error: { code: "PRIMARY_ACTION_TARGET_MISMATCH" } });
        return;
      }
      const currentQuestion = (await readDialogueQuestions(root)).find((candidate) => candidate.questionId === decision.actionId.slice("answer-".length));
      const automaticRedBlueCaseId = currentQuestion?.options.length && currentQuestion.options.length >= 2 ? `red-blue-${currentQuestion.questionId}-${currentQuestion.questionVersion}` : undefined;
      const advanced = await advanceUnderstandingAfterConfirmedAnswer({
        root,
        projectSlug: project.slug,
        answer: {
          questionId,
          questionVersion: Number(req.body?.questionVersion),
          expectedSnapshotFingerprint: typeof req.body?.expectedSnapshotFingerprint === "string" ? req.body.expectedSnapshotFingerprint : "",
          idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : validation.idempotencyKey || "",
          answerText: typeof req.body?.answerText === "string" ? req.body.answerText : "",
          answerStatus: req.body?.answerStatus === "tentative" || req.body?.answerStatus === "delegated" ? req.body.answerStatus : "confirmed",
          ...(typeof req.body?.redBlueCaseId === "string" ? { redBlueCaseId: req.body.redBlueCaseId } : automaticRedBlueCaseId ? { redBlueCaseId: automaticRedBlueCaseId } : {})
        }
      });
      if (!advanced.answer.accepted) {
        res.status(409).json({ error: { code: "PRIMARY_ACTION_ANSWER_REJECTED", conflict: advanced.answer.conflict }, conflict: advanced.answer.conflict });
        return;
      }
      const refreshedQuestions = await readDialogueQuestions(root);
      const refreshedDecisions = await readDecisionRecords(root);
      const refreshedActiveQuestion = refreshedQuestions.find((candidate) => candidate.status === "active");
      const refreshedSession = await readCreativeSession(root, project.slug);
      const journey = buildCreativeJourneyProjection(refreshedSession, {
        ...(refreshedActiveQuestion ? { activeQuestion: { questionId: refreshedActiveQuestion.questionId, text: refreshedActiveQuestion.text, impact: refreshedActiveQuestion.impact, source: "deterministic-gap" as const } } : {}),
        answeredQuestionIds: refreshedDecisions.filter((record) => record.status === "recorded").map((record) => record.questionId)
      });
      await persistCreativeJourneyProjection(root, journey);
      res.status(advanced.answer.replayed ? 200 : 201).json({ execution: { status: "completed", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, created: !advanced.answer.replayed }, question: advanced.answer.question, ...(advanced.nextQuestion ? { nextQuestion: advanced.nextQuestion } : {}), ...(advanced.contractCandidate ? { contractCandidate: advanced.contractCandidate } : {}), ...(advanced.consumption ? { consumption: advanced.consumption } : {}), completed: advanced.completed, journey, decision: advanced.answer.decision });
      return;
    }
    res.status(202).json({ execution: { status: "accepted", actionId: decision.actionId, idempotencyKey: validation.idempotencyKey, command: decision.allowedCommands[0] } });
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

  app.post("/api/novel/projects/:projectId/runtime/session/provider-evaluation", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const root = projectRoot(project.slug);
    const records = await readModelInvocations(root);
    const evidence = await readQualityCalibrationEvidence(root);
    const report = evaluateProviderRun({ providerRef: String(req.body?.providerRef || ""), records, qualityEvidence: evidence, maxP95LatencyMs: Number(req.body?.maxP95LatencyMs), maxCost: Number(req.body?.maxCost) });
    res.json({ report });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/provider-probe", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const profile = resolveAgentProfile({ profileId: typeof req.body?.profileId === "string" ? req.body.profileId : undefined, modelId: typeof req.body?.modelId === "string" ? req.body.modelId : undefined });
    const result = await runProviderProbe({
      root: projectRoot(project.slug),
      projectRoot: projectRoot(project.slug),
      config: profile,
      prompt: String(req.body?.prompt || ""),
      taskId: String(req.body?.taskId || "provider-probe"),
      taskFingerprint: String(req.body?.taskFingerprint || "provider-probe"),
      contextManifestRef: String(req.body?.contextManifestRef || "probe://context"),
      promptSchemaVersion: String(req.body?.promptSchemaVersion || "probe.v1"),
      routeDecision: String(req.body?.routeDecision || "probe"),
      estimatedInputTokens: Number(req.body?.estimatedInputTokens ?? 0),
      estimatedOutputTokens: Number(req.body?.estimatedOutputTokens ?? 0),
      estimatedCost: Number(req.body?.estimatedCost ?? 0),
      currency: typeof req.body?.currency === "string" ? req.body.currency : undefined,
      runner: new AgentProcessRunner()
    });
    res.status(201).json({ result });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-invocations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const record = createModelInvocationRecord({ ...body, usage: body.usage ?? {}, cost: body.cost ?? {}, cache: body.cache ?? { hit: false } });
    if (record.authorityBinding) await verifyModelInvocationAuthorityBinding(projectRoot(project.slug), record.authorityBinding);
    await appendModelInvocation(projectRoot(project.slug), record);
    res.status(201).json({ record });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-invocations/budget-gate", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ gate: evaluateInvocationBudget({ hardLimit: Number(req.body?.hardLimit), committed: Number(req.body?.committed), reserved: Number(req.body?.reserved), nextEstimate: Number(req.body?.nextEstimate) }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-invocations/:invocationId/settle", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const reservationId = typeof req.body?.reservationId === "string" ? req.body.reservationId : "";
    if (!reservationId.trim()) throw new Error("MODEL_INVOCATION_RESERVATION_REQUIRED");
    const result = await settlePersistedModelInvocation(projectRoot(project.slug), req.params.invocationId, reservationId);
    res.status(201).json(result);
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/model-route", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    res.json({ decision: routeModelCapability({ taskType: String(body.taskType ?? ""), impact: body.impact, requiredCapabilityTier: body.requiredCapabilityTier, authorPreference: body.authorPreference, estimatedCost: Number(body.estimatedCost), remainingBudget: Number(body.remainingBudget), capabilities: Array.isArray(body.capabilities) ? body.capabilities : [] }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/session/provider-failover", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const body = req.body ?? {};
    const candidates = Array.isArray(body.candidates) ? body.candidates.map((candidate: Record<string, unknown>) => ({
      candidateId: String(candidate.candidateId ?? ""),
      provider: String(candidate.provider ?? ""),
      ...(typeof candidate.modelId === "string" ? { modelId: candidate.modelId } : {}),
      status: candidate.status === "retired" ? "retired" as const : "active" as const,
      verifiedTaskTypes: Array.isArray(candidate.verifiedTaskTypes) ? candidate.verifiedTaskTypes.map(String) : [],
      structuredOutput: candidate.structuredOutput === true,
      contextLimit: Number(candidate.contextLimit),
      privacyClasses: Array.isArray(candidate.privacyClasses) ? candidate.privacyClasses.map(String) : [],
      dataResidencies: Array.isArray(candidate.dataResidencies) ? candidate.dataResidencies.map(String) : []
    })) : [];
    const decision = evaluateProviderFailover({
      currentCandidateId: String(body.currentCandidateId ?? ""),
      taskType: String(body.taskType ?? ""),
      requiredContextTokens: Number(body.requiredContextTokens),
      requiresStructuredOutput: body.requiresStructuredOutput !== false,
      privacyClass: String(body.privacyClass ?? ""),
      dataResidency: String(body.dataResidency ?? ""),
      frozenInputFingerprint: String(body.frozenInputFingerprint ?? ""),
      candidates
    });
    res.json({ decision });
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
    const run = createSeedCompilationRun({ projectSlug: project.slug, idempotencyKey: String(body.idempotencyKey ?? ""), inputFingerprint: String(body.inputFingerprint ?? ""), compilerVersion: String(body.compilerVersion ?? ""), sourceMessageIds: Array.isArray(body.sourceMessageIds) ? body.sourceMessageIds.map(String) : [] });
    res.status(201).json({ run: await persistSeedCompilationRun(projectRoot(project.slug), run) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/story-seeds/runs/:runId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const run = await readSeedCompilationRun(projectRoot(project.slug), req.params.runId);
    if (!run) { res.status(404).json({ error: "Seed compilation run not found" }); return; }
    res.json({ run });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/runs/:runId/advance", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const run = await readSeedCompilationRun(root, req.params.runId);
    if (!run) { res.status(404).json({ error: { code: "SEED_RUN_NOT_FOUND" } }); return; }
    if (run.status !== "captured") { res.status(409).json({ error: { code: "SEED_RUN_ADVANCE_INVALID" }, run }); return; }
    const [manifest, budget, capability, session] = await Promise.all([
      readContextManifest(root),
      readUnderstandingBudget(root),
      readUnderstandingCapabilityAuthorization(root),
      readCreativeSession(root, project.slug)
    ]);
    const preflight = evaluateUnderstandingPreflight(manifest, budget, capability, fingerprintCreativeSession(session));
    const missingDependencies = preflight.reasons.filter((reason) => reason.status === "missing").map((reason) => reason.dependency);
    if (!preflight.modelCallAllowed || !manifest || !budget || !capability) {
      res.status(409).json({ error: { code: "SEED_COMPILATION_DEPENDENCIES_MISSING", missingDependencies }, run, preflight });
      return;
    }
    const interpreting = await persistSeedCompilationRun(root, transitionSeedCompilationRun(run, "interpreting", { checkpoint: "understanding-preflight" }));
    const result = await executeShadowUnderstanding({ root, projectSlug: project.slug, session, manifest, riskProfile: buildUnderstandingRiskProfile(), budget, capability });
    const advanced = await persistSeedCompilationRun(root, transitionSeedCompilationRun(interpreting, "reviewable", { checkpoint: "understanding-snapshot" }));
    const firstQuestion = UNDERSTANDING_QUESTION_SEQUENCE[0];
    const existingQuestion = (await readDialogueQuestions(root)).find((question) => question.questionId === firstQuestion.questionId);
    const question = existingQuestion
      ? { question: existingQuestion, created: false }
      : await createDialogueQuestion(root, {
          projectSlug: project.slug,
          questionId: firstQuestion.questionId,
          questionVersion: 1,
          text: firstQuestion.text,
          whyNow: firstQuestion.whyNow,
          impact: firstQuestion.impact,
          ambiguity: 0.8,
          errorCost: firstQuestion.errorCost,
          reversibility: firstQuestion.reversibility,
          delayCost: firstQuestion.delayCost,
          options: [],
          recommendation: firstQuestion.recommendation,
          snapshotFingerprint: manifest.sourceFingerprint
        });
    const journeyProjection = buildCreativeJourneyProjection(session, { activeQuestion: { questionId: question.question.questionId, text: question.question.text, impact: question.question.impact, source: "deterministic-gap" } });
    await persistCreativeJourneyProjection(root, journeyProjection);
    await persistCreativeTimelineProjection(root, buildCreativeTimelineProjection(session));
    res.status(201).json({ run: advanced, understanding: result, question: question.question, questionCreated: question.created, preflight });
  }));

  app.post("/api/novel/projects/:projectId/runtime/story-seeds/runs/transition", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const run = req.body?.run;
    if (!run || run.projectSlug !== project.slug) { res.status(409).json({ error: { code: "SEED_RUN_SCOPE_MISMATCH" } }); return; }
    res.json({ run: await persistSeedCompilationRun(projectRoot(project.slug), transitionSeedCompilationRun(run, req.body?.next, req.body?.input ?? {})) });
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
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json(await validateNarrativeStructure(projectRoot(project.slug), project.slug));
  }));
  app.post("/api/novel/projects/:projectId/runtime/semantic-nodes", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.status(201).json(await createSemanticNode({ root: projectRoot(project.slug), projectSlug: project.slug, semanticId: String(req.body.semanticId || ""), kind: req.body.kind, label: String(req.body.label || ""), displayChapter: String(req.body.displayChapter || ""), parentId: req.body.parentId ?? null, sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [] }));
  }));
  app.get("/api/novel/projects/:projectId/runtime/semantic-nodes", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json(await listSemanticNodes(projectRoot(project.slug), project.slug)); }));
  app.get("/api/novel/projects/:projectId/runtime/semantic-nodes/:semanticId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const node = await readSemanticNode(projectRoot(project.slug), req.params.semanticId); if (!node) return res.status(404).json({ error: "SEMANTIC_NODE_NOT_FOUND" }); res.json(node); }));
  app.post("/api/novel/projects/:projectId/runtime/semantic-nodes/projection", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json(await projectSemanticNodeOrder(projectRoot(project.slug), project.slug, Array.isArray(req.body.semanticIds) ? req.body.semanticIds : [])); }));
  app.post("/api/novel/projects/:projectId/runtime/outline/impact-analyses", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.status(201).json(await createImpactAnalysis({ root: projectRoot(project.slug), projectSlug: project.slug, rootNodeIds: Array.isArray(req.body.rootNodeIds) ? req.body.rootNodeIds : [], protectedNodeIds: Array.isArray(req.body.protectedNodeIds) ? req.body.protectedNodeIds : [], reason: String(req.body.reason || ""), sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/outline/replan-decisions", asyncRoute(async (req, res) => { const body = req.body || {}; res.status(201).json(createReplanDecision({ runId: String(body.runId || ""), triggerEvidence: Array.isArray(body.triggerEvidence) ? body.triggerEvidence.map(String) : [], affectedWorkItemIds: Array.isArray(body.affectedWorkItemIds) ? body.affectedWorkItemIds.map(String) : [], affectedNodeIds: Array.isArray(body.affectedNodeIds) ? body.affectedNodeIds.map(String) : [], currentGraphVersion: Number(body.currentGraphVersion), redArgument: String(body.redArgument || ""), blueArgument: String(body.blueArgument || ""), authorChoice: body.authorChoice === "retroactive-canon" || body.authorChoice === "keep-plan" ? body.authorChoice : "partial-future", authorizationGranted: body.authorizationGranted === true, affectedAssetIds: Array.isArray(body.affectedAssetIds) ? body.affectedAssetIds.map(String) : [], impact: { status: body.impact?.status === "blocked" ? "blocked" : "ready", affectedNodeIds: Array.isArray(body.impact?.affectedNodeIds) ? body.impact.affectedNodeIds.map(String) : [], unknownNodeIds: Array.isArray(body.impact?.unknownNodeIds) ? body.impact.unknownNodeIds.map(String) : [], protectedAffectedNodeIds: Array.isArray(body.impact?.protectedAffectedNodeIds) ? body.impact.protectedAffectedNodeIds.map(String) : [], unaffectedNodeIds: Array.isArray(body.impact?.unaffectedNodeIds) ? body.impact.unaffectedNodeIds.map(String) : [] } })); }));
  app.post("/api/novel/projects/:projectId/runtime/outline/expansion-gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ gate: evaluateGraphExpansion({ gateId: String(body.gateId || `expansion-${Date.now()}`), currentChapterCount: Number(body.currentChapterCount), proposedAdditionalChapters: Number(body.proposedAdditionalChapters), currentBudgetCents: Number(body.currentBudgetCents), projectedAdditionalCostCents: Number(body.projectedAdditionalCostCents), choice: ["neutralize", "compress-reclaim", "authorize-expansion"].includes(body.choice) ? body.choice as GraphExpansionChoice : undefined, authorizationGranted: body.authorizationGranted === true }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/beat-evidence-gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ gate: evaluateBeatEvidence({ planned: body.planned !== false, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [] }) }); }));
  app.post("/api/novel/projects/:projectId/runtime/obligation-setup-fairness", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json({ gate: evaluateSetupFairness({ obligationId: String(body.obligationId || ""), salience: { placement: Number(body.salience?.placement), sensorySpecificity: Number(body.salience?.sensorySpecificity), characterReaction: Number(body.salience?.characterReaction), repetitionCount: Number(body.salience?.repetitionCount || 0), obscuredByStrongerEvent: body.salience?.obscuredByStrongerEvent === true }, remediationEvidence: typeof body.remediationEvidence === "string" ? body.remediationEvidence : undefined }) }); }));
  app.get("/api/novel/projects/:projectId/runtime/outline/impact-analyses/:analysisId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const analysis = await readImpactAnalysis(projectRoot(project.slug), req.params.analysisId); if (!analysis) return res.status(404).json({ error: "IMPACT_ANALYSIS_NOT_FOUND" }); res.json(analysis); }));
  app.post("/api/novel/projects/:projectId/runtime/emergence-candidates", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.status(201).json(await createEmergenceCandidate({ root: projectRoot(project.slug), projectSlug: project.slug, chapterId: String(req.body.chapterId || ""), observation: String(req.body.observation || ""), emergenceType: req.body.emergenceType, level: req.body.level, competingInterpretations: Array.isArray(req.body.competingInterpretations) ? req.body.competingInterpretations : [], affectedNodeIds: Array.isArray(req.body.affectedNodeIds) ? req.body.affectedNodeIds : [], protectedNodeIds: Array.isArray(req.body.protectedNodeIds) ? req.body.protectedNodeIds : [], impactFingerprint: typeof req.body.impactFingerprint === "string" ? req.body.impactFingerprint : undefined, rollbackPoint: typeof req.body.rollbackPoint === "string" ? req.body.rollbackPoint : undefined, impactBlockers: Array.isArray(req.body.impactBlockers) ? req.body.impactBlockers.map(String) : [], sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/emergence-candidates/:candidateId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const candidate = await readEmergenceCandidate(projectRoot(project.slug), req.params.candidateId); if (!candidate) return res.status(404).json({ error: "EMERGENCE_CANDIDATE_NOT_FOUND" }); res.json(candidate); }));
  app.post("/api/novel/projects/:projectId/runtime/emergence-candidates/:candidateId/adopt", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json(await adoptEmergenceCandidate(projectRoot(project.slug), req.params.candidateId, { authorization: req.body.authorization === "author" ? "author" : "none", regressionFingerprint: String(req.body.regressionFingerprint || ""), structureValidationFingerprint: typeof req.body.structureValidationFingerprint === "string" ? req.body.structureValidationFingerprint : undefined, rollbackPoint: typeof req.body.rollbackPoint === "string" ? req.body.rollbackPoint : undefined })); }));
  app.post("/api/novel/projects/:projectId/runtime/execution-ready/gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; const report = evaluateExecutionReadyGate({ projectSlug: project.slug, outlineVersionId: String(body.outlineVersionId || ""), nearHorizon: Array.isArray(body.nearHorizon) ? body.nearHorizon : [], arcObligationLinks: Array.isArray(body.arcObligationLinks) ? body.arcObligationLinks : [], causalReachable: body.causalReachable === true, contextComplete: body.contextComplete === true, blockingConflictsResolved: body.blockingConflictsResolved === true, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], structureVersionFingerprint: String(body.structureVersionFingerprint || ""), changeLevel: body.changeLevel === "L2" ? "L2" : body.changeLevel === "L1" ? "L1" : "L0", adoptionAuthority: String(body.adoptionAuthority || ""), adoptionProofFingerprint: String(body.adoptionProofFingerprint || "") }); await persistExecutionReadyGateReport(projectRoot(project.slug), report, project.slug); res.json({ report }); }));
  app.get("/api/novel/projects/:projectId/runtime/execution-ready/gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const report = await readExecutionReadyGateReport(projectRoot(project.slug)); if (!report || report.projectSlug !== project.slug) return res.status(404).json({ error: "EXECUTION_READY_GATE_NOT_FOUND" }); res.json({ report }); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-segments", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createProseSegment({ root: projectRoot(project.slug), projectSlug: project.slug, sceneId: String(body.sceneId || ""), beatId: String(body.beatId || ""), text: String(body.text || ""), beforeText: String(body.beforeText || ""), afterText: String(body.afterText || ""), sourceCandidateId: String(body.sourceCandidateId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/prose-segments/:semanticId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const segment = await readProseSegment(projectRoot(project.slug), req.params.semanticId); if (!segment) return res.status(404).json({ error: "PROSE_SEGMENT_NOT_FOUND" }); res.json(segment); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-segments/:semanticId/patch", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await applyProseSegmentPatch(projectRoot(project.slug), req.params.semanticId, { beforeBoundaryFingerprint: String(body.beforeBoundaryFingerprint || ""), afterBoundaryFingerprint: String(body.afterBoundaryFingerprint || ""), replacementText: String(body.replacementText || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/scene-execution-ledgers", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; const sceneCard = await readSceneCardContract(projectRoot(project.slug), String(body.sceneId || "")); if (!sceneCard) return res.status(404).json({ error: "SCENE_CARD_NOT_FOUND" }); res.status(201).json(await createSceneExecutionLedger({ root: projectRoot(project.slug), sceneCard, obligationIds: Array.isArray(body.obligationIds) ? body.obligationIds : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/scene-execution-ledgers/:ledgerId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const ledger = await readSceneExecutionLedger(projectRoot(project.slug), req.params.ledgerId); if (!ledger) return res.status(404).json({ error: "SCENE_LEDGER_NOT_FOUND" }); res.json(ledger); }));
  app.post("/api/novel/projects/:projectId/runtime/scene-execution-ledgers/:ledgerId/evidence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await appendSceneExecutionEvidence(projectRoot(project.slug), req.params.ledgerId, { kind: body.kind, value: String(body.value || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/beat-fulfillment", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createBeatFulfillmentLedger({ root: projectRoot(project.slug), projectSlug: project.slug, sceneId: String(body.sceneId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], beats: Array.isArray(body.beats) ? body.beats : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/beat-fulfillment/:ledgerId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const ledger = await readBeatFulfillmentLedger(projectRoot(project.slug), req.params.ledgerId); if (!ledger) return res.status(404).json({ error: "BEAT_LEDGER_NOT_FOUND" }); res.json(ledger); }));
  app.post("/api/novel/projects/:projectId/runtime/beat-fulfillment/:ledgerId/:beatId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await transitionBeatFulfillment(projectRoot(project.slug), req.params.ledgerId, req.params.beatId, { status: body.status, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], reason: body.reason })); }));
  app.post("/api/novel/projects/:projectId/runtime/agency-chains", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createAgencyChain({ root: projectRoot(project.slug), projectSlug: project.slug, sceneId: String(body.sceneId || ""), characterId: String(body.characterId || ""), perception: String(body.perception || ""), desire: String(body.desire || ""), availableStrategies: Array.isArray(body.availableStrategies) ? body.availableStrategies : [], actualChoice: String(body.actualChoice || ""), immediateReason: String(body.immediateReason || ""), cost: String(body.cost || ""), consequence: String(body.consequence || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], keyScene: body.keyScene !== false })); }));
  app.get("/api/novel/projects/:projectId/runtime/agency-chains/:chainId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const chain = await readAgencyChain(projectRoot(project.slug), req.params.chainId); if (!chain) return res.status(404).json({ error: "AGENCY_CHAIN_NOT_FOUND" }); res.json(chain); }));
  app.post("/api/novel/projects/:projectId/runtime/voice-consistency", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateVoiceConsistency({ characterId: String(body.characterId || ""), voiceVersion: String(body.voiceVersion || ""), previousVoiceVersion: body.previousVoiceVersion, voiceChangeMilestone: body.voiceChangeMilestone, voiceChangeEvidenceRefs: Array.isArray(body.voiceChangeEvidenceRefs) ? body.voiceChangeEvidenceRefs : [], emotion: String(body.emotion || ""), relationshipState: String(body.relationshipState || ""), powerState: String(body.powerState || ""), knowledgeBoundary: Array.isArray(body.knowledgeBoundary) ? body.knowledgeBoundary : [], utterance: String(body.utterance || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/dialogue-action", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateDialogueAction({ dialogueId: String(body.dialogueId || ""), sceneId: String(body.sceneId || ""), participants: Array.isArray(body.participants) ? body.participants : [], informationAsymmetry: Array.isArray(body.informationAsymmetry) ? body.informationAsymmetry : [], postChange: { power: String(body.postChange?.power || ""), relationship: String(body.postChange?.relationship || "") }, exchangeRefs: Array.isArray(body.exchangeRefs) ? body.exchangeRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/information-state", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createInformationStateTrace({ root: projectRoot(project.slug), projectSlug: project.slug, sceneId: String(body.sceneId || ""), povCharacterId: String(body.povCharacterId || ""), authorTruth: Array.isArray(body.authorTruth) ? body.authorTruth : [], readerKnown: Array.isArray(body.readerKnown) ? body.readerKnown : [], povKnown: Array.isArray(body.povKnown) ? body.povKnown : [], povBeliefs: Array.isArray(body.povBeliefs) ? body.povBeliefs : [], otherPrivate: Array.isArray(body.otherPrivate) ? body.otherPrivate : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/information-state/:traceId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const trace = await readInformationStateTrace(projectRoot(project.slug), req.params.traceId); if (!trace) return res.status(404).json({ error: "INFORMATION_TRACE_NOT_FOUND" }); res.json(trace); }));
  app.post("/api/novel/projects/:projectId/runtime/information-state/:traceId/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await appendInformationEvent(projectRoot(project.slug), req.params.traceId, { kind: body.kind, factId: String(body.factId || ""), target: body.target, inferenceBasis: Array.isArray(body.inferenceBasis) ? body.inferenceBasis : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/narrative-distance", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateNarrativeDistance({ sceneId: String(body.sceneId || ""), povCharacterId: String(body.povCharacterId || ""), declaredDistance: body.declaredDistance, allowedChanges: Array.isArray(body.allowedChanges) ? body.allowedChanges : [], segments: Array.isArray(body.segments) ? body.segments : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/emotion-causality", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateEmotionCausality({ sceneId: String(body.sceneId || ""), characterId: String(body.characterId || ""), intensity: body.intensity, trigger: String(body.trigger || ""), bodyAttention: String(body.bodyAttention || ""), interpretation: String(body.interpretation || ""), choice: String(body.choice || ""), aftermath: { character: String(body.aftermath?.character || ""), relationship: String(body.aftermath?.relationship || ""), nextAction: String(body.aftermath?.nextAction || "") }, proseEvidenceRefs: Array.isArray(body.proseEvidenceRefs) ? body.proseEvidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-specificity", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateProseSpecificity({ sceneId: String(body.sceneId || ""), blocks: Array.isArray(body.blocks) ? body.blocks : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/cognitive-budget", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateCognitiveBudget({ sceneId: String(body.sceneId || ""), budget: body.budget || { maxNewUnits: 0, maxNamedEntities: 0, maxRules: 0, maxClues: 0 }, units: Array.isArray(body.units) ? body.units : [], answerClaims: Array.isArray(body.answerClaims) ? body.answerClaims : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/micro-rhythm", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateMicroRhythm({ sceneId: String(body.sceneId || ""), paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/scene-seam", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateSceneSeam({ leftSceneId: String(body.leftSceneId || ""), rightSceneId: String(body.rightSceneId || ""), left: body.left, right: body.right, leftVerifiedBeatIds: Array.isArray(body.leftVerifiedBeatIds) ? body.leftVerifiedBeatIds : [], rightVerifiedBeatIds: Array.isArray(body.rightVerifiedBeatIds) ? body.rightVerifiedBeatIds : [], repair: body.repair || null, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/chapter-continuations", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createChapterContinuationRun({ root: projectRoot(project.slug), projectSlug: project.slug, chapterId: String(body.chapterId || ""), inputManifest: body.inputManifest, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/chapter-continuations/:runId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const run = await readChapterContinuationRun(projectRoot(project.slug), req.params.runId); if (!run) return res.status(404).json({ error: "CONTINUATION_RUN_NOT_FOUND" }); res.json(run); }));
  app.post("/api/novel/projects/:projectId/runtime/chapter-continuations/:runId/checkpoints", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await saveContinuationCheckpoint(projectRoot(project.slug), req.params.runId, { baselineTail: String(body.baselineTail || ""), fulfilledBeatIds: Array.isArray(body.fulfilledBeatIds) ? body.fulfilledBeatIds : [], pendingBeatIds: Array.isArray(body.pendingBeatIds) ? body.pendingBeatIds : [], candidateText: String(body.candidateText || ""), validationStatus: body.validationStatus, validationRefs: Array.isArray(body.validationRefs) ? body.validationRefs : [], continuationToken: String(body.continuationToken || "") })); }));
  app.post("/api/novel/projects/:projectId/runtime/chapter-continuations/:runId/resume", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json(await resumeFromVerifiedCheckpoint(projectRoot(project.slug), req.params.runId)); }));
  app.post("/api/novel/projects/:projectId/runtime/candidate-convergence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createCandidateConvergence({ root: projectRoot(project.slug), projectSlug: project.slug, assetId: String(body.assetId || ""), targetProblem: String(body.targetProblem || ""), stopAfterUnimproved: Number(body.stopAfterUnimproved || 3), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/candidate-convergence/:runId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const run = await readCandidateConvergence(projectRoot(project.slug), req.params.runId); if (!run) return res.status(404).json({ error: "CONVERGENCE_RUN_NOT_FOUND" }); res.json(run); }));
  app.post("/api/novel/projects/:projectId/runtime/candidate-convergence/:runId/iterations", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await recordCandidateIteration(projectRoot(project.slug), req.params.runId, { candidateId: String(body.candidateId || ""), similarityFingerprint: String(body.similarityFingerprint || ""), problemScore: Number(body.problemScore), preserved: Array.isArray(body.preserved) ? body.preserved : [], regressions: Array.isArray(body.regressions) ? body.regressions : [], authorJudgment: String(body.authorJudgment || ""), reviewVerdict: body.reviewVerdict, evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/review-isolation", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createReviewIsolationSession({ root: projectRoot(project.slug), projectSlug: project.slug, candidateId: String(body.candidateId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), generatedSelfClaims: Array.isArray(body.generatedSelfClaims) ? body.generatedSelfClaims : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/review-isolation/:sessionId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const session = await readReviewIsolationSession(projectRoot(project.slug), req.params.sessionId); if (!session) return res.status(404).json({ error: "REVIEW_SESSION_NOT_FOUND" }); res.json(session); }));
  app.post("/api/novel/projects/:projectId/runtime/review-isolation/:sessionId/reviews", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await submitReview(projectRoot(project.slug), req.params.sessionId, { side: body.side, verdict: String(body.verdict || ""), findings: Array.isArray(body.findings) ? body.findings : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/review-isolation/:sessionId/synthesize", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(await synthesizeReview(projectRoot(project.slug), req.params.sessionId, { decision: String(body.decision || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-validation-dossier", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(buildProseValidationDossier({ projectSlug: project.slug, candidateId: String(body.candidateId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), domains: Array.isArray(body.domains) ? body.domains : [], overallScore: Number(body.overallScore || 0), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-repair-plans", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createEvidenceRepairPlan({ projectSlug: project.slug, candidateId: String(body.candidateId || ""), maturity: body.maturity, issues: Array.isArray(body.issues) ? body.issues : [], immutableItems: Array.isArray(body.immutableItems) ? body.immutableItems : [], affectedSegmentIds: Array.isArray(body.affectedSegmentIds) ? body.affectedSegmentIds : [], collateralRisks: Array.isArray(body.collateralRisks) ? body.collateralRisks : [], verificationMethod: String(body.verificationMethod || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-regression-proof", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(buildProseRegressionProof({ candidateId: String(body.candidateId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), candidateFingerprint: String(body.candidateFingerprint || ""), targetScoreBefore: Number(body.targetScoreBefore), targetScoreAfter: Number(body.targetScoreAfter), qualityScoresBefore: Array.isArray(body.qualityScoresBefore) ? body.qualityScoresBefore : [], qualityScoresAfter: Array.isArray(body.qualityScoresAfter) ? body.qualityScoresAfter : [], guards: body.guards || {}, targetEvidenceRefs: Array.isArray(body.targetEvidenceRefs) ? body.targetEvidenceRefs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-adoption-transactions", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createProseCanon({ root: projectRoot(project.slug), projectSlug: project.slug, segmentId: String(body.segmentId || ""), baselineFingerprint: String(body.baselineFingerprint || ""), currentText: String(body.currentText || ""), maturity: body.maturity, authorLockIds: Array.isArray(body.authorLockIds) ? body.authorLockIds : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] }, { expectedBaselineFingerprint: String(body.expectedBaselineFingerprint || ""), replacementText: String(body.replacementText || ""), authority: body.authority, revisionMode: body.revisionMode, changeSet: Array.isArray(body.changeSet) ? body.changeSet : undefined, lockCheckPassed: body.lockCheckPassed === true, validationFingerprint: String(body.validationFingerprint || ""), derivedCandidates: Array.isArray(body.derivedCandidates) ? body.derivedCandidates : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/derived-settlement", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(settleDerivedChanges({ adoptionStatus: body.adoptionStatus, anchorRebuildStatus: body.anchorRebuildStatus, evidenceStatus: body.evidenceStatus, derivedChanges: Array.isArray(body.derivedChanges) ? body.derivedChanges : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-maturity", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createProseMaturity({ projectSlug: project.slug, chapterId: String(body.chapterId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/prose-maturity/advance", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(advanceProseMaturity(body.state, { event: String(body.event || ""), target: body.target, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], gates: body.gates || {} })); }));
  app.post("/api/novel/projects/:projectId/runtime/source-material", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createSourceMaterialRecord({ root: projectRoot(project.slug), projectSlug: project.slug, platform: String(body.platform || ""), stableLocator: String(body.stableLocator || ""), capturedAt: String(body.capturedAt || ""), contentFingerprint: String(body.contentFingerprint || ""), sourceFamily: String(body.sourceFamily || ""), accessClass: body.accessClass, processingPurpose: String(body.processingPurpose || ""), retainableEvidenceScope: String(body.retainableEvidenceScope || ""), projectScope: String(body.projectScope || ""), platformScope: String(body.platformScope || ""), refreshPolicy: String(body.refreshPolicy || ""), expiresAt: String(body.expiresAt || ""), deletionPolicy: String(body.deletionPolicy || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.get("/api/novel/projects/:projectId/runtime/source-material/:recordId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const record = await readSourceMaterialRecord(projectRoot(project.slug), req.params.recordId); if (!record) return res.status(404).json({ error: "SOURCE_MATERIAL_NOT_FOUND" }); res.json(record); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-pattern-explanations", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); const body = req.body || {}; res.status(201).json(await createCraftPattern({ root: projectRoot(project.slug), projectSlug: project.slug, name: String(body.name || ""), structuralMechanism: String(body.structuralMechanism || ""), readerEffect: String(body.readerEffect || ""), applicableScenes: Array.isArray(body.applicableScenes) ? body.applicableScenes : [], minimalPositiveExample: String(body.minimalPositiveExample || ""), counterExample: String(body.counterExample || ""), failureConditions: Array.isArray(body.failureConditions) ? body.failureConditions : [], genreBoundaries: Array.isArray(body.genreBoundaries) ? body.genreBoundaries : [], sourceRecordId: String(body.sourceRecordId || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));

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
      const existing = await readCraftExperiment(projectRoot(project.slug), req.params.experimentId);
      if (!existing || existing.projectSlug !== project.slug) { res.status(404).json({ error: "Craft experiment not found" }); return; }
      const experiment = await startCraftExperiment({ root: projectRoot(project.slug), experimentId: req.params.experimentId, runnerId: typeof req.body?.runnerId === "string" ? req.body.runnerId : "" });
      res.status(200).json({ experiment });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/provider-evaluation", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const existing = await readCraftExperiment(projectRoot(project.slug), req.params.experimentId);
      if (!existing || existing.projectSlug !== project.slug) { res.status(404).json({ error: "Craft experiment not found" }); return; }
      const records = await readModelInvocations(projectRoot(project.slug));
      let evidence = null;
      try { evidence = await readQualityCalibrationEvidence(projectRoot(project.slug)); } catch { evidence = null; }
      const report = evaluateProviderRun({ providerRef: String(req.body?.providerRef || ""), records, qualityEvidence: evidence, maxP95LatencyMs: Number(req.body?.maxP95LatencyMs), maxCost: Number(req.body?.maxCost) });
      const experiment = await attachCraftProviderEvaluation({ root: projectRoot(project.slug), experimentId: req.params.experimentId, report });
      res.status(200).json({ experiment, report });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/reader-calibration", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const existing = await readCraftExperiment(projectRoot(project.slug), req.params.experimentId);
      if (!existing || existing.projectSlug !== project.slug) { res.status(404).json({ error: "Craft experiment not found" }); return; }
      const calibration = calibrateReaderReviewer({ reviewerId: String(req.body?.reviewerId || ""), humanSamples: Number(req.body?.humanSamples), blind: req.body?.blind === true, agreementRate: Number(req.body?.agreementRate) });
      const experiment = await attachCraftReaderCalibration({ root: projectRoot(project.slug), experimentId: req.params.experimentId, calibration });
      res.status(200).json({ experiment, calibration });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/judge", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const existing = await readCraftExperiment(projectRoot(project.slug), req.params.experimentId);
      if (!existing || existing.projectSlug !== project.slug) { res.status(404).json({ error: "Craft experiment not found" }); return; }
      const holdout = req.body?.holdout && typeof req.body.holdout === "object" ? { extractionSceneIds: Array.isArray(req.body.holdout.extractionSceneIds) ? req.body.holdout.extractionSceneIds : [], cases: Array.isArray(req.body.holdout.cases) ? req.body.holdout.cases : [], sourceRefs: Array.isArray(req.body.holdout.sourceRefs) ? req.body.holdout.sourceRefs : [] } : undefined;
      const experiment = await judgeCraftExperiment({ root: projectRoot(project.slug), experimentId: req.params.experimentId, evaluatorId: typeof req.body?.evaluatorId === "string" ? req.body.evaluatorId : "", evaluatorKind: req.body?.evaluatorKind, winner: req.body?.winner, hardGuardsPassed: req.body?.hardGuardsPassed === true, authorReason: typeof req.body?.authorReason === "string" ? req.body.authorReason : "", holdout });
      res.status(200).json({ experiment });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/decision", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const existing = await readCraftExperiment(projectRoot(project.slug), req.params.experimentId);
      if (!existing || existing.projectSlug !== project.slug) { res.status(404).json({ error: "Craft experiment not found" }); return; }
      const decision = req.body?.decision === "adopt" ? "adopt" : req.body?.decision === "reject" ? "reject" : undefined;
      if (!decision) { res.status(400).json({ error: "Unsupported craft experiment decision" }); return; }
      const experiment = await recordCraftExperimentDecision({ root: projectRoot(project.slug), experimentId: req.params.experimentId, actor: typeof req.body?.actor === "string" ? req.body.actor : "", decision, reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ experiment });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/feedback", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const feedback = await recordCraftFeedback({ root: projectRoot(project.slug), projectSlug: project.slug, experimentId: req.params.experimentId, actor: typeof req.body?.actor === "string" ? req.body.actor : "", outcome: req.body?.outcome === "accepted" || req.body?.outcome === "edited" ? req.body.outcome : "rejected", note: typeof req.body?.note === "string" ? req.body.note : "", changedDimensions: Array.isArray(req.body?.changedDimensions) ? req.body.changedDimensions.filter((value: unknown): value is string => typeof value === "string") : [], confounders: Array.isArray(req.body?.confounders) ? req.body.confounders.filter((value: unknown): value is string => typeof value === "string") : [] });
      res.status(201).json({ feedback });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));
  app.get("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/feedback", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ feedback: await listCraftFeedbackEvents(projectRoot(project.slug), project.slug, req.params.experimentId) });
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft-experiments/:experimentId/feedback/attribution", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const feedbackId = typeof req.body?.feedbackId === "string" ? req.body.feedbackId.trim() : "";
      const category = req.body?.category;
      if (!feedbackId || !["content", "structure", "language", "fact", "presentation"].includes(category)) { res.status(400).json({ error: "Craft feedback attribution input invalid" }); return; }
      const scope = req.body?.scope && typeof req.body.scope === "object" ? { chapterId: typeof req.body.scope.chapterId === "string" ? req.body.scope.chapterId : undefined, sceneId: typeof req.body.scope.sceneId === "string" ? req.body.scope.sceneId : undefined } : {};
      const attribution = await createCraftFeedbackAttribution({ root: projectRoot(project.slug), feedbackId, projectSlug: project.slug, pattern: typeof req.body?.pattern === "string" ? req.body.pattern : "", category, scope });
      res.status(201).json({ attribution });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));
  app.post("/api/novel/projects/:projectId/runtime/craft-feedback-attributions/:attributionId/hypothesis", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const attribution = await readFeedbackAttribution(projectRoot(project.slug), req.params.attributionId);
    if (!attribution || attribution.projectSlug !== project.slug) { res.status(404).json({ error: "Craft feedback attribution not found" }); return; }
    const hypothesis = await deriveCraftFeedbackPreference({ root: projectRoot(project.slug), attribution });
    res.status(201).json({ hypothesis });
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
      const experimentId = typeof req.body?.experimentId === "string" ? req.body.experimentId : typeof req.body?.experiment?.experimentId === "string" ? req.body.experiment.experimentId : "";
      const experiment = experimentId ? await readCraftExperiment(projectRoot(project.slug), experimentId) : null;
      if (!experiment || experiment.projectSlug !== project.slug) { res.status(409).json({ error: "CRAFT_EXPERIMENT_NOT_FOUND" }); return; }
      const pattern = await promoteCraftPatternFromExperiment({ root: projectRoot(project.slug), patternId: req.params.patternId, experiment, actor: typeof req.body?.actor === "string" ? req.body.actor : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ pattern });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/craft-patterns/:patternId/validate-from-experiment", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    try {
      const experimentId = typeof req.body?.experimentId === "string" ? req.body.experimentId : typeof req.body?.experiment?.experimentId === "string" ? req.body.experiment.experimentId : "";
      const experiment = experimentId ? await readCraftExperiment(projectRoot(project.slug), experimentId) : null;
      if (!experiment || experiment.projectSlug !== project.slug) { res.status(409).json({ error: "CRAFT_EXPERIMENT_NOT_FOUND" }); return; }
      const pattern = await validateCraftPatternFromExperiment({ root: projectRoot(project.slug), patternId: req.params.patternId, experiment, actor: typeof req.body?.actor === "string" ? req.body.actor : "", reason: typeof req.body?.reason === "string" ? req.body.reason : "" });
      res.status(200).json({ pattern });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/chapters/:chapterId/settlements/:settlementId/derived", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const researchGate = await evaluateResearchPublicationGate(projectRoot(project.slug));
    if (!researchGate.allowed) { res.status(409).json({ error: { code: "RESEARCH_PUBLICATION_GATE_BLOCKED", gate: researchGate } }); return; }
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

  app.post("/api/novel/projects/:projectId/runtime/derived-publications/:transactionId/revalidate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const writes = Array.isArray(req.body?.writes) ? req.body.writes.filter((item: unknown): item is { relativePath: string; content: string } => Boolean(item && typeof item === "object" && typeof (item as { relativePath?: unknown }).relativePath === "string" && typeof (item as { content?: unknown }).content === "string")) : [];
    try {
      const transaction = await revalidateDerivedPublication(projectRoot(project.slug), req.params.transactionId, writes);
      res.status(201).json({ transaction });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/work-graph", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const chapterIds = Array.isArray(req.body?.chapterIds) ? req.body.chapterIds.filter((item: unknown): item is string => typeof item === "string") : project.chapters.map((chapter) => chapter.id);
    res.status(201).json({ graph: await createBookWorkGraph(projectRoot(project.slug), project.slug, chapterIds) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/work-graph/refresh", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
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
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const run = resolveRuntimeRunForControl(project.slug, body);
    if (!run) {
      throw new Error("Runtime run not found");
    }
    assertRuntimeControlFreshness(run.updatedAt, body.expectedRunUpdatedAt);
    if (type === "pause") {
      updateRuntimeRun(run.id, { status: "paused" });
    } else if (type === "stop") {
      updateRuntimeRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString() });
    } else if (type === "resume" || type === "rewrite") {
      updateRuntimeRun(run.id, { status: "queued", error: undefined, finishedAt: undefined });
    } else if (type === "accept") {
      const result = (run.result && typeof run.result === "object" ? run.result : {}) as Record<string, unknown>;
      const settlementId = typeof body.settlementId === "string" && body.settlementId.trim()
        ? body.settlementId.trim()
        : typeof result.settlementId === "string" && result.settlementId.trim()
          ? result.settlementId.trim()
          : "";
      if (!settlementId) throw new Error("RUNTIME_ACCEPT_SETTLEMENT_REQUIRED");
      const settlement = await readChapterSettlement(projectRoot(project.slug), settlementId);
      if (!settlement || settlement.status !== "settled" || settlement.chapterId !== run.chapterId || settlement.projectSlug !== project.slug) {
        throw new Error("RUNTIME_ACCEPT_SETTLEMENT_INVALID");
      }
      const chapterId = run.chapterId;
      if (!chapterId) throw new Error("RUNTIME_ACCEPT_SETTLEMENT_INVALID");
      const finishedAt = new Date().toISOString();
      const existingReceipt = result.draftingExecutionReceipt;
      const receipt = existingReceipt && typeof existingReceipt === "object"
        ? assertDraftingExecutionReceipt(existingReceipt)
        : createDraftingExecutionReceipt({
          projectSlug: project.slug,
          runId: run.id,
          chapterId,
          riskTier: run.input.riskTier === "key" || run.input.riskTier === "elevated" ? run.input.riskTier as DraftingRiskTier : "ordinary",
          candidateCount: typeof result.candidateCount === "number" ? result.candidateCount : 1,
          reviewCount: typeof result.reviewCount === "number" ? result.reviewCount : 1,
          repairCount: typeof result.repairAttempts === "number" ? result.repairAttempts : 0,
          elapsedMs: Math.max(0, Date.parse(finishedAt) - Date.parse(run.createdAt)),
          cost: { status: "unknown" },
          outcome: "accepted",
          createdAt: finishedAt
        });
      updateRuntimeRun(run.id, { result: { ...result, settlementId, draftingExecutionReceipt: receipt }, status: "completed", finishedAt });
      appendRuntimeEvent({ projectSlug: project.slug, runId: run.id, type: "review", message: "Runtime drafting execution receipt recorded", payload: { receiptFingerprint: (receipt as { fingerprint?: string }).fingerprint, policyVersion: (receipt as { policyVersion?: string }).policyVersion, riskTier: (receipt as { riskTier?: string }).riskTier } });
    }
    let directionEvent: ReturnType<typeof receiveRunDirection> | undefined;
    if (type === "direction") {
      const direction = typeof body.direction === "string" ? body.direction : typeof body.prompt === "string" ? body.prompt : "";
      const event = await createSteeringEvent({ root: projectRoot(project.slug), projectSlug: project.slug, runId: run.id, direction, parentRunVersion: Date.parse(run.updatedAt) });
      const phase = body.phase === "model-call" || body.phase === "settled"
        ? body.phase
        : run.status === "running" ? "model-call" : run.status === "completed" ? "settled" : "idle";
      directionEvent = receiveRunDirection({ runId: run.id, workItemId: run.chapterId || run.id, authorText: direction, phase, targetObjectiveVersion: Number.isInteger(body.targetObjectiveVersion) && Number(body.targetObjectiveVersion) > 0 ? Number(body.targetObjectiveVersion) : 1 });
      body = { ...body, steeringEventId: event.eventId };
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
    return { run: getRuntimeRun(run.id), command, ...(directionEvent ? { directionEvent } : {}) };
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

  app.post("/api/novel/projects/:projectId/runtime/notifications/plan", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const body = req.body || {};
    try {
      const events = Array.isArray(body.events) ? body.events.map((event: any) => ({
        eventId: String(event?.eventId || ""),
        kind: event?.kind as NotificationKind,
        title: String(event?.title || ""),
        deepLink: String(event?.deepLink || "")
      })) : [];
      const plan = planRunNotifications({
        quiet: body.quiet === true,
        authorOnline: body.authorOnline === true,
        notificationLevel: body.notificationLevel === "all" ? "all" as NotificationLevel : "high-value" as NotificationLevel,
        maxUnattendedWorkItems: Number(body.maxUnattendedWorkItems),
        unattendedWorkItems: Number(body.unattendedWorkItems),
        events
      });
      const planId = typeof body.planId === "string" && body.planId.trim() ? body.planId.trim() : `notification-${plan.fingerprint.slice(0, 24)}`;
      const persisted = await persistNotificationPlan(projectRoot(project.slug), planId, plan);
      res.status(200).json({ plan: persisted.plan, planId, created: persisted.created });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("NOTIFICATION_")) { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
  }));

  app.get("/api/novel/projects/:projectId/runtime/notifications/plans/:planId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const plan = await readNotificationPlan(projectRoot(project.slug), req.params.planId);
    if (!plan) { res.status(404).json({ error: "Notification plan not found" }); return; }
    res.json({ plan, planId: req.params.planId });
  }));

  app.get("/api/novel/projects/:projectId/runtime/steering-events/:eventId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const event = await readSteeringEvent(projectRoot(project.slug), req.params.eventId);
    if (!event || event.projectSlug !== project.slug) { res.status(404).json({ error: "Steering event not found" }); return; }
    res.json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/steering-events/:eventId/advance", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const current = await readSteeringEvent(projectRoot(project.slug), req.params.eventId);
    if (!current || current.projectSlug !== project.slug) { res.status(404).json({ error: "Steering event not found" }); return; }
    const requested = String(req.body?.status || "");
    const allowed = ["classified", "effective", "queued_for_boundary", "superseded", "rejected_stale"] as const;
    if (!(allowed as readonly string[]).includes(requested)) { res.status(400).json({ error: { code: "STEERING_STATUS_INVALID" } }); return; }
    try {
      const event = await advanceSteeringEvent(projectRoot(project.slug), req.params.eventId, requested as typeof allowed[number], typeof req.body?.reason === "string" ? req.body.reason : undefined);
      res.status(201).json({ event });
    } catch (error) { if (error instanceof Error && error.message.startsWith("STEERING_")) { res.status(409).json({ error: { code: error.message } }); return; } throw error; }
  }));

  app.post("/api/novel/projects/:projectId/runtime/derivatives", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
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
    res.json({ summary, authority: "projection-only", projectionType: "chapter-summary", requiresMemoryClaimVerification: true });
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
    const root = projectRoot(project.slug);
    const report = await readChapterQualityReport(root, req.params.chapterId);
    let evidenceStatus: "missing" | "legacy" | "current" | "stale" = report ? "legacy" : "missing";
    if (report?.evidence) {
      const chapter = project.chapters.find((item) => item.id === req.params.chapterId);
      const content = chapter ? await fs.readFile(resolveInside(root, chapter.contentPath), "utf8").catch(() => "") : "";
      try {
        assertQualityReportCurrent(report, { content, sourceFingerprint: report.evidence.sourceFingerprint });
        evidenceStatus = "current";
      } catch {
        evidenceStatus = "stale";
      }
    }
    res.json({ report, evidenceStatus });
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

  app.post("/api/novel/projects/:projectId/quality/:chapterId/gate", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const root = projectRoot(project.slug);
    const body = req.body || {};
    const chapter = project.chapters.find((item) => item.id === req.params.chapterId);
    const report = body.report || await readChapterQualityReport(root, req.params.chapterId);
    const content = chapter ? await fs.readFile(resolveInside(root, chapter.contentPath), "utf8").catch(() => "") : "";
    if (!chapter || !report || typeof body.sourceFingerprint !== "string") {
      res.status(400).json({ error: "chapter, quality report, and sourceFingerprint are required" });
      return;
    }
    try {
      const decision = evaluateQualityGate({
        projectSlug: project.slug,
        report,
        content,
        sourceFingerprint: body.sourceFingerprint,
        riskTier: body.riskTier === "key" || body.riskTier === "elevated" ? body.riskTier : "ordinary",
        hardGuards: body.hardGuards && typeof body.hardGuards === "object" ? body.hardGuards : {},
        authorObjectiveSupported: body.authorObjectiveSupported === true,
        protectedStrengthsPreserved: body.protectedStrengthsPreserved === true,
        independentEvidenceRequired: body.independentEvidenceRequired === true,
        independentEvidencePassed: body.independentEvidencePassed === true,
        disagreements: Array.isArray(body.disagreements) ? body.disagreements.map(String) : [],
        authorizationRef: typeof body.authorizationRef === "string" ? body.authorizationRef : "",
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [],
        waiver: body.waiver && typeof body.waiver === "object" ? { authorized: body.waiver.authorized === true, reason: typeof body.waiver.reason === "string" ? body.waiver.reason : "" } : undefined
      });
      await persistQualityGateDecision(root, decision);
      res.status(decision.status === "passed" || decision.status === "waived" ? 201 : 422).json({ decision });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/quality/:chapterId/gate/:decisionId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const decision = await readQualityGateDecision(projectRoot(project.slug), req.params.decisionId);
    if (!decision || decision.projectSlug !== project.slug || decision.reportChapterId !== req.params.chapterId) {
      res.status(404).json({ error: "Quality gate decision not found" });
      return;
    }
    res.json({ decision });
  }));

  app.post("/api/novel/projects/:projectId/recaps/accept", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    if (rejectGovernedProjectionMutation(project, res)) return;
    const summary = await acceptWritingRecapPatches(projectRoot(project.slug), req.body.recap || req.body || {});
    res.json({ summary });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/claims", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const body = req.body || {};
    const claim = createMemoryClaim({ claimId: String(body.claimId || ""), proposition: String(body.proposition || ""), epistemicType: body.epistemicType, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [], evidenceAnchors: Array.isArray(body.evidenceAnchors) ? body.evidenceAnchors.map(String) : [], producedBy: body.producedBy, confirmer: typeof body.confirmer === "string" ? body.confirmer : undefined, temporalScope: body.temporalScope || { asOfVersion: "" }, confidence: Number(body.confidence) });
    const event = await persistMemoryClaim(projectRoot(project.slug), claim, "created", "candidate created");
    res.status(201).json({ claim, event });
  }));

  app.get("/api/novel/projects/:projectId/runtime/memory/claims/:claimId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claim = await readMemoryClaim(projectRoot(project.slug), req.params.claimId);
    if (!claim) { res.status(404).json({ error: "Memory claim not found" }); return; }
    res.json({ claim });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/chapter-patches", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const body = req.body || {};
    try {
      const patch = createChapterMemoryPatch({
        patchId: String(body.patchId || ""), chapterId: String(body.chapterId || ""), chapterVersion: String(body.chapterVersion || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs.map(String) : [],
        summary: String(body.summary || ""), keyEvents: Array.isArray(body.keyEvents) ? body.keyEvents : [], newFacts: Array.isArray(body.newFacts) ? body.newFacts : [], characterStates: Array.isArray(body.characterStates) ? body.characterStates : [], emotionLedger: Array.isArray(body.emotionLedger) ? body.emotionLedger : [], foreshadowingActions: Array.isArray(body.foreshadowingActions) ? body.foreshadowingActions : [], continuityRisks: Array.isArray(body.continuityRisks) ? body.continuityRisks : [], growthChanges: Array.isArray(body.growthChanges) ? body.growthChanges : [], noChangeReason: typeof body.noChangeReason === "string" ? body.noChangeReason : undefined
      });
      const persisted = await persistChapterMemoryPatch(projectRoot(project.slug), patch);
      const candidates = await persistMemoryClaimCandidates(projectRoot(project.slug), { projectSlug: project.slug, patch: persisted });
      const adoption = evaluateMemoryPatchAdoption(persisted, { mode: body.adoptionMode === "manual" ? "manual" : "auto", authorConfirmed: body.authorConfirmed === true });
      res.status(201).json({ patch: persisted, candidates, adoption });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/memory/chapter-patches/:patchId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const patch = await readChapterMemoryPatch(projectRoot(project.slug), req.params.patchId);
    if (!patch) { res.status(404).json({ error: "MEMORY_PATCH_NOT_FOUND" }); return; }
    res.json({ patch });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/asset-coverage", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const chapters = Array.isArray(req.body?.chapters) ? req.body.chapters.map((chapter: any) => ({ chapterId: String(chapter?.chapterId || ""), prose: chapter?.prose === true, summary: chapter?.summary === true, qualityReport: chapter?.qualityReport === true, knowledgeIndex: chapter?.knowledgeIndex === true, foreshadowingExtraction: chapter?.foreshadowingExtraction === true })) : [];
    res.json({ coverage: calculateChapterAssetCoverage(chapters) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/mutation-plans", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try {
      const body = req.body || {};
      const plan = createMutationPlan(projectRoot(project.slug), {
        mutationId: String(body.mutationId || ""), idempotencyKey: String(body.idempotencyKey || ""), projectSlug: project.slug, commandType: String(body.commandType || ""), expectedProjectFingerprint: String(body.expectedProjectFingerprint || ""),
        changes: Array.isArray(body.changes) ? body.changes.map((change: any) => ({ relativePath: String(change?.relativePath || ""), assetType: String(change?.assetType || ""), nextContent: String(change?.nextContent || ""), authoritative: change?.authoritative === true })) : [],
        domainEvents: Array.isArray(body.domainEvents) ? body.domainEvents.map(String) : [], projectionUpdates: Array.isArray(body.projectionUpdates) ? body.projectionUpdates.map(String) : [], postCommitJobs: Array.isArray(body.postCommitJobs) ? body.postCommitJobs.map(String) : []
      });
      res.status(201).json({ plan: await persistMutationPlan(projectRoot(project.slug), plan) });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/runtime/mutation-plans/:mutationId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const plan = await readRuntimeMutationPlan(projectRoot(project.slug), req.params.mutationId);
    if (!plan) { res.status(404).json({ error: "MUTATION_PLAN_NOT_FOUND" }); return; }
    res.json({ plan });
  }));

  app.post("/api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/preflight", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const plan = await readRuntimeMutationPlan(projectRoot(project.slug), req.params.mutationId);
    if (!plan) { res.status(404).json({ error: "MUTATION_PLAN_NOT_FOUND" }); return; }
    res.json({ preflight: evaluateMutationPlan(projectRoot(project.slug), plan) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/commit", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try { res.status(201).json({ plan: await commitMutationPlan(projectRoot(project.slug), req.params.mutationId) }); }
    catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/rollback", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try { res.status(201).json({ plan: await rollbackMutationPlan(projectRoot(project.slug), req.params.mutationId) }); }
    catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/mutation-plans/:mutationId/recover", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    try { res.status(201).json({ plan: await recoverMutationPlan(projectRoot(project.slug), req.params.mutationId) }); }
    catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/claim-relations", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const relation = createMemoryClaimRelation({ fromClaimId: String(req.body?.fromClaimId || ""), toClaimId: String(req.body?.toClaimId || ""), relation: req.body?.relation, sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.map(String) : [], validFromVersion: typeof req.body?.validFromVersion === "string" ? req.body.validFromVersion : "" });
    res.status(201).json({ relation: await persistMemoryClaimRelation(projectRoot(project.slug), relation) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/claim-relations/:relationId/revoke", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const event = await persistMemoryClaimRelationRevocation(projectRoot(project.slug), { relationId: req.params.relationId, reason: String(req.body?.reason || ""), sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.map(String) : [] });
    res.status(201).json({ event });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/contradiction-sets", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ sets: buildMemoryContradictionSets(await listMemoryClaims(projectRoot(project.slug)), await listMemoryClaimRelations(projectRoot(project.slug))), authority: "memory-claims-and-relations" });
  }));

  app.post("/api/novel/projects/:projectId/memory/conflict-preflights", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    const claims = await listMemoryClaims(root);
    const relations = await listMemoryClaimRelations(root);
    const freshness = await evaluateMemoryProjectionFreshness(root);
    res.json({ gate: buildMemoryConflictPreflight({ claims, relations, freshness }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/claims/:claimId/temporal", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claim = await readMemoryClaim(projectRoot(project.slug), req.params.claimId);
    if (!claim) { res.status(404).json({ error: "Memory claim not found" }); return; }
    const events = await listStoryTimeEvents(projectRoot(project.slug), project.slug);
    res.json({ temporal: evaluateMemoryClaimTemporal({ claim, targetEvent: String(req.body?.targetEvent || ""), eventOrder: buildStoryTimeEventOrder(events) }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/claims/:claimId/settle", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const claim = await readMemoryClaim(projectRoot(project.slug), req.params.claimId);
    if (!claim) { res.status(404).json({ error: "Memory claim not found" }); return; }
    try {
      const chapterId = claim.sourceRefs.map((ref) => /^(?:chapter-settlement|chapter):\/\/(.+)$/i.exec(ref)?.[1]).find(Boolean);
      const chapterSettlementCompleted = Boolean(chapterId && await hasSettledChapterSettlement(projectRoot(project.slug), project.slug, chapterId));
      const settled = settleMemoryClaim({ claim, chapterSettlementCompleted, confirmer: String(req.body?.confirmer || ""), reason: String(req.body?.reason || "") });
      const event = await persistMemoryClaim(projectRoot(project.slug), settled, "settled", String(req.body?.reason || ""));
      res.status(201).json({ claim: settled, event });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/claims/:claimId/retcon", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    await assertCapabilityWriteAllowed(projectRoot(project.slug), project.slug, "runtime");
    const claim = await readMemoryClaim(projectRoot(project.slug), req.params.claimId);
    if (!claim) { res.status(404).json({ error: "Memory claim not found" }); return; }
    try {
      const result = retconMemoryClaim({ claim, replacementProposition: String(req.body?.replacementProposition || ""), replacementEvidenceAnchors: Array.isArray(req.body?.replacementEvidenceAnchors) ? req.body.replacementEvidenceAnchors.map(String) : [], confirmer: String(req.body?.confirmer || ""), reason: String(req.body?.reason || "") });
      await persistMemoryClaim(projectRoot(project.slug), result.obsolete, "obsoleted", String(req.body?.reason || ""));
      await persistMemoryClaim(projectRoot(project.slug), result.replacement, "created", "retcon replacement candidate");
      const impact = await buildMemoryRetconImpactReport(projectRoot(project.slug), { claimId: result.replacement.claimId, replacementClaimVersion: result.replacement.version, reason: String(req.body?.reason || "") });
      const rebuild = await executeMemoryRetconRebuild(projectRoot(project.slug), project, impact);
      res.status(201).json({ ...result, impact, rebuild });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/entities", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const entity = createMemoryEntityIdentity({ entityId: String(req.body?.entityId || ""), kind: req.body?.kind, canonicalName: String(req.body?.canonicalName || ""), sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.map(String) : [] });
    const persisted = await persistMemoryEntity(projectRoot(project.slug), entity);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.get("/api/novel/projects/:projectId/runtime/memory/entities", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ entities: await listMemoryEntities(projectRoot(project.slug)) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/memory/entities/replay", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ replay: await replayPersistedMemoryEntities(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/entities/merge", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const root = projectRoot(project.slug);
      const current = await listMemoryEntities(root);
      const sourceIds: string[] = Array.isArray(req.body?.sourceEntityIds) ? req.body.sourceEntityIds.map(String) : [];
      const sourceEntities = sourceIds.map((id: string) => current.find((entity) => entity.entityId === id)).filter((entity): entity is typeof current[number] => Boolean(entity));
      if (sourceEntities.length !== sourceIds.length) throw new Error("MEMORY_ENTITY_SOURCE_NOT_FOUND");
      const target = createMemoryEntityIdentity({ entityId: String(req.body?.targetEntityId || ""), kind: req.body?.kind as MemoryEntityKind, canonicalName: String(req.body?.canonicalName || ""), sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.map(String) : [] });
      const result = mergeMemoryEntities({ sourceEntities, targetEntity: target, confirmer: String(req.body?.confirmer || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [], reason: String(req.body?.reason || "") });
      for (const entity of result.entities.filter((item) => item.status === "merged")) await persistMemoryEntity(root, entity, "merged", { replacementEntityIds: [target.entityId], evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [], reason: String(req.body?.reason || "") });
      await persistMemoryEntity(root, target, "created");
      res.status(201).json({ entities: result.entities, replay: await replayPersistedMemoryEntities(root) });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/entities/split", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const root = projectRoot(project.slug);
      const current = await listMemoryEntities(root);
      const source = current.find((entity) => entity.entityId === String(req.body?.sourceEntityId || ""));
      if (!source) throw new Error("MEMORY_ENTITY_SOURCE_NOT_FOUND");
      const replacementEntities: MemoryEntityIdentity[] = (Array.isArray(req.body?.replacementEntities) ? req.body.replacementEntities : []).map((item: Record<string, unknown>) => createMemoryEntityIdentity({ entityId: String(item.entityId || ""), kind: item.kind as MemoryEntityKind, canonicalName: String(item.canonicalName || ""), sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs.map(String) : [] }));
      const evidenceRefs = Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [];
      const reason = String(req.body?.reason || "");
      const result = splitMemoryEntity({ sourceEntity: source, replacementEntities, confirmer: String(req.body?.confirmer || ""), evidenceRefs, reason });
      await persistMemoryEntity(root, result.entities[0], "split", { replacementEntityIds: replacementEntities.map((entity) => entity.entityId), evidenceRefs, reason });
      for (const entity of replacementEntities) await persistMemoryEntity(root, entity, "created");
      res.status(201).json({ entities: result.entities, replay: await replayPersistedMemoryEntities(root) });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/alias-assertions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const assertion = createAliasAssertion({ fromEntityId: String(req.body?.fromEntityId || ""), alias: String(req.body?.alias || ""), relation: req.body?.relation, toEntityId: String(req.body?.toEntityId || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [], knowledgeScope: req.body?.knowledgeScope, validFromEvent: typeof req.body?.validFromEvent === "string" ? req.body.validFromEvent : undefined, validToEvent: typeof req.body?.validToEvent === "string" ? req.body.validToEvent : undefined });
    const persisted = await persistAliasAssertion(projectRoot(project.slug), assertion);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.get("/api/novel/projects/:projectId/runtime/memory/alias-assertions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ assertions: await listAliasAssertions(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/alias-assertions/confirm", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const assertion = confirmAliasAssertion(req.body?.assertion, { confirmer: String(req.body?.confirmer || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [] });
      const persisted = await persistAliasAssertion(projectRoot(project.slug), assertion, "confirmed");
      res.json(persisted);
    }
    catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/alias-resolutions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    res.json({ resolution: resolveMemoryAlias({ entities: await listMemoryEntities(root), assertions: await listAliasAssertions(root), alias: String(req.body?.alias || "") }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/knowledge/characters", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const state = createCharacterKnowledgeState({ characterId: String(req.body?.characterId || ""), claimId: String(req.body?.claimId || ""), state: req.body?.state, evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [], asOfEvent: String(req.body?.asOfEvent || "") });
      await persistCharacterKnowledgeState(projectRoot(project.slug), state);
      res.status(201).json({ state });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/memory/epistemic/characters/:characterId", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claimId = typeof req.query.claimId === "string" ? req.query.claimId : undefined;
    const states = (await listCharacterKnowledgeStates(projectRoot(project.slug))).filter((state) => state.characterId === req.params.characterId && (!claimId || state.claimId === claimId));
    res.json({ characterId: req.params.characterId, claimId: claimId || null, states, authority: "memory-knowledge-events" });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/knowledge/readers", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const state = createMemoryReaderKnowledgeState({ readerScope: String(req.body?.readerScope || ""), claimId: String(req.body?.claimId || ""), state: req.body?.state, publicationVersion: String(req.body?.publicationVersion || ""), progressCursor: String(req.body?.progressCursor || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [] });
      await persistReaderKnowledgeState(projectRoot(project.slug), state);
      res.status(201).json({ state });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.get("/api/novel/projects/:projectId/memory/epistemic/readers/:readerScope", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const claimId = typeof req.query.claimId === "string" ? req.query.claimId : undefined;
    const publicationVersion = typeof req.query.publicationVersion === "string" ? req.query.publicationVersion : undefined;
    const states = (await listReaderKnowledgeStates(projectRoot(project.slug))).filter((state) => state.readerScope === req.params.readerScope && (!claimId || state.claimId === claimId) && (!publicationVersion || state.publicationVersion === publicationVersion));
    res.json({ readerScope: req.params.readerScope, claimId: claimId || null, publicationVersion: publicationVersion || null, states, authority: "memory-knowledge-events" });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/knowledge/characters/eligibility", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ eligibility: evaluateCharacterKnowledge({ states: await listCharacterKnowledgeStates(projectRoot(project.slug)), characterId: String(req.body?.characterId || ""), claimId: String(req.body?.claimId || ""), targetEvent: String(req.body?.targetEvent || ""), eventOrder: req.body?.eventOrder && typeof req.body.eventOrder === "object" ? req.body.eventOrder : {} }) });
  }));

  app.post("/api/novel/projects/:projectId/runtime/memory/knowledge/readers/eligibility", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ eligibility: evaluateReaderKnowledge({ states: await listReaderKnowledgeStates(projectRoot(project.slug)), readerScope: String(req.body?.readerScope || ""), claimId: String(req.body?.claimId || ""), publicationVersion: String(req.body?.publicationVersion || ""), progressCursor: String(req.body?.progressCursor || "") }) });
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

  app.post("/api/novel/projects/:projectId/memory/retrieval-previews", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const body = req.body || {};
    const query = { ...body, query: String(body.query || "") } as KnowledgeSearchQuery;
    const result = await searchKnowledgeIndex(projectRoot(project.slug), project, query);
    const maxResults = Number(body.maxResults ?? body.limit ?? query.limit ?? 10);
    const preview = await persistMemoryRetrievalPreview(projectRoot(project.slug), buildMemoryRetrievalPreview({ projectSlug: project.slug, result, maxResults }));
    res.status(201).json({ preview });
  }));

  app.get("/api/novel/projects/:projectId/memory/retrievals/:retrievalId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const preview = await readMemoryRetrievalPreview(projectRoot(project.slug), req.params.retrievalId);
    if (!preview) { res.status(404).json({ error: "Retrieval preview not found" }); return; }
    res.json({ preview });
  }));

  app.post("/api/novel/projects/:projectId/memory/health-reports", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const chapterIds = project.chapters.map((chapter) => chapter.id);
    const report = await persistMemoryHealthReport(projectRoot(project.slug), await buildMemoryHealthReport(projectRoot(project.slug), { projectSlug: project.slug, chapterIds }));
    res.status(201).json({ report });
  }));

  app.get("/api/novel/projects/:projectId/memory/health-reports/:reportId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await readMemoryHealthReport(projectRoot(project.slug), req.params.reportId);
    if (!report) { res.status(404).json({ error: "Memory health report not found" }); return; }
    res.json({ report });
  }));

  app.post("/api/novel/projects/:projectId/memory/ready-proofs", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const health = await readMemoryHealthReport(root, String(req.body?.healthReportId || ""));
    const preview = await readMemoryRetrievalPreview(root, String(req.body?.retrievalId || ""));
    if (!health || !preview) { res.status(404).json({ error: "Memory health report or retrieval preview not found" }); return; }
    const continuityAuditId = String(req.body?.continuityAuditId || "").trim();
    const continuityAudit = continuityAuditId ? await readLongContinuityAudit(root, continuityAuditId) : undefined;
    if (continuityAuditId && !continuityAudit) { res.status(404).json({ error: "Memory continuity audit not found" }); return; }
    const claims = await listMemoryClaims(root);
    const relations = await listMemoryClaimRelations(root);
    const proof = await persistMemoryReadyProof(root, buildMemoryReadyProof({ projectSlug: project.slug, targetChapterId: String(req.body?.targetChapterId || ""), health, preview, continuityAudit: continuityAudit || undefined, projection: await evaluateMemoryProjectionFreshness(root), contradictionSetIds: buildMemoryContradictionSets(claims, relations).map((set) => set.setId) }));
    res.status(201).json({ proof });
  }));

  app.get("/api/novel/projects/:projectId/memory/ready-proofs/:proofId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const proof = await readMemoryReadyProof(projectRoot(project.slug), req.params.proofId);
    if (!proof) { res.status(404).json({ error: "Memory ready proof not found" }); return; }
    res.json({ proof });
  }));

  app.get("/api/novel/projects/:projectId/memory/entities", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ entities: await listMemoryEntities(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/memory/entity-resolutions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const root = projectRoot(project.slug);
    res.json({ resolution: resolveMemoryAlias({ entities: await listMemoryEntities(root), assertions: await listAliasAssertions(root), alias: String(req.body?.alias || "") }) });
  }));

  app.get("/api/novel/projects/:projectId/memory/alias-assertions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    res.json({ assertions: await listAliasAssertions(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/memory/alias-assertions", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    const assertion = createAliasAssertion({ fromEntityId: String(req.body?.fromEntityId || ""), alias: String(req.body?.alias || ""), relation: req.body?.relation, toEntityId: String(req.body?.toEntityId || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [], knowledgeScope: req.body?.knowledgeScope, validFromEvent: typeof req.body?.validFromEvent === "string" ? req.body.validFromEvent : undefined, validToEvent: typeof req.body?.validToEvent === "string" ? req.body.validToEvent : undefined });
    const persisted = await persistAliasAssertion(projectRoot(project.slug), assertion);
    res.status(persisted.created ? 201 : 200).json(persisted);
  }));

  app.post("/api/novel/projects/:projectId/memory/alias-assertions/:assertionId/confirm", asyncRoute(async (req, res) => {
    const project = await requireProject(req.params.projectId); if (!project) return;
    try {
      const root = projectRoot(project.slug);
      const assertion = (await listAliasAssertions(root)).find((item) => item.assertionId === req.params.assertionId);
      if (!assertion) { res.status(404).json({ error: "Memory alias assertion not found" }); return; }
      const confirmed = confirmAliasAssertion(assertion, { confirmer: String(req.body?.confirmer || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [] });
      res.json(await persistAliasAssertion(root, confirmed, "confirmed"));
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  }));

  app.post("/api/novel/projects/:projectId/memory/continuity-audits", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const health = await readMemoryHealthReport(root, String(req.body?.healthReportId || ""));
    if (!health) { res.status(404).json({ error: "Memory health report not found" }); return; }
    const claims = await listMemoryClaims(root);
    const relations = await listMemoryClaimRelations(root);
    const audit = await persistLongContinuityAudit(root, buildLongContinuityAudit({ projectSlug: project.slug, health, candidateClaims: claims.filter((claim) => claim.status === "candidate").length, contradictionSetIds: buildMemoryContradictionSets(claims, relations).map((set) => set.setId) }));
    res.status(201).json({ audit });
  }));

  app.get("/api/novel/projects/:projectId/memory/continuity-audits/:auditId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const audit = await readLongContinuityAudit(projectRoot(project.slug), req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Long continuity audit not found" }); return; }
    res.json({ audit });
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
    res.json({ entries, authority: "projection-only", projectionType: "ledger", requiresMemoryClaimVerification: true });
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
    if (protectedSessionWritePaths.has(relativePath.replaceAll("\\", "/"))) {
      res.status(403).json({ error: "Protected session authority cannot be edited through file saves" });
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

  app.get("/api/novel/projects/:projectId/tasks/context-manifests/:manifestId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await readTaskContextManifest(projectRoot(project.slug), req.params.manifestId);
    if (!manifest) { res.status(404).json({ error: "Task context manifest not found" }); return; }
    res.json({ manifest });
  }));

  app.get("/api/novel/projects/:projectId/tasks/context-manifests/:manifestId/freshness", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const manifest = await readTaskContextManifest(projectRoot(project.slug), req.params.manifestId);
    if (!manifest) { res.status(404).json({ error: "Task context manifest not found" }); return; }
    res.json({ freshness: await evaluateTaskContextManifestFreshness(projectRoot(project.slug), manifest) });
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
    const obligations = await listNarrativeObligations(projectRoot(project.slug));
    res.json({ obligations: obligations.filter((obligation) => obligation.projectSlug === project.slug) });
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

  app.post("/api/novel/projects/:projectId/obligation-candidates/:candidateId/adopt", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const candidates = await buildNarrativeObligationCandidates(projectRoot(project.slug), project.chapters.map((chapter) => chapter.id));
    const candidate = candidates.find((item) => item.candidateId === req.params.candidateId);
    if (!candidate) { res.status(404).json({ error: "Obligation candidate not found" }); return; }
    try {
      const result = await adoptNarrativeObligationCandidate(projectRoot(project.slug), { projectSlug: project.slug, candidate, type: req.body?.type, title: String(req.body?.title || ""), questionOrPromise: String(req.body?.questionOrPromise || ""), importance: req.body?.importance, authorizationId: String(req.body?.authorizationId || ""), expectedCandidateFingerprint: String(req.body?.expectedCandidateFingerprint || ""), evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs.map(String) : [] });
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("OBLIGATION_CANDIDATE_")) { res.status(409).json({ error: { code: error.message } }); return; }
      throw error;
    }
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
      const decisionConsumptionReceiptRef = typeof req.body?.decisionConsumptionReceiptRef === "string" ? req.body.decisionConsumptionReceiptRef.trim() : "";
      if (decisionConsumptionReceiptRef) {
        const receipt = await readDecisionConsumptionReceipt(projectRoot(project.slug), decisionConsumptionReceiptRef);
        if (!receipt || receipt.projectSlug !== project.slug || receipt.consumer !== "obligation") throw new Error("OBLIGATION_DECISION_RECEIPT_INVALID");
      }
      const obligation = await createNarrativeObligation(projectRoot(project.slug), {
        projectSlug: project.slug,
        type: req.body?.type as ObligationType,
        title: typeof req.body?.title === "string" ? req.body.title : "",
        questionOrPromise: typeof req.body?.questionOrPromise === "string" ? req.body.questionOrPromise : "",
        importance: req.body?.importance,
        sourceRefs: Array.isArray(req.body?.sourceRefs) ? req.body.sourceRefs.filter((value: unknown): value is string => typeof value === "string") : [],
        entityRefs: Array.isArray(req.body?.entityRefs) ? req.body.entityRefs.filter((value: unknown): value is string => typeof value === "string") : [],
        ...(decisionConsumptionReceiptRef ? { decisionConsumptionReceiptRef } : {})
      });
      res.status(201).json({ obligation });
    } catch (error) {
      res.status(400).json({ error: { code: error instanceof Error ? error.message : "OBLIGATION_INVALID" } });
    }
  }));

  app.get("/api/novel/projects/:projectId/obligations/:obligationId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const obligation = await readNarrativeObligation(projectRoot(project.slug), req.params.obligationId);
    if (!obligation || obligation.projectSlug !== project.slug) { res.status(404).json({ error: "Obligation not found" }); return; }
    res.json({ obligation });
  }));

  app.put("/api/novel/projects/:projectId/obligations/:obligationId", asyncRoute(async (_req, res) => {
    res.status(409).json({ error: { code: "OBLIGATION_DOMAIN_COMMAND_REQUIRED", detail: "整表 PUT 不得覆盖义务投影；请使用带 expectedVersion、具体领域命令与 payoff/豁免证据的事件接口。" } });
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

  app.get("/api/novel/projects/:projectId/backups/:backupId/verification", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const verification = await readBackupVerification(projectRoot(project.slug), req.params.backupId);
    if (!verification) { res.status(404).json({ error: "Backup verification not found" }); return; }
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

  app.post("/api/novel/projects/:projectId/runtime/negative-preferences", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(await createNegativePreference({ root: projectRoot(project.slug), projectSlug: project.slug, preferenceId: String(body.preferenceId || ""), scope: String(body.scope || ""), rejectedPattern: String(body.rejectedPattern || ""), rationale: String(body.rationale || ""), confidence: Number(body.confidence), triggerConditions: Array.isArray(body.triggerConditions) ? body.triggerConditions : [], counterexamples: Array.isArray(body.counterexamples) ? body.counterexamples : [], rejectedMechanism: typeof body.rejectedMechanism === "string" ? body.rejectedMechanism : undefined, exceptions: Array.isArray(body.exceptions) ? body.exceptions : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/negative-preferences/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateNegativePreferenceSuggestion(body.preference, { proposedPattern: String(body.proposedPattern || ""), proposedMechanism: typeof body.proposedMechanism === "string" ? body.proposedMechanism : undefined, newScene: String(body.newScene || ""), differenceExplanation: String(body.differenceExplanation || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/source-lineage", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(createSourceLineage({ sourceId: String(body.sourceId || ""), projectSlug: project.slug, accessClass: body.accessClass, derivedPatternIds: Array.isArray(body.derivedPatternIds) ? body.derivedPatternIds : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/source-lineage/revoke", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(revokeSourceLineage(body.lineage, { mode: body.mode, actor: String(body.actor || ""), reason: String(body.reason || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-pattern-publication-gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluatePatternPublication({ patternId: String(body.patternId || ""), sourceEligibility: body.sourceEligibility, abstractMechanism: body.abstractMechanism === true, containsPrivateExpression: body.containsPrivateExpression === true, canReconstructOriginal: body.canReconstructOriginal === true, sourceRegistered: body.sourceRegistered === true, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/untrusted-samples/isolate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(isolateUntrustedSample({ sampleId: String(body.sampleId || ""), sourceId: String(body.sourceId || ""), content: String(body.content || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], legacy: body.legacy === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-mechanism-units", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftMechanismUnit({ unitId: String(body.unitId || ""), triggerCondition: String(body.triggerCondition || ""), characterGoal: String(body.characterGoal || ""), narrativeFunction: String(body.narrativeFunction || ""), readerExpectation: String(body.readerExpectation || ""), actionChange: String(body.actionChange || ""), informationChange: String(body.informationChange || ""), cost: String(body.cost || ""), applicableScenes: Array.isArray(body.applicableScenes) ? body.applicableScenes : [], failureModes: Array.isArray(body.failureModes) ? body.failureModes : [], evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/surface-mechanism-patterns", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createSeparatedPattern({ patternId: String(body.patternId || ""), projectSlug: project.slug, surface: body.surface, mechanism: body.mechanism, abstractionProof: String(body.abstractionProof || ""), antiImitationPassed: body.antiImitationPassed === true, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/surface-mechanism-patterns/transfer-gate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateCrossProjectTransfer({ ...body.pattern, targetProjectSlug: String(body.targetProjectSlug || ""), reuseSurface: body.reuseSurface === true, identifiableSourceCombination: body.identifiableSourceCombination === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-effect-evidence", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftEffectEvidence({ patternId: String(body.patternId || ""), readerProblem: String(body.readerProblem || ""), context: String(body.context || ""), prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites : [], cost: String(body.cost || ""), failureChapters: Array.isArray(body.failureChapters) ? body.failureChapters : [], evidence: body.evidence || { proseAnchors: [], comparisonSamples: [], authorJudgment: "" }, modelClaim: String(body.modelClaim || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-boundaries", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftBoundary({ patternId: String(body.patternId || ""), genres: Array.isArray(body.genres) ? body.genres : [], chapterFunctions: Array.isArray(body.chapterFunctions) ? body.chapterFunctions : [], narrativeDistances: Array.isArray(body.narrativeDistances) ? body.narrativeDistances : [], characterStages: Array.isArray(body.characterStages) ? body.characterStages : [], targetReaders: Array.isArray(body.targetReaders) ? body.targetReaders : [], forbiddenConditions: Array.isArray(body.forbiddenConditions) ? body.forbiddenConditions : [], counterexamples: Array.isArray(body.counterexamples) ? body.counterexamples : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-boundaries/evaluate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(evaluateCraftBoundaryMatch(body.boundary, body.context)); }));
  app.post("/api/novel/projects/:projectId/runtime/abstraction-transfer", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(compileAbstractTransfer({ patternId: String(body.patternId || ""), sourceProject: body.sourceProject, targetStory: body.targetStory, mechanism: String(body.mechanism || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/anti-imitation-guard", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(runAntiImitationGuard({ authorizedSourceIds: Array.isArray(body.authorizedSourceIds) ? body.authorizedSourceIds : [], sourceEntities: Array.isArray(body.sourceEntities) ? body.sourceEntities : [], distinctiveImagery: Array.isArray(body.distinctiveImagery) ? body.distinctiveImagery : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [], beforeContext: Array.isArray(body.beforeContext) ? body.beforeContext : [], generatedText: String(body.generatedText || ""), generatedNgrams: Array.isArray(body.generatedNgrams) ? body.generatedNgrams : [], generatedSemanticNeighbors: Array.isArray(body.generatedSemanticNeighbors) ? body.generatedSemanticNeighbors : [], sourceStructuralSignature: body.sourceStructuralSignature, generatedStructuralSignature: body.generatedStructuralSignature, bypassRequested: body.bypassRequested === true })); }));
  app.post("/api/novel/projects/:projectId/runtime/task-pattern-retrieval", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(buildTaskPatternRetrieval({ projectSlug: project.slug, sceneFunction: String(body.sceneFunction || ""), targetGap: String(body.targetGap || ""), genreProfile: String(body.genreProfile || ""), authorPreferences: Array.isArray(body.authorPreferences) ? body.authorPreferences : [], sourceEligibility: body.sourceEligibility, applicablePatternIds: Array.isArray(body.applicablePatternIds) ? body.applicablePatternIds : [], sourceFamilies: Array.isArray(body.sourceFamilies) ? body.sourceFamilies : [], evidenceSnapshots: Array.isArray(body.evidenceSnapshots) ? body.evidenceSnapshots : [], budget: body.budget || { maxPatterns: 0, timeWindowMs: 0 }, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-context-budget", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(buildCraftContextBudget({ taskId: String(body.taskId || ""), requiredFunctions: Array.isArray(body.requiredFunctions) ? body.requiredFunctions : [], tokenBudget: Number(body.tokenBudget || 0), items: Array.isArray(body.items) ? body.items : [], forbiddenItems: Array.isArray(body.forbiddenItems) ? body.forbiddenItems : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-conflicts/resolve", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(resolveCraftConflicts({ taskId: String(body.taskId || ""), sceneId: String(body.sceneId || ""), rules: Array.isArray(body.rules) ? body.rules : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-holdout/validate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(validateCraftHoldout({ experimentId: String(body.experimentId || ""), extractionSceneIds: Array.isArray(body.extractionSceneIds) ? body.extractionSceneIds : [], cases: Array.isArray(body.cases) ? body.cases : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-attributions", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftAttribution({ candidateId: String(body.candidateId || ""), patternId: String(body.patternId || ""), projectSlug: project.slug, authorId: String(body.authorId || ""), judgment: body.judgment, scope: String(body.scope || ""), rationale: String(body.rationale || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-attributions/:attributionId/events", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(transitionCraftAttribution(body.record, { target: body.target, actor: String(body.actor || ""), reason: String(body.reason || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-provenance", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(createCraftProvenanceBundle({ candidateId: String(body.candidateId || ""), patternId: String(body.patternId || ""), sceneId: String(body.sceneId || ""), sources: Array.isArray(body.sources) ? body.sources : [], transformations: Array.isArray(body.transformations) ? body.transformations : [], evaluationRefs: Array.isArray(body.evaluationRefs) ? body.evaluationRefs : [], adoptionChangeSetRefs: Array.isArray(body.adoptionChangeSetRefs) ? body.adoptionChangeSetRefs : [], proseVersionRefs: Array.isArray(body.proseVersionRefs) ? body.proseVersionRefs : [], qualityReportRefs: Array.isArray(body.qualityReportRefs) ? body.qualityReportRefs : [], releaseSnapshotRefs: Array.isArray(body.releaseSnapshotRefs) ? body.releaseSnapshotRefs : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-provenance/project", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json(projectCraftProvenance(req.body?.bundle, req.body?.audience === "author-audit" ? "author-audit" : "reader")); }));
  app.post("/api/novel/projects/:projectId/runtime/craft-revocation/propagate", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; try { const propagation = propagateCraftSourceRevocation({ sourceId: String(body.sourceId || ""), eventId: String(body.eventId || ""), reason: String(body.reason || ""), evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [], sourceFingerprint: String(body.sourceFingerprint || ""), artifacts: Array.isArray(body.artifacts) ? body.artifacts : [], sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] }); const record = await persistCraftRevocationRecord(projectRoot(project.slug), { projectSlug: project.slug, propagation }); res.status(201).json({ propagation, record }); } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); } }));
  app.get("/api/novel/projects/:projectId/runtime/craft-revocation/:eventId", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const record = await readCraftRevocationRecord(projectRoot(project.slug), req.params.eventId); if (!record || record.projectSlug !== project.slug) { res.status(404).json({ error: "Craft revocation record not found" }); return; } res.json({ record, propagation: record.propagation }); }));
  app.post("/api/novel/projects/:projectId/runtime/character-identities", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.status(201).json(registerCharacterIdentity({ projectSlug: project.slug, entityId: String(body.entityId || ""), displayName: String(body.displayName || ""), aliases: Array.isArray(body.aliases) ? body.aliases : [], narrativeIdentity: String(body.narrativeIdentity || ""), sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-identities/admit", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; res.json(admitCharacterToCast(req.body?.identity)); }));
  app.post("/api/novel/projects/:projectId/runtime/character-documents/classify", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(classifyCharacterDocument({ path: String(body.path || ""), title: String(body.title || ""), category: body.category, sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [] })); }));
  app.post("/api/novel/projects/:projectId/runtime/character-truth/resolve", asyncRoute(async (req, res) => { const project = await requireProject(req.params.projectId); if (!project) return; const body = req.body || {}; res.json(resolveCharacterFieldTruth(String(body.field || ""), Array.isArray(body.assertions) ? body.assertions : [])); }));
  return app;
}
