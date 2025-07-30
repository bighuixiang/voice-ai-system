# API 文档

Voice AI Decision System 提供了完整的 RESTful API 接口，支持语音处理、文本分析、知识库管理等功能。

## 📋 基础信息

- **Base URL**: `http://localhost:3000/api`
- **API Version**: v1
- **Content-Type**: `application/json` (除文件上传外)
- **Authentication**: 暂不需要（开发版本）

## 🎯 核心接口

### 1. 语音处理

#### 上传语音文件进行处理

**接口地址**: `POST /api/process/voice`

**请求格式**: `multipart/form-data`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | File | 是 | 音频文件（支持 wav, mp3, m4a, flac） |
| language | String | 否 | 语言代码（默认: auto） |
| context | String | 否 | 上下文信息 |

**请求示例**:
```bash
curl -X POST http://localhost:3000/api/process/voice \
  -F "file=@audio.wav" \
  -F "language=zh" \
  -F "context=meeting_notes"
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "id": "proc_123456789",
    "transcription": "请帮我分析一下今天的销售数据",
    "understanding": {
      "intent": "data_analysis",
      "entities": [
        {
          "type": "time",
          "value": "今天",
          "confidence": 0.95
        },
        {
          "type": "data_type",
          "value": "销售数据",
          "confidence": 0.92
        }
      ],
      "confidence": 0.89
    },
    "actions": [
      {
        "type": "query_database",
        "parameters": {
          "table": "sales",
          "date_range": "today"
        },
        "priority": 1
      }
    ],
    "knowledge_context": [
      {
        "title": "销售数据分析指南",
        "relevance": 0.85,
        "excerpt": "销售数据分析的基本步骤..."
      }
    ],
    "processing_time": 2.34,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### 文本处理

**接口地址**: `POST /api/process/text`

**请求格式**: `application/json`

**请求参数**:
```json
{
  "text": "请帮我制定下个月的营销计划",
  "context": "marketing_planning",
  "use_knowledge": true
}
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "id": "proc_987654321",
    "text": "请帮我制定下个月的营销计划",
    "understanding": {
      "intent": "planning",
      "entities": [
        {
          "type": "time_period",
          "value": "下个月",
          "confidence": 0.98
        },
        {
          "type": "task_type",
          "value": "营销计划",
          "confidence": 0.94
        }
      ],
      "confidence": 0.91
    },
    "actions": [
      {
        "type": "create_plan",
        "parameters": {
          "plan_type": "marketing",
          "time_frame": "next_month"
        },
        "priority": 1
      }
    ],
    "suggestions": [
      "分析目标市场",
      "制定预算计划",
      "选择营销渠道",
      "设定KPI指标"
    ],
    "processing_time": 1.23,
    "timestamp": "2024-01-15T10:35:00Z"
  }
}
```

### 2. 知识库管理

#### 上传文档

**接口地址**: `POST /api/knowledge/upload`

**请求格式**: `multipart/form-data`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | File | 是 | 文档文件（支持 txt, md, pdf, docx） |
| title | String | 否 | 文档标题 |
| category | String | 否 | 文档分类 |
| tags | String | 否 | 标签（逗号分隔） |

**请求示例**:
```bash
curl -X POST http://localhost:3000/api/knowledge/upload \
  -F "file=@document.pdf" \
  -F "title=产品使用手册" \
  -F "category=技术文档" \
  -F "tags=产品,手册,技术"
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "id": "doc_123456789",
    "title": "产品使用手册",
    "filename": "document.pdf",
    "category": "技术文档",
    "tags": ["产品", "手册", "技术"],
    "size": 1024000,
    "pages": 25,
    "upload_time": "2024-01-15T10:40:00Z",
    "status": "processed"
  }
}
```

#### 搜索知识库

**接口地址**: `GET /api/knowledge/search`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| q | String | 是 | 搜索关键词 |
| category | String | 否 | 文档分类过滤 |
| limit | Number | 否 | 返回结果数量（默认: 10） |
| offset | Number | 否 | 分页偏移量（默认: 0） |

**请求示例**:
```bash
curl "http://localhost:3000/api/knowledge/search?q=产品功能&category=技术文档&limit=5"
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "doc_123456789",
        "title": "产品功能详解",
        "category": "技术文档",
        "relevance_score": 0.92,
        "excerpt": "本产品具有以下核心功能：1. 语音识别...",
        "matched_keywords": ["产品", "功能"],
        "created_at": "2024-01-10T08:00:00Z"
      }
    ],
    "total": 15,
    "page": 1,
    "per_page": 5,
    "query_time": 0.045
  }
}
```

#### 获取文档详情

**接口地址**: `GET /api/knowledge/documents/{id}`

**响应格式**:
```json
{
  "success": true,
  "data": {
    "id": "doc_123456789",
    "title": "产品使用手册",
    "content": "文档完整内容...",
    "category": "技术文档",
    "tags": ["产品", "手册", "技术"],
    "metadata": {
      "author": "技术团队",
      "version": "1.0",
      "last_updated": "2024-01-15T10:40:00Z"
    },
    "statistics": {
      "word_count": 5000,
      "read_time": "20分钟",
      "view_count": 156
    }
  }
}
```

#### 删除文档

**接口地址**: `DELETE /api/knowledge/documents/{id}`

**响应格式**:
```json
{
  "success": true,
  "message": "文档删除成功"
}
```

### 3. 系统管理

#### 健康检查

**接口地址**: `GET /health`

**响应格式**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:45:00Z",
  "services": {
    "api": {
      "status": "healthy",
      "response_time": 12
    },
    "ai_service": {
      "status": "healthy",
      "response_time": 45
    },
    "database": {
      "status": "healthy",
      "response_time": 8
    }
  },
  "system": {
    "memory_usage": "45%",
    "cpu_usage": "23%",
    "disk_usage": "67%"
  }
}
```

