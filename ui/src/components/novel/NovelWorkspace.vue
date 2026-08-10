<template>
  <div class="novel-workspace" :class="{ 'is-project-workspace': isProjectRoute }">
    <header class="workspace-header" :class="{ 'is-workspace-shell': isProjectRoute }">
      <div>
        <h1>创作生产平台</h1>
        <p>从小说项目开始，逐步扩展到素材、剧本、图片和视频生成管理。</p>
      </div>
      <div class="header-actions">
        <el-tooltip :content="themeStore.isDark ? '切换白色主题' : '切换黑暗主题'" placement="bottom">
          <el-button circle aria-label="切换主题" @click="themeStore.toggleTheme">
            <el-icon>
              <Sunny v-if="themeStore.isDark" />
              <Moon v-else />
            </el-icon>
          </el-button>
        </el-tooltip>
        <el-button @click="openAiConfigDialog">
          <el-icon><Setting /></el-icon>
          AI 配置
        </el-button>
        <el-button v-if="isProjectRoute && store.hasProject" @click="openStoryControlDialog">
          <el-icon><Collection /></el-icon>
          故事总控
        </el-button>
        <el-button v-if="isProjectRoute" @click="goProjectHub">
          <el-icon><Folder /></el-icon>
          项目大厅
        </el-button>
        <el-button :loading="store.isLoading" @click="store.loadProjects">
          <el-icon><Refresh /></el-icon>
          刷新项目
        </el-button>
      </div>
    </header>

    <nav v-if="store.openWorkspaceProjects.length" class="workspace-tabs" aria-label="已打开工作台">
      <button
        v-for="project in store.openWorkspaceProjects"
        :key="project.slug"
        class="workspace-tab"
        :class="{ active: store.currentProject?.slug === project.slug }"
        type="button"
        @click="goWorkspace(project.slug)"
      >
        <span>{{ project.title }}</span>
        <el-button circle size="small" aria-label="关闭工作台" @click.stop="closeWorkspace(project.slug)">
          <el-icon><Close /></el-icon>
        </el-button>
      </button>
    </nav>

    <main v-if="!isProjectRoute" class="project-hub">
      <section class="hub-copy" aria-labelledby="hub-title">
        <p class="eyebrow">创作生产平台</p>
        <h2 id="hub-title">先选项目，再进入工作台</h2>
        <p>最小可用版本先把小说创作跑通；项目结构已经为素材、剧本、图片生成和视频生成预留模块。</p>
        <div class="module-strip" aria-label="平台模块">
          <span>小说创作</span>
          <span>素材管理</span>
          <span>剧本生产</span>
          <span>图片生成</span>
          <span>视频生成</span>
        </div>
      </section>

      <QuickStartGuidePanel variant="hub" @start-create="scrollToCreatePanel" @use-example="applyStarterIdea" />

      <div class="hub-grid">
        <ProjectManagerPanel
          :projects="store.projects"
          :current-project="store.currentProject"
          :loading="store.isLoading"
          @refresh="store.loadProjects"
          @open="goWorkspace($event.slug)"
          @delete-project="confirmDeleteProject"
          @import-project="importProjectAndOpen"
        />
        <ProjectCreatePanel :starter-idea="starterIdea" @created="goWorkspace($event.slug)" />
        <PlatformLibraryPanel
          :library="store.platformLibrary"
          :loading="store.isLoading"
          @refresh="store.loadPlatformLibrary"
          @create-asset="store.createSharedAsset"
          @link-asset="store.linkSharedAsset"
        />
      </div>
    </main>

    <main v-else-if="store.hasProject" class="workspace-grid" :class="`mode-${store.writingMode}`">
      <aside v-if="store.writingMode !== 'focus'" class="left-rail">
        <CollapsiblePanel
          v-if="store.currentProject"
          title="章节导航"
          :subtitle="`${store.currentProject.chapters.length} 章`"
          :collapsed="panelCollapsed('chapter-tree')"
          @update:collapsed="setPanelCollapsed('chapter-tree', $event)"
        >
          <ChapterTree
            :project="store.currentProject"
            :active-chapter-id="store.currentChapter?.id"
            @open="store.openChapter"
          />
        </CollapsiblePanel>
      </aside>

      <section class="center-stage">
        <CreativeSessionPanel
          :session="store.creativeSession"
          :journey="store.creativeJourney"
          :question="store.activeDialogueQuestion"
          :question-loading="store.isLoadingDialogueQuestions"
          :question-error="store.dialogueQuestionsError"
          :preview="store.understandingPreview"
          :context-manifest="store.contextManifest"
          :freezing="store.isFreezingContextManifest"
          :advancing="store.isAdvancingAuthorJourney"
          :loading="store.isLoadingCreativeSession"
          :submitting="store.isSubmittingCreativeMessage"
          :error="store.creativeSessionError"
          :contract-error="store.contractCandidatesError"
          @submit="store.captureAuthorMessage"
          @freeze="store.freezeCurrentContextManifest"
          @primary-action="store.executeCreativeJourneyAction"
          @prepare-question="store.prepareUnderstandingQuestion"
          @answer="store.answerDialogueQuestion"
          @retry-question="store.loadDialogueQuestions"
          @retry-contract="store.retryContractCandidateCompilation"
        />
        <StoryBlueprintPanel
          :blueprint="store.activeStoryBlueprint || null"
          :confirmed="store.creativeJourney?.stage === 'ready-for-outline'"
          :busy="store.isAdvancingAuthorJourney"
          :error="store.authorJourneyError"
          :load-error="store.storyBlueprintLoadError"
          :loading="store.isLoadingStoryBlueprint"
          @revise="store.reviseStoryBlueprint"
          @regenerate="store.regenerateStoryBlueprint"
          @confirm="store.confirmStoryBlueprint"
          @start-outline="store.executeCreativeJourneyAction('generate-outline')"
          @reload="store.loadLatestStoryBlueprint"
        />
        <ContractCandidatePanel
          v-if="store.creativeJourney?.stage === 'ready-for-outline' || store.contractCandidates.length"
          :candidates="store.contractCandidates || []"
          :outline-source-candidate-id="store.activeStoryBlueprint?.sourceContractCandidateId || ''"
          :outline-loading="store.isLoadingStoryBlueprint || Boolean(store.storyBlueprintLoadError)"
          :loading="store.isLoadingContractCandidates || false"
          :error="store.contractCandidatesError || ''"
          :adoption-loading="store.isCreatingContractAdoptionProposal || false"
          :adoption-error="store.contractAdoptionError || ''"
          :proposal="store.contractAdoptionProposal"
          @refresh="store.loadContractCandidates?.()"
          @compile-outline="store.compileOutlineCandidate?.($event.sourceCandidateId)"
          @adopt="store.createContractAdoptionProposal?.($event)"
          @commit="store.commitContractAdoption?.($event)"
        />
        <OutlineCandidatePanel
          v-if="store.outlineCandidates.length || store.isLoadingOutlineCandidates"
          :candidates="store.outlineCandidates || []"
          :reports="store.outlineValidationReports || {}"
          :loading="store.isLoadingOutlineCandidates || false"
          :validating-id="store.validatingOutlineId || ''"
          :error="store.outlineCandidatesError || ''"
          :proposal="store.outlineAdoptionProposal"
          :adoption-loading="store.isAdoptingOutline || false"
          :adoption-error="store.outlineAdoptionError || ''"
          :adopted-contract-candidate-id="store.contractAdoptionProposal?.status === 'committed' && store.contractAdoptionProposal?.canonWritten === true ? store.contractAdoptionProposal.candidateId : ''"
          @refresh="store.loadOutlineCandidates?.()"
          @validate="store.validateOutlineCandidate?.($event)"
          @select-chapters="store.setOutlineChapterSelection?.($event)"
          @create-proposal="store.createOutlineAdoptionProposal?.($event)"
          @authorize="store.authorizeOutlineAdoption?.($event)"
          @commit="store.commitOutlineAdoption?.($event)"
        />
        <CollapsiblePanel
          title="创作规划与全书治理"
          subtitle="按需加载"
          :collapsed="!workspaceGovernanceOpen"
          @update:collapsed="setWorkspaceGovernanceOpen"
        >
          <div v-if="workspaceGovernanceOpen" class="workspace-governance-stack">
        <LearningGovernancePanel
          :policy="store.learningPolicy || null"
          :budgets="store.explorationBudgets || {}"
          :loading="store.isLoading || false"
          @refresh="handleLearningGovernanceRefresh"
          @pause="handlePauseExplorationBudget"
        />
        <CraftPatternPanel
          :patterns="store.craftPatterns || []"
          :experiments="store.craftExperiments || {}"
          @validate="handleValidateCraftPattern"
          @promote="handlePromoteCraftPattern"
          @refresh="handleCraftGovernanceRefresh"
        />
        <CharacterContractPanel
          :contracts="store.characterContracts || []"
          @refresh="handleCharacterContractsRefresh"
          @confirm="handleCharacterContractConfirm"
        />
        <ExecutionReadinessPanel
          :proof="store.executionReadyProof || null"
          :readiness="store.executionReadiness || null"
          :work-items="store.executionWorkItems || []"
          :chapter-id="store.currentChapter?.id || ''"
          :loading="store.isLoadingExecutionReadiness || false"
          :error="store.executionReadinessError || ''"
          @refresh-proof="store.loadExecutionReadyProof?.()"
          @check-readiness="store.checkExecutionReadiness?.($event)"
          @start-production="store.startChapterProduction?.($event)"
        />
        <BookRunPanel
          :run="store.activeBookRun"
          :loading="store.isLoadingBookRun"
          :error="store.bookRunError"
          @start="store.startBookRun"
          @advance="store.advanceActiveBookRun"
          @completion-audit="store.runActiveBookCompletionAudit"
        />
        <LengthPlanningPanel
          :contract="store.lengthContract || null"
          :forecast="store.lengthForecast || null"
          :decision="store.lengthVarianceDecision || null"
          :loading="store.isLoadingLengthPlanning || false"
          :error="store.lengthPlanningError || ''"
          @refresh="store.loadLengthPlanning?.()"
          @decide="store.decideProjectLengthVariance?.()"
        />
        <ProseCandidatePanel
          :candidates="store.proseCandidates || []"
          :loading="store.isLoadingProseCandidates || false"
          :validations="store.proseValidations || {}"
       :reviews="store.proseReviews || {}"
          :repair-plans="store.proseRepairPlans || {}"
          :repair-candidates="store.proseRepairCandidates || {}"
          :repair-regressions="store.proseRepairRegressions || {}"
         :readiness="store.proseAdoptionReadiness || {}"
         :adoptions="store.proseAdoptions || {}"
          :busy-id="store.proseCandidateBusyId || ''"
          @refresh="store.loadProseCandidates?.()"
          @validate="store.validateProseCandidate?.($event)"
       @review="store.reviewProseCandidate?.($event)"
          @repair="store.createProseRepairPlan?.($event)"
          @create-repair-candidate="handleProseRepairCandidate"
          @evaluate-repair="store.evaluateProseRepairRegression?.($event)"
         @readiness="store.loadProseAdoptionReadiness?.($event)"
         @adopt="handleProseAdopt"
         @settle="handleProseSettle"
        />
        <QualityCalibrationPanel
          :evidence="store.qualityCalibrationEvidence || null"
          :history="store.qualityCalibrationHistory || []"
          :loading="store.isLoadingQualityCalibration || false"
          :error="store.qualityCalibrationError || ''"
          @refresh="store.loadQualityCalibrationEvidence?.()"
          @submit="store.submitQualityCalibrationEvidence?.($event)"
        />
        <ReleaseAcceptancePanel
          :decision="store.releaseAcceptanceDecision || null"
          :activation="store.releaseActivation || null"
          :loading="store.isLoadingReleaseAcceptance || false"
          :activating="store.isActivatingRelease || false"
          :activation-error="store.releaseActivationError || ''"
          @refresh="store.loadReleaseAcceptance?.()"
          @activate="store.activateAcceptedRelease?.()"
        />
        <PublicationEvidencePanel
          :manifest="store.publicationEdition"
          :tree="store.publicationTree"
          :artifacts="store.publicationArtifacts"
          :proof="store.deliveryProofVerification"
          :delivery-proof="store.deliveryProof"
          :preflight="store.publicationPreflight"
          :loading="store.isLoadingPublicationEvidence"
          :error="store.publicationEvidenceError"
          @load="store.loadPublicationEvidence"
          @create="store.createPublicationEdition"
          @compile-tree="store.compilePublicationEditionTree"
          @render-artifacts="store.renderPublicationEditionArtifacts"
          @issue-proof="store.issuePublicationDeliveryProof"
        />
        <IndependentReviewPanel
          :review="store.understandingReview || null"
          :loading="store.isLoadingUnderstandingReview || false"
          @refresh="store.loadUnderstandingReview?.()"
          @submit="store.submitExternalUnderstandingReview?.($event)"
        />
        <MigrationCutoverPanel
          :report="store.migrationCutoverReport || null"
          :loading="store.isLoadingMigrationCutover || false"
          @validate="store.validateAllProjectMigrations?.()"
        />
          </div>
        </CollapsiblePanel>
        <div class="autopilot-zone">
          <div class="autopilot-toolbar">
            <WritingModeSwitcher :mode="store.writingMode" @update:mode="store.setWritingMode" />
            <SavePipelinePanel
              :auto-run="store.autoRunSavePipeline"
              :steps="store.savePipelineSteps"
              :is-running="store.isRunningSavePipeline"
              @update:auto-run="store.setAutoRunSavePipeline"
              @run="store.runPostSavePipelineFromCurrentContent"
            />
          </div>
          <CollapsiblePanel
            title="自动驾驶运行时"
            :subtitle="
              store.activeRuntimeRun
                ? `${statusLabel(store.activeRuntimeRun.status)} · ${store.activeRuntimeChapterLabel || store.activeRuntimeRun.chapterId || '未选择章节'}`
                : '未启动'
            "
            hide-toggle-test-hook
            :collapsed="panelCollapsed('runtime-autopilot', store.writingMode !== 'focus')"
            @update:collapsed="setPanelCollapsed('runtime-autopilot', $event)"
          >
            <AutopilotRuntimePanel
              :active-run="store.activeRuntimeRun"
              :active-chapter-label="store.activeRuntimeChapterLabel"
              :events="store.runtimeEvents"
              :checkpoints="store.runtimeCheckpoints"
              :branches="store.runtimeBranches"
              :latest-snapshot="store.latestRuntimeNarrativeSnapshot"
              :knowledge-refs="store.runtimeKnowledgeRefs"
              :worker="store.runtimeWorkerHealth"
              :event-connected="store.isRuntimeEventsConnected"
              :starting="store.isStartingRuntime"
              @start="store.startAutopilotRuntime"
              @pause="store.pauseAutopilotRuntime"
              @resume="store.resumeAutopilotRuntime"
              @stop="store.stopAutopilotRuntime"
              @accept="store.acceptAutopilotReview"
              @rewrite="store.rewriteAutopilotReview"
              @direction="store.sendAutopilotDirection"
              @derivative="store.createAutopilotDerivative"
              @merge-derivative="store.mergeAutopilotDerivative"
              @restore="store.restoreAutopilotCheckpoint"
              @refresh="store.loadRuntimeStatus"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            title="自动驾驶状态"
            class="autopilot-loop-panel"
            :collapsed="panelCollapsed('autopilot-loop', true)"
            @update:collapsed="setPanelCollapsed('autopilot-loop', $event)"
          >
            <CreationLoopPanel
              :steps="store.creationLoopSteps"
              :next-actions="store.nextWorkbenchActions"
              :risk-signals="store.workbenchRiskSignals"
              :runtime-snapshot="store.currentRuntimeSnapshot"
              :loading="store.isLoading || store.isSavingContent"
              @action="handleCreationLoopAction"
              @command="handleWorkbenchCommand"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.plotPilotLearningItems.length"
            title="机制学习"
            :subtitle="`${store.plotPilotLearningItems.length} 项`"
            :collapsed="panelCollapsed('plotpilot-learning', true)"
            @update:collapsed="setPanelCollapsed('plotpilot-learning', $event)"
          >
            <PlotPilotLearningPanel
              :items="store.plotPilotLearningItems"
              :experiments="Object.values(store.craftExperiments || {})"
              @action="handleCreationLoopAction"
              @command="handleWorkbenchCommand"
            />
          </CollapsiblePanel>
        </div>
        <div class="workspace-assist-stack">
          <CollapsiblePanel
            title="快速指引"
            :collapsed="panelCollapsed('quick-start', hasWorkspaceDraft || hasWorkspaceStructure)"
            @update:collapsed="setPanelCollapsed('quick-start', $event)"
          >
            <QuickStartGuidePanel
              variant="workspace"
              :mode="store.writingMode"
              :has-structure="hasWorkspaceStructure"
              :has-draft="hasWorkspaceDraft"
              @open-mode="store.setWritingMode"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.writingMode === 'focus'"
            title="专注写作"
            :collapsed="panelCollapsed('focus-writing')"
            @update:collapsed="setPanelCollapsed('focus-writing', $event)"
          >
            <FocusWritingPanel
              :guide="store.focusWritingGuide"
              :instruction="store.focusDraftInstruction"
              :can-generate="store.canRequestFocusDraft"
              :is-generating="store.isLoading"
              @update-target="store.updateFocusTargetWords"
              @update-instruction="store.updateFocusDraftInstruction"
              @generate-draft="store.requestFocusDraft"
              @open-structure="store.setWritingMode('structure')"
              @open-review="store.setWritingMode('review')"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.writingMode === 'focus' && store.rewriteCandidate"
            title="候选改写"
            :collapsed="panelCollapsed('focus-rewrite')"
            @update:collapsed="setPanelCollapsed('focus-rewrite', $event)"
          >
            <RewriteComparison
              :result="store.rewriteCandidate"
              original-text="当前章节末尾"
              empty-original-text="AI 会把建议稿追加到当前正文末尾。"
              accept-label="追加到正文"
              :can-accept="Boolean(store.rewriteCandidate?.content)"
              :can-tune="store.canRequestFocusDraft"
              :tune-options="focusDraftTuneOptions"
              @accept="store.acceptFocusDraft"
              @reject="store.rejectRewrite"
              @tune="store.requestFocusDraftRevision"
              @apply-patches="store.applyTaskPatches"
              @request="store.requestFocusDraft"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.writingMode === 'focus' && store.recapCandidate"
            title="写作回顾"
            :collapsed="panelCollapsed('focus-recap')"
            @update:collapsed="setPanelCollapsed('focus-recap', $event)"
          >
            <WritingRecapPanel
              :candidate="store.recapCandidate"
              :can-request="Boolean(store.currentChapter && store.currentContent.trim())"
              :loading="store.isLoading"
              @accept="store.acceptWritingRecap"
              @reject="store.rejectWritingRecap"
              @request="store.requestWritingRecap"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.writingMode === 'structure'"
            title="结构生成"
            :collapsed="panelCollapsed('structure-quick-start', hasWorkspaceStructure || hasWorkspaceDraft)"
            @update:collapsed="setPanelCollapsed('structure-quick-start', $event)"
          >
            <StructureQuickStartPanel
              :idea="store.structureIdeaInput"
              :can-reverse-engineer="store.canReverseEngineerStructure"
              :can-save-structure="Boolean(store.currentDashboard)"
              :is-saving="store.isSavingDashboard || store.isSavingScenes"
              :is-reverse-engineering="store.isReverseEngineeringStructure"
              @update:idea="store.updateStructureIdeaInput"
              @reverse-from-draft="store.reverseEngineerStructureFromDraft"
              @generate-from-idea="store.generateStructureFromIdea"
              @save-structure="handleSaveCurrentStructure"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.writingMode === 'structure'"
            title="章节仪表盘"
            :collapsed="panelCollapsed('chapter-dashboard', true)"
            @update:collapsed="setPanelCollapsed('chapter-dashboard', $event)"
          >
            <ChapterDashboardPanel
              :dashboard="store.currentDashboard"
              :is-saving="store.isSavingDashboard"
              :revision="store.structureDraftVersion"
              @update:dashboard="store.updateDashboard"
              @save="store.saveCurrentDashboard"
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            v-if="store.writingMode === 'structure'"
            title="场景卡"
            :subtitle="`${store.sceneCards.length} 张`"
            :collapsed="panelCollapsed('scene-cards', store.sceneCards.length === 0)"
            @update:collapsed="setPanelCollapsed('scene-cards', $event)"
          >
            <SceneCardPanel
              :cards="store.sceneCards"
              :is-saving="store.isSavingScenes"
              :revision="store.structureDraftVersion"
              @update:cards="store.updateSceneCards"
              @save="store.saveCurrentSceneCards"
            />
          </CollapsiblePanel>
        </div>
        <ChapterEditor
          class="editor-area"
          :chapter="store.currentChapter"
          :document-kind="store.currentDocumentKind"
          :document-label="store.currentDocumentLabel"
          :file-path="store.currentFilePath"
          :content="store.currentContent"
          :has-unsaved-changes="store.hasUnsavedChanges"
          :save-state-label="store.currentSaveStateLabel"
          :is-saving="store.isSavingContent"
          :word-count="editorWordCount"
          :suggestion-provider="store.requestEditorSuggestion"
          @update:content="store.updateContent"
          @switch-document="store.openChapterDocument"
          @selection="store.updateSelection"
          @save="handleSaveCurrentContent"
        />
        <CollapsiblePanel
          title="版本对比"
          :subtitle="`${store.fileVersions.length} 个快照`"
          :collapsed="panelCollapsed('file-diff', true)"
          @update:collapsed="setPanelCollapsed('file-diff', $event)"
        >
          <FileVersionDiffPanel
            :versions="store.fileVersions"
            :diff="store.currentFileDiff"
            :loading-versions="store.isLoadingFileVersions"
            :loading-diff="store.isLoadingFileDiff"
            @refresh="store.loadCurrentFileVersions"
            @preview="store.previewCurrentFileDiff"
            @close="store.clearCurrentFileDiff"
          />
        </CollapsiblePanel>
      </section>

      <aside v-if="store.writingMode !== 'focus'" class="right-rail">
        <CollapsiblePanel
          v-if="store.writingMode === 'review'"
          title="选区工具"
          :collapsed="panelCollapsed('selection-toolbar')"
          @update:collapsed="setPanelCollapsed('selection-toolbar', $event)"
        >
          <SelectionToolbar
            :selection="store.selection"
            :loading="store.isLoading"
            @polish="store.polishSelection"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'review'"
          title="质量诊断"
          :collapsed="panelCollapsed('review-quality')"
          @update:collapsed="setPanelCollapsed('review-quality', $event)"
        >
          <ReviewQualityPanel
            :report="store.currentQualityReport"
            :series-metrics="store.currentSeriesQualityMetrics"
            :selected-tone="store.styleTone"
            :can-diagnose="store.canDiagnoseChapter"
            :can-tune-selection="store.canTuneSelection"
            :can-improve-quality="store.canImproveQualityMetrics"
            :is-improving-quality="store.isImprovingQualityMetrics"
            :quality-target-score="store.qualityTargetScore"
            :quality-max-score="store.qualityMaxScore"
            :is-rebuilding-series="store.isRebuildingSeriesQualityMetrics"
            :quality-improvement="store.qualityImprovementState"
            :task-progress="store.taskProgress"
            @diagnose="store.diagnoseCurrentChapter"
            @update:tone="store.updateStyleTone"
            @tune-selection="store.tuneSelectionStyle"
            @improve-metric="store.improveQualityMetrics"
            @improve-all-metrics="store.improveQualityMetrics"
            @open-diff="openFileDiffPanel"
            @rebuild-series="store.rebuildSeriesQualityMetrics"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'review'"
          title="改写对比"
          :collapsed="panelCollapsed('review-rewrite', !store.rewriteCandidate)"
          @update:collapsed="setPanelCollapsed('review-rewrite', $event)"
        >
          <RewriteComparison
            :result="store.rewriteCandidate"
            :original-text="store.rewriteComparisonOriginalText"
            :empty-original-text="store.rewriteComparisonEmptyOriginalText"
            :apply-patches-label="store.rewritePatchApplyLabel"
            :can-accept="store.canAcceptSelectedRewrite"
            :can-request="Boolean(store.selection?.selectedText && !store.isLoading)"
            @accept="store.acceptRewrite"
            @reject="store.rejectRewrite"
            @apply-patches="store.applyTaskPatches"
            @request="store.polishSelection('polish')"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'structure'"
          title="AI 操作"
          :collapsed="panelCollapsed('ai-operation', true)"
          @update:collapsed="setPanelCollapsed('ai-operation', $event)"
        >
          <AIOperationPanel
            :task="store.currentTask"
            :active-task-type="store.activeTaskType"
            :progress="store.taskProgress"
            :loading="store.isLoading"
            :stages="store.aiStages"
            @run-task="store.runTask"
            @cancel-task="store.cancelActiveTask"
            @apply-patches="store.applyTaskPatches"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'review'"
          title="写作回顾"
          :collapsed="panelCollapsed('review-recap', !store.recapCandidate)"
          @update:collapsed="setPanelCollapsed('review-recap', $event)"
        >
          <WritingRecapPanel
            :candidate="store.recapCandidate"
            :can-request="Boolean(store.currentChapter && store.currentContent.trim())"
            :loading="store.isLoading"
            @accept="store.acceptWritingRecap"
            @reject="store.rejectWritingRecap"
            @request="store.requestWritingRecap"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'review'"
          title="任务历史"
          :subtitle="`${store.taskHistory.length} 条`"
          :collapsed="panelCollapsed('task-history', store.taskHistory.length === 0)"
          @update:collapsed="setPanelCollapsed('task-history', $event)"
        >
          <TaskHistoryPanel
            :tasks="store.taskHistory"
            :invocations="store.aiInvocations"
            :stages="store.aiStages"
            :can-export="Boolean(store.currentProject)"
            :is-exporting="store.isExportingAuditReport"
            :is-previewing="store.isLoadingAuditReportPreview"
            @preview-report="openAuditReportPreview"
            @export-report="store.exportProjectAuditReport"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'structure'"
          title="创作方法"
          :collapsed="panelCollapsed('context-panel')"
          @update:collapsed="setPanelCollapsed('context-panel', $event)"
        >
          <ContextPanel
            :project="store.currentProject"
            :chapter="store.currentChapter"
            :ai-summary="store.activeNovelAiSummary"
            :ai-status="store.activeNovelAgentCheck?.available ? store.activeNovelAgentCheck.version || '连接正常' : errorText(store.activeNovelAgentCheck?.error, '连接失败')"
            :ai-available="store.activeNovelAgentCheck?.available"
            :active-skills="activeNovelSkills"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'structure'"
          title="平台资料库"
          :collapsed="panelCollapsed('platform-library', true)"
          @update:collapsed="setPanelCollapsed('platform-library', $event)"
        >
          <PlatformLibraryPanel
            :library="store.platformLibrary"
            :project-slug="store.currentProject?.slug"
            :loading="store.isLoading"
            @refresh="store.loadPlatformLibrary"
            @create-asset="store.createSharedAsset"
            @link-asset="store.linkSharedAsset"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'structure'"
          title="支撑文件"
          :collapsed="panelCollapsed('support-files', true)"
          @update:collapsed="setPanelCollapsed('support-files', $event)"
        >
          <SupportFilePanel
            :files="store.supportFiles"
            :current-path="store.currentSupportPath"
            :content="store.supportContent"
            :has-unsaved-changes="store.hasUnsavedSupportChanges"
            @open="store.openSupportFile"
            @update:content="store.updateSupportContent"
            @save="store.saveSupportContent"
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          v-if="store.writingMode === 'review'"
          title="账本"
          :collapsed="panelCollapsed('ledger-panel', true)"
          @update:collapsed="setPanelCollapsed('ledger-panel', $event)"
        >
          <LedgerPanel
            :entries="store.ledgerEntries"
            :active-kind="store.activeLedgerKind"
            :loading="store.isLoading"
            @change-kind="store.loadLedger"
            @update:entries="store.updateLedgerEntries"
            @save="store.saveLedger"
          />
        </CollapsiblePanel>
        <div v-if="store.error" class="workspace-error" role="alert">{{ store.error }}</div>
      </aside>
    </main>
    <main v-else class="workspace-loading" aria-live="polite">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ store.error || "正在载入工作台" }}</span>
    </main>
    <el-dialog v-model="storyControlDialogOpen" title="故事总控台" width="min(1360px, 96vw)" destroy-on-close @closed="storyGraphFocus = null">
      <div class="story-control-dialog-body">
        <StoryControlPanel
          :story-control="store.storyControl"
          :is-saving="store.isSavingStoryControl"
          :is-generating="store.isLoading"
          :can-generate="store.canRequestStoryOrchestration"
          @update:story-control="store.updateStoryControl"
          @save="handleSaveStoryControl"
          @orchestrate="store.requestStoryOrchestration"
        />
        <QuickReferencePanel
          :story-control="store.storyControl"
          :knowledge-index="store.knowledgeIndex"
          :search-result="store.knowledgeSearchResult"
          :is-searching="store.isSearchingKnowledge"
          @search="store.searchKnowledgeIndex"
        />
        <StoryGraphPanel
          :graph="store.storyGraph"
          :is-rebuilding="store.isRebuildingStoryGraph"
          :focus="storyGraphFocus"
          @refresh="store.rebuildStoryGraph"
        />
        <KnowledgeIndexPanel
          :index="store.knowledgeIndex"
          :is-rebuilding="store.isRebuildingKnowledgeIndex"
          :search-result="store.knowledgeSearchResult"
          :retrieval-preview="store.knowledgeRetrievalPreview"
          :is-searching="store.isSearchingKnowledge"
          @rebuild="store.rebuildKnowledgeIndex"
          @search="store.searchKnowledgeIndex"
        />
        <MemoryGovernancePanel
          :health="store.memoryHealthReport"
          :ready-proof="store.memoryReadyProof"
          :continuity-audit="store.memoryContinuityAudit"
          :retrieval-available="Boolean(store.knowledgeRetrievalPreview)"
          :loading="store.isRunningMemoryGovernance || false"
          @run="store.runMemoryGovernance"
        />
        <BackgroundJobPanel
          :jobs="store.backgroundJobs"
          :is-loading="store.isRebuildingKnowledgeIndex || store.isRebuildingSeriesQualityMetrics || store.isRebuildingStoryGraph"
          @refresh="store.loadBackgroundJobs"
          @cancel="store.cancelBackgroundJob"
          @retry="store.retryBackgroundJob"
        />
      </div>
    </el-dialog>
    <el-dialog v-model="aiConfigDialogOpen" title="AI 配置" width="min(980px, 96vw)" destroy-on-close>
      <AiConfigPanel
        :config="store.platformAiConfig"
        :profiles="store.agentProfiles"
        :checks="store.agentChecks"
        :saving="store.isSavingAiConfig"
        :checking="store.isLoading"
        @save="handleSaveAiConfig"
        @check="handleCheckAgent"
      />
    </el-dialog>
    <el-dialog
      v-model="auditReportDialogOpen"
      title="审计报告"
      width="min(1100px, 96vw)"
      destroy-on-close
      @closed="closeAuditReportPreview"
    >
      <AuditReportPanel
        :report="store.auditReportPreview"
        :loading="store.isLoadingAuditReportPreview"
        :focus-section="auditReportFocusSection"
        @refresh="store.previewProjectAuditReport"
        @download="store.exportProjectAuditReport"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Close, Collection, Folder, Loading, Moon, Refresh, Setting, Sunny } from "@element-plus/icons-vue";
