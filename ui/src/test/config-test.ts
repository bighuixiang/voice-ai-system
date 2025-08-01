// 测试配置是否正确工作
import { getApiClient } from '@/services/api'
import { useAPIStore, useConfigStore } from '@/stores'

// 测试API客户端
console.log('API Client Config:', getApiClient().getConfig())

// 测试类型导入
export function testConfiguration() {
  // 这个函数用于验证所有导入是否正确
  const config = getApiClient().getConfig()
  
  return {
    apiBaseURL: config.baseURL,
    timeout: config.timeout,
    supportedFormats: config.supportedAudioFormats,
    storesAvailable: {
      apiStore: typeof useAPIStore === 'function',
      configStore: typeof useConfigStore === 'function'
    }
  }
}

export default testConfiguration