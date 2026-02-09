import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/service-worker/index.ts'),
        'content-scripts/accessibility-tree': resolve(__dirname, 'src/content-scripts/accessibility-tree.ts'),
        'content-scripts/agent-visual-indicator': resolve(__dirname, 'src/content-scripts/agent-visual-indicator.ts'),
        'content-scripts/content-script': resolve(__dirname, 'src/content-scripts/content-script.ts'),
        'content-scripts/x-post-rename': resolve(__dirname, 'src/content-scripts/x-post-rename.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') return 'service-worker.js';
          if (chunkInfo.name.startsWith('content-scripts/')) return '[name].js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