import { useRoute, useRouter } from "vue-router";
import { useNovelStore } from "@/stores/novel";
import { useThemeStore } from "@/stores/theme";
import type { CreationLoopAction, NovelProject, PlatformAiConfig, StoryGraphFocus, WorkbenchCommand } from "@/types/novel";
import { errorText, statusLabel } from "@/utils/novelLabels";
import { useWorkspacePanelState } from "./useWorkspacePanelState";
import WritingModeSwitcher from "./WritingModeSwitcher.vue";
import CollapsiblePanel from "./CollapsiblePanel.vue";

const ProjectManagerPanel = defineAsyncComponent(() => import("./ProjectManagerPanel.vue"));
const ProjectCreatePanel = defineAsyncComponent(() => import("./ProjectCreatePanel.vue"));
const AiConfigPanel = defineAsyncComponent(() => import("./AiConfigPanel.vue"));
const ChapterTree = defineAsyncComponent(() => import("./ChapterTree.vue"));
const FocusWritingPanel = defineAsyncComponent(() => import("./FocusWritingPanel.vue"));
const StructureQuickStartPanel = defineAsyncComponent(() => import("./StructureQuickStartPanel.vue"));
const StoryControlPanel = defineAsyncComponent(() => import("./StoryControlPanel.vue"));
const QuickReferencePanel = defineAsyncComponent(() => import("./QuickReferencePanel.vue"));
const StoryGraphPanel = defineAsyncComponent(() => import("./StoryGraphPanel.vue"));
const KnowledgeIndexPanel = defineAsyncComponent(() => import("./KnowledgeIndexPanel.vue"));
const MemoryGovernancePanel = defineAsyncComponent(() => import("./MemoryGovernancePanel.vue"));
const BackgroundJobPanel = defineAsyncComponent(() => import("./BackgroundJobPanel.vue"));
const ChapterDashboardPanel = defineAsyncComponent(() => import("./ChapterDashboardPanel.vue"));
const SceneCardPanel = defineAsyncComponent(() => import("./SceneCardPanel.vue"));
const ChapterEditor = defineAsyncComponent(() => import("./ChapterEditor.vue"));
const FileVersionDiffPanel = defineAsyncComponent(() => import("./FileVersionDiffPanel.vue"));
const SelectionToolbar = defineAsyncComponent(() => import("./SelectionToolbar.vue"));
const ReviewQualityPanel = defineAsyncComponent(() => import("./ReviewQualityPanel.vue"));
const RewriteComparison = defineAsyncComponent(() => import("./RewriteComparison.vue"));
const AIOperationPanel = defineAsyncComponent(() => import("./AIOperationPanel.vue"));
const WritingRecapPanel = defineAsyncComponent(() => import("./WritingRecapPanel.vue"));
const TaskHistoryPanel = defineAsyncComponent(() => import("./TaskHistoryPanel.vue"));
const AuditReportPanel = defineAsyncComponent(() => import("./AuditReportPanel.vue"));
const ContextPanel = defineAsyncComponent(() => import("./ContextPanel.vue"));
const SupportFilePanel = defineAsyncComponent(() => import("./SupportFilePanel.vue"));
const LedgerPanel = defineAsyncComponent(() => import("./LedgerPanel.vue"));
const PlatformLibraryPanel = defineAsyncComponent(() => import("./PlatformLibraryPanel.vue"));
const QuickStartGuidePanel = defineAsyncComponent(() => import("./QuickStartGuidePanel.vue"));
const CreationLoopPanel = defineAsyncComponent(() => import("./CreationLoopPanel.vue"));
const PlotPilotLearningPanel = defineAsyncComponent(() => import("./PlotPilotLearningPanel.vue"));
const SavePipelinePanel = defineAsyncComponent(() => import("./SavePipelinePanel.vue"));
const AutopilotRuntimePanel = defineAsyncComponent(() => import("./AutopilotRuntimePanel.vue"));
const CreativeSessionPanel = defineAsyncComponent(() => import("./CreativeSessionPanel.vue"));
const StoryBlueprintPanel = defineAsyncComponent(() => import("./StoryBlueprintPanel.vue"));
const ContractCandidatePanel = defineAsyncComponent(() => import("./ContractCandidatePanel.vue"));
const BookRunPanel = defineAsyncComponent(() => import("./BookRunPanel.vue"));
const LengthPlanningPanel = defineAsyncComponent(() => import("./LengthPlanningPanel.vue"));
const PublicationEvidencePanel = defineAsyncComponent(() => import("./PublicationEvidencePanel.vue"));
const OutlineCandidatePanel = defineAsyncComponent(() => import("./OutlineCandidatePanel.vue"));
const ExecutionReadinessPanel = defineAsyncComponent(() => import("./ExecutionReadinessPanel.vue"));
const ProseCandidatePanel = defineAsyncComponent(() => import("./ProseCandidatePanel.vue"));
const QualityCalibrationPanel = defineAsyncComponent(() => import("./QualityCalibrationPanel.vue"));
const ReleaseAcceptancePanel = defineAsyncComponent(() => import("./ReleaseAcceptancePanel.vue"));
const IndependentReviewPanel = defineAsyncComponent(() => import("./IndependentReviewPanel.vue"));
const MigrationCutoverPanel = defineAsyncComponent(() => import("./MigrationCutoverPanel.vue"));
const LearningGovernancePanel = defineAsyncComponent(() => import("./LearningGovernancePanel.vue"));
const CraftPatternPanel = defineAsyncComponent(() => import("./CraftPatternPanel.vue"));
const CharacterContractPanel = defineAsyncComponent(() => import("./CharacterContractPanel.vue"));

