import axios, { AxiosInstance, AxiosResponse, CancelTokenSource } from "axios";

// Extend the axios interfaces to include metadata
declare module "axios" {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
      requestId: string;
      retryCount: number;
    };
  }

  interface AxiosRequestConfig {
    metadata?: {
      startTime?: number;
      requestId: string;
      retryCount?: number;
    };
  }
}

// API配置接口
export interface APIConfig {
  baseURL: string;
  timeout: number;
  maxFileSize: number;
  supportedAudioFormats: string[];
  supportedLanguages: string[];
  maxRetries: number;
  retryDelay: number;
}

// 请求选项接口
export interface RequestOptions {
  retries?: number;
  cancelToken?: CancelTokenSource;
  onUploadProgress?: (progressEvent: any) => void;
  onDownloadProgress?: (progressEvent: any) => void;
}

// 错误类型枚举
export enum ErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
  API_ERROR = "API_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  CANCELLED_ERROR = "CANCELLED_ERROR",
}

// 应用错误接口
export interface AppError {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: string;
  recoverable: boolean;
  originalError?: any;
}

// 默认配置 - 连接Python AI服务
const defaultConfig: APIConfig = {
  // 开发环境使用代理，生产环境直连
  baseURL: import.meta.env.VITE_API_BASE_URL || 
    (import.meta.env.DEV ? "" : ""),
  timeout: 30000,
  maxFileSize: 52428800, // 50MB
  supportedAudioFormats: ["wav", "mp3", "m4a", "flac"],
  supportedLanguages: ["zh-CN", "en-US"],
  maxRetries: 3,
  retryDelay: 1000,
};

// 文本处理请求接口
export interface TextInputData {
  text: string;
  context?: string;
  useKnowledge: boolean;
}

// API请求格式（匹配后端DTO）
interface ProcessTextRequest {
  content: string;
  context?: string;
  language?: string;
}

// 语音处理选项接口
export interface VoiceOptions {
  language?: string;
  context?: string;
}

// 文本处理响应接口
export interface TextProcessResponse {
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

// 语音处理响应接口
export interface VoiceProcessResponse {
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

// 健康检查响应接口
export interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  services: {
    api: boolean;
    ai: boolean;
    database?: boolean;
  };
}

// API客户端类
export class VoiceAIClient {
  private client: AxiosInstance;
  private config: APIConfig;
  private activeCancelTokens: Map<string, CancelTokenSource> = new Map();

