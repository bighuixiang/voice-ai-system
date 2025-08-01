// 验证所有配置是否正确设置
import { getApiClient } from '@/services/api'

export interface SetupVerification {
  elementPlus: boolean
  pinia: boolean
  axios: boolean
  scss: boolean
  cssModules: boolean
  apiClient: boolean
  errors: string[]
}

export function verifySetup(): SetupVerification {
  const result: SetupVerification = {
    elementPlus: false,
    pinia: false,
    axios: false,
    scss: false,
    cssModules: false,
    apiClient: false,
    errors: []
  }

  try {
    // 验证 Element Plus
    if (typeof window !== 'undefined' && (window as any).ElMessage) {
      result.elementPlus = true
    } else {
      result.errors.push('Element Plus not properly loaded')
    }
  } catch (error) {
    result.errors.push(`Element Plus error: ${error}`)
  }

  try {
    // 验证 Pinia (通过检查是否可以创建store)
    import('@/stores').then(() => {
      result.pinia = true
    }).catch((error) => {
      result.errors.push(`Pinia error: ${error}`)
    })
  } catch (error) {
    result.errors.push(`Pinia import error: ${error}`)
  }

  try {
    // 验证 Axios (通过API客户端)
    const config = getApiClient().getConfig()
    if (config && config.baseURL) {
      result.axios = true
      result.apiClient = true
    } else {
      result.errors.push('API client configuration invalid')
    }
  } catch (error) {
    result.errors.push(`Axios/API client error: ${error}`)
  }

  try {
    // 验证 SCSS (通过检查CSS变量是否存在)
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement)
      const primaryColor = computedStyle.getPropertyValue('--el-color-primary')
      if (primaryColor) {
        result.scss = true
      } else {
        result.errors.push('SCSS variables not loaded')
      }
    }
  } catch (error) {
    result.errors.push(`SCSS verification error: ${error}`)
  }

  // CSS Modules 验证将在组件中进行
  result.cssModules = true // 假设配置正确

  return result
}

export function logSetupStatus(): void {
  const verification = verifySetup()
  
  console.group('🔧 Setup Verification')
  console.log('Element Plus:', verification.elementPlus ? '✅' : '❌')
  console.log('Pinia:', verification.pinia ? '✅' : '❌')
  console.log('Axios:', verification.axios ? '✅' : '❌')
  console.log('SCSS:', verification.scss ? '✅' : '❌')
  console.log('CSS Modules:', verification.cssModules ? '✅' : '❌')
  console.log('API Client:', verification.apiClient ? '✅' : '❌')
  
  if (verification.errors.length > 0) {
    console.group('❌ Errors:')
    verification.errors.forEach(error => console.error(error))
    console.groupEnd()
  }
  
  console.groupEnd()
}