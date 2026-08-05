<template>
  <section class="migration-panel" data-testid="migration-cutover-panel" aria-labelledby="migration-cutover-title">
    <header><div><p class="eyebrow">迁移门禁</p><h2 id="migration-cutover-title">迁移切换</h2><p>只读显示项目迁移状态；重新验证不会激活迁移。</p></div><button data-testid="validate-migrations" type="button" :disabled="loading" @click="emit('validate')">{{ loading ? "验证中…" : "重新验证迁移" }}</button></header>
    <div v-if="report" class="summary"><strong>{{ statusLabel(report.status) }}</strong><span>{{ report.projectCount }} 个项目 · {{ report.blockers.length }} 个阻断项</span><code data-testid="migration-cutover-fingerprint">指纹：{{ report.fingerprint }}</code></div>
    <div v-else class="empty">尚未读取迁移切换状态。</div>
    <ul v-if="report" class="projects"><li v-for="project in report.projects" :key="project.projectSlug" :class="project.status"><div><strong>{{ project.projectSlug }}</strong><span>{{ classificationLabel(project.classification) }} · {{ governanceStateLabel(project.governanceState) }}</span></div><strong>{{ statusLabel(project.status) }}</strong><small v-for="blocker in project.blockers" :key="blocker">{{ userFacingText(blocker, "迁移阻断项待处理") }}</small></li></ul>
  </section>
</template>

<script setup lang="ts">
import type { MigrationCutoverReport } from "@/types/novel";
import { statusLabel, userFacingText } from "@/utils/novelLabels";
withDefaults(defineProps<{ report?: MigrationCutoverReport | null; loading?: boolean }>(), { report: null, loading: false });
const emit = defineEmits<{ validate: [] }>();
function classificationLabel(value: string) { return ({ managed: "已托管", unmanaged: "未托管", legacy: "旧版本" } as Record<string, string>)[value] || "未分类"; }
function governanceStateLabel(value: string) { return ({ governed: "已治理", unmanaged: "未治理", legacy: "旧版本" } as Record<string, string>)[value] || "未提供"; }
</script>

<style scoped>
.migration-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--el-border-color); border-radius: 14px; background: var(--el-bg-color-overlay); }.migration-panel header { display: flex; justify-content: space-between; gap: 16px; }.migration-panel h2 { margin: 4px 0; }.migration-panel header p:not(.eyebrow), .empty { margin: 0; color: var(--el-text-color-secondary); }.eyebrow { margin: 0; color: var(--el-color-primary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }.migration-panel button { padding: 7px 11px; border: 1px solid var(--el-border-color); border-radius: 7px; background: transparent; color: var(--el-text-color-primary); }.summary { display: flex; justify-content: space-between; padding: 10px; border-radius: 8px; background: var(--el-fill-color-lighter); }.projects { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }.projects li { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; padding: 10px; border-left: 3px solid var(--el-border-color); background: var(--el-fill-color-lighter); }.projects li.ready { border-left-color: var(--el-color-success); }.projects li.blocked { border-left-color: var(--el-color-danger); }.projects li div { display: grid; gap: 3px; }.projects li span, .projects li small { color: var(--el-text-color-secondary); }.projects li small { grid-column: 1 / -1; }
</style>
