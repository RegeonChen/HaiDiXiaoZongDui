import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * electron-vite 三段式配置
 *  - main:     主进程 (Node 环境)
 *  - preload:  preload (沙箱安全桥)
 *  - renderer: 渲染进程 (浏览器环境，React)
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      outDir: 'out/preload',
      // —— sandbox preload 必须 CJS ——
      // Electron sandbox 上下文里的 preload 不支持 ESM 入口，
      // 这里强制 rollup 输出 .cjs，避免加载阶段就报 ERR_REQUIRE_ESM。
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    },
    server: {
      host: '127.0.0.1',
      port: 5173
    }
  }
});
