import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

describe('App.vue', () => {
  it('renders properly', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Voice AI Test UI')
  })

  it('has config button', () => {
    const wrapper = mount(App)
    const configButton = wrapper.find('[data-test="config-button"]')
    expect(wrapper.text()).toContain('配置')
  })

  it('shows placeholder content for panels', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('文本输入面板 - 待实现')
    expect(wrapper.text()).toContain('语音输入面板 - 待实现')
    expect(wrapper.text()).toContain('结果展示面板 - 待实现')
    expect(wrapper.text()).toContain('请求日志面板 - 待实现')
  })
})