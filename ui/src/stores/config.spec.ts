import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigStore } from './config'
import type { UIConfig } from './config'

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

// Mock document and window
Object.defineProperty(document, 'documentElement', {
  value: {
    classList: {
      add: vi.fn(),
      remove: vi.fn()
    }
  }
})

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
})

describe('Config Store', () => {
  let store: ReturnType<typeof useConfigStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useConfigStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      expect(store.uiConfig.theme).toBe('light')
      expect(store.uiConfig.language).toBe('zh-CN')
      expect(store.uiConfig.autoSave).toBe(true)
      expect(store.uiConfig.showRequestDetails).toBe(true)
      expect(store.uiConfig.maxHistoryItems).toBe(50)
      expect(store.uiConfig.enableNotifications).toBe(true)
      expect(store.uiConfig.compactMode).toBe(false)
    })

    it('应该有正确的计算属性', () => {
      expect(store.isDarkMode).toBe(false)
      expect(store.isEnglish).toBe(false)
      expect(store.isChinese).toBe(true)
      expect(store.isDefaultConfig).toBe(true)
    })
  })

  describe('主题管理', () => {
    it('应该能够切换主题', () => {
      store.toggleTheme()
      expect(store.uiConfig.theme).toBe('dark')
      expect(store.isDarkMode).toBe(true)
      
      store.toggleTheme()
      expect(store.uiConfig.theme).toBe('light')
      expect(store.isDarkMode).toBe(false)
    })

    it('应该能够应用主题到DOM', () => {
      const htmlElement = document.documentElement
      
      store.applyTheme('dark')
      expect(htmlElement.classList.add).toHaveBeenCalledWith('dark')
      
      store.applyTheme('light')
      expect(htmlElement.classList.remove).toHaveBeenCalledWith('dark')
    })
  })

  describe('语言管理', () => {
    it('应该能够切换语言', () => {
      store.toggleLanguage()
      expect(store.uiConfig.language).toBe('en-US')
      expect(store.isEnglish).toBe(true)
      expect(store.isChinese).toBe(false)
      
      store.toggleLanguage()
      expect(store.uiConfig.language).toBe('zh-CN')
      expect(store.isEnglish).toBe(false)
      expect(store.isChinese).toBe(true)
    })
  })

  describe('紧凑模式', () => {
    it('应该能够切换紧凑模式', () => {
      expect(store.uiConfig.compactMode).toBe(false)
      
      store.toggleCompactMode()
      expect(store.uiConfig.compactMode).toBe(true)
      
      store.toggleCompactMode()
      expect(store.uiConfig.compactMode).toBe(false)
    })
  })

  describe('配置更新', () => {
    it('应该能够更新UI配置', () => {
      const newConfig: Partial<UIConfig> = {
        theme: 'dark',
        language: 'en-US',
        autoSave: false
      }
      
      store.updateUIConfig(newConfig)
      
      expect(store.uiConfig.theme).toBe('dark')
      expect(store.uiConfig.language).toBe('en-US')
      expect(store.uiConfig.autoSave).toBe(false)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ui-config',
        JSON.stringify(store.uiConfig)
      )
    })

    it('应该能够批量更新配置', () => {
      const updates: Partial<UIConfig> = {
        theme: 'dark',
        maxHistoryItems: 100,
        enableNotifications: false
      }
      
      const result = store.batchUpdateConfig(updates)
      
      expect(result).toBe(true)
      expect(store.uiConfig.theme).toBe('dark')
      expect(store.uiConfig.maxHistoryItems).toBe(100)
      expect(store.uiConfig.enableNotifications).toBe(false)
    })
  })

  describe('配置验证', () => {
    it('应该验证有效的配置', () => {
      const validConfig: Partial<UIConfig> = {
        theme: 'dark',
        language: 'en-US',
        maxHistoryItems: 100
      }
      
      expect(store.validateConfig(validConfig)).toBe(true)
    })

    it('应该拒绝无效的主题', () => {
      const invalidConfig = { theme: 'invalid' as any }
      expect(store.validateConfig(invalidConfig)).toBe(false)
    })

    it('应该拒绝无效的语言', () => {
      const invalidConfig = { language: 'invalid' as any }
      expect(store.validateConfig(invalidConfig)).toBe(false)
    })

    it('应该拒绝无效的历史记录数量', () => {
      expect(store.validateConfig({ maxHistoryItems: 0 })).toBe(false)
      expect(store.validateConfig({ maxHistoryItems: 1001 })).toBe(false)
      expect(store.validateConfig({ maxHistoryItems: 50 })).toBe(true)
    })
  })

  describe('本地存储', () => {
    it('应该能够保存配置到本地存储', () => {
      store.saveToLocalStorage()
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ui-config',
        JSON.stringify(store.uiConfig)
      )
    })

    it('应该能够从本地存储加载配置', () => {
      const savedConfig: UIConfig = {
        theme: 'dark',
        language: 'en-US',
        autoSave: false,
        showRequestDetails: false,
        maxHistoryItems: 100,
        enableNotifications: false,
        compactMode: true
      }
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedConfig))
      store.loadFromLocalStorage()
      
      expect(store.uiConfig).toEqual(savedConfig)
      expect(store.isInitialized).toBe(true)
    })

    it('应该处理本地存储加载错误', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('Storage error')
      })
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      store.loadFromLocalStorage()
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load UI config from localStorage:',
        expect.any(Error)
      )
      expect(store.isInitialized).toBe(true)
      
      consoleSpy.mockRestore()
    })
  })

  describe('配置重置', () => {
    it('应该能够重置配置', () => {
      // 先修改配置
      store.updateUIConfig({ theme: 'dark', language: 'en-US' })
      
      // 重置配置
      store.resetConfig()
      
      expect(store.uiConfig.theme).toBe('light')
      expect(store.uiConfig.language).toBe('zh-CN')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('ui-config')
    })
  })

  describe('配置导入导出', () => {
    it('应该能够导出配置', () => {
      const exported = store.exportConfig()
      const parsed = JSON.parse(exported)
      
      expect(parsed).toEqual(store.uiConfig)
    })

    it('应该能够导入有效配置', () => {
      const configToImport: UIConfig = {
        theme: 'dark',
        language: 'en-US',
        autoSave: false,
        showRequestDetails: false,
        maxHistoryItems: 100,
        enableNotifications: false,
        compactMode: true
      }
      
      const result = store.importConfig(JSON.stringify(configToImport))
      
      expect(result).toBe(true)
      expect(store.uiConfig.theme).toBe('dark')
      expect(store.uiConfig.language).toBe('en-US')
    })

    it('应该拒绝无效的导入配置', () => {
      const result = store.importConfig('invalid json')
      expect(result).toBe(false)
    })

    it('应该只导入有效的配置项', () => {
      const partialConfig = {
        theme: 'dark',
        invalidField: 'invalid',
        maxHistoryItems: 200
      }
      
      const result = store.importConfig(JSON.stringify(partialConfig))
      
      expect(result).toBe(true)
      expect(store.uiConfig.theme).toBe('dark')
      expect(store.uiConfig.maxHistoryItems).toBe(200)
      expect((store.uiConfig as any).invalidField).toBeUndefined()
    })
  })

  describe('获取配置', () => {
    it('应该返回配置的副本', () => {
      const config = store.getConfig()
      
      expect(config).toEqual(store.uiConfig)
      expect(config).not.toBe(store.uiConfig) // 应该是副本，不是同一个对象
    })
  })

  describe('初始化', () => {
    it('应该能够初始化配置', () => {
      const newStore = useConfigStore()
      newStore.initialize()
      
      expect(newStore.isInitialized).toBe(true)
    })

    it('不应该重复初始化', () => {
      store.initialize()
      const loadSpy = vi.spyOn(store, 'loadFromLocalStorage')
      
      store.initialize() // 第二次调用
      
      expect(loadSpy).not.toHaveBeenCalled()
    })
  })

  describe('系统主题监听', () => {
    it('应该能够设置系统主题监听器', () => {
      const mockMediaQuery = {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
      
      vi.mocked(window.matchMedia).mockReturnValue(mockMediaQuery as any)
      
      const cleanup = store.watchSystemTheme()
      
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
      
      // 测试清理函数
      cleanup()
      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })
  })
})