defineOptions({
  name: "NovelWorkspace"
});

const store = useNovelStore();
function handleProseAdopt(candidate: Parameters<typeof store.adoptProseCandidate>[0], input: Parameters<typeof store.adoptProseCandidate>[1]) {
  return store.adoptProseCandidate?.(candidate, input);
}
function handleProseSettle(candidate: Parameters<typeof store.settleProseCandidate>[0], transaction: Parameters<typeof store.settleProseCandidate>[1]) {
  return store.settleProseCandidate?.(candidate, transaction);
}
function handleProseRepairCandidate(candidate: Parameters<typeof store.createProseRepairCandidate>[0], content: Parameters<typeof store.createProseRepairCandidate>[1]) {
  return store.createProseRepairCandidate?.(candidate, content);
}
function handlePauseExplorationBudget(budget: Parameters<typeof store.pauseExplorationBudget>[0]) {
  return store.pauseExplorationBudget?.(budget, "author requested pause");
}
function handleLearningGovernanceRefresh() {
  return Promise.all([
    store.loadLearningPolicy?.(),
    ...Object.keys(store.explorationBudgets || {}).map((budgetId) => store.loadExplorationBudget?.(budgetId))
  ]);
}
function handleValidateCraftPattern(pattern: Parameters<typeof store.validateCraftPatternFromExperiment>[0], experiment: Parameters<typeof store.validateCraftPatternFromExperiment>[1]) {
  return store.validateCraftPatternFromExperiment?.(pattern, experiment);
}
function handlePromoteCraftPattern(pattern: Parameters<typeof store.promoteCraftPatternFromExperiment>[0]) {
  return store.promoteCraftPatternFromExperiment?.(pattern);
}
function handleCraftGovernanceRefresh() {
  return Promise.all([store.loadCraftPatterns?.(), store.loadCraftExperiments?.()]);
}
function handleCharacterContractsRefresh() {
  return store.loadCharacterContracts?.();
}
function handleCharacterContractConfirm(contract: Parameters<typeof store.confirmCharacterContract>[0]) {
  return store.confirmCharacterContract?.(contract);
}
const themeStore = useThemeStore();
const route = useRoute();
const router = useRouter();
const globalWorkspaceDataLoaded = {
  agentProfiles: false,
  platformAiConfig: false,
  platformLibrary: false,
  aiStages: false
};
const globalWorkspaceDataPending: Record<keyof typeof globalWorkspaceDataLoaded, Promise<void> | null> = {
  agentProfiles: null,
  platformAiConfig: null,
  platformLibrary: null,
  aiStages: null
};
const sampleStarterIdea = "一个被逐出山门的少年在雨夜发现旧封印松动；他想证明自己还能修行，却必须在救人和暴露身份之间做选择。";
const starterIdea = ref("");
const aiConfigDialogOpen = ref(false);
const storyControlDialogOpen = ref(false);
const auditReportDialogOpen = ref(false);
const workspaceGovernanceOpen = ref(false);
const storyGraphFocus = ref<StoryGraphFocus | null>(null);
const auditReportFocusSection = ref<"ai-control-plane" | null>(null);
const isProjectRoute = computed(() => route.name === "project-workspace");
const editorWordCount = computed(() => store.currentDashboard?.wordCount ?? store.currentContent.replace(/\s+/g, "").length);
const hasWorkspaceStructure = computed(() => Boolean(store.currentDashboard?.goal || store.sceneCards.length));
const hasWorkspaceDraft = computed(() => store.currentContent.replace(/\s+/g, "").length >= 30);
const activeNovelSkills = computed(() =>
  (store.platformLibrary?.skills || []).filter((skill) => skill.enabled && skill.tags.includes("novel")).slice(0, 4)
);
const collapseStorageKey = computed(
  () => `novel-workspace:${store.currentProject?.slug || "hub"}:${store.writingMode}:collapsed-panels`
);
const { panelCollapsed, setPanelCollapsed } = useWorkspacePanelState({
  storageKey: collapseStorageKey,
  onExpand(key) {
    if (key === "file-diff") {
      void store.loadCurrentFileVersions();
    } else if (key === "support-files") {
      void store.openSupportFile(store.currentSupportPath, { skipLeaveCheck: true });
    } else if (key === "task-history") {
      void store.loadTaskAudit();
    } else if (key === "ai-operation") {
      void store.loadAiStages();
    } else if (key === "platform-library") {
      void store.loadPlatformLibrary();
    } else if (key === "ledger-panel") {
      void store.loadLedger();
    } else if (key === "chapter-dashboard" || key === "scene-cards") {
      void store.loadChapterStructure();
    } else if (key === "review-quality") {
      void store.loadChapterReview();
    } else if (key === "runtime-autopilot") {
      void store.loadChapterRuntime();
    }
  }
});
const focusDraftTuneOptions = [
  { label: "更有压迫感", value: "增强压迫感，让角色被更明确的危险、代价或时间压力推动" },
  { label: "更优雅", value: "提升文笔质感，保留清晰动作线，减少直白说明" },
  { label: "更快推进", value: "压缩铺垫，更快进入下一笔关键动作或转折" },
  { label: "更克制", value: "降低煽情和夸张表达，保持冷静、可信、有限视角" }
];

