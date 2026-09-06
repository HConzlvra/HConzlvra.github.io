import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 独立页面（如 characters）：由 src/pages/[...slug].astro 统一渲染
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

// 博客文章：由 src/pages/posts/[...slug].astro 渲染，左侧导航栏列出
const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
  }),
});

export const collections = { pages, posts };
