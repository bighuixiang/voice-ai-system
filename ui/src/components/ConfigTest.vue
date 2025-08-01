<template>
  <div :class="styles.testContainer">
    <el-card :class="styles.testCard">
      <template #header>
        <div :class="styles.cardHeader">
          <h3>配置测试组件</h3>
          <el-tag type="success">Task 2 验证</el-tag>
        </div>
      </template>

      <!-- Element Plus 测试 -->
      <div :class="styles.testSection">
        <h4>Element Plus 组件测试</h4>
        <div :class="styles.elementTest">
          <el-button type="primary" @click="showMessage">
            <el-icon><Check /></el-icon>
            测试消息
          </el-button>
          <el-button type="success" @click="showNotification">
            <el-icon><Bell /></el-icon>
            测试通知
          </el-button>
          <el-switch v-model="testSwitch" />
        </div>
      </div>

      <!-- Pinia Store 测试 -->
      <div :class="styles.testSection">
        <h4>Pinia 状态管理测试</h4>
        <div :class="styles.storeTest">
          <p>当前主题: {{ configStore.uiConfig.theme }}</p>
          <p>API 基础URL: {{ apiStore.config.baseURL }}</p>
          <el-button @click="configStore.toggleTheme()">切换主题</el-button>
          <el-button @click="testApiStore">测试 API Store</el-button>
        </div>
      </div>

      <!-- SCSS 变量测试 -->
      <div :class="styles.testSection">
        <h4>SCSS 样式测试</h4>
        <div :class="styles.scssTest">
          <div :class="styles.colorBox" class="primary">Primary Color</div>
          <div :class="styles.colorBox" class="success">Success Color</div>
          <div :class="styles.colorBox" class="warning">Warning Color</div>
          <div :class="styles.colorBox" class="danger">Danger Color</div>
        </div>
      </div>

      <!-- CSS Modules 测试 -->
      <div :class="styles.testSection">
        <h4>CSS Modules 测试</h4>
        <div :class="styles.modulesTest">
          <p>这个组件使用了 CSS Modules</p>
          <p>类名会被自动转换为唯一标识符</p>
          <div :class="styles.moduleExample">
            示例模块化样式
          </div>
        </div>
      </div>

      <!-- Axios 测试 -->
      <div :class="styles.testSection">
        <h4>Axios HTTP 客户端测试</h4>
        <div :class="styles.axiosTest">
          <el-button 
            @click="testHealthCheck" 
            :loading="isLoading"
            type="info"
          >
            <el-icon><Connection /></el-icon>
            测试健康检查
          </el-button>
          <p v-if="healthStatus">
            状态: {{ healthStatus.status }}
          </p>
          <p v-if="apiError" class="error">
            错误: {{ apiError }}
          </p>
        </div>
      </div>

      <!-- 工具类测试 -->
      <div :class="styles.testSection">
        <h4>工具类测试</h4>
        <div class="flex justify-between items-center p-md border rounded">
          <span class="text-primary font-medium">Flexbox 工具类</span>
          <el-tag class="animate-pulse">动画效果</el-tag>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { Check, Bell, Connection } from '@element-plus/icons-vue'
import { useAPIStore, useConfigStore } from '@/stores'
import type { HealthStatus } from '@/services/api'
import styles from '@/styles/components.module.scss'

// 响应式数据
const testSwitch = ref(false)
const isLoading = ref(false)
const healthStatus = ref<HealthStatus | null>(null)
const apiError = ref<string | null>(null)

// 使用 stores
const apiStore = useAPIStore()
const configStore = useConfigStore()

// Element Plus 测试方法
const showMessage = () => {
  ElMessage.success('Element Plus 消息组件工作正常！')
}

const showNotification = () => {
  ElNotification({
    title: '通知测试',
    message: 'Element Plus 通知组件工作正常！',
    type: 'success'
  })
}

// API Store 测试
const testApiStore = () => {
  console.log('API Store 状态:', {
    config: apiStore.config,
    isLoading: apiStore.isLoading,
    requestHistory: apiStore.requestHistory.length
  })
  ElMessage.info('请查看控制台输出')
}

// 健康检查测试
const testHealthCheck = async () => {
  isLoading.value = true
  apiError.value = null
  healthStatus.value = null
  
  try {
    const result = await apiStore.checkHealth()
    healthStatus.value = result
    ElMessage.success('健康检查成功！')
  } catch (error: any) {
    apiError.value = error.message
    ElMessage.error('健康检查失败')
  } finally {
    isLoading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use "@/styles/variables" as *;
@use "@/styles/mixins" as *;

.error {
  color: $danger-color;
  font-size: $font-size-small;
}
</style>