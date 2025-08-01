import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAPIStore } from './api'
import { useConfigStore } from './config'

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

// Mock API client
vi.mock('@/services/api', () => ({
  getApiClient: () => ({
    getConfig: () => ({
      baseURL: 'http://localhost:3000',
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

// Mock document
Object.defineProperty(document, 'documentElement', {
  value: {
    classList: {
      add: vi.fn(),
      remove: vi.fn()
    }
  }
})

describe('Store Integration Tests', () => {
  let apiStore: ReturnType<typeof useAPIStore>
  let configStore: ReturnType<typeof useConfigStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    apiStore = useAPIStore()
    configStore = useConfigStore()
    vi.clearAllMocks()
  })

  describe('Store初始化', () => {
    it('两个store应该能够独立初始化', () => {
      expect(apiStore.isLoading).toBe(false)
      expect(apiStore.error).toBe(null)
      expect(configStore.uiConfig.theme).toBe('light')
      expect(configStore.isInitialized).toBe(false)
    })

    it('配置store初始化后应该设置正确的状态', () => {
      configStore.initialize()
      expect(configStore.isInitialized).toBe(true)
    })
  })

  describe('配置联动', () => {
    it('配置store的maxHistoryItems应该影响API store的历史记录限制', () => {
      // 设置配置store的历史记录限制
      configStore.updateUIConfig({ maxHistoryItems: 10 })
      
      // 添加超过限制的历史记录
      for (let i = 0; i < 15; i++) {
        apiStore.requestHistory.push({
          id: i.toString(),
          type: 'text',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'success'
        })
      }
      
      // 应用配置store的限制
      apiStore.limitHistory(configStore.uiConfig.maxHistoryItems)
      
      expect(apiStore.requestHistory.length).toBe(10)
    })

    it('主题变化应该正确应用到DOM', () => {
      const htmlElement = document.documentElement
      
      // 切换到暗黑主题
      configStore.toggleTheme()
      expect(configStore.isDarkMode).toBe(true)
      expect(htmlElement.classList.add).toHaveBeenCalledWith('dark')
      
      // 切换回明亮主题
      configStore.toggleTheme()
      expect(configStore.isDarkMode).toBe(false)
      expect(htmlElement.classList.remove).toHaveBeenCalledWith('dark')
    })
  })

  describe('本地存储集成', () => {
    it('两个store应该使用不同的localStorage键', () => {
      // 保存API配置
      apiStore.updateConfig({ baseURL: 'http://localhost:4000' })
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'api-config',
        expect.any(String)
      )
      
      // 保存UI配置
      configStore.updateUIConfig({ theme: 'dark' })
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ui-config',
        expect.any(String)
      )
      
      // 保存历史记录
      apiStore.saveHistoryToStorage()
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'api-request-history',
        expect.any(String)
      )
    })

    it('清除数据时应该正确清理localStorage', () => {
      // 清除API历史记录
      apiStore.clearHistory()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('api-request-history')
      
      // 重置API配置
      apiStore.resetConfig()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('api-config')
      
      // 重置UI配置
      configStore.resetConfig()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('ui-config')
    })
  })

  describe('错误处理集成', () => {
    it('API错误不应该影响配置store', () => {
      // 设置API错误
      apiStore.error = 'API请求失败'
      
      // 配置store应该仍然正常工作
      expect(() => {
        configStore.toggleTheme()
        configStore.updateUIConfig({ language: 'en-US' })
      }).not.toThrow()
      
      expect(configStore.uiConfig.theme).toBe('dark')
      expect(configStore.uiConfig.language).toBe('en-US')
    })

    it('配置错误不应该影响API store', () => {
      // 模拟配置导入错误
      const result = configStore.importConfig('invalid json')
      expect(result).toBe(false)
      
      // API store应该仍然正常工作
      expect(() => {
        apiStore.clearError()
        apiStore.setUploadProgress(50)
      }).not.toThrow()
      
      expect(apiStore.error).toBe(null)
      expect(apiStore.uploadProgress).toBe(50)
    })
  })

  describe('状态同步', () => {
    it('多个组件使用同一个store实例', () => {
      // 在第一个"组件"中修改状态
      const apiStore1 = useAPIStore()
      const configStore1 = useConfigStore()
      
      apiStore1.setUploadProgress(75)
      configStore1.updateUIConfig({ compactMode: true })
      
      // 在第二个"组件"中访问状态
      const apiStore2 = useAPIStore()
      const configStore2 = useConfigStore()
      
      expect(apiStore2.uploadProgress).toBe(75)
      expect(configStore2.uiConfig.compactMode).toBe(true)
      
      // 应该是同一个实例
      expect(apiStore1).toBe(apiStore2)
      expect(configStore1).toBe(configStore2)
    })
  })

  describe('计算属性响应性', () => {
    it('API store计算属性应该响应状态变化', () => {
      expect(apiStore.hasError).toBe(false)
      
      apiStore.error = '测试错误'
      expect(apiStore.hasError).toBe(true)
      
      apiStore.clearError()
      expect(apiStore.hasError).toBe(false)
    })

    it('配置store计算属性应该响应状态变化', () => {
      expect(configStore.isDarkMode).toBe(false)
      expect(configStore.isChinese).toBe(true)
      
      configStore.updateUIConfig({ 
        theme: 'dark',
        language: 'en-US'
      })
      
      expect(configStore.isDarkMode).toBe(true)
      expect(configStore.isChinese).toBe(false)
      expect(configStore.isEnglish).toBe(true)
    })
  })

  describe('性能优化验证', () => {
    it('历史记录应该自动限制数量', () => {
      // 添加大量历史记录
      for (let i = 0; i < 100; i++) {
        apiStore.requestHistory.push({
          id: i.toString(),
          type: 'text',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'success'
        })
      }
      
      // 应用默认限制
      apiStore.limitHistory()
      
      expect(apiStore.requestHistory.length).toBe(50)
    })

    it('本地存储应该只保存必要的历史记录', () => {
      // 添加大量历史记录
      for (let i = 0; i < 30; i++) {
        apiStore.requestHistory.push({
          id: i.toString(),
          type: 'text',
          timestamp: new Date().toISOString(),
          request: { url: '/test', method: 'POST', headers: {}, data: {} },
          status: 'success'
        })
      }
      
      apiStore.saveHistoryToStorage()
      
      // 验证只保存了最近20条记录
      const savedData = localStorageMock.setItem.mock.calls.find(
        call => call[0] === 'api-request-history'
      )
      
      expect(savedData).toBeDefined()
      const parsedData = JSON.parse(savedData[1])
      expect(parsedData.length).toBe(20)
    })
  })
})