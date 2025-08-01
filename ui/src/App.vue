<template>
  <div class="app">
    <el-container class="app-container">
      <el-header class="app-header">
        <div class="header-content">
          <h1 class="app-title">
            <el-icon><Microphone /></el-icon>
            Voice AI Test UI
          </h1>
          <div class="header-actions">
            <el-button type="primary" @click="showConfig = !showConfig">
              <el-icon><Setting /></el-icon>
              配置
            </el-button>
          </div>
        </div>
      </el-header>
      
      <el-main class="app-main">
        <div class="main-content">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
              <div class="test-panels">
                <TextInputPanel
                  @submit="handleTextSubmit"
                  @success="handleTextSuccess"
                  @error="handleTextError"
                />
                
                <!-- 配置测试组件 -->
                <ConfigTest />
                
                <el-card class="panel-card" header="语音测试">
                  <div class="placeholder-content">
                    语音输入面板 - 待实现
                  </div>
                </el-card>
              </div>
            </el-col>
            
            <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
              <div class="result-panels">
                <el-card class="panel-card" header="处理结果">
                  <div class="placeholder-content">
                    结果展示面板 - 待实现
                  </div>
                </el-card>
                
                <el-card class="panel-card" header="请求日志">
                  <div class="placeholder-content">
                    请求日志面板 - 待实现
                  </div>
                </el-card>
              </div>
            </el-col>
          </el-row>
        </div>
      </el-main>
    </el-container>
    
    <!-- 配置面板抽屉 -->
    <el-drawer
      v-model="showConfig"
      title="API配置"
      direction="rtl"
      size="400px"
    >
      <div class="config-content">
        <div class="placeholder-content">
          配置面板 - 待实现
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Microphone, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import ConfigTest from '@/components/ConfigTest.vue'
import TextInputPanel from '@/components/TextInputPanel.vue'
import type { TextInputData, TextProcessResponse } from '@/types/api'

const showConfig = ref(false)

// 文本输入事件处理
const handleTextSubmit = (data: TextInputData) => {
  console.log('Text submit:', data)
  ElMessage.info('正在处理文本...')
}

const handleTextSuccess = (response: TextProcessResponse) => {
  console.log('Text success:', response)
  ElMessage.success('文本处理成功')
}

const handleTextError = (error: string) => {
  console.error('Text error:', error)
  ElMessage.error(`文本处理失败: ${error}`)
}
</script>

<style lang="scss" scoped>
@use "@/styles/variables" as *;

.app {
  height: 100vh;
  background-color: $bg-color-page;
}

.app-container {
  height: 100%;
}

.app-header {
  background-color: $bg-color;
  border-bottom: 1px solid $border-color;
  padding: 0 $spacing-lg;
  
  .header-content {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .app-title {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    font-size: $font-size-large;
    font-weight: 600;
    color: $primary-color;
    margin: 0;
    
    .el-icon {
      font-size: $font-size-extra-large;
    }
  }
}

.app-main {
  padding: $spacing-lg;
  overflow-y: auto;
}

.main-content {
  max-width: 1400px;
  margin: 0 auto;
}

.test-panels,
.result-panels {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.panel-card {
  .placeholder-content {
    padding: $spacing-xl;
    text-align: center;
    color: $text-color-secondary;
    background-color: $bg-color-page;
    border-radius: $border-radius-base;
    border: 2px dashed $border-color-light;
  }
}

.config-content {
  padding: $spacing-md;
  
  .placeholder-content {
    padding: $spacing-xl;
    text-align: center;
    color: $text-color-secondary;
    background-color: $bg-color-page;
    border-radius: $border-radius-base;
    border: 2px dashed $border-color-light;
  }
}

// 响应式调整
@media (max-width: 768px) {
  .app-header {
    padding: 0 $spacing-md;
  }
  
  .app-main {
    padding: $spacing-md;
  }
  
  .app-title {
    font-size: $font-size-medium;
    
    .el-icon {
      font-size: $font-size-large;
    }
  }
  
  .test-panels,
  .result-panels {
    gap: $spacing-md;
  }
}
</style>