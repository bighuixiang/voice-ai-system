/**
 * Mock API service for development and testing
 * Used when the backend API is not available
 */

import type { TextInputData, TextProcessResponse, VoiceProcessResponse, HealthStatus } from '@/types/api'

// Mock delay to simulate network latency
const mockDelay = (ms: number = 1000) => new Promise(resolve => setTimeout(resolve, ms))

// Mock text processing response generator
const generateMockTextResponse = (inputText: string): TextProcessResponse => {
  const mockEntities = [
    { type: 'PERSON', value: '用户', confidence: 0.95 },
    { type: 'INTENT', value: '询问', confidence: 0.88 }
  ]

  const mockActions = [
    {
      type: 'RESPONSE',
      parameters: { message: '我理解您的问题，正在为您处理...' },
      priority: 1
    },
    {
      type: 'SEARCH',
      parameters: { query: inputText, source: 'knowledge_base' },
      priority: 2
    }
  ]

  return {
    id: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    text: inputText,
    understanding: {
      intent: inputText.includes('问') ? 'question' : inputText.includes('帮') ? 'help' : 'general',
      entities: mockEntities,
      confidence: 0.85 + Math.random() * 0.1 // 0.85-0.95
    },
    actions: mockActions,
    suggestions: [
      '您可以提供更多详细信息',
      '是否需要相关的帮助文档？',
      '我可以为您查找相关资源'
    ],
    processing_time: 800 + Math.random() * 400, // 800-1200ms
    timestamp: new Date().toISOString()
  }
}

// Mock voice processing response generator
const generateMockVoiceResponse = (fileName: string): VoiceProcessResponse => {
  const mockTranscription = '这是一个模拟的语音转文字结果，用于测试目的。'
  
  return {
    id: `voice_mock_${Date.now()}`,
    transcription: mockTranscription,
    understanding: {
      intent: 'voice_query',
      entities: [
        { type: 'AUDIO_FILE', value: fileName, confidence: 1.0 }
      ],
      confidence: 0.92
    },
    actions: [
      {
        type: 'TRANSCRIPTION_COMPLETE',
        parameters: { text: mockTranscription },
        priority: 1
      }
    ],
    knowledge_context: [
      {
        title: '语音处理相关文档',
        relevance: 0.85,
        excerpt: '这是一个模拟的知识库搜索结果...'
      }
    ],
    processing_time: 1500 + Math.random() * 500,
    timestamp: new Date().toISOString()
  }
}

// Mock health status
const generateMockHealthStatus = (): HealthStatus => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: true,
      ai: true,
      database: true
    }
  }
}

// Mock API client class
export class MockAPIClient {
  private isEnabled: boolean = false

  constructor() {
    // Enable mock in development when backend is not available
    this.isEnabled = import.meta.env.MODE === 'development'
  }

  // Enable/disable mock mode
  setMockMode(enabled: boolean) {
    this.isEnabled = enabled
    console.log(`Mock API mode ${enabled ? 'enabled' : 'disabled'}`)
  }

  // Check if mock mode is enabled
  isMockMode(): boolean {
    return this.isEnabled
  }

  // Mock text processing
  async processText(data: TextInputData): Promise<TextProcessResponse> {
    if (!this.isEnabled) {
      throw new Error('Mock API is not enabled')
    }

    console.log('🎭 Mock API: Processing text...', data)
    
    // Simulate processing delay
    await mockDelay(1000 + Math.random() * 1000)
    
    // Simulate occasional errors for testing
    if (Math.random() < 0.1) { // 10% chance of error
      throw new Error('模拟的API错误：服务暂时不可用，请稍后重试')
    }
    
    const response = generateMockTextResponse(data.text)
    console.log('🎭 Mock API: Text processing complete', response)
    
    return response
  }

  // Mock voice processing
  async processVoice(file: File): Promise<VoiceProcessResponse> {
    if (!this.isEnabled) {
      throw new Error('Mock API is not enabled')
    }

    console.log('🎭 Mock API: Processing voice...', file.name)
    
    // Simulate longer processing for voice
    await mockDelay(2000 + Math.random() * 1000)
    
    // Simulate occasional errors
    if (Math.random() < 0.15) { // 15% chance of error
      throw new Error('模拟的语音处理错误：文件格式不支持或处理失败')
    }
    
    const response = generateMockVoiceResponse(file.name)
    console.log('🎭 Mock API: Voice processing complete', response)
    
    return response
  }

  // Mock health check
  async checkHealth(): Promise<HealthStatus> {
    if (!this.isEnabled) {
      throw new Error('Mock API is not enabled')
    }

    console.log('🎭 Mock API: Health check...')
    
    // Simulate quick health check
    await mockDelay(200)
    
    const status = generateMockHealthStatus()
    console.log('🎭 Mock API: Health check complete', status)
    
    return status
  }
}

// Export singleton instance
export const mockAPIClient = new MockAPIClient()

// Helper function to enable mock mode with console message
export const enableMockMode = () => {
  mockAPIClient.setMockMode(true)
  console.log(`
🎭 Mock API Mode Enabled
========================
- Text processing: Available
- Voice processing: Available  
- Health check: Available
- Error simulation: 10-15% chance
- Response delay: 1-3 seconds

Use mockAPIClient.setMockMode(false) to disable
`)
}

// Helper function to disable mock mode
export const disableMockMode = () => {
  mockAPIClient.setMockMode(false)
  console.log('🎭 Mock API Mode Disabled')
}

// Auto-enable in development if backend is not reachable
if (import.meta.env.MODE === 'development') {
  // Try to reach the backend, if it fails, enable mock mode
  fetch('/api/health', { method: 'GET' })
    .then(response => {
      if (!response.ok) {
        enableMockMode()
      }
    })
    .catch(() => {
      enableMockMode()
    })
}