import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

import App from './App.vue'
import { router } from './router'
import { applyInitialTheme } from './stores/theme'

// 样式导入
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/element-plus.scss'
import './styles/global.scss'

applyInitialTheme()

const app = createApp(App)

// 注册Element Plus图标
// 创建Pinia实例
const pinia = createPinia()

// 使用插件
app.use(pinia)
app.use(ElementPlus)
app.use(router)

app.mount('#app')
