<template>
  <div :class="styles.textInputPanel">
    <div :class="styles.header">
      <h3 :class="styles.title">
        <el-icon><EditPen /></el-icon>
        文本输入测试
      </h3>
      <div :class="styles.actions">
        <el-button 
          v-if="hasInput" 
          size="small" 
          @click="clearInput"
          :disabled="isLoading"
        >
          清空
        </el-button>
      </div>
    </div>

    <div :class="styles.content">
      <!-- 文本输入区域 -->
      <div :class="styles.inputArea">
        <el-input
          v-model="inputData.text"
          type="textarea"
          :placeholder="placeholder"
          :rows="6"
          :maxlength="maxLength"
          show-word-limit
          resize="vertical"
          :disabled="isLoading"
          @input="handleTextInput"
          @blur="validateInput"
          data-test="text-input"
        />
        <div v-if="inputError" :class="styles.errorMessage">
          <el-icon><WarningFilled /></el-icon>
          {{ inputError }}
        </div>
      </div>

      <!-- 配置选项 -->
      <div :class="styles.configOptions">
        <div :class="styles.option">
          <label :class="styles.label">上下文信息（可选）</label>
          <el-input
            v-model="inputData.context"
            placeholder="输入相关上下文信息，帮助系统更好地理解文本"
            :disabled="isLoading"
            maxlength="200"
            show-word-limit
          />
        </div>
        
        <div :class="styles.option">
          <el-checkbox 
            v-model="inputData.useKnowledge"
            :disabled="isLoading"
            data-test="use-knowledge-checkbox"
          >
            启用知识库查询
          </el-checkbox>
          <div :class="styles.optionHint">
            启用后将使用知识库信息来增强理解和决策
          </div>
        </div>
      </div>

      <!-- 提交按钮 -->
      <el-button
        type="primary"
        size="large"
        :class="styles.submitButton"
        :loading="isLoading"
        :disabled="!canSubmit"
        @click="handleSubmit"
        data-test="submit-button"
      >
        <template v-if="!isLoading">
          <el-icon><Position /></el-icon>
          处理文本
        </template>
        <template v-else>
          处理中...
        </template>
      </el-button>

      <!-- 错误提示 -->
      <el-alert
        v-if="submitError"
        :title="submitError"
        type="error"
        :closable="true"
        @close="clearError"
        :class="styles.errorAlert"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen, WarningFilled, Position } from '@element-plus/icons-vue'
import { useAPIStore } from '@/stores/api'
import type { TextInputData, TextProcessResponse } from '@/types/api'
import styles from './TextInputPanel.module.scss'

// Props
interface Props {
  maxLength?: number
  placeholder?: string
  autoFocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxLength: 2000,
  placeholder: '请输入要处理的文本内容...',
  autoFocus: false
})

// Emits
interface Emits {
  (e: 'submit', data: TextInputData): void
  (e: 'success', response: TextProcessResponse): void
  (e: 'error', error: string): void
}

const emit = defineEmits<Emits>()

// Store
const apiStore = useAPIStore()

// 响应式数据
const inputData = ref<TextInputData>({
  text: '',
  context: '',
  useKnowledge: true
})

const inputError = ref<string>('')
const submitError = ref<string>('')

// 计算属性
const isLoading = computed(() => apiStore.isLoading)
const hasInput = computed(() => inputData.value.text.trim().length > 0)
const canSubmit = computed(() => {
  return hasInput.value && !inputError.value && !isLoading.value
})

// 输入验证
const validateInput = () => {
  const text = inputData.value.text.trim()
  
  if (!text) {
    inputError.value = ''
    return true
  }
  
  if (text.length < 2) {
    inputError.value = '文本内容至少需要2个字符'
    return false
  }
  
  if (text.length > props.maxLength) {
    inputError.value = `文本内容不能超过${props.maxLength}个字符`
    return false
  }
  
  // 检查是否包含有效内容（不只是空格和特殊字符）
  const validContentRegex = /[\u4e00-\u9fa5a-zA-Z0-9]/
  if (!validContentRegex.test(text)) {
    inputError.value = '请输入有效的文本内容'
    return false
  }
  
  inputError.value = ''
  return true
}

// 处理文本输入
const handleTextInput = (value: string) => {
  // 清除之前的错误
  if (inputError.value) {
    inputError.value = ''
  }
  if (submitError.value) {
    submitError.value = ''
  }
  
  // 实时验证（但不显示错误，只在失焦时显示）
  if (value.trim().length > 0) {
    validateInput()
  }
}

// 提交处理
const handleSubmit = async () => {
  // 最终验证
  if (!validateInput()) {
    return
  }
  
  const submitData: TextInputData = {
    text: inputData.value.text.trim(),
    context: inputData.value.context.trim() || undefined,
    useKnowledge: inputData.value.useKnowledge
  }
  
  try {
    // 清除之前的错误
    clearError()
    
    // 触发提交事件
    emit('submit', submitData)
    
    // 调用API
    const response = await apiStore.processText(submitData)
    
    // 成功提示
    ElMessage.success('文本处理完成')
    
    // 触发成功事件
    emit('success', response)
    
  } catch (error: any) {
    const errorMessage = error.message || '文本处理失败，请重试'
    submitError.value = errorMessage
    
    // 触发错误事件
    emit('error', errorMessage)
    
    // 错误提示
    ElMessage.error(errorMessage)
  }
}

// 清空输入
const clearInput = () => {
  inputData.value = {
    text: '',
    context: '',
    useKnowledge: true
  }
  inputError.value = ''
  submitError.value = ''
}

// 清除错误
const clearError = () => {
  submitError.value = ''
  apiStore.clearError()
}

// 监听API store的错误状态
watch(
  () => apiStore.error,
  (newError) => {
    if (newError && !submitError.value) {
      submitError.value = newError
    }
  }
)

// 组件挂载后自动聚焦
if (props.autoFocus) {
  // 使用nextTick确保DOM已渲染
  import('vue').then(({ nextTick }) => {
    nextTick(() => {
      const textareaEl = document.querySelector('[data-test="text-input"] textarea') as HTMLTextAreaElement
      if (textareaEl) {
        textareaEl.focus()
      }
    })
  })
}

// 暴露方法给父组件
defineExpose({
  clearInput,
  validateInput,
  submit: handleSubmit,
  inputData: computed(() => inputData.value),
  isValid: computed(() => canSubmit.value)
})
</script>