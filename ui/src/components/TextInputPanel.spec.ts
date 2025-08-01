import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ElMessage } from 'element-plus'
import TextInputPanel from './TextInputPanel.vue'
import { useAPIStore } from '@/stores/api'
import type { TextInputData, TextProcessResponse } from '@/types/api'

// Mock Element Plus
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock API store
vi.mock('@/stores/api', () => ({
  useAPIStore: vi.fn()
}))

describe('TextInputPanel', () => {
  let wrapper: VueWrapper
  let mockApiStore: any
  
  beforeEach(() => {
    // 创建 Pinia 实例
    const pinia = createPinia()
    setActivePinia(pinia)
    
    // Mock API store
    mockApiStore = {
      isLoading: false,
      error: null,
      processText: vi.fn(),
      clearError: vi.fn()
    }
    
    vi.mocked(useAPIStore).mockReturnValue(mockApiStore)
    
    // 挂载组件
    wrapper = mount(TextInputPanel, {
      global: {
        plugins: [pinia],
        stubs: {
          'el-input': {
            template: '<div><textarea v-model="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'input\', $event.target.value)" @blur="$emit(\'blur\')" data-test="text-input"></textarea></div>',
            props: ['modelValue', 'placeholder', 'disabled', 'type', 'rows', 'maxlength', 'showWordLimit', 'resize'],
            emits: ['update:modelValue', 'input', 'blur']
          },
          'el-checkbox': {
            template: '<div><input type="checkbox" v-model="modelValue" :disabled="disabled" data-test="use-knowledge-checkbox" @change="$emit(\'update:modelValue\', $event.target.checked)"><span><slot></slot></span></div>',
            props: ['modelValue', 'disabled'],
            emits: ['update:modelValue']
          },
          'el-button': {
            template: '<button :disabled="disabled || loading" :class="{ \'is-loading\': loading }" @click="$emit(\'click\')" data-test="submit-button"><slot></slot></button>',
            props: ['disabled', 'loading', 'type', 'size'],
            emits: ['click']
          },
          'el-alert': {
            template: '<div v-if="title" @click="$emit(\'close\')">{{ title }}</div>',
            props: ['title', 'type', 'closable'],
            emits: ['close']
          },
          'el-icon': {
            template: '<span><slot></slot></span>'
          }
        }
      }
    })
  })
  
  afterEach(() => {
    wrapper.unmount()
    vi.clearAllMocks()
  })
  
  describe('组件渲染', () => {
    it('应该正确渲染组件', () => {
      expect(wrapper.find('[data-test="text-input"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="use-knowledge-checkbox"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="submit-button"]').exists()).toBe(true)
    })
    
    it('应该显示正确的标题', () => {
      expect(wrapper.text()).toContain('文本输入测试')
    })
    
    it('应该显示正确的占位符', () => {
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      expect(textInput.attributes('placeholder')).toBe('请输入要处理的文本内容...')
    })
  })
  
  describe('输入验证', () => {
    it('应该验证空输入', async () => {
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      
      // 输入空文本
      await textInput.setValue('')
      await textInput.trigger('blur')
      
      // 提交按钮应该被禁用
      const submitButton = wrapper.find('[data-test="submit-button"]')
      expect(submitButton.attributes('disabled')).toBeDefined()
    })
    
    it('应该验证文本长度', async () => {
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      
      // 输入过短的文本
      await textInput.setValue('a')
      await textInput.trigger('blur')
      
      // 应该显示错误信息
      expect(wrapper.text()).toContain('文本内容至少需要2个字符')
    })
    
    it('应该验证有效内容', async () => {
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      
      // 输入只包含空格的文本
      await textInput.setValue('   ')
      await textInput.trigger('blur')
      
      // 应该显示错误信息
      expect(wrapper.text()).toContain('请输入有效的文本内容')
    })
    
    it('应该接受有效输入', async () => {
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      
      // 输入有效文本
      await textInput.setValue('这是一个有效的测试文本')
      await textInput.trigger('blur')
      
      // 不应该显示错误信息
      expect(wrapper.text()).not.toContain('文本内容至少需要2个字符')
      expect(wrapper.text()).not.toContain('请输入有效的文本内容')
      
      // 提交按钮应该可用
      const submitButton = wrapper.find('[data-test="submit-button"]')
      expect(submitButton.attributes('disabled')).toBeUndefined()
    })
  })
  
  describe('表单交互', () => {
    it('应该更新文本输入', async () => {
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      const testText = '测试文本内容'
      
      await textInput.setValue(testText)
      
      // 检查组件内部状态
      const component = wrapper.vm as any
      expect(component.inputData.text).toBe(testText)
    })
    
    it('应该更新知识库选项', async () => {
      const checkbox = wrapper.find('[data-test="use-knowledge-checkbox"] input')
      
      // 默认应该是选中状态
      const component = wrapper.vm as any
      expect(component.inputData.useKnowledge).toBe(true)
      
      // 取消选中
      await checkbox.setChecked(false)
      expect(component.inputData.useKnowledge).toBe(false)
    })
    
    it('应该更新上下文信息', async () => {
      const contextInput = wrapper.findAll('input').find(input => 
        input.attributes('placeholder')?.includes('上下文信息')
      )
      
      if (contextInput) {
        const testContext = '测试上下文'
        await contextInput.setValue(testContext)
        
        const component = wrapper.vm as any
        expect(component.inputData.context).toBe(testContext)
      }
    })
  })
  
  describe('提交功能', () => {
    it('应该成功提交文本', async () => {
      const mockResponse: TextProcessResponse = {
        id: 'test-id',
        text: '测试文本',
        understanding: {
          intent: 'test',
          entities: [],
          confidence: 0.9
        },
        actions: [],
        processing_time: 100,
        timestamp: new Date().toISOString()
      }
      
      mockApiStore.processText.mockResolvedValue(mockResponse)
      
      // 输入有效文本
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      await textInput.setValue('测试文本内容')
      
      // 点击提交按钮
      const submitButton = wrapper.find('[data-test="submit-button"]')
      await submitButton.trigger('click')
      
      // 验证API调用
      expect(mockApiStore.processText).toHaveBeenCalledWith({
        text: '测试文本内容',
        context: undefined,
        useKnowledge: true
      })
      
      // 验证成功消息
      expect(ElMessage.success).toHaveBeenCalledWith('文本处理完成')
    })
    
    it('应该处理提交错误', async () => {
      const errorMessage = '处理失败'
      mockApiStore.processText.mockRejectedValue(new Error(errorMessage))
      
      // 输入有效文本
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      await textInput.setValue('测试文本内容')
      
      // 点击提交按钮
      const submitButton = wrapper.find('[data-test="submit-button"]')
      await submitButton.trigger('click')
      
      // 等待错误处理
      await wrapper.vm.$nextTick()
      
      // 验证错误消息
      expect(ElMessage.error).toHaveBeenCalledWith(errorMessage)
    })
    
    it('应该在加载时禁用提交', async () => {
      mockApiStore.isLoading = true
      await wrapper.vm.$nextTick()
      
      const submitButton = wrapper.find('[data-test="submit-button"]')
      expect(submitButton.attributes('disabled')).toBeDefined()
    })
  })
  
  describe('清空功能', () => {
    it('应该清空所有输入', async () => {
      // 输入一些数据
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      await textInput.setValue('测试文本')
      
      const component = wrapper.vm as any
      component.inputData.context = '测试上下文'
      component.inputData.useKnowledge = false
      
      // 点击清空按钮
      const clearButton = wrapper.find('button:not([data-test="submit-button"])')
      if (clearButton.exists()) {
        await clearButton.trigger('click')
        
        // 验证数据被清空
        expect(component.inputData.text).toBe('')
        expect(component.inputData.context).toBe('')
        expect(component.inputData.useKnowledge).toBe(true)
      }
    })
  })
  
  describe('事件发射', () => {
    it('应该发射submit事件', async () => {
      mockApiStore.processText.mockResolvedValue({} as TextProcessResponse)
      
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      await textInput.setValue('测试文本内容')
      
      const submitButton = wrapper.find('[data-test="submit-button"]')
      await submitButton.trigger('click')
      
      // 验证事件发射
      const submitEvents = wrapper.emitted('submit')
      expect(submitEvents).toBeTruthy()
      expect(submitEvents![0][0]).toEqual({
        text: '测试文本内容',
        context: undefined,
        useKnowledge: true
      })
    })
    
    it('应该发射success事件', async () => {
      const mockResponse: TextProcessResponse = {
        id: 'test-id',
        text: '测试文本',
        understanding: {
          intent: 'test',
          entities: [],
          confidence: 0.9
        },
        actions: [],
        processing_time: 100,
        timestamp: new Date().toISOString()
      }
      
      mockApiStore.processText.mockResolvedValue(mockResponse)
      
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      await textInput.setValue('测试文本内容')
      
      const submitButton = wrapper.find('[data-test="submit-button"]')
      await submitButton.trigger('click')
      
      // 等待异步操作完成
      await wrapper.vm.$nextTick()
      
      // 验证事件发射
      const successEvents = wrapper.emitted('success')
      expect(successEvents).toBeTruthy()
      expect(successEvents![0][0]).toEqual(mockResponse)
    })
    
    it('应该发射error事件', async () => {
      const errorMessage = '处理失败'
      mockApiStore.processText.mockRejectedValue(new Error(errorMessage))
      
      const textInput = wrapper.find('[data-test="text-input"] textarea')
      await textInput.setValue('测试文本内容')
      
      const submitButton = wrapper.find('[data-test="submit-button"]')
      await submitButton.trigger('click')
      
      // 等待异步操作完成
      await wrapper.vm.$nextTick()
      
      // 验证事件发射
      const errorEvents = wrapper.emitted('error')
      expect(errorEvents).toBeTruthy()
      expect(errorEvents![0][0]).toBe(errorMessage)
    })
  })
  
  describe('组件暴露的方法', () => {
    it('应该暴露clearInput方法', () => {
      const component = wrapper.vm as any
      expect(typeof component.clearInput).toBe('function')
    })
    
    it('应该暴露validateInput方法', () => {
      const component = wrapper.vm as any
      expect(typeof component.validateInput).toBe('function')
    })
    
    it('应该暴露submit方法', () => {
      const component = wrapper.vm as any
      expect(typeof component.submit).toBe('function')
    })
    
    it('应该暴露inputData计算属性', () => {
      const component = wrapper.vm as any
      expect(component.inputData).toBeDefined()
      expect(typeof component.inputData.text).toBe('string')
    })
    
    it('应该暴露isValid计算属性', () => {
      const component = wrapper.vm as any
      expect(typeof component.isValid).toBe('boolean')
    })
  })
})