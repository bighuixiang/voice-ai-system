import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

// Mock axios completely
const mockAxiosInstance = {
  post: vi.fn(),
  get: vi.fn(),
  defaults: { baseURL: "", timeout: 0 },
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
};

const mockCancelToken = {
  token: "mock-token",
  cancel: vi.fn(),
};

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
    CancelToken: {
      source: vi.fn(() => mockCancelToken),
    },
    isCancel: vi.fn(() => false),
  },
}));

// Import after mocking
import {
  VoiceAIClient,
  ErrorType,
  type APIConfig,
  type TextInputData,
  type VoiceOptions,
} from "./api";

describe("VoiceAIClient", () => {
  let client: VoiceAIClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new VoiceAIClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("构造函数和配置", () => {
    it("应该使用默认配置创建客户端", () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: "/api",
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
        },
      });
    });

    it("应该允许自定义配置", () => {
      const customConfig: Partial<APIConfig> = {
        baseURL: "http://localhost:3000",
        timeout: 60000,
        maxRetries: 5,
      };

      const customClient = new VoiceAIClient(customConfig);
      const config = customClient.getConfig();

      expect(config.baseURL).toBe("http://localhost:3000");
      expect(config.timeout).toBe(60000);
      expect(config.maxRetries).toBe(5);
    });

    it("应该设置请求和响应拦截器", () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe("文本处理", () => {
    it("应该成功处理文本请求", async () => {
      const mockResponse = {
        data: {
          id: "test-id",
          text: "测试文本",
          understanding: {
            intent: "test",
            entities: [],
            confidence: 0.9,
          },
          actions: [],
          processing_time: 100,
          timestamp: "2023-01-01T00:00:00Z",
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const textData: TextInputData = {
        text: "测试文本",
        useKnowledge: true,
      };

      const result = await client.processText(textData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        "/process/text",
        textData,
        expect.objectContaining({
          cancelToken: "mock-token",
          metadata: expect.objectContaining({
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("语音处理", () => {
    let mockFile: File;

    beforeEach(() => {
      mockFile = new File(["audio data"], "test.wav", { type: "audio/wav" });
      Object.defineProperty(mockFile, "size", { value: 1024 * 1024 }); // 1MB
    });

    it("应该成功处理语音文件", async () => {
      const mockResponse = {
        data: {
          id: "voice-test-id",
          transcription: "转录文本",
          understanding: {
            intent: "test",
            entities: [],
            confidence: 0.8,
          },
          actions: [],
          knowledge_context: [],
          processing_time: 200,
          timestamp: "2023-01-01T00:00:00Z",
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const voiceOptions: VoiceOptions = {
        language: "zh-CN",
        context: "测试上下文",
      };

      const result = await client.processVoice(mockFile, voiceOptions);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        "/process/voice",
        expect.any(FormData),
        expect.objectContaining({
          headers: {
            "Content-Type": "multipart/form-data",
          },
          cancelToken: "mock-token",
          onUploadProgress: expect.any(Function),
          metadata: expect.objectContaining({
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it("应该验证文件大小", async () => {
      const largeFile = new File(["large audio data"], "large.wav", {
        type: "audio/wav",
      });
      Object.defineProperty(largeFile, "size", { value: 100 * 1024 * 1024 }); // 100MB

      await expect(client.processVoice(largeFile)).rejects.toMatchObject({
        type: ErrorType.FILE_TOO_LARGE,
        message: expect.stringContaining("文件大小超过限制"),
        recoverable: false,
      });
    });

    it("应该验证文件格式", async () => {
      const invalidFile = new File(["data"], "test.txt", {
        type: "text/plain",
      });

      await expect(client.processVoice(invalidFile)).rejects.toMatchObject({
        type: ErrorType.UNSUPPORTED_FORMAT,
        message: expect.stringContaining("不支持的文件格式"),
        recoverable: false,
      });
    });
  });

  describe("健康检查", () => {
    it("应该成功执行健康检查", async () => {
      const mockResponse = {
        data: {
          status: "healthy",
          timestamp: "2023-01-01T00:00:00Z",
          services: {
            api: true,
            ai: true,
            database: true,
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.checkHealth();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/health",
        expect.objectContaining({
          cancelToken: "mock-token",
          metadata: expect.objectContaining({
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("请求取消", () => {
    it("应该能够创建取消令牌", () => {
      const cancelToken = client.createCancelToken();

      expect(axios.CancelToken.source).toHaveBeenCalled();
      expect(cancelToken).toHaveProperty("token");
      expect(cancelToken).toHaveProperty("cancel");
    });

    it("应该能够取消所有活跃请求", () => {
      // Simulate active requests
      (client as any).activeCancelTokens.set("request1", mockCancelToken);
      (client as any).activeCancelTokens.set("request2", mockCancelToken);

      client.cancelAllRequests("测试取消");

      expect(mockCancelToken.cancel).toHaveBeenCalledWith("测试取消");
      expect(client.getActiveRequestCount()).toBe(0);
    });

    it("应该能够取消特定请求", () => {
      (client as any).activeCancelTokens.set("request1", mockCancelToken);

      const result = client.cancelRequest("request1", "取消特定请求");

      expect(result).toBe(true);
      expect(mockCancelToken.cancel).toHaveBeenCalledWith("取消特定请求");
      expect(client.getActiveRequestCount()).toBe(0);
    });

    it("应该返回false当尝试取消不存在的请求", () => {
      const result = client.cancelRequest("nonexistent", "取消不存在的请求");

      expect(result).toBe(false);
    });
  });

  describe("配置管理", () => {
    it("应该能够更新配置", () => {
      const newConfig = {
        baseURL: "http://new-api.com",
        timeout: 45000,
      };

      client.updateConfig(newConfig);

      const config = client.getConfig();
      expect(config.baseURL).toBe("http://new-api.com");
      expect(config.timeout).toBe(45000);
      expect(mockAxiosInstance.defaults.baseURL).toBe("http://new-api.com");
      expect(mockAxiosInstance.defaults.timeout).toBe(45000);
    });

    it("应该返回当前配置的副本", () => {
      const config1 = client.getConfig();
      const config2 = client.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // 应该是不同的对象实例
    });
  });

  describe("活跃请求管理", () => {
    it("应该正确跟踪活跃请求数量", () => {
      expect(client.getActiveRequestCount()).toBe(0);
      (client as any).activeCancelTokens.set("request1", mockCancelToken);
      (client as any).activeCancelTokens.set("request2", mockCancelToken);

      expect(client.getActiveRequestCount()).toBe(2);
    });

    it("应该返回活跃请求ID列表", () => {
      (client as any).activeCancelTokens.set("request1", mockCancelToken);
      (client as any).activeCancelTokens.set("request2", mockCancelToken);

      const activeIds = client.getActiveRequestIds();

      expect(activeIds).toContain("request1");
      expect(activeIds).toContain("request2");
      expect(activeIds).toHaveLength(2);
    });
  });
});