function routeProjectSlug() {
  const slug = route.params.slug;
  return typeof slug === "string" ? slug : "";
}

function queueGlobalWorkspaceLoad(
  key: keyof typeof globalWorkspaceDataLoaded,
  loader: () => Promise<unknown>,
  onError: () => void
) {
  if (globalWorkspaceDataLoaded[key]) {
    return null;
  }
  if (globalWorkspaceDataPending[key]) {
    return globalWorkspaceDataPending[key];
  }
  const request = loader()
    .then(() => {
      globalWorkspaceDataLoaded[key] = true;
    })
    .catch(() => {
      onError();
    })
    .finally(() => {
      globalWorkspaceDataPending[key] = null;
    });
  globalWorkspaceDataPending[key] = request;
  return request;
}

async function ensureGlobalWorkspaceDataLoaded() {
  const pendingLoads = [
    queueGlobalWorkspaceLoad("agentProfiles", () => store.loadAgentProfiles(), () => {
      // AI profiles are optional while the API service is booting.
    }),
    queueGlobalWorkspaceLoad("platformAiConfig", () => store.loadPlatformAiConfig(), () => {
      // Global AI config falls back to Codex CLI until the API service is ready.
    }),
    queueGlobalWorkspaceLoad("platformLibrary", () => store.loadPlatformLibrary(), () => {
      // Platform library is optional until the API service is running.
    }),
    queueGlobalWorkspaceLoad("aiStages", () => store.loadAiStages(), () => {
      // AI stage labels are optional while the API service is booting.
    })
  ].filter((request): request is Promise<void> => Boolean(request));

  if (pendingLoads.length) {
    await Promise.all(pendingLoads);
  }
}

