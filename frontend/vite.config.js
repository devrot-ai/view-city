import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(async () => {
  const plugins = [react()]

  if (process.env.ANALYZE === 'true') {
    try {
      const mod = await import('rollup-plugin-visualizer')
      if (mod && mod.visualizer) {
        plugins.push(mod.visualizer({ filename: 'dist/bundle-analysis.html', gzipSize: true }))
      }
    } catch (e) {
      // ignore missing visualizer
    }
  }

  return {
    plugins,
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/setupTests.js',
      exclude: ['node_modules/**', 'e2e/**']
    },
    build: {
      sourcemap: true,
    },
  }
})
