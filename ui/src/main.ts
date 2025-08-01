import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import { useConfigStore } from '@/stores'
import { logSetupStatus } from '@/utils/verify-setup'

// 样式导入
import 'element-plus/dist/index.css'
import './styles/element-plus.scss'
import './styles/global.scss'

const app = createApp(App)

// 注册Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 创建Pinia实例
const pinia = createPinia()

// 使用插件
app.use(pinia)
app.use(ElementPlus)

// 初始化配置store
const configStore = useConfigStore()
configStore.initialize()

// 开发环境下验证设置
if (import.meta.env.DEV) {
  app.mount('#app')
  // 延迟执行验证，确保应用已完全加载
  setTimeout(() => {
    logSetupStatus()
  }, 1000)
} else {
  app.mount('#app')
}