#### 系统状态

**接口地址**: `GET /api/system/status`

**响应格式**:
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "uptime": 86400,
    "environment": "production",
    "features": {
      "voice_processing": true,
      "text_processing": true,
      "knowledge_base": true,
      "gpu_acceleration": false
    },
    "statistics": {
      "total_requests": 1250,
      "successful_requests": 1198,
      "error_rate": "4.16%",
      "average_response_time": 1.85
    },
    "models": {
      "whisper": {
        "version": "base",
        "status": "loaded",
        "memory_usage": "512MB"
      },
      "llm": {
        "version": "Qwen2-1.5B",
        "status": "loaded",
        "memory_usage": "2.1GB"
      }
    }
  }
}
```

#### 系统配置

**接口地址**: `GET /api/system/config`

**响应格式**:
```json
{
  "success": true,
  "data": {
    "limits": {
      "max_file_size": "50MB",
      "max_audio_duration": "300s",
      "max_concurrent_tasks": 4,
      "request_timeout": "30s"
    },
    "supported_formats": {
      "audio": ["wav", "mp3", "m4a", "flac"],
      "document": ["txt", "md", "pdf", "docx"]
    },
    "languages": {
      "supported": ["zh", "en", "ja", "ko"],
      "default": "auto"
    }
  }
}
```

## 🔧 高级功能

### 批量处理

#### 批量语音处理

**接口地址**: `POST /api/process/batch/voice`

**请求格式**: `multipart/form-data`

**请求参数**:
```bash
curl -X POST http://localhost:3000/api/process/batch/voice \
  -F "files[]=@audio1.wav" \
  -F "files[]=@audio2.wav" \
  -F "files[]=@audio3.wav" \
  -F "options={\"language\":\"zh\",\"context\":\"meeting\"}"
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "batch_id": "batch_123456789",
    "total_files": 3,
    "status": "processing",
    "estimated_completion": "2024-01-15T11:00:00Z",
    "results_url": "/api/process/batch/batch_123456789/results"
  }
}
```

#### 获取批量处理结果

**接口地址**: `GET /api/process/batch/{batch_id}/results`

**响应格式**:
```json
{
  "success": true,
  "data": {
    "batch_id": "batch_123456789",
    "status": "completed",
    "total_files": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "file": "audio1.wav",
        "status": "success",
        "transcription": "第一段音频内容",
        "processing_time": 2.1
      },
      {
        "file": "audio2.wav",
        "status": "success",
        "transcription": "第二段音频内容",
        "processing_time": 1.8
      },
      {
        "file": "audio3.wav",
        "status": "success",
        "transcription": "第三段音频内容",
        "processing_time": 2.3
      }
    ],
    "completion_time": "2024-01-15T10:58:30Z"
  }
}
```

### 实时处理

#### WebSocket 连接

**连接地址**: `ws://localhost:3000/ws/process`

