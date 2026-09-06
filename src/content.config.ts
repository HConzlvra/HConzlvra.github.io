import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 内容集合：src/content/pages 下的所有 Markdown 页面
// 每个集合的页面由 src/pages/[...slug].astro 统一渲染
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { pages };
