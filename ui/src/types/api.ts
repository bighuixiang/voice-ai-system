export interface APIConfig {
  baseURL: string;
  timeout: number;
  maxFileSize: number;
  supportedAudioFormats: string[];
  supportedLanguages: string[];
}

export interface TextInputData {
  text: string;
  context?: string;
  useKnowledge: boolean;
}

export interface VoiceInputData {
  file: File;
  language?: string;
  context?: string;
}

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

// 流式响应数据块类型
export interface StreamChunk {
  type: 'understanding' | 'action' | 'suggestion' | 'complete' | 'error';
  data: any;
  timestamp: string;
}

// 流式响应状态
export interface StreamState {
  id: string;
  isStreaming: boolean;
  chunks: StreamChunk[];
  currentResponse: Partial<TextProcessResponse>;
  error?: string;
}

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

export interface APIRequest {
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

export interface HealthStatus {
  status: string;
  timestamp: string;
  services: {
    api: boolean;
    ai: boolean;
    database: boolean;
  };
}