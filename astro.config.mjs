// @ts-check
import { defineConfig } from 'astro/config';
import remarkBreaks from 'remark-breaks';

// https://astro.build/config
export default defineConfig({
  // 单个换行符渲染为 <br>（诗歌/短行排版需要）
  markdown: {
    remarkPlugins: [remarkBreaks],
  },
  // 开发时把 /api 代理到本地 wrangler pages dev（留言板 API），
  // 前端 DEV 模式走同源 /api，免跨域；构建产物不受影响
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:8788',
      },
    },
  },
});