**连接示例**:
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/process');

ws.onopen = function() {
    console.log('WebSocket 连接已建立');
};

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('收到处理结果:', data);
};

// 发送音频数据
ws.send(JSON.stringify({
    type: 'audio_chunk',
    data: base64AudioData,
    sequence: 1
}));
```

**消息格式**:
```json
{
  "type": "transcription_partial",
  "data": {
    "text": "正在识别的文本...",
    "confidence": 0.75,
    "is_final": false
  }
}
```

## 📊 错误处理

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "文件格式不支持",
    "details": {
      "field": "file",
      "supported_formats": ["wav", "mp3", "m4a", "flac"]
    },
    "timestamp": "2024-01-15T10:50:00Z",
    "request_id": "req_123456789"
  }
}
```

### 常见错误码

| 错误码 | HTTP状态码 | 说明 |
|--------|------------|------|
| VALIDATION_ERROR | 400 | 请求参数验证失败 |
| FILE_TOO_LARGE | 413 | 文件大小超过限制 |
| UNSUPPORTED_FORMAT | 415 | 不支持的文件格式 |
| PROCESSING_ERROR | 500 | 处理过程中发生错误 |
| SERVICE_UNAVAILABLE | 503 | AI服务暂时不可用 |
| RATE_LIMIT_EXCEEDED | 429 | 请求频率超过限制 |

### 重试机制

对于临时性错误（如 503, 429），客户端应实现指数退避重试：

```javascript
async function retryRequest(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            
            if (response.status === 429 || response.status === 503) {
                const delay = Math.pow(2, i) * 1000; // 指数退避
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
        }
    }
}
```

## 🔐 认证和授权

### API Key 认证（计划中）

```bash
curl -X POST http://localhost:3000/api/process/voice \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@audio.wav"
```

### 请求限制

| 用户类型 | 每分钟请求数 | 每日请求数 | 文件大小限制 |
|----------|--------------|------------|--------------|
| 免费用户 | 10 | 100 | 10MB |
| 付费用户 | 60 | 1000 | 50MB |
| 企业用户 | 300 | 10000 | 100MB |

## 📈 性能优化

### 缓存策略

- **响应缓存**: 相同请求的结果会被缓存1小时
- **模型缓存**: AI模型保持在内存中以提高响应速度
- **文件缓存**: 上传的文件会被临时缓存以支持重试

### 最佳实践

1. **文件预处理**: 上传前压缩音频文件以减少传输时间
2. **批量处理**: 对于多个文件，使用批量接口而非单独请求
3. **异步处理**: 对于大文件，使用异步处理接口
4. **连接复用**: 使用 HTTP/1.1 keep-alive 或 HTTP/2

## 🧪 测试接口

### 测试数据生成

**接口地址**: `POST /api/test/generate-sample`

**请求参数**:
```json
{
  "type": "audio",
  "duration": 10,
  "language": "zh",
  "content": "这是一段测试音频"
}
```

### 性能测试

**接口地址**: `GET /api/test/performance`

**响应格式**:
```json
{
  "success": true,
  "data": {
    "latency": {
      "p50": 1.2,
      "p95": 3.5,
      "p99": 8.1
    },
    "throughput": {
      "requests_per_second": 45.2,
      "concurrent_users": 10
    },
    "resource_usage": {
      "cpu_usage": "65%",
      "memory_usage": "78%",
      "gpu_usage": "45%"
    }
  }
}
```

---

## 📞 技术支持

如果您在使用 API 过程中遇到问题：

1. 查看错误响应中的详细信息
2. 检查请求格式和参数
3. 查看系统健康状态
4. 联系技术支持团队

**支持邮箱**: support@voice-ai-system.com  
**文档更新**: 本文档会随着系统更新而持续更新，请关注版本变化。