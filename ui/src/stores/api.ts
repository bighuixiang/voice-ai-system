import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiClient, type APIConfig, type TextInputData, type VoiceOptions, type TextProcessResponse, type VoiceProcessResponse } from '@/services/api'
import type { StreamChunk, StreamState } from '@/types/api'

// API请求记录接口
export interface APIRequest {
  id: string
  type: 'text' | 'voice'
  timestamp: string
  request: {
    url: string
    method: string
    headers: Record<string, string>
    data: any
  }
  response?: {
    status: number
    headers: Record<string, string>
    data: any
    processingTime: number
  }
  error?: {
    message: string
    code: string
    details?: any
  }
  status: 'pending' | 'success' | 'error'
  duration?: number
}

export const useAPIStore = defineStore('api', () => {
  // 状态
  const config = ref<APIConfig>(getApiClient().getConfig())
  const currentRequest = ref<APIRequest | null>(null)
  const requestHistory = ref<APIRequest[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const uploadProgress = ref(0)
  
  // 流式响应状态
  const streamState = ref<StreamState | null>(null)
  const isStreaming = ref(false)

  // 计算属性
  const hasError = computed(() => error.value !== null)
  const recentRequests = computed(() => requestHistory.value.slice(0, 10))
  const successfulRequests = computed(() => 
    requestHistory.value.filter(req => req.status === 'success')
  )
  const failedRequests = computed(() => 
    requestHistory.value.filter(req => req.status === 'error')
  )

  // 清除错误
  const clearError = () => {
    error.value = null
  }

  // 文本处理
  const processText = async (data: TextInputData): Promise<TextProcessResponse> => {
    const requestId = Date.now().toString()
    isLoading.value = true
    error.value = null
    uploadProgress.value = 0

    // 创建请求记录
    const apiRequest: APIRequest = {
      id: requestId,
      type: 'text',
      timestamp: new Date().toISOString(),
      request: {
        url: '/api/process/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { ...data }
      },
      status: 'pending'
    }

    currentRequest.value = apiRequest
    requestHistory.value.unshift(apiRequest)

    try {
      const startTime = Date.now()
      const response = await getApiClient().processText(data)
      const endTime = Date.now()
      const duration = endTime - startTime

      // 更新请求记录
      apiRequest.response = {
        status: 200,
        headers: {},
        data: response,
        processingTime: response.processing_time || 0
      }
      apiRequest.status = 'success'
      apiRequest.duration = duration
      
      // 自动保存历史记录
      saveHistoryToStorage()

      return response
    } catch (err: any) {
      // 更新错误信息
      apiRequest.error = {
        message: err.message || '未知错误',
        code: err.code || 'UNKNOWN_ERROR',
        details: err
      }
      apiRequest.status = 'error'
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
      currentRequest.value = null
    }
  }

  // 语音处理
  const processVoice = async (file: File, options: VoiceOptions = {}): Promise<VoiceProcessResponse> => {
    const requestId = Date.now().toString()
    isLoading.value = true
    error.value = null
    uploadProgress.value = 0

    // 创建请求记录
    const apiRequest: APIRequest = {
      id: requestId,
      type: 'voice',
      timestamp: new Date().toISOString(),
      request: {
        url: '/api/process/voice',
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        data: { 
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          ...options 
        }
      },
      status: 'pending'
    }

    currentRequest.value = apiRequest
    requestHistory.value.unshift(apiRequest)

    try {
      const startTime = Date.now()
      const response = await getApiClient().processVoice(file, options)
      const endTime = Date.now()
      const duration = endTime - startTime

      // 更新请求记录
      apiRequest.response = {
        status: 200,
        headers: {},
        data: response,
        processingTime: response.processing_time || 0
      }
      apiRequest.status = 'success'
      apiRequest.duration = duration
      
      // 自动保存历史记录
      saveHistoryToStorage()

      return response
    } catch (err: any) {
      // 更新错误信息
      apiRequest.error = {
        message: err.message || '未知错误',
        code: err.code || 'UNKNOWN_ERROR',
        details: err
      }
      apiRequest.status = 'error'
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
      uploadProgress.value = 0
      currentRequest.value = null
    }
  }

  // 健康检查
  const checkHealth = async () => {
    try {
      const health = await getApiClient().checkHealth()
      return health
    } catch (err: any) {
      error.value = err.message
      throw err
    }
  }

  // 更新配置
  const updateConfig = (newConfig: Partial<APIConfig>) => {
    config.value = { ...config.value, ...newConfig }
    getApiClient().updateConfig(newConfig)
    
    // 保存到本地存储
    localStorage.setItem('api-config', JSON.stringify(config.value))
  }

  // 从本地存储加载配置
  const loadConfig = () => {
    try {
      const savedConfig = localStorage.getItem('api-config')
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig)
        updateConfig(parsedConfig)
      }
    } catch (err) {
      console.warn('Failed to load config from localStorage:', err)
    }
  }

  // 重置配置
  const resetConfig = () => {
    const defaultConfig = getApiClient().getConfig()
    config.value = { ...defaultConfig }
    getApiClient().updateConfig(defaultConfig)
    localStorage.removeItem('api-config')
  }

  // 清除历史记录
  const clearHistory = () => {
    requestHistory.value = []
    localStorage.removeItem('api-request-history')
  }

  // 删除特定请求记录
  const removeRequest = (requestId: string) => {
    const index = requestHistory.value.findIndex(req => req.id === requestId)
    if (index > -1) {
      requestHistory.value.splice(index, 1)
    }
  }

  // 限制历史记录数量
  const limitHistory = (maxItems: number = 50) => {
    if (requestHistory.value.length > maxItems) {
      requestHistory.value = requestHistory.value.slice(0, maxItems)
    }
  }

  // 保存历史记录到本地存储
  const saveHistoryToStorage = () => {
    try {
      const historyToSave = requestHistory.value.slice(0, 20) // 只保存最近20条记录
      localStorage.setItem('api-request-history', JSON.stringify(historyToSave))
    } catch (err) {
      console.warn('Failed to save request history to localStorage:', err)
    }
  }

  // 从本地存储加载历史记录
  const loadHistoryFromStorage = () => {
    try {
      const savedHistory = localStorage.getItem('api-request-history')
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory)
        if (Array.isArray(parsedHistory)) {
          requestHistory.value = parsedHistory
        }
      }
    } catch (err) {
      console.warn('Failed to load request history from localStorage:', err)
    }
  }

  // 自动保存历史记录（在添加新记录时调用）
  const addToHistory = (type: 'text' | 'voice', request: any, response: any) => {
    const historyItem: APIRequest = {
      id: Date.now().toString(),
      type,
      timestamp: new Date().toISOString(),
      request: {
        url: type === 'text' ? '/api/process/text' : '/api/process/voice',
        method: 'POST',
        headers: type === 'text' ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'multipart/form-data' },
        data: request
      },
      response: {
        status: 200,
        headers: {},
        data: response,
        processingTime: response.processing_time || 0
      },
      status: 'success'
    }
    
    requestHistory.value.unshift(historyItem)
    limitHistory(50) // 限制历史记录数量
    saveHistoryToStorage() // 自动保存到本地存储
  }

  // 设置上传进度
  const setUploadProgress = (progress: number) => {
    uploadProgress.value = Math.max(0, Math.min(100, progress))
  }

  // 流式文本处理
  const processTextStream = async (
    data: TextInputData,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<TextProcessResponse> => {
    const requestId = Date.now().toString()
    isLoading.value = true
    isStreaming.value = true
    error.value = null

    // 初始化流式状态
    streamState.value = {
      id: requestId,
      isStreaming: true,
      chunks: [],
      currentResponse: {
        id: requestId,
        text: data.text,
        understanding: {
          intent: '',
          entities: [],
          confidence: 0
        },
        actions: [],
        suggestions: [],
        processing_time: 0,
        timestamp: new Date().toISOString()
      }
    }

    // 创建请求记录
    const apiRequest: APIRequest = {
      id: requestId,
      type: 'text',
      timestamp: new Date().toISOString(),
      request: {
        url: '/api/process/text/stream',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { ...data, stream: true }
      },
      status: 'pending'
    }

    currentRequest.value = apiRequest
    requestHistory.value.unshift(apiRequest)

    try {
      const startTime = Date.now()
      
      const response = await getApiClient().processTextStream(
        data,
        (chunk: any) => {
          // 处理流式数据块
          const streamChunk: StreamChunk = {
            type: chunk.type || 'understanding',
            data: chunk.data || chunk,
            timestamp: new Date().toISOString()
          }

          // 添加到流式状态
          if (streamState.value) {
            streamState.value.chunks.push(streamChunk)
            
            // 更新当前响应状态
            updateCurrentResponse(streamChunk)
          }

          // 调用外部回调
          if (onChunk) {
            onChunk(streamChunk)
          }
        }
      )

      const endTime = Date.now()
      const duration = endTime - startTime

      // 更新请求记录
      apiRequest.response = {
        status: 200,
        headers: {},
        data: response,
        processingTime: response.processing_time || 0
      }
      apiRequest.status = 'success'
      apiRequest.duration = duration
      
      // 保存历史记录
      saveHistoryToStorage()

      return response
    } catch (err: any) {
      // 更新错误信息
      apiRequest.error = {
        message: err.message || '未知错误',
        code: err.code || 'UNKNOWN_ERROR',
        details: err
      }
      apiRequest.status = 'error'
      error.value = err.message
      
      // 更新流式状态错误
      if (streamState.value) {
        streamState.value.error = err.message
        streamState.value.isStreaming = false
      }
      
      throw err
    } finally {
      isLoading.value = false
      isStreaming.value = false
      currentRequest.value = null
      
      // 标记流式响应完成
      if (streamState.value) {
        streamState.value.isStreaming = false
      }
    }
  }

  // 更新当前响应状态
  const updateCurrentResponse = (chunk: StreamChunk) => {
    if (!streamState.value?.currentResponse) return

    const current = streamState.value.currentResponse

    switch (chunk.type) {
      case 'understanding':
        if (chunk.data.intent) {
          current.understanding!.intent = chunk.data.intent
        }
        if (chunk.data.entities) {
          current.understanding!.entities = chunk.data.entities
        }
        if (chunk.data.confidence !== undefined) {
          current.understanding!.confidence = chunk.data.confidence
        }
        break

      case 'action':
        if (chunk.data && !current.actions!.find(a => a.type === chunk.data.type)) {
          current.actions!.push(chunk.data)
        }
        break

      case 'suggestion':
        if (chunk.data && !current.suggestions!.includes(chunk.data)) {
          current.suggestions!.push(chunk.data)
        }
        break

      case 'complete':
        // 最终完成时更新所有数据
        if (chunk.data) {
          Object.assign(current, chunk.data)
        }
        break
    }
  }

  // 清除流式状态
  const clearStreamState = () => {
    streamState.value = null
    isStreaming.value = false
  }

  // 获取当前流式响应
  const getCurrentStreamResponse = () => {
    return streamState.value?.currentResponse || null
  }

  // 初始化时加载配置和历史记录
  loadConfig()
  loadHistoryFromStorage()

  return {
    // 状态
    config,
    currentRequest,
    requestHistory,
    isLoading,
    error,
    uploadProgress,
    streamState,
    isStreaming,
    
    // 计算属性
    hasError,
    recentRequests,
    successfulRequests,
    failedRequests,
    
    // 方法
    clearError,
    processText,
    processTextStream,
    processVoice,
    checkHealth,
    updateConfig,
    loadConfig,
    resetConfig,
    clearHistory,
    removeRequest,
    limitHistory,
    saveHistoryToStorage,
    loadHistoryFromStorage,
    addToHistory,
    setUploadProgress,
    clearStreamState,
    getCurrentStreamResponse
  }
})