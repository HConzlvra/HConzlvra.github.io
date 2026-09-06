import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

interface SearchDoc {
  title: string;
  description: string;
  url: string;
  type: 'page' | 'post';
  content: string;
}

// 全站搜索索引：构建时静态生成 /search-data.json，由 /search 页面 fetch
export const GET: APIRoute = async () => {
  const docs: SearchDoc[] = [
    {
      title: 'Home',
      description: 'HConzlvra_ 的主页',
      url: '/',
      type: 'page',
      content: `HConzlvra_ 哈康HC 主页 Github Bilibili 由 Astro 搭建 是个人物 烨然若神人 哈康大会 Harold_Conzlvra 哈康国王 我让自己登基，做疯的君王 万物皆有裂痕，那是光照进来的地方`,
    },
    {
      title: 'About',
      description: '关于 HConzlvra_',
      url: '/about',
      type: 'page',
      content: `Hi! I'm Harold_Conzlvra 我是哈康 一个人物 关于 关于我 何意味 小县城唯一何过意味的人`,
    },
  ];

  for (const page of await getCollection('pages')) {
    docs.push({
      title: page.data.title,
      description: page.data.description ?? '',
      url: `/${page.id}`,
      type: 'page',
      content: page.body ?? '',
    });
  }

  for (const post of await getCollection('posts')) {
    docs.push({
      title: post.data.title,
      description: post.data.description ?? '',
      url: `/posts/${post.id}`,
      type: 'post',
      content: post.body ?? '',
    });
  }

  return new Response(JSON.stringify(docs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
