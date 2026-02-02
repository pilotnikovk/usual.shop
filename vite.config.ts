import { defineConfig } from 'vite'
import devServer from '@hono/vite-dev-server'

export default defineConfig({
  plugins: [
    devServer({
      entry: 'src/index.tsx'
    })
  ],
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: ['hono', '@hono/node-server', 'postgres', 'fs', 'path', 'fs/promises'],
      output: {
        preserveModules: false
      }
    },
    copyPublicDir: true,
    ssr: true,
    target: 'node18'
  },
  publicDir: 'public',
  ssr: {
    noExternal: ['hono']
  }
})
