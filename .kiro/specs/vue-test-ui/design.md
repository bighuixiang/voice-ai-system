# 设计文档

## 概述

本设计文档描述了基于Vite+Vue3的Voice AI Decision System测试UI界面的技术架构和实现方案。该UI将提供直观的界面来测试语音处理和文本处理功能，支持文件上传、实时结果展示和API调试功能。

## 架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Vue Test UI (Port 5173)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Text Input  │  │ Voice Input │  │  Result Display     │  │
│  │ Component   │  │ Component   │  │  Component          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ API Config  │  │ Request Log │  │  Error Handling     │  │
│  │ Component   │  │ Component   │  │  Component          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Vite Dev Server                         │
│                  (Proxy to API)                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Proxy
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Voice AI System (Port 3000)                   │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   NestJS API    │    │        Python AI Service       │ │
│  │   Service       │◄──►│         (Port 8000)            │ │
│  │  (Port 3000)    │    │                                 │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

- **前端框架**: Vue 3 + Composition API
- **构建工具**: Vite
- **UI组件库**: Element Plus
- **HTTP客户端**: Axios
- **状态管理**: Pinia
- **样式**: SCSS + CSS Modules
- **类型检查**: TypeScript

## 组件和接口

### 核心组件设计

#### 1. App.vue (主应用组件)
```vue
<template>
  <div class="app">
    <Header />
    <main class="main-content">
      <div class="test-panels">
        <TextInputPanel />
        <VoiceInputPanel />
      </div>
      <div class="result-panels">
        <ResultDisplay />
        <RequestLogger />
      </div>
    </main>
    <ConfigPanel />
  </div>
</template>
```

#### 2. TextInputPanel.vue (文本输入组件)
```typescript
interface TextInputData {
  text: string;
  context?: string;
  useKnowledge: boolean;
}

interface TextProcessResponse {
  id: string;
  text: string;
  understanding: {
    intent: string;
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    confidence: number;
  };
  actions: Array<{
    type: string;
    parameters: Record<string, any>;
    priority: number;
  }>;
  suggestions?: string[];
  processing_time: number;
  timestamp: string;
}
```

#### 3. VoiceInputPanel.vue (语音输入组件)
```typescript
interface VoiceInputData {
  file: File;
  language?: string;
  context?: string;
}

interface VoiceProcessResponse {
  id: string;
  transcription: string;
  understanding: {
    intent: string;
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    confidence: number;
  };
  actions: Array<{
    type: string;
    parameters: Record<string, any>;
    priority: number;
  }>;
  knowledge_context: Array<{
    title: string;
    relevance: number;
    excerpt: string;
  }>;
  processing_time: number;
  timestamp: string;
}
```

#### 4. ResultDisplay.vue (结果展示组件)
```typescript
interface DisplayResult {
  type: 'text' | 'voice';
  request: TextInputData | VoiceInputData;
  response: TextProcessResponse | VoiceProcessResponse;
  timestamp: string;
  processingTime: number;
  status: 'success' | 'error' | 'loading';
  error?: string;
}
```

### API服务接口

#### API客户端设计
```typescript
class VoiceAIClient {
  private baseURL: string;
  private timeout: number;
  
  constructor(config: APIConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout;
  }

  async processText(data: TextInputData): Promise<TextProcessResponse> {
    return this.request('POST', '/api/process/text', data);
  }

  async processVoice(file: File, options?: VoiceOptions): Promise<VoiceProcessResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.language) formData.append('language', options.language);
    if (options?.context) formData.append('context', options.context);
    
    return this.request('POST', '/api/process/voice', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  async checkHealth(): Promise<HealthStatus> {
    return this.request('GET', '/health');
  }

  private async request(method: string, url: string, data?: any, options?: RequestOptions) {
    // 实现HTTP请求逻辑
  }
}
```

### 状态管理设计

#### Pinia Store结构
```typescript
// stores/api.ts
export const useAPIStore = defineStore('api', {
  state: () => ({
    config: {
      baseURL: 'http://localhost:3000',
      timeout: 30000,
    },
    currentRequest: null as APIRequest | null,
    requestHistory: [] as APIRequest[],
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async processText(data: TextInputData) {
      this.isLoading = true;
      try {
        const response = await apiClient.processText(data);
        this.addToHistory('text', data, response);
        return response;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async processVoice(file: File, options?: VoiceOptions) {
      this.isLoading = true;
      try {
        const response = await apiClient.processVoice(file, options);
        this.addToHistory('voice', { file, ...options }, response);
        return response;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    updateConfig(newConfig: Partial<APIConfig>) {
      this.config = { ...this.config, ...newConfig };
      localStorage.setItem('api-config', JSON.stringify(this.config));
    },

    addToHistory(type: string, request: any, response: any) {
      const historyItem = {
        id: Date.now().toString(),
        type,
        request,
        response,
        timestamp: new Date().toISOString(),
        processingTime: response.processing_time,
      };
      this.requestHistory.unshift(historyItem);
      if (this.requestHistory.length > 50) {
        this.requestHistory = this.requestHistory.slice(0, 50);
      }
    },
  },
});
```