async function syncWorkspaceFromRoute() {
  if (!store.projects.length) {
    await store.loadProjects();
  }

  if (!isProjectRoute.value) {
    await ensureGlobalWorkspaceDataLoaded();
    store.showProjectHub({ skipLeaveCheck: true });
    return;
  }

  const slug = routeProjectSlug();
  const project = store.projects.find((item) => item.slug === slug);
  if (!project) {
    store.error = `找不到项目：${slug}`;
    await router.replace({ name: "project-hub" });
    return;
  }

  await store.openProject(project, { skipLeaveCheck: true });
}

async function setWorkspaceGovernanceOpen(open: boolean) {
  workspaceGovernanceOpen.value = open;
  if (open) {
    await store.loadWorkspaceGovernance();
  }
}

async function openStoryControlDialog() {
  storyControlDialogOpen.value = true;
  await store.loadStoryGovernance();
}

async function openAiConfigDialog() {
  aiConfigDialogOpen.value = true;
  await Promise.all([store.loadAgentProfiles(), store.loadPlatformAiConfig(), store.loadAiStages()]);
}

function goProjectHub() {
  router.push({ name: "project-hub" });
}

function goWorkspace(projectSlug: string) {
  router.push({ name: "project-workspace", params: { slug: projectSlug } });
}

