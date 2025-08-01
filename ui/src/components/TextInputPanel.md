# TextInputPanel 组件文档

## 概述

TextInputPanel 是一个用于文本输入和处理的 Vue 3 组件，提供了完整的文本输入、验证、配置和提交功能。该组件是 Voice AI Decision System 测试 UI 的核心组件之一。

## 功能特性

### 核心功能
- ✅ **文本输入**: 多行文本输入框，支持字符计数和限制
- ✅ **输入验证**: 实时验证文本长度和有效性
- ✅ **配置选项**: 上下文信息输入和知识库查询开关
- ✅ **提交处理**: 集成 API 调用和状态管理
- ✅ **错误处理**: 友好的错误提示和重试机制
- ✅ **加载状态**: 处理中的视觉反馈
- ✅ **响应式设计**: 适配不同屏幕尺寸

### 交互功能
- ✅ **清空输入**: 一键清空所有输入内容
- ✅ **自动聚焦**: 可选的自动聚焦功能
- ✅ **实时反馈**: 输入时的即时验证和状态更新
- ✅ **键盘支持**: 完整的键盘导航支持

## API 接口

### Props

| 属性名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `maxLength` | `number` | `2000` | 文本输入的最大字符数 |
| `placeholder` | `string` | `'请输入要处理的文本内容...'` | 输入框占位符文本 |
| `autoFocus` | `boolean` | `false` | 是否自动聚焦到输入框 |

### Events

| 事件名 | 参数 | 描述 |
|--------|------|------|
| `submit` | `(data: TextInputData)` | 用户点击提交按钮时触发 |
| `success` | `(response: TextProcessResponse)` | API 处理成功时触发 |
| `error` | `(error: string)` | API 处理失败时触发 |

### 暴露的方法

| 方法名 | 参数 | 返回值 | 描述 |
|--------|------|--------|------|
| `clearInput` | - | `void` | 清空所有输入内容 |
| `validateInput` | - | `boolean` | 验证当前输入是否有效 |
| `submit` | - | `Promise<void>` | 手动触发提交 |

### 暴露的属性

| 属性名 | 类型 | 描述 |
|--------|------|------|
| `inputData` | `ComputedRef<TextInputData>` | 当前输入数据的只读引用 |
| `isValid` | `ComputedRef<boolean>` | 当前输入是否有效 |

## 数据类型

### TextInputData

```typescript
interface TextInputData {
  text: string              // 输入的文本内容
  context?: string          // 可选的上下文信息
  useKnowledge: boolean     // 是否启用知识库查询
}
```

### TextProcessResponse

```typescript
interface TextProcessResponse {
  id: string                // 响应唯一标识
  text: string              // 处理的文本
  understanding: {          // 理解结果
    intent: string          // 意图识别
    entities: Array<{       // 实体识别
      type: string
      value: string
      confidence: number
    }>
    confidence: number      // 整体置信度
  }
  actions: Array<{          // 建议动作
    type: string
    parameters: Record<string, any>
    priority: number
  }>
  suggestions?: string[]    // 可选的建议
  processing_time: number   // 处理时间（毫秒）
  timestamp: string         // 时间戳
}
```

## 使用示例

### 基础使用

```vue
<template>
  <TextInputPanel
    @submit="handleSubmit"
    @success="handleSuccess"
    @error="handleError"
  />
</template>

<script setup lang="ts">
import TextInputPanel from '@/components/TextInputPanel.vue'
import type { TextInputData, TextProcessResponse } from '@/types/api'

const handleSubmit = (data: TextInputData) => {
  console.log('提交数据:', data)
}

const handleSuccess = (response: TextProcessResponse) => {
  console.log('处理成功:', response)
}

const handleError = (error: string) => {
  console.error('处理失败:', error)
}
</script>
```

### 自定义配置

```vue
<template>
  <TextInputPanel
    :max-length="5000"
    placeholder="请输入您的问题..."
    :auto-focus="true"
    @submit="handleSubmit"
    @success="handleSuccess"
    @error="handleError"
  />
</template>
```

### 使用组件引用