  constructor(config: Partial<APIConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  // 设置请求和响应拦截器
  private setupInterceptors() {
    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        // 添加请求时间戳和唯一ID
        const requestId =
          Date.now().toString() + Math.random().toString(36).substring(2, 11);
        config.metadata = {
          startTime: Date.now(),
          requestId,
          retryCount: config.metadata?.retryCount || 0,
        };

        console.log(
          `[API Request] ${config.method?.toUpperCase()} ${
            config.url
          } (ID: ${requestId}, Retry: ${config.metadata.retryCount})`,
          config.data instanceof FormData ? "[FormData]" : config.data
        );

        return config;
      },
      (error) => {
        console.error("[API Request Error]", error);
        return Promise.reject(this.handleError(error));
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const endTime = Date.now();
        const startTime = response.config.metadata?.startTime || endTime;
        const duration = endTime - startTime;
        const requestId = response.config.metadata?.requestId;

        console.log(
          `[API Response] ${response.config.method?.toUpperCase()} ${
            response.config.url
          } - ${duration}ms (ID: ${requestId})`,
          response.data
        );

        // 添加处理时间到响应数据
        if (response.data && typeof response.data === "object") {
          response.data.request_duration = duration;
        }

        // 清理取消令牌
        if (requestId) {
          this.activeCancelTokens.delete(requestId);
        }

        return response;
      },
      (error) => {
        const endTime = Date.now();
        const startTime = error.config?.metadata?.startTime || endTime;
        const duration = endTime - startTime;
        const requestId = error.config?.metadata?.requestId;

        console.error(
          `[API Error] ${error.config?.method?.toUpperCase()} ${
            error.config?.url
          } - ${duration}ms (ID: ${requestId})`,
          error.response?.data || error.message
        );

        // 清理取消令牌
        if (requestId) {
          this.activeCancelTokens.delete(requestId);
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  // 统一错误处理
  private handleError(error: any): AppError {
    const timestamp = new Date().toISOString();

    if (axios.isCancel(error)) {
      return {
        type: ErrorType.CANCELLED_ERROR,
        message: "请求已被取消",
        timestamp,
        recoverable: true,
        originalError: error,
      };
    }

    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      return {
        type: ErrorType.TIMEOUT_ERROR,
        message: "请求超时，请检查网络连接或稍后重试",
        timestamp,
        recoverable: true,
        originalError: error,
      };
    }

    if (error.response) {
      // 服务器响应错误
      const status = error.response.status;
      const errorData = error.response.data;
      const errorMessage =
        errorData?.message || errorData?.error || "服务器错误";

      return {
        type: ErrorType.API_ERROR,
        message: `API错误 (${status}): ${errorMessage}`,
        details: {
          status,
          data: errorData,
          headers: error.response.headers,
        },
        timestamp,
        recoverable: status >= 500 || status === 429, // 5xx错误和429可重试
        originalError: error,
      };
    } else if (error.request) {
      // 网络错误
      return {
        type: ErrorType.NETWORK_ERROR,
        message: "网络连接失败，请检查网络设置",
        timestamp,
        recoverable: true,
        originalError: error,
      };
    } else {
      // 其他错误
      return {
        type: ErrorType.VALIDATION_ERROR,
        message: error.message || "未知错误",
        timestamp,
        recoverable: false,
        originalError: error,
      };
    }
  }

  // 带重试机制的请求方法
  private async requestWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    options: RequestOptions = {}
  ): Promise<T> {
    const maxRetries = options.retries ?? this.config.maxRetries;
    let lastError: AppError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await requestFn();
        return response.data;
      } catch (error) {
        lastError = error as AppError;

        // 如果是不可恢复的错误或已达到最大重试次数，直接抛出
        if (!lastError.recoverable || attempt === maxRetries) {
          throw lastError;
        }

        // 如果请求被取消，不重试
        if (lastError.type === ErrorType.CANCELLED_ERROR) {
          throw lastError;
        }

        // 等待后重试
        const delay = this.config.retryDelay * Math.pow(2, attempt); // 指数退避
        console.log(`[Retry] 第 ${attempt + 1} 次重试，${delay}ms 后重试...`);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  // 睡眠函数
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 文本处理 - 直接连接Python AI服务
  async processText(
    data: TextInputData,
    options: RequestOptions = {}
  ): Promise<TextProcessResponse> {
    const cancelToken = options.cancelToken || this.createCancelToken();
    const requestId =
      Date.now().toString() + Math.random().toString(36).substring(2, 11);

    if (options.cancelToken) {
      this.activeCancelTokens.set(requestId, options.cancelToken);
    }

    // Python AI服务期望的简单格式
    const requestData = {
      content: data.text
    };

    const response = await this.requestWithRetry<any>(async () => {
      return this.client.post<any>(
        "/api/process/text",
        requestData,
        {
          cancelToken: cancelToken.token,
          metadata: { requestId },
        }
      );
    }, options);

    // 转换Python AI服务响应格式到前端期望的格式
    return this.transformBackendResponse(response, data.text);
  }

  // 流式文本处理
  async processTextStream(
    data: TextInputData,
    onChunk: (chunk: any) => void,
    options: RequestOptions = {}
  ): Promise<TextProcessResponse> {
    const cancelToken = options.cancelToken || this.createCancelToken();
    const requestId =
      Date.now().toString() + Math.random().toString(36).substring(2, 11);

    if (options.cancelToken) {
      this.activeCancelTokens.set(requestId, options.cancelToken);
    }

    try {
      // 直接使用真实的流式接口
      return await this.processRealStreamAPI(data, onChunk, requestId, cancelToken);
    } finally {
      if (requestId) {
        this.activeCancelTokens.delete(requestId);
      }
    }
  }

  // 处理真实的流式API
  private async processRealStreamAPI(
    data: TextInputData,
    onChunk: (chunk: any) => void,
    requestId: string,
    cancelToken: any
  ): Promise<TextProcessResponse> {
    const requestData = {
      content: data.text
    };

    // 创建 AbortController 用于 fetch
    const abortController = new AbortController();
    
    // 监听 axios cancelToken 的取消事件
    if (cancelToken.token.reason) {
      abortController.abort();
    } else {
      cancelToken.token.promise?.then(() => {
        abortController.abort();
      });
    }

    try {
      const response = await fetch('/api/process/text/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(requestData),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResponse: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一行（可能不完整）

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            try {
              if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') {
                  if (finalResponse) {
                    return this.transformStreamResponse(finalResponse, data.text);
                  } else {
                    throw new Error('流式响应未收到完整数据');
                  }
                }
                
                const chunkData = JSON.parse(jsonStr);
                
                // 保存完整响应数据
                if (chunkData.type === 'complete') {
                  finalResponse = chunkData.data;
                }
                
                // 调用回调函数处理数据块
                onChunk(chunkData);
              }
            } catch (error) {
              console.warn('解析流式数据块失败:', error, line);
            }
          }
        }

        // 如果循环结束但没有收到完整响应
        if (finalResponse) {
          return this.transformStreamResponse(finalResponse, data.text);
        } else {
          throw new Error('流式响应意外结束');
        }

      } finally {
        reader.releaseLock();
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('请求已取消');
      }
      throw this.handleError(error);
    }
  }

  // 转换流式响应数据
  private transformStreamResponse(
    streamResponse: any,
    originalText: string
  ): TextProcessResponse {
    return {
      id: Date.now().toString(),
      text: originalText,
      understanding: {
        intent: this.translateIntent(streamResponse.understanding?.intent) || "未知",
        entities: streamResponse.understanding?.entities || [],
        confidence: streamResponse.understanding?.confidence || 0,
      },
      actions: (streamResponse.actions || []).map((action: any) => ({
        type: this.translateAction(typeof action === 'string' ? action : action.type || action),
        parameters: { original_text: originalText },
        priority: 2
      })),
      suggestions: streamResponse.response_content ? [streamResponse.response_content] : [],
      processing_time: streamResponse.processing_time || 0,
      timestamp: streamResponse.timestamp 
        ? new Date(parseFloat(streamResponse.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    };
  }

  // 模拟流式响应
  private async simulateStreamResponse(
    data: TextInputData,
    onChunk: (chunk: any) => void,
    requestId: string,
    cancelToken: any
  ): Promise<TextProcessResponse> {
    console.log('使用模拟流式响应');

    return new Promise((resolve, reject) => {
      let cancelled = false;

      // 监听取消事件
      if (cancelToken.token.reason) {
        cancelled = true;
        reject(new Error('请求已取消'));
        return;
      }

      cancelToken.token.promise?.then(() => {
        cancelled = true;
        reject(new Error('请求已取消'));
      });

      const simulateStream = async () => {
        try {
          // 模拟分析过程
          const steps = [
            {
              type: 'understanding',
              data: { intent: '分析中...', confidence: 0.1 },
              delay: 500
            },
            {
              type: 'understanding',
              data: { 
                intent: this.analyzeIntent(data.text), 
                confidence: 0.6,
                entities: this.extractEntities(data.text)
              },
              delay: 800
            },
            {
              type: 'understanding',
              data: { 
                intent: this.analyzeIntent(data.text), 
                confidence: 0.85,
                entities: this.extractEntities(data.text)
              },
              delay: 600
            },
            {
              type: 'action',
              data: {
                type: this.suggestAction(data.text),
                parameters: { text: data.text },
                priority: 2
              },
              delay: 400
            },
            {
              type: 'suggestion',
              data: this.generateSuggestion(data.text),
              delay: 300
            }
          ];

          let totalDelay = 0;
          for (const step of steps) {
            if (cancelled) return;

            await this.sleep(step.delay);
            totalDelay += step.delay;

            if (cancelled) return;

            onChunk({
              type: step.type,
              data: step.data,
              timestamp: new Date().toISOString()
            });
          }

          if (cancelled) return;

          // 最终完整响应
          const finalResponse: TextProcessResponse = {
            id: requestId,
            text: data.text,
            understanding: {
              intent: this.analyzeIntent(data.text),
              entities: this.extractEntities(data.text),
              confidence: 0.85
            },
            actions: [{
              type: this.suggestAction(data.text),
              parameters: { text: data.text },
              priority: 2
            }],
            suggestions: [this.generateSuggestion(data.text)],
            processing_time: totalDelay,
            timestamp: new Date().toISOString()
          };

          // 发送完成事件
          onChunk({
            type: 'complete',
            data: finalResponse,
            timestamp: new Date().toISOString()
          });

          resolve(finalResponse);

        } catch (error) {
          if (!cancelled) {
            reject(error);
          }
        }
      };

      simulateStream();
    });
  }

  // 简单的意图分析
  private analyzeIntent(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('?') || lowerText.includes('？') || 
        lowerText.includes('什么') || lowerText.includes('如何') || 
        lowerText.includes('怎么')) {
      return 'question';
    }
    
    if (lowerText.includes('请') || lowerText.includes('帮') || 
        lowerText.includes('需要') || lowerText.includes('想要')) {
      return 'request';
    }
    
    if (lowerText.includes('问题') || lowerText.includes('错误') || 
        lowerText.includes('不行') || lowerText.includes('失败')) {
      return 'complaint';
    }
    
    if (lowerText.includes('谢谢') || lowerText.includes('感谢') || 
        lowerText.includes('很好') || lowerText.includes('不错')) {
      return 'compliment';
    }
    
    return 'statement';
  }

  // 简单的实体提取
  private extractEntities(text: string): Array<{type: string, value: string, confidence: number}> {
    const entities = [];
    
    // 提取数字
    const numbers = text.match(/\d+/g);
    if (numbers) {
      numbers.forEach(num => {
        entities.push({
          type: 'number',
          value: num,
          confidence: 0.9
        });
      });
    }
    
    // 提取时间相关词汇
    const timeWords = ['今天', '明天', '昨天', '现在', '以后', '之前'];
    timeWords.forEach(word => {
      if (text.includes(word)) {
        entities.push({
          type: 'time',
          value: word,
          confidence: 0.8
        });
      }
    });
    
    return entities;
  }

  // 建议操作
  private suggestAction(text: string): string {
    const intent = this.analyzeIntent(text);
    
    switch (intent) {
      case 'question':
        return 'provide_answer';
      case 'request':
        return 'fulfill_request';
      case 'complaint':
        return 'resolve_issue';
      case 'compliment':
        return 'acknowledge_thanks';
      default:
        return 'general_response';
    }
  }

  // 生成建议回复
  private generateSuggestion(text: string): string {
    const intent = this.analyzeIntent(text);
    
    const suggestions = {
      question: '我来为您详细解答这个问题。',
      request: '我会尽力帮助您完成这个请求。',
      complaint: '很抱歉给您带来不便，让我来帮您解决这个问题。',
      compliment: '谢谢您的认可，我会继续努力为您提供更好的服务。',
      statement: '我理解您的观点，有什么我可以帮助您的吗？'
    };
    
    return suggestions[intent as keyof typeof suggestions] || suggestions.statement;
  }

  // 回退到普通API + 模拟流式效果
  private async fallbackToNormalAPIWithStream(
    data: TextInputData,
    onChunk: (chunk: any) => void,
    requestId: string,
    cancelToken: any
  ): Promise<TextProcessResponse> {
    console.log('使用普通API + 模拟流式效果');

    return new Promise(async (resolve, reject) => {
      let cancelled = false;

      // 监听取消事件
      if (cancelToken.token.reason) {
        cancelled = true;
        reject(new Error('请求已取消'));
        return;
      }

      cancelToken.token.promise?.then(() => {
        cancelled = true;
        reject(new Error('请求已取消'));
      });

      try {
        // 先发送开始分析的流式数据
        onChunk({
          type: 'understanding',
          data: { intent: '正在连接AI服务...', confidence: 0.1 },
          timestamp: new Date().toISOString()
        });

        if (cancelled) return;

        // 模拟一些延迟
        await this.sleep(300);

        onChunk({
          type: 'understanding',
          data: { intent: '正在分析文本...', confidence: 0.3 },
          timestamp: new Date().toISOString()
        });

        if (cancelled) return;

        // 调用真实的普通API
        const response = await this.processText(data, { cancelToken });

        if (cancelled) return;

        // 模拟流式返回真实结果
        const steps = [
          {
            type: 'understanding',
            data: { 
              intent: response.understanding.intent, 
              confidence: 0.7,
              entities: response.understanding.entities.slice(0, Math.ceil(response.understanding.entities.length / 2))
            },
            delay: 200
          },
          {
            type: 'understanding',
            data: { 
              intent: response.understanding.intent, 
              confidence: response.understanding.confidence,
              entities: response.understanding.entities
            },
            delay: 300
          }
        ];

        // 添加actions
        if (response.actions && response.actions.length > 0) {
          response.actions.forEach((action, index) => {
            steps.push({
              type: 'action',
              data: action,
              delay: 200 + index * 100
            });
          });
        }

        // 添加suggestions
        if (response.suggestions && response.suggestions.length > 0) {
          response.suggestions.forEach((suggestion, index) => {
            steps.push({
              type: 'suggestion',
              data: suggestion,
              delay: 150 + index * 100
            });
          });
        }

        // 逐步发送流式数据
        for (const step of steps) {
          if (cancelled) return;

          await this.sleep(step.delay);

          if (cancelled) return;

          onChunk({
            type: step.type,
            data: step.data,
            timestamp: new Date().toISOString()
          });
        }

        if (cancelled) return;

        // 发送完成事件
        onChunk({
          type: 'complete',
          data: response,
          timestamp: new Date().toISOString()
        });

        resolve(response);

      } catch (error) {
        if (!cancelled) {
          // 发送错误事件
          onChunk({
            type: 'error',
            data: { message: error instanceof Error ? error.message : '处理失败' },
            timestamp: new Date().toISOString()
          });
          reject(error);
        }
      }
    });
  }

  // 转换Python AI服务响应格式到前端期望的格式
  private transformBackendResponse(
    backendResponse: any,
    originalText: string
  ): TextProcessResponse {
    // 检查Python AI服务是否返回了错误
    if (!backendResponse.success && backendResponse.error) {
      throw new Error(backendResponse.error);
    }

    // Python AI服务返回格式转换为前端期望的 TextProcessResponse 格式
    // Python返回格式: {success, understanding: {intent, entities, sentiment, confidence, summary}, actions, processing_time, timestamp, error, response_content}
    const understanding = backendResponse.understanding || {};
    
    // 处理建议回复，优先使用后端返回的response_content
    const suggestions = [];
    if (backendResponse.response_content) {
      suggestions.push(backendResponse.response_content);
    }
    
    // 如果没有response_content，根据意图生成建议
    if (suggestions.length === 0) {
      suggestions.push(this.generateSuggestion(originalText));
    }
    
    return {
      id: Date.now().toString(), // Python服务没有返回ID，生成一个
      text: originalText,
      understanding: {
        intent: this.translateIntent(understanding.intent) || "未知",
        entities: understanding.entities || [],
        confidence: understanding.confidence || 0,
      },
      actions: (backendResponse.actions || []).map((action: any) => ({
        type: this.translateAction(typeof action === 'string' ? action : action.type || action),
        parameters: typeof action === 'object' && action.parameters ? action.parameters : { original_text: originalText },
        priority: typeof action === 'object' && action.priority ? action.priority : 2
      })),
      suggestions,
      processing_time: backendResponse.processing_time || 0,
      timestamp: backendResponse.timestamp 
        ? new Date(parseFloat(backendResponse.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    };
  }

  // 翻译意图到中文
  private translateIntent(intent: string): string {
    const intentMap: Record<string, string> = {
      'question': '问题询问',
      'request': '请求帮助', 
      'complaint': '问题反馈',
      'compliment': '表达感谢',
      'statement': '陈述观点',
      'greeting': '问候交流',
      'unknown': '未知意图'
    };
    
    return intentMap[intent] || intent || '未知意图';
  }

  // 翻译操作到中文
  private translateAction(action: string): string {
    const actionMap: Record<string, string> = {
      'provide_answer': '提供答案',
      'fulfill_request': '满足请求',
      'resolve_issue': '解决问题', 
      'acknowledge_thanks': '回应感谢',
      'general_response': '一般回复',
      'review_request': '审查请求',
      'process_query': '处理查询'
    };
    
    return actionMap[action] || action || '一般处理';
  }

  // 语音处理
  async processVoice(
    file: File,
    voiceOptions: VoiceOptions = {},
    requestOptions: RequestOptions = {}
  ): Promise<VoiceProcessResponse> {
    // 文件验证
    this.validateAudioFile(file);

    return this.requestWithRetry<VoiceProcessResponse>(async () => {
      const cancelToken =
        requestOptions.cancelToken || this.createCancelToken();
      const requestId =
        Date.now().toString() + Math.random().toString(36).substring(2, 11);

      if (requestOptions.cancelToken) {
        this.activeCancelTokens.set(requestId, requestOptions.cancelToken);
      }

      const formData = new FormData();
      formData.append("file", file);

      if (voiceOptions.language) {
        formData.append("language", voiceOptions.language);
      }
      if (voiceOptions.context) {
        formData.append("context", voiceOptions.context);
      }

      return this.client.post<VoiceProcessResponse>(
        "/api/process/voice",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          cancelToken: cancelToken.token,
          onUploadProgress:
            requestOptions.onUploadProgress ||
            ((progressEvent) => {
              if (progressEvent.total) {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                );
                console.log(`[Upload Progress] ${percentCompleted}%`);
              }
            }),
          metadata: { requestId },
        }
      );
    }, requestOptions);
  }

  // 健康检查
  async checkHealth(options: RequestOptions = {}): Promise<HealthStatus> {
    return this.requestWithRetry<HealthStatus>(async () => {
      const cancelToken = options.cancelToken || this.createCancelToken();
      const requestId =
        Date.now().toString() + Math.random().toString(36).substring(2, 11);

      if (options.cancelToken) {
        this.activeCancelTokens.set(requestId, options.cancelToken);
      }

      return this.client.get<HealthStatus>("/health", {
        cancelToken: cancelToken.token,
        metadata: { requestId },
      });
    }, options);
  }

  // 文件验证
  private validateAudioFile(file: File): void {
    // 检查文件大小
    if (file.size > this.config.maxFileSize) {
      const error: AppError = {
        type: ErrorType.FILE_TOO_LARGE,
        message: `文件大小超过限制 (${Math.round(
          this.config.maxFileSize / 1024 / 1024
        )}MB)`,
        details: { fileSize: file.size, maxSize: this.config.maxFileSize },
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      throw error;
    }

    // 检查文件格式
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    if (
      !fileExtension ||
      !this.config.supportedAudioFormats.includes(fileExtension)
    ) {
      const error: AppError = {
        type: ErrorType.UNSUPPORTED_FORMAT,
        message: `不支持的文件格式，支持的格式: ${this.config.supportedAudioFormats.join(
          ", "
        )}`,
        details: {
          fileName: file.name,
          extension: fileExtension,
          supportedFormats: this.config.supportedAudioFormats,
        },
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      throw error;
    }

    // 检查MIME类型
    const supportedMimeTypes = [
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/m4a",
      "audio/flac",
      "audio/x-flac",
    ];

    if (!supportedMimeTypes.includes(file.type)) {
      console.warn(`文件MIME类型 ${file.type} 可能不受支持`);
    }
  }

  // 更新配置
  updateConfig(newConfig: Partial<APIConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // 更新axios实例配置
    this.client.defaults.baseURL = this.config.baseURL;
    this.client.defaults.timeout = this.config.timeout;
  }

  // 获取当前配置
  getConfig(): APIConfig {
    return { ...this.config };
  }

  // 创建取消令牌
  createCancelToken(): CancelTokenSource {
    return axios.CancelToken.source();
  }

  // 取消所有活跃请求
  cancelAllRequests(reason?: string): void {
    const cancelReason = reason || "用户取消了所有请求";
    this.activeCancelTokens.forEach((cancelToken, requestId) => {
      console.log(`[Cancel Request] 取消请求 ID: ${requestId}`);
      cancelToken.cancel(cancelReason);
    });
    this.activeCancelTokens.clear();
  }

  // 取消特定请求
  cancelRequest(requestId: string, reason?: string): boolean {
    const cancelToken = this.activeCancelTokens.get(requestId);
    if (cancelToken) {
      const cancelReason = reason || `取消请求 ID: ${requestId}`;
      console.log(`[Cancel Request] ${cancelReason}`);
      cancelToken.cancel(cancelReason);
      this.activeCancelTokens.delete(requestId);
      return true;
    }
    return false;
  }

  // 获取活跃请求数量
  getActiveRequestCount(): number {
    return this.activeCancelTokens.size;
  }

  // 获取活跃请求ID列表
  getActiveRequestIds(): string[] {
    return Array.from(this.activeCancelTokens.keys());
  }
}

// 创建默认API客户端实例的工厂函数
let _apiClient: VoiceAIClient | null = null;

export const getApiClient = (): VoiceAIClient => {
  if (!_apiClient) {
    _apiClient = new VoiceAIClient();
  }
  return _apiClient;
};

// 延迟初始化的API客户端
export const apiClient = {
  get instance() {
    return getApiClient();
  },
};

// Types are already exported above with their definitions