async function scrollToCreatePanel() {
  await nextTick();
  document.querySelector("#project-create-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function applyStarterIdea() {
  starterIdea.value = "";
  await nextTick();
  starterIdea.value = sampleStarterIdea;
  await scrollToCreatePanel();
}

async function importProjectAndOpen(input: { sourcePath: string; title?: string; genre?: string }) {
  const project = await store.importProject(input);
  if (project) {
    goWorkspace(project.slug);
  }
}

async function confirmDeleteProject(project: NovelProject) {
  const projectTitle = project.title || project.slug;
  try {
    await ElMessageBox.confirm(
      `确认删除项目「${projectTitle}」？项目文件、分析结果和当前工作区缓存都会被移除，删除后不可恢复。`,
      "删除项目",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        confirmButtonClass: "el-button--danger"
      }
    );
    await store.deleteProject(project);
    if (routeProjectSlug() === project.slug) {
      await router.replace({ name: "project-hub" });
    }
    ElMessage.success(`已删除项目：${projectTitle}`);
  } catch (err) {
    if (err === "cancel" || err === "close") return;
    ElMessage.error(errorText(err, "删除项目失败"));
  }
}

async function closeWorkspace(projectSlug: string) {
  await store.closeWorkspace(projectSlug);
  const nextProject = store.currentProject;
  if (nextProject) {
    goWorkspace(nextProject.slug);
    return;
  }

  goProjectHub();
}

