# 状态管理Store文档

本文档描述了Vue Test UI应用中的状态管理实现，包括API状态管理和配置管理两个主要store。

## 概述

应用使用Pinia作为状态管理库，实现了以下两个主要store：

- **API Store** (`api.ts`): 管理API请求状态、历史记录和相关配置
- **Config Store** (`config.ts`): 管理UI配置、主题设置和用户偏好

## API Store (useAPIStore)

### 功能特性

#### 1. 请求状态管理
- 跟踪当前请求状态（加载中、错误、成功）
- 管理上传进度
- 处理请求取消和超时

#### 2. 历史记录管理
- 保存所有API请求的详细记录
- 支持查看请求和响应数据
- 自动限制历史记录数量（默认50条）
- 本地存储持久化（保存最近20条记录）

#### 3. 配置管理
- API基础URL配置
- 请求超时设置
- 文件大小限制
- 支持的音频格式配置

#### 4. 本地存储持久化
- 自动保存API配置到localStorage
- 自动保存请求历史记录
- 应用启动时自动加载保存的数据

### 主要状态

```typescript
interface APIStoreState {
  config: APIConfig              // API配置
  currentRequest: APIRequest     // 当前请求
  requestHistory: APIRequest[]   // 请求历史记录
  isLoading: boolean            // 加载状态
  error: string | null          // 错误信息
  uploadProgress: number        // 上传进度 (0-100)
}
```

### 计算属性

- `hasError`: 是否有错误
- `recentRequests`: 最近10条请求
- `successfulRequests`: 成功的请求
- `failedRequests`: 失败的请求

### 主要方法

#### 请求处理
- `processText(data)`: 处理文本输入请求
- `processVoice(file, options)`: 处理语音文件请求
- `checkHealth()`: 健康检查

#### 配置管理
- `updateConfig(newConfig)`: 更新API配置
- `loadConfig()`: 从本地存储加载配置
- `resetConfig()`: 重置为默认配置

#### 历史记录管理
- `clearHistory()`: 清除所有历史记录
- `removeRequest(id)`: 删除特定请求记录
- `limitHistory(maxItems)`: 限制历史记录数量
- `saveHistoryToStorage()`: 保存历史记录到本地存储
- `loadHistoryFromStorage()`: 从本地存储加载历史记录

#### 错误处理
- `clearError()`: 清除错误状态
- `setUploadProgress(progress)`: 设置上传进度

### 使用示例

```typescript
import { useAPIStore } from '@/stores/api'

const apiStore = useAPIStore()

// 处理文本请求
try {
  const response = await apiStore.processText({
    text: '用户输入的文本',
    useKnowledge: true
  })
  console.log('处理结果:', response)
} catch (error) {
  console.error('请求失败:', error)
}

// 更新配置
apiStore.updateConfig({
  baseURL: 'http://localhost:4000',
  timeout: 60000
})

// 查看历史记录
console.log('最近请求:', apiStore.recentRequests)
console.log('成功请求数:', apiStore.successfulRequests.length)
```

## Config Store (useConfigStore)

### 功能特性

#### 1. UI主题管理
- 支持明亮/暗黑主题切换
- 自动应用主题到DOM
- 监听系统主题变化

#### 2. 语言设置
- 支持中文/英文切换
- 语言偏好持久化

#### 3. 用户偏好设置
- 自动保存开关
- 请求详情显示控制
- 历史记录数量限制
- 通知开关
- 紧凑模式

#### 4. 配置导入导出
- 支持配置的JSON格式导出
- 支持从JSON导入配置
- 配置验证和错误处理

#### 5. 本地存储持久化
- 所有配置自动保存到localStorage
- 应用启动时自动加载配置
- 支持配置重置

### 主要状态

```typescript
interface UIConfig {
  theme: 'light' | 'dark'           // 主题
  language: 'zh-CN' | 'en-US'       // 语言
  autoSave: boolean                 // 自动保存
  showRequestDetails: boolean       // 显示请求详情
  maxHistoryItems: number           // 最大历史记录数
  enableNotifications: boolean      // 启用通知
  compactMode: boolean             // 紧凑模式
}
```

