import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5 vẫn dùng cú pháp Sass cũ (@import, if(), mix()...) nên Dart Sass mới
        // liên tục cảnh báo "deprecated" dù không ảnh hưởng gì đến kết quả build - ẩn bớt
        // các cảnh báo này cho log gọn hơn, không phải lỗi thật.
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions', 'if-function']
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