async function handleSaveCurrentContent() {
  const hadChanges = store.hasUnsavedChanges;
  try {
    await store.saveCurrentContent();
    ElMessage.success(hadChanges ? "当前文档已保存" : "当前文档已是最新");
  } catch (err) {
    ElMessage.error(errorText(err, "保存失败"));
  }
}

function openFileDiffPanel() {
  setPanelCollapsed("file-diff", false);
}

async function handleCreationLoopAction(action: CreationLoopAction) {
  try {
    await store.runCreationLoopAction(action);
  } catch {
    ElMessage.error("闭环动作执行失败，请检查当前章节状态。");
  }
}

async function handleWorkbenchCommand(command: WorkbenchCommand) {
  if (command.type === "creation-action") {
    await handleCreationLoopAction(command.action);
    return;
  }
  if (command.type === "open-story-graph") {
    storyGraphFocus.value = {
      nodeId: command.nodeId,
      characterId: command.characterId,
      appearanceStatus: command.appearanceStatus
    };
    storyControlDialogOpen.value = true;
    return;
  }
  if (command.type === "open-audit-report") {
    auditReportFocusSection.value = command.section === "ai-control-plane" ? "ai-control-plane" : null;
    await openAuditReportPreview(auditReportFocusSection.value);
  }
}

function isSaveShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s";
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!isSaveShortcut(event) || event.repeat || !isProjectRoute.value || !store.hasProject) return;

  event.preventDefault();
  handleSaveCurrentContent();
}

async function handleSaveCurrentStructure() {
  try {
    await store.saveCurrentStructure();
    ElMessage.success("章节结构已保存");
  } catch (err) {
    ElMessage.error(errorText(err, "保存结构失败"));
  }
}

async function handleSaveStoryControl() {
  try {
    await store.saveStoryControl();
    ElMessage.success("故事总控台已保存");
  } catch (err) {
    ElMessage.error(errorText(err, "保存故事总控台失败"));
  }
}

