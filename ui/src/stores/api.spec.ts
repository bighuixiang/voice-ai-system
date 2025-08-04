import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAPIStore } from './api'
import type { TextInputData, VoiceOptions } from '@/services/api'

// Mock the API client
vi.mock('@/services/api', () => ({
  getApiClient: () => ({
    getConfig: () => ({
      baseURL: 'http://localhost:8000',
      timeout: 30000,
      maxFileSize: 52428800,
      supportedAudioFormats: ['wav', 'mp3', 'm4a', 'flac'],
      supportedLanguages: ['zh-CN', 'en-US'],
      maxRetries: 3,
      retryDelay: 1000
    }),
    updateConfig: vi.fn(),
    processText: vi.fn(),
    processVoice: vi.fn(),
    checkHealth: vi.fn()
  })
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('API Store', () => {
  let store: ReturnType<typeof useAPIStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAPIStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(null)
      expect(store.uploadProgress).toBe(0)
      expect(store.currentRequest).toBe(null)
      expect(store.requestHistory).toEqual([])
    })

    it('应该有正确的计算属性', () => {
      expect(store.hasError).toBe(false)
      expect(store.recentRequests).toEqual([])
      expect(store.successfulRequests).toEqual([])
      expect(store.failedRequests).toEqual([])
    })
  })

  describe('配置管理', () => {
    it('应该能够更新配置', () => {
      const newConfig = { baseURL: 'http://localhost:4000' }
      store.updateConfig(newConfig)
      
      expect(store.config.baseURL).toBe('http://localhost:4000')
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'api-config',
        JSON.stringify(store.config)
      )
    })

    it('应该能够重置配置', () => {
      store.resetConfig()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('api-config')
    })

    it('应该能够从本地存储加载配置', () => {
      const savedConfig = { baseURL: 'http://localhost:5000' }
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedConfig))
      
      store.loadConfig()
      expect(store.config.baseURL).toBe('http://localhost:5000')
    })
  })

  describe('历史记录管理', () => {
    it('应该能够清除历史记录', () => {
      store.clearHistory()
      expect(store.requestHistory).toEqual([])
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('api-request-history')
    })

    it('应该能够删除特定请求记录', () => {
      const mockRequest = {
        id: '123',
        type: 'text' as const,
        timestamp: new Date().toISOString(),
        request: { url: '/test', method: 'POST', headers: {}, data: {} },
        status: 'success' as const
      }
      
      store.requestHistory.push(mockRequest)
      store.removeRequest('123')
      
      expect(store.requestHistory).toEqual([])
    })

    it('应该能够限制历史记录数量', () => {
      // 添加多个请求记录
      for (let i = 0; i < 60; i++) {
        store.requestHistory.push({
          id: i.toString(),
          type: 'text',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'success'
        })
      }
      
      store.limitHistory(50)
      expect(store.requestHistory.length).toBe(50)
    })

    it('应该能够保存历史记录到本地存储', () => {
      const mockRequest = {
        id: '123',
        type: 'text' as const,
        timestamp: new Date().toISOString(),
        request: { url: '/test', method: 'POST', headers: {}, data: {} },
        status: 'success' as const
      }
      
      store.requestHistory.push(mockRequest)
      store.saveHistoryToStorage()
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'api-request-history',
        JSON.stringify([mockRequest])
      )
    })

    it('应该能够从本地存储加载历史记录', () => {
      const savedHistory = [{
        id: '123',
        type: 'text',
        timestamp: new Date().toISOString(),
        request: { url: '/test', method: 'POST', headers: {}, data: {} },
        status: 'success'
      }]
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedHistory))
      store.loadHistoryFromStorage()
      
      expect(store.requestHistory).toEqual(savedHistory)
    })
  })

  describe('错误处理', () => {
    it('应该能够清除错误', () => {
      store.error = '测试错误'
      store.clearError()
      expect(store.error).toBe(null)
    })

    it('hasError 计算属性应该正确反映错误状态', () => {
      expect(store.hasError).toBe(false)
      
      store.error = '测试错误'
      expect(store.hasError).toBe(true)
    })
  })

  describe('上传进度', () => {
    it('应该能够设置上传进度', () => {
      store.setUploadProgress(50)
      expect(store.uploadProgress).toBe(50)
    })

    it('应该限制上传进度在0-100之间', () => {
      store.setUploadProgress(-10)
      expect(store.uploadProgress).toBe(0)
      
      store.setUploadProgress(150)
      expect(store.uploadProgress).toBe(100)
    })
  })

  describe('计算属性', () => {
    beforeEach(() => {
      // 清空历史记录并添加测试数据
      store.requestHistory.length = 0
      store.requestHistory.push(
        {
          id: '1',
          type: 'text',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'success'
        },
        {
          id: '2',
          type: 'voice',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'error'
        },
        {
          id: '3',
          type: 'text',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'success'
        }
      )
    })

    it('recentRequests 应该返回最近10条请求', () => {
      expect(store.recentRequests.length).toBe(3)
    })

    it('successfulRequests 应该只返回成功的请求', () => {
      expect(store.successfulRequests.length).toBe(2)
      expect(store.successfulRequests.every(req => req.status === 'success')).toBe(true)
    })

    it('failedRequests 应该只返回失败的请求', () => {
      expect(store.failedRequests.length).toBe(1)
      expect(store.failedRequests.every(req => req.status === 'error')).toBe(true)
    })
  })
})