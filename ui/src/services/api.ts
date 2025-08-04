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
    // Python返回格式: {success, understanding: {intent, entities, sentiment, confidence, summary}, actions, processing_time, timestamp, error}
    const understanding = backendResponse.understanding || {};
    
    return {
      id: Date.now().toString(), // Python服务没有返回ID，生成一个
      text: originalText,
      understanding: {
        intent: understanding.intent || "unknown",
        entities: understanding.entities || [],
        confidence: understanding.confidence || 0,
      },
      actions: (backendResponse.actions || []).map((action: any) => ({
        type: typeof action === 'string' ? action : action.type || action,
        parameters: typeof action === 'object' && action.parameters ? action.parameters : {},
        priority: typeof action === 'object' && action.priority ? action.priority : 1
      })),
      suggestions: [], // Python服务暂时没有这个字段
      processing_time: backendResponse.processing_time || 0,
      timestamp: backendResponse.timestamp 
        ? new Date(parseFloat(backendResponse.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    };
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
