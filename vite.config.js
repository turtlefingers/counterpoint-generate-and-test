import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // GitHub Pages 배포를 위한 설정
  // 리포지토리 이름이 'my-repo'라면 '/my-repo/'로 설정해야 합니다.
  // 사용자 페이지(username.github.io)라면 '/'로 설정합니다.
  base: './',

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        test: resolve(__dirname, 'test-vexflow.html'),
      },
    },
  },
});
