<template>
  <el-card class="result-panel" header="处理结果">
    <div v-if="!hasResult && !isStreaming" class="empty-state">
      <el-icon class="empty-icon"><Document /></el-icon>
      <p class="empty-text">暂无处理结果</p>
    </div>

    <div v-else class="result-content">
      <!-- 流式加载状态 -->
      <div v-if="isStreaming" class="streaming-indicator">
        <el-icon class="rotating"><Loading /></el-icon>
        <span>AI正在思考中...</span>
      </div>

      <!-- 原始文本 -->
      <div v-if="result?.text" class="result-section">
        <h4 class="section-title">
          <el-icon><EditPen /></el-icon>
          输入文本
        </h4>
        <div class="text-content">{{ result.text }}</div>
      </div>

      <!-- 理解分析 -->
      <div v-if="result?.understanding" class="result-section">
        <h4 class="section-title">
          <el-icon><MagicStick /></el-icon>
          理解分析
        </h4>
        <div class="understanding-content">
          <div class="understanding-item">
            <span class="label">意图识别:</span>
            <el-tag 
              :type="getIntentTagType(result.understanding.intent)"
              class="intent-tag"
            >
              {{ result.understanding.intent || '分析中...' }}
            </el-tag>
          </div>
          
          <div class="understanding-item">
            <span class="label">置信度:</span>
            <el-progress 
              :percentage="Math.round((result.understanding.confidence || 0) * 100)"
              :color="getConfidenceColor(result.understanding.confidence || 0)"
              :show-text="true"
              class="confidence-progress"
            />
          </div>

          <div v-if="result.understanding.entities?.length" class="understanding-item">
            <span class="label">实体识别:</span>
            <div class="entities-list">
              <el-tag 
                v-for="entity in result.understanding.entities" 
                :key="`${entity.type}-${entity.value}`"
                type="info"
                class="entity-tag"
              >
                {{ entity.type }}: {{ entity.value }}
                <span class="entity-confidence">({{ Math.round(entity.confidence * 100) }}%)</span>
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 建议操作 -->
      <div v-if="result?.actions?.length" class="result-section">
        <h4 class="section-title">
          <el-icon><Operation /></el-icon>
          建议操作
        </h4>
        <div class="actions-content">
          <div 
            v-for="action in result.actions" 
            :key="action.type"
            class="action-item"
          >
            <div class="action-header">
              <el-tag :type="getActionTagType(action.priority)" size="small">
                优先级: {{ action.priority }}
              </el-tag>
              <span class="action-type">{{ action.type }}</span>
            </div>
            <div v-if="Object.keys(action.parameters || {}).length" class="action-params">
              <span class="params-label">参数:</span>
              <code class="params-code">{{ JSON.stringify(action.parameters, null, 2) }}</code>
            </div>
          </div>
        </div>
      </div>

      <!-- 建议回复 -->
      <div v-if="result?.suggestions?.length" class="result-section">
        <h4 class="section-title">
          <el-icon><ChatDotRound /></el-icon>
          建议回复
        </h4>
        <div class="suggestions-content">
          <div 
            v-for="(suggestion, index) in result.suggestions" 
            :key="index"
            class="suggestion-item"
          >
            <el-icon class="suggestion-icon"><ChatLineRound /></el-icon>
            <span class="suggestion-text">{{ suggestion }}</span>
          </div>
        </div>
      </div>

      <!-- 处理信息 -->
      <div v-if="result?.processing_time || result?.timestamp" class="result-section">
        <h4 class="section-title">
          <el-icon><Timer /></el-icon>
          处理信息
        </h4>
        <div class="processing-info">
          <div v-if="result.processing_time" class="info-item">
            <span class="label">处理耗时:</span>
            <span class="value">{{ result.processing_time.toFixed(2) }}ms</span>
          </div>
          <div v-if="result.timestamp" class="info-item">
            <span class="label">处理时间:</span>
            <span class="value">{{ formatTimestamp(result.timestamp) }}</span>
          </div>
        </div>
      </div>

      <!-- 流式数据块展示（调试用） -->
      <div v-if="showDebugInfo && streamChunks.length" class="result-section debug-section">
        <h4 class="section-title">
          <el-icon><Monitor /></el-icon>
          流式数据块
          <el-button 
            size="small" 
            text 
            @click="showDebugInfo = false"
            class="toggle-debug"
          >
            隐藏
          </el-button>
        </h4>
        <div class="debug-content">
          <div 
            v-for="(chunk, index) in streamChunks" 
            :key="index"
            class="debug-chunk"
          >
            <div class="chunk-header">
              <el-tag size="small" :type="getChunkTagType(chunk.type)">
                {{ chunk.type }}
              </el-tag>
              <span class="chunk-time">{{ formatTimestamp(chunk.timestamp) }}</span>
            </div>
            <pre class="chunk-data">{{ JSON.stringify(chunk.data, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- 调试信息切换 -->
      <div v-if="streamChunks.length && !showDebugInfo" class="debug-toggle">
        <el-button 
          size="small" 
          text 
          @click="showDebugInfo = true"
        >
          <el-icon><Monitor /></el-icon>
          显示调试信息
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  Document, 
  EditPen, 
  MagicStick, 
  Operation, 
  ChatDotRound, 
  ChatLineRound, 
  Timer, 
  Loading,
  Monitor
} from '@element-plus/icons-vue'
import type { TextProcessResponse, StreamChunk } from '@/types/api'

// Props
interface Props {
  result?: TextProcessResponse | null
  isStreaming?: boolean
  streamChunks?: StreamChunk[]
}

const props = withDefaults(defineProps<Props>(), {
  result: null,
  isStreaming: false,
  streamChunks: () => []
})

// 响应式数据
const showDebugInfo = ref(false)

// 计算属性
const hasResult = computed(() => {
  return props.result && (
    props.result.understanding?.intent ||
    props.result.actions?.length ||
    props.result.suggestions?.length
  )
})

// 方法
const getIntentTagType = (intent: string) => {
  if (!intent) return 'info'
  
  const intentTypes: Record<string, string> = {
    'question': 'primary',
    'request': 'success',
    'complaint': 'warning',
    'compliment': 'success',
    'unknown': 'info'
  }
  
  return intentTypes[intent.toLowerCase()] || 'primary'
}

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return '#67c23a'
  if (confidence >= 0.6) return '#e6a23c'
  return '#f56c6c'
}

const getActionTagType = (priority: number) => {
  if (priority >= 3) return 'danger'
  if (priority >= 2) return 'warning'
  return 'success'
}

const getChunkTagType = (type: string) => {
  const typeMap: Record<string, string> = {
    'understanding': 'primary',
    'action': 'success',
    'suggestion': 'info',
    'complete': 'success',
    'error': 'danger'
  }
  return typeMap[type] || 'info'
}

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return timestamp
  }
}