async function handleSaveAiConfig(config: PlatformAiConfig) {
  try {
    await store.savePlatformAiConfig(config);
    ElMessage.success("AI 配置已保存");
  } catch (err) {
    ElMessage.error(errorText(err, "AI 配置保存失败"));
  }
}

async function handleCheckAgent(config: { profileId: string; modelId?: string }) {
  store.isLoading = true;
  try {
    const result = await store.checkAgentProfile(config.profileId, config.modelId);
    if (result.available) {
      ElMessage.success(`${result.label} 连接正常`);
      return;
    }
    ElMessage.error(result.error || `${result.label} 不可用`);
  } catch (err) {
    ElMessage.error(errorText(err, "AI 执行器测试失败"));
  } finally {
    store.isLoading = false;
  }
}

async function openAuditReportPreview(focusSection: "ai-control-plane" | null = null) {
  auditReportFocusSection.value = focusSection;
  auditReportDialogOpen.value = true;
  const report = await store.previewProjectAuditReport();
  if (!report && store.error) {
    ElMessage.error(store.error);
  }
}

function closeAuditReportPreview() {
  auditReportFocusSection.value = null;
  store.clearAuditReportPreview();
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
  syncWorkspaceFromRoute().catch(() => {
    // Initial load can fail if the API service has not been started yet.
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});

watch(
  () => route.fullPath,
  () => {
    syncWorkspaceFromRoute().catch(() => {
      // Keep the cached workspace visible if the API is temporarily unavailable.
    });
  }
);

watch(
  () => store.currentFileDiff?.fromVersion.id,
  (versionId) => {
    if (versionId) {
      openFileDiffPanel();
    }
  }
);
</script>

<style scoped lang="scss">
.novel-workspace {
  --workspace-chrome-height: 116px;
  min-height: 100vh;
  background: var(--app-bg-page);
  color: var(--app-text-primary);
}

.novel-workspace.is-project-workspace {
  --workspace-chrome-height: 86px;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);

  h1 {
    font-size: 20px;
    margin: 0 0 4px;
  }

  p {
    margin: 0;
    color: var(--app-text-muted);
  }
}

.workspace-header.is-workspace-shell {
  min-height: 42px;
  padding: 6px 12px;

  h1 {
    margin: 0;
    font-size: 15px;
    line-height: 1.2;
  }

  p {
    display: none;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-header.is-workspace-shell .header-actions {
  gap: 6px;
}

.workspace-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);
  overflow-x: auto;
}

.is-project-workspace .workspace-tabs {
  min-height: 36px;
  padding: 4px 10px;
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 4px 4px 4px 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg-soft);
  color: var(--app-text-secondary);
  cursor: pointer;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.active {
    border-color: var(--app-primary);
    background: var(--app-primary-soft);
    color: var(--app-primary-text);
  }
}

.is-project-workspace .workspace-tab {
  padding: 3px 4px 3px 9px;
}

.story-control-dialog-body {
  display: grid;
  gap: 12px;
}

.project-hub {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
  min-height: calc(100vh - 116px);
  padding: 24px;
}

.hub-copy {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;

  .eyebrow {
    margin: 0 0 6px;
    color: var(--app-primary);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 26px;
  }

  p {
    max-width: 720px;
    margin: 0;
    color: var(--app-text-secondary);
  }
}

.module-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;

  span {
    padding: 5px 9px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-bg);
    color: var(--app-text-secondary);
    font-size: 12px;
  }
}

.project-hub > .quick-start-guide {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
}

.hub-grid {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(360px, 620px) minmax(300px, 380px);
  align-items: start;
  justify-content: center;
  gap: 16px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(420px, 1fr) minmax(300px, 380px);
  gap: 10px;
  height: calc(100vh - var(--workspace-chrome-height));
  padding: 10px 12px;

  &.mode-focus {
    grid-template-columns: minmax(0, 980px);
    justify-content: center;
  }

  &.mode-review {
    grid-template-columns: minmax(220px, 280px) minmax(420px, 1fr) minmax(320px, 420px);
  }
}

.left-rail,
.right-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
}

.center-stage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
}

.autopilot-zone,
.workspace-assist-stack,
.center-stage > .collapsible-panel {
  flex: 0 0 auto;
}

.autopilot-zone {
  display: grid;
  gap: 6px;
  min-height: 0;
  overflow: visible;
}

.autopilot-toolbar {
  display: grid;
  grid-template-columns: minmax(210px, 0.45fr) minmax(360px, 1fr);
  gap: 8px;
  align-items: stretch;
}

.workspace-assist-stack {
  order: 3;
  display: grid;
  gap: 6px;
  min-height: 0;
  overflow: visible;
}

.center-stage > .editor-area {
  order: 2;
  height: clamp(460px, 62vh, 680px);
  min-height: 460px;
  flex: 0 0 auto;
}

.mode-focus .center-stage > .editor-area {
  height: clamp(520px, 70vh, 760px);
  min-height: 520px;
  flex: 0 0 auto;
}

.center-stage > .collapsible-panel {
  order: 4;
}

.workspace-governance-stack {
  display: grid;
  gap: 12px;
}

.autopilot-zone :deep(.collapsible-panel) {
  gap: 6px;
}

.autopilot-zone :deep(.collapse-toggle),
.workspace-assist-stack :deep(.collapse-toggle) {
  min-height: 30px;
  padding: 4px 7px;
}

.autopilot-toolbar :deep(.writing-mode-switcher),
.autopilot-toolbar :deep(.save-pipeline-panel) {
  padding: 8px;
  border-radius: 7px;
}

.autopilot-toolbar :deep(.save-pipeline-panel) {
  gap: 6px;
}

.autopilot-toolbar :deep(.save-pipeline-panel p) {
  display: none;
}

.autopilot-toolbar :deep(.workbench-segmented) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.autopilot-toolbar :deep(.segment-option) {
  min-height: 30px;
  padding: 4px 6px;
}

.autopilot-toolbar :deep(.option-icon) {
  width: 20px;
  height: 20px;
}

.autopilot-toolbar :deep(.step-list) {
  display: none;
}

.autopilot-toolbar :deep(.step-item) {
  padding: 5px;
}

.workspace-error {
  padding: 10px;
  border-radius: 6px;
  background: var(--app-danger-soft);
  color: var(--app-danger-text);
}

.workspace-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: calc(100vh - var(--workspace-chrome-height));
  color: var(--app-text-secondary);
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 260px minmax(420px, 1fr);
  }

  .right-rail {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .autopilot-toolbar {
    grid-template-columns: 1fr;
  }

  .autopilot-zone {
    overflow: visible;
  }
}

@media (max-width: 760px) {
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .project-hub {
    min-height: auto;
    padding: 16px;
  }

  .hub-grid,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-grid {
    height: calc(100vh - var(--workspace-chrome-height));
    min-height: 0;
  }

  .right-rail {
    display: flex;
  }

  .autopilot-zone {
    overflow: visible;
  }

  .workspace-assist-stack {
    overflow: visible;
  }
}
</style>
