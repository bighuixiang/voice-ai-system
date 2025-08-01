import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// 全局配置测试环境
config.global.plugins = [ElementPlus]

// Mock环境变量
Object.defineProperty(window, 'import.meta', {
  value: {
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000',
      VITE_MAX_FILE_SIZE: '52428800',
      VITE_SUPPORTED_AUDIO_FORMATS: 'wav,mp3,m4a,flac'
    }
  }
})