### 计算属性

- `isDarkMode`: 是否为暗黑模式
- `isEnglish`: 是否为英文
- `isChinese`: 是否为中文
- `isDefaultConfig`: 是否为默认配置

### 主要方法

#### 配置更新
- `updateUIConfig(config)`: 更新UI配置
- `batchUpdateConfig(updates)`: 批量更新配置
- `resetConfig()`: 重置为默认配置

#### 主题管理
- `toggleTheme()`: 切换主题
- `applyTheme(theme)`: 应用主题到DOM
- `watchSystemTheme()`: 监听系统主题变化

#### 语言管理
- `toggleLanguage()`: 切换语言

#### 其他功能
- `toggleCompactMode()`: 切换紧凑模式
- `exportConfig()`: 导出配置为JSON
- `importConfig(json)`: 从JSON导入配置
- `validateConfig(config)`: 验证配置有效性

#### 持久化
- `saveToLocalStorage()`: 保存到本地存储
- `loadFromLocalStorage()`: 从本地存储加载
- `initialize()`: 初始化配置

### 使用示例

```typescript
import { useConfigStore } from '@/stores/config'

const configStore = useConfigStore()

// 初始化配置
configStore.initialize()

// 切换主题
configStore.toggleTheme()

// 更新配置
configStore.updateUIConfig({
  maxHistoryItems: 100,
  enableNotifications: false
})

// 批量更新
configStore.batchUpdateConfig({
  theme: 'dark',
  language: 'en-US',
  compactMode: true
})

// 导出配置
const configJson = configStore.exportConfig()
console.log('当前配置:', configJson)

// 导入配置
const success = configStore.importConfig(configJson)
if (success) {
  console.log('配置导入成功')
}
```

## 本地存储键值

应用使用以下localStorage键来持久化数据：

- `api-config`: API配置数据
- `api-request-history`: API请求历史记录（最近20条）
- `ui-config`: UI配置数据

## 错误处理

两个store都实现了完善的错误处理机制：

### API Store错误处理
- 网络错误自动重试
- 请求超时处理
- 文件验证错误
- API响应错误

### Config Store错误处理
- 本地存储读写错误
- 配置验证错误
- JSON解析错误
- 配置导入错误

## 测试覆盖

每个store都有对应的测试文件：

- `api.spec.ts`: API Store的单元测试
- `config.spec.ts`: Config Store的单元测试

测试覆盖了所有主要功能，包括：
- 状态管理
- 方法调用
- 错误处理
- 本地存储操作
- 计算属性

## 最佳实践

### 1. 状态访问
```typescript
// 推荐：使用计算属性
const hasError = computed(() => apiStore.hasError)

// 避免：直接访问状态
const hasError = apiStore.error !== null
```

### 2. 错误处理
```typescript
// 推荐：使用try-catch处理异步操作
try {
  await apiStore.processText(data)
} catch (error) {
  // 处理错误
  console.error('请求失败:', error)
}
```

### 3. 配置更新
```typescript
// 推荐：使用批量更新减少存储操作
configStore.batchUpdateConfig({
  theme: 'dark',
  language: 'en-US'
})

// 避免：多次单独更新
configStore.updateUIConfig({ theme: 'dark' })
configStore.updateUIConfig({ language: 'en-US' })
```

### 4. 历史记录管理
```typescript
// 推荐：定期清理历史记录
if (apiStore.requestHistory.length > 100) {
  apiStore.limitHistory(50)
}
```

## 性能优化

1. **历史记录限制**: 自动限制历史记录数量，避免内存泄漏
2. **本地存储优化**: 只保存必要的数据到localStorage
3. **计算属性缓存**: 使用Vue的计算属性缓存机制
4. **批量更新**: 支持批量配置更新，减少存储操作

## 扩展性

Store设计考虑了扩展性：

1. **模块化设计**: 每个store职责单一，易于维护
2. **类型安全**: 完整的TypeScript类型定义
3. **插件化**: 支持添加新的配置项和功能
4. **测试友好**: 完善的测试覆盖，便于重构和扩展