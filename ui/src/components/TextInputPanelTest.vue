<template>
  <div class="test-page">
    <h1>TextInputPanel 测试页面</h1>
    
    <div class="test-section">
      <h2>组件测试</h2>
      <TextInputPanel
        @submit="handleSubmit"
        @success="handleSuccess"
        @error="handleError"
      />
    </div>
    
    <div class="test-section">
      <h2>事件日志</h2>
      <div class="event-log">
        <div v-for="(event, index) in eventLog" :key="index" class="event-item">
          <span class="event-type">{{ event.type }}</span>
          <span class="event-time">{{ event.time }}</span>
          <pre class="event-data">{{ JSON.stringify(event.data, null, 2) }}</pre>
        </div>
        <div v-if="eventLog.length === 0" class="no-events">
          暂无事件记录
        </div>
      </div>
      <button @click="clearLog" class="clear-button">清空日志</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TextInputPanel from './TextInputPanel.vue'
import type { TextInputData, TextProcessResponse } from '@/types/api'

interface EventLogItem {
  type: string
  time: string
  data: any
}

const eventLog = ref<EventLogItem[]>([])

const addEvent = (type: string, data: any) => {
  eventLog.value.unshift({
    type,
    time: new Date().toLocaleTimeString(),
    data
  })
}

const handleSubmit = (data: TextInputData) => {
  addEvent('submit', data)
  console.log('Submit event:', data)
}

const handleSuccess = (response: TextProcessResponse) => {
  addEvent('success', response)
  console.log('Success event:', response)
}

const handleError = (error: string) => {
  addEvent('error', { message: error })
  console.log('Error event:', error)
}

const clearLog = () => {
  eventLog.value = []
}
</script>

<style scoped>
.test-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.test-section {
  margin-bottom: 40px;
}

.test-section h2 {
  color: #409eff;
  margin-bottom: 20px;
  border-bottom: 2px solid #409eff;
  padding-bottom: 10px;
}

.event-log {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 16px;
  background-color: #f5f7fa;
}

.event-item {
  margin-bottom: 16px;
  padding: 12px;
  background-color: white;
  border-radius: 4px;
  border-left: 4px solid #409eff;
}

.event-type {
  display: inline-block;
  background-color: #409eff;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 12px;
}

.event-time {
  color: #909399;
  font-size: 12px;
}

.event-data {
  margin-top: 8px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  background-color: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
}

.no-events {
  text-align: center;
  color: #909399;
  font-style: italic;
  padding: 40px;
}

.clear-button {
  margin-top: 16px;
  padding: 8px 16px;
  background-color: #f56c6c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.clear-button:hover {
  background-color: #f78989;
}
</style>