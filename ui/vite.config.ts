import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const apiPort = process.env.NOVEL_API_PORT || '8787'
const apiTarget = `http://127.0.0.1:${apiPort}`

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    cors: true,
    proxy: {
      '/api/novel': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/platform': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) {
            const monacoPath = id.split('/esm/vs/')[1]
            if (!monacoPath) return 'editor'

            const segments = monacoPath.split('/')
            const [scope, area] = segments

            if (scope === 'editor' && area) {
              return `editor-${scope}-${area}`
            }

            return scope ? `editor-${scope}` : 'editor'
          }
          if (id.includes('node_modules/@element-plus/icons-vue')) return 'ui-icons'
          if (id.includes('node_modules/element-plus')) return 'ui-core'
          if (id.includes('node_modules/vue') || id.includes('node_modules/pinia') || id.includes('node_modules/vue-router')) {
            return 'vendor'
          }
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    },
    modules: {
      // CSS Modules 配置
      localsConvention: 'camelCaseOnly',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    }
  }
})
