import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// UI配置接口
export interface UIConfig {
  theme: 'light' | 'dark'
  language: 'zh-CN' | 'en-US'
  autoSave: boolean
  showRequestDetails: boolean
  maxHistoryItems: number
  enableNotifications: boolean
  compactMode: boolean
}

// 默认UI配置
const defaultUIConfig: UIConfig = {
  theme: 'light',
  language: 'zh-CN',
  autoSave: true,
  showRequestDetails: true,
  maxHistoryItems: 50,
  enableNotifications: true,
  compactMode: false
}

export const useConfigStore = defineStore('config', () => {
  // 状态
  const uiConfig = ref<UIConfig>({ ...defaultUIConfig })
  const isInitialized = ref(false)

  // 计算属性
  const isDarkMode = computed(() => uiConfig.value.theme === 'dark')
  const isEnglish = computed(() => uiConfig.value.language === 'en-US')
  const isChinese = computed(() => uiConfig.value.language === 'zh-CN')

  // 更新UI配置
  const updateUIConfig = (newConfig: Partial<UIConfig>) => {
    uiConfig.value = { ...uiConfig.value, ...newConfig }
    saveToLocalStorage()
    
    // 应用主题变化
    if (newConfig.theme) {
      applyTheme(newConfig.theme)
    }
  }

  // 应用主题
  const applyTheme = (theme: 'light' | 'dark') => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }

  // 切换主题
  const toggleTheme = () => {
    const newTheme = uiConfig.value.theme === 'light' ? 'dark' : 'light'
    updateUIConfig({ theme: newTheme })
  }

  // 切换语言
  const toggleLanguage = () => {
    const newLanguage = uiConfig.value.language === 'zh-CN' ? 'en-US' : 'zh-CN'
    updateUIConfig({ language: newLanguage })
  }

  // 切换紧凑模式
  const toggleCompactMode = () => {
    updateUIConfig({ compactMode: !uiConfig.value.compactMode })
  }

  // 保存到本地存储
  const saveToLocalStorage = () => {
    try {
      localStorage.setItem('ui-config', JSON.stringify(uiConfig.value))
    } catch (err) {
      console.warn('Failed to save UI config to localStorage:', err)
    }
  }

  // 从本地存储加载配置
  const loadFromLocalStorage = () => {
    try {
      const savedConfig = localStorage.getItem('ui-config')
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig)
        uiConfig.value = { ...defaultUIConfig, ...parsedConfig }
        applyTheme(uiConfig.value.theme)
      }
    } catch (err) {
      console.warn('Failed to load UI config from localStorage:', err)
      uiConfig.value = { ...defaultUIConfig }
    }
    isInitialized.value = true
  }

  // 重置配置
  const resetConfig = () => {
    uiConfig.value = { ...defaultUIConfig }
    localStorage.removeItem('ui-config')
    applyTheme(defaultUIConfig.theme)
  }

  // 导出配置
  const exportConfig = (): string => {
    return JSON.stringify(uiConfig.value, null, 2)
  }

  // 导入配置
  const importConfig = (configJson: string): boolean => {
    try {
      const importedConfig = JSON.parse(configJson)
      
      // 验证配置格式
      if (typeof importedConfig === 'object' && importedConfig !== null) {
        // 只导入有效的配置项
        const validConfig: Partial<UIConfig> = {}
        
        if (['light', 'dark'].includes(importedConfig.theme)) {
          validConfig.theme = importedConfig.theme
        }
        
        if (['zh-CN', 'en-US'].includes(importedConfig.language)) {
          validConfig.language = importedConfig.language
        }
        
        if (typeof importedConfig.autoSave === 'boolean') {
          validConfig.autoSave = importedConfig.autoSave
        }
        
        if (typeof importedConfig.showRequestDetails === 'boolean') {
          validConfig.showRequestDetails = importedConfig.showRequestDetails
        }
        
        if (typeof importedConfig.maxHistoryItems === 'number' && importedConfig.maxHistoryItems > 0) {
          validConfig.maxHistoryItems = importedConfig.maxHistoryItems
        }
        
        if (typeof importedConfig.enableNotifications === 'boolean') {
          validConfig.enableNotifications = importedConfig.enableNotifications
        }
        
        if (typeof importedConfig.compactMode === 'boolean') {
          validConfig.compactMode = importedConfig.compactMode
        }
        
        updateUIConfig(validConfig)
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to import config:', err)
      return false
    }
  }

  // 获取当前配置的副本
  const getConfig = (): UIConfig => {
    return { ...uiConfig.value }
  }

  // 检查是否为默认配置
  const isDefaultConfig = computed(() => {
    return JSON.stringify(uiConfig.value) === JSON.stringify(defaultUIConfig)
  })

  // 初始化配置
  const initialize = () => {
    if (!isInitialized.value) {
      loadFromLocalStorage()
    }
  }

  // 验证配置
  const validateConfig = (config: Partial<UIConfig>): boolean => {
    if (config.theme && !['light', 'dark'].includes(config.theme)) {
      return false
    }
    if (config.language && !['zh-CN', 'en-US'].includes(config.language)) {
      return false
    }
    if (config.maxHistoryItems !== undefined && (config.maxHistoryItems < 1 || config.maxHistoryItems > 1000)) {
      return false
    }
    return true
  }

  // 批量更新配置
  const batchUpdateConfig = (updates: Partial<UIConfig>) => {
    if (!validateConfig(updates)) {
      console.warn('Invalid configuration provided:', updates)
      return false
    }
    
    const oldConfig = { ...uiConfig.value }
    uiConfig.value = { ...uiConfig.value, ...updates }
    
    try {
      saveToLocalStorage()
      
      // 应用主题变化
      if (updates.theme && updates.theme !== oldConfig.theme) {
        applyTheme(updates.theme)
      }
      
      return true
    } catch (error) {
      // 回滚配置
      uiConfig.value = oldConfig
      console.error('Failed to update configuration:', error)
      return false
    }
  }

  // 监听系统主题变化
  const watchSystemTheme = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      
      const handleThemeChange = (e: MediaQueryListEvent) => {
        // Note: 'auto' theme is not currently supported in the UIConfig type
        // This code is kept for future enhancement
        // if (uiConfig.value.theme === 'auto') {
        //   applyTheme(e.matches ? 'dark' : 'light')
        // }
      }
      
      mediaQuery.addEventListener('change', handleThemeChange)
      
      // 返回清理函数
      return () => {
        mediaQuery.removeEventListener('change', handleThemeChange)
      }
    }
    return () => {}
  }

  return {
    // 状态
    uiConfig,
    isInitialized,
    
    // 计算属性
    isDarkMode,
    isEnglish,
    isChinese,
    isDefaultConfig,
    
    // 方法
    updateUIConfig,
    applyTheme,
    toggleTheme,
    toggleLanguage,
    toggleCompactMode,
    saveToLocalStorage,
    loadFromLocalStorage,
    resetConfig,
    exportConfig,
    importConfig,
    getConfig,
    initialize,
    validateConfig,
    batchUpdateConfig,
    watchSystemTheme
  }
})