## 数据模型

### 配置数据模型
```typescript
interface APIConfig {
  baseURL: string;
  timeout: number;
  maxFileSize: number;
  supportedAudioFormats: string[];
  supportedLanguages: string[];
}

interface UIConfig {
  theme: 'light' | 'dark';
  autoSave: boolean;
  showRequestDetails: boolean;
  maxHistoryItems: number;
}
```

### 请求响应数据模型
```typescript
interface APIRequest {
  id: string;
  type: 'text' | 'voice';
  timestamp: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data: any;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    data: any;
    processingTime: number;
  };
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  status: 'pending' | 'success' | 'error';
}
```

### 文件处理数据模型
```typescript
interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  preview?: string; // 对于音频文件的波形预览
}

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed: number; // bytes per second
  remainingTime: number; // seconds
}
```

## 错误处理

### 错误类型定义
```typescript
enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  API_ERROR = 'API_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

interface AppError {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: string;
  recoverable: boolean;
}
```

### 错误处理策略
1. **网络错误**: 自动重试机制，最多重试3次
2. **文件验证错误**: 前端预验证，提供清晰的错误提示
3. **API错误**: 展示服务器返回的错误信息
4. **超时错误**: 提供取消请求和重试选项

### 全局错误处理器
```typescript
// utils/errorHandler.ts
export class ErrorHandler {
  static handle(error: any): AppError {
    if (error.response) {
      // API错误
      return {
        type: ErrorType.API_ERROR,
        message: error.response.data?.message || '服务器错误',
        details: error.response.data,
        timestamp: new Date().toISOString(),
        recoverable: error.response.status < 500,
      };
    } else if (error.request) {
      // 网络错误
      return {
        type: ErrorType.NETWORK_ERROR,
        message: '网络连接失败，请检查网络设置',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
    } else {
      // 其他错误
      return {
        type: ErrorType.VALIDATION_ERROR,
        message: error.message || '未知错误',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
    }
  }
}
```

## 测试策略

### 单元测试
- 使用 Vitest 进行组件单元测试
- 测试覆盖率目标: 80%以上
- 重点测试API客户端、状态管理和工具函数

### 集成测试
- 使用 Cypress 进行端到端测试
- 测试完整的用户交互流程
- 模拟API响应进行测试

### 测试用例设计
```typescript
// tests/components/TextInputPanel.spec.ts
describe('TextInputPanel', () => {
  it('should submit text input correctly', async () => {
    const wrapper = mount(TextInputPanel);
    const textInput = wrapper.find('[data-test="text-input"]');
    const submitButton = wrapper.find('[data-test="submit-button"]');
    
    await textInput.setValue('测试文本');
    await submitButton.trigger('click');
    
    expect(mockAPIClient.processText).toHaveBeenCalledWith({
      text: '测试文本',
      context: undefined,
      useKnowledge: true,
    });
  });
});
```

### 性能测试
- 文件上传性能测试
- 大量请求历史记录的渲染性能
- 内存泄漏检测

## 部署配置

### Vite配置
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          ui: ['element-plus'],
          utils: ['axios', 'lodash-es'],
        },
      },
    },
  },
});
```

### Docker集成
```dockerfile
# Dockerfile.ui
FROM node:18-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 环境变量配置
```typescript
// .env.development
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_MAX_FILE_SIZE=52428800
VITE_SUPPORTED_AUDIO_FORMATS=wav,mp3,m4a,flac

// .env.production
VITE_API_BASE_URL=/api
VITE_WS_URL=wss://your-domain.com/ws
VITE_MAX_FILE_SIZE=52428800
VITE_SUPPORTED_AUDIO_FORMATS=wav,mp3,m4a,flac
```

## 安全考虑

### 文件上传安全
- 客户端文件类型验证
- 文件大小限制
- 文件名安全处理

### API安全
- CORS配置
- 请求频率限制
- 敏感信息脱敏

### 数据安全
- 本地存储数据加密
- 敏感配置信息保护
- 请求日志脱敏处理