// 监听流式数据变化，自动滚动到底部
watch(
  () => props.streamChunks.length,
  () => {
    if (props.isStreaming) {
      // 延迟滚动，确保DOM已更新
      setTimeout(() => {
        const resultPanel = document.querySelector('.result-panel .el-card__body')
        if (resultPanel) {
          resultPanel.scrollTop = resultPanel.scrollHeight
        }
      }, 100)
    }
  }
)
</script>

<style lang="scss" scoped>
.result-panel {
  height: 100%;
  
  :deep(.el-card__body) {
    height: calc(100% - 60px);
    overflow-y: auto;
    padding: 16px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--el-text-color-secondary);
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  .empty-text {
    font-size: 16px;
    margin: 0;
  }
}

.result-content {
  .streaming-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background-color: var(--el-color-primary-light-9);
    border-radius: 6px;
    margin-bottom: 16px;
    color: var(--el-color-primary);
    
    .rotating {
      animation: rotate 1s linear infinite;
    }
  }
}

.result-section {
  margin-bottom: 24px;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin: 0 0 12px 0;
    
    .toggle-debug {
      margin-left: auto;
    }
  }
}

.text-content {
  padding: 12px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 6px;
  border-left: 4px solid var(--el-color-primary);
  line-height: 1.6;
}

.understanding-content {
  .understanding-item {
    margin-bottom: 16px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .label {
      display: inline-block;
      width: 80px;
      font-weight: 500;
      color: var(--el-text-color-regular);
    }
    
    .intent-tag {
      margin-left: 8px;
    }
    
    .confidence-progress {
      width: 200px;
      margin-left: 8px;
    }
  }
  
  .entities-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: 8px;
    
    .entity-tag {
      .entity-confidence {
        opacity: 0.7;
        font-size: 12px;
      }
    }
  }
}

.actions-content {
  .action-item {
    padding: 12px;
    background-color: var(--el-fill-color-lighter);
    border-radius: 6px;
    margin-bottom: 12px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .action-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      
      .action-type {
        font-weight: 500;
        color: var(--el-text-color-primary);
      }
    }
    
    .action-params {
      .params-label {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        margin-right: 8px;
      }
      
      .params-code {
        display: block;
        background-color: var(--el-fill-color-dark);
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        margin-top: 4px;
        white-space: pre-wrap;
        overflow-x: auto;
      }
    }
  }
}

.suggestions-content {
  .suggestion-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    
    &:last-child {
      border-bottom: none;
    }
    
    .suggestion-icon {
      color: var(--el-color-primary);
      margin-top: 2px;
      flex-shrink: 0;
    }
    
    .suggestion-text {
      line-height: 1.5;
    }
  }
}

.processing-info {
  display: flex;
  gap: 24px;
  
  .info-item {
    .label {
      font-weight: 500;
      color: var(--el-text-color-regular);
      margin-right: 8px;
    }
    
    .value {
      color: var(--el-text-color-primary);
    }
  }
}

.debug-section {
  border-top: 2px dashed var(--el-border-color);
  padding-top: 16px;
  
  .debug-content {
    max-height: 300px;
    overflow-y: auto;
    
    .debug-chunk {
      margin-bottom: 12px;
      padding: 8px;
      background-color: var(--el-fill-color-lighter);
      border-radius: 4px;
      
      .chunk-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        
        .chunk-time {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
      
      .chunk-data {
        font-size: 12px;
        margin: 0;
        white-space: pre-wrap;
        overflow-x: auto;
      }
    }
  }
}

.debug-toggle {
  text-align: center;
  padding-top: 16px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// 响应式调整
@media (max-width: 768px) {
  .understanding-content {
    .understanding-item {
      .label {
        width: 100%;
        margin-bottom: 4px;
      }
      
      .confidence-progress {
        width: 100%;
        margin-left: 0;
      }
    }
    
    .entities-list {
      margin-left: 0;
    }
  }
  
  .processing-info {
    flex-direction: column;
    gap: 8px;
  }
}
</style>