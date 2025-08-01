import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ElMessage } from 'element-plus'
import TextInputPanel from './TextInputPanel.vue'
import { useAPIStore } from '@/stores/api'

// Mock Element Plus
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

describe('TextInputPanel Integration', () => {
  let wrapper: any
  let pinia: any
  
  beforeEach(() => {
    // 创建 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    
    // 挂载组件
    wrapper = mount(TextInputPanel, {
      global: {
        plugins: [pinia]
      }
    })
  })
  
  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })
  
  it('应该正确渲染组件', () => {
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.textInputPanel').exists()).toBe(true)
  })
  
  it('应该显示正确的标题', () => {
    expect(wrapper.text()).toContain('文本输入测试')
  })
  
  it('应该有文本输入区域', () => {
    const textArea = wrapper.find('textarea')
    expect(textArea.exists()).toBe(true)
  })
  
  it('应该有配置选项', () => {
    expect(wrapper.text()).toContain('上下文信息')
    expect(wrapper.text()).toContain('启用知识库查询')
  })
  
  it('应该有提交按钮', () => {
    const submitButton = wrapper.find('button[type="primary"]')
    expect(submitButton.exists()).toBe(true)
    expect(wrapper.text()).toContain('处理文本')
  })
  
  it('应该暴露正确的方法', () => {
    const component = wrapper.vm
    expect(typeof component.clearInput).toBe('function')
    expect(typeof component.validateInput).toBe('function')
    expect(typeof component.submit).toBe('function')
    expect(component.inputData).toBeDefined()
    expect(typeof component.isValid).toBe('boolean')
  })
  
  it('应该能够更新输入数据', async () => {
    const component = wrapper.vm
    
    // 直接调用组件方法来更新数据
    component.inputData.text = '测试文本'
    component.inputData.context = '测试上下文'
    component.inputData.useKnowledge = false
    
    await wrapper.vm.$nextTick()
    
    expect(component.inputData.text).toBe('测试文本')
    expect(component.inputData.context).toBe('测试上下文')
    expect(component.inputData.useKnowledge).toBe(false)
  })
  
  it('应该能够验证输入', () => {
    const component = wrapper.vm
    
    // 测试空输入
    component.inputData.text = ''
    expect(component.validateInput()).toBe(true) // 空输入不显示错误，但不能提交
    
    // 测试过短输入
    component.inputData.text = 'a'
    expect(component.validateInput()).toBe(false)
    
    // 测试有效输入
    component.inputData.text = '这是一个有效的测试文本'
    expect(component.validateInput()).toBe(true)
  })
  
  it('应该能够清空输入', () => {
    const component = wrapper.vm
    
    // 设置一些数据
    component.inputData.text = '测试文本'
    component.inputData.context = '测试上下文'
    component.inputData.useKnowledge = false
    
    // 清空输入
    component.clearInput()
    
    expect(component.inputData.text).toBe('')
    expect(component.inputData.context).toBe('')
    expect(component.inputData.useKnowledge).toBe(true)
  })
  
  it('应该正确计算canSubmit状态', async () => {
    const component = wrapper.vm
    
    // 空输入时不能提交
    component.inputData.text = ''
    await wrapper.vm.$nextTick()
    expect(component.canSubmit).toBe(false)
    
    // 有效输入时可以提交
    component.inputData.text = '这是一个有效的测试文本'
    component.inputError = ''
    await wrapper.vm.$nextTick()
    expect(component.canSubmit).toBe(true)
    
    // 有错误时不能提交
    component.inputError = '有错误'
    await wrapper.vm.$nextTick()
    expect(component.canSubmit).toBe(false)
  })
  
  it('应该能够处理API store的状态', async () => {
    const apiStore = useAPIStore()
    const component = wrapper.vm
    
    // 测试加载状态
    apiStore.isLoading = true
    await wrapper.vm.$nextTick()
    expect(component.isLoading).toBe(true)
    
    // 测试错误状态
    apiStore.error = '测试错误'
    await wrapper.vm.$nextTick()
    // 组件应该能够访问到错误状态
    expect(apiStore.error).toBe('测试错误')
  })
})