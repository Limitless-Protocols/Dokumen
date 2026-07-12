import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main.ts'),
        fileName: () => 'index.js',
        formats: ['cjs']
      },
      outDir: 'out/main',
      emptyOutDir: true
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload.ts'),
        fileName: () => 'index.js',
        formats: ['cjs']
      },
      outDir: 'out/preload',
      emptyOutDir: true
    }
  },
  renderer: {
    plugins: [svelte()]
  }
})