```vue
<template>
  <div>
    <TextInputPanel ref="textInputRef" />
    <button @click="clearInput">清空</button>
    <button @click="submitText">提交</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TextInputPanel from '@/components/TextInputPanel.vue'

const textInputRef = ref<InstanceType<typeof TextInputPanel>>()

const clearInput = () => {
  textInputRef.value?.clearInput()
}

const submitText = async () => {
  if (textInputRef.value?.isValid) {
    await textInputRef.value?.submit()
  }
}
</script>
```

## 样式定制

### CSS 模块类名

组件使用 CSS Modules，主要的类名包括：

- `.textInputPanel` - 主容器
- `.header` - 头部区域
- `.title` - 标题
- `.content` - 内容区域
- `.inputArea` - 输入区域
- `.configOptions` - 配置选项区域
- `.submitButton` - 提交按钮
- `.errorMessage` - 错误信息
- `.errorAlert` - 错误警告

### 主题支持

组件支持深色主题，通过全局 `.dark` 类自动切换：

```scss
:global(.dark) {
  .textInputPanel {
    background-color: #1f1f1f;
    border-color: #404040;
    // ... 其他深色主题样式
  }
}
```

## 验证规则

### 输入验证

1. **最小长度**: 文本内容至少需要 2 个字符
2. **最大长度**: 不能超过 `maxLength` 属性设置的值（默认 2000）
3. **有效内容**: 必须包含中文、英文字母或数字字符
4. **非空验证**: 不能只包含空格或特殊字符

### 验证时机

- **实时验证**: 输入时进行基础验证，但不显示错误
- **失焦验证**: 输入框失焦时显示验证错误
- **提交验证**: 提交前进行最终验证

## 状态管理

组件集成了 Pinia 状态管理：

- **API Store**: 处理 API 调用和状态
- **Config Store**: 管理配置信息
- **错误状态**: 统一的错误处理机制
- **加载状态**: 全局加载状态管理

## 错误处理

### 错误类型

1. **验证错误**: 输入不符合要求
2. **网络错误**: API 调用失败
3. **服务器错误**: 后端处理异常
4. **超时错误**: 请求超时

### 错误显示

- **内联错误**: 输入验证错误显示在输入框下方
- **警告框**: API 错误通过 `el-alert` 组件显示
- **消息提示**: 使用 `ElMessage` 显示简短提示

## 性能优化

### 防抖处理

- 输入验证使用防抖，避免频繁验证
- API 调用自动防重复提交

### 内存管理

- 组件卸载时清理事件监听器
- 合理使用 `computed` 和 `watch` 避免内存泄漏

### 懒加载

- 图标组件按需导入
- 样式文件模块化加载

## 测试

### 单元测试

```bash
# 运行组件单元测试
npm run test -- TextInputPanel.spec.ts

# 运行集成测试
npm run test -- TextInputPanel.integration.spec.ts
```

### 测试覆盖

- ✅ 组件渲染测试
- ✅ 输入验证测试
- ✅ 事件发射测试
- ✅ API 集成测试
- ✅ 错误处理测试

## 需求映射

### 需求 1.1
> 用户在文本输入框中输入文本内容，系统应该提供清晰的输入界面和提交按钮

**实现**: `el-input` textarea 组件 + 提交按钮

### 需求 1.2
> 用户点击提交按钮，系统应该将请求发送到 Node.js API 服务

**实现**: `handleSubmit` 方法调用 `apiStore.processText`

### 需求 1.3
> API 返回处理结果，系统应该清晰地展示结果

**实现**: `success` 事件发射，由父组件处理展示

### 需求 1.4
> API 请求失败，系统应该显示友好的错误信息

**实现**: 错误处理机制 + `el-alert` 组件

## 更新日志

### v1.0.0 (当前版本)
- ✅ 初始版本实现
- ✅ 基础文本输入功能
- ✅ 输入验证和错误处理
- ✅ API 集成和状态管理
- ✅ 响应式设计和主题支持
- ✅ 完整的测试覆盖

## 贡献指南

### 开发环境

1. 确保安装了 Node.js 18+
2. 安装依赖: `npm install`
3. 启动开发服务器: `npm run dev`

### 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 Vue 3 Composition API 最佳实践
- 使用 SCSS 模块化样式
- 编写完整的单元测试

### 提交规范

- 功能: `feat: 添加新功能`
- 修复: `fix: 修复问题`
- 文档: `docs: 更新文档`
- 样式: `style: 样式调整`
- 测试: `test: 添加测试`