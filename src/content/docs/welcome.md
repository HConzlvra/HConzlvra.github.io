---
title: Welcome to Docs
description: 这个栏目是什么，以及怎么往里面加新文章。
category: Guide
pubDate: 2026-09-13
order: 1
---

这里是 Docs —— 放我整理的、写得比较正经的文章和资料。和 Posts 里的随笔分开，这里讲究一点结构。

目前是刚搭好的框架，内容会慢慢补。

## 怎么加一篇新文档

1. 在 `src/content/docs/` 下新建一个 `.md` 文件
2. 写好 frontmatter：

````md
---
title: 文档标题
description: 一句话简介
category: 分类名
pubDate: 2026-01-01
order: 1
---

正文……
````

3. `category` 相同的文档会自动归到同一组，首页的分类筛选按钮也是按它生成的
4. `order` 越小排越前（默认 0），同 `order` 的按日期新的在前

## 约定

- 一篇文档只讲一件事，尽量讲清楚
- 正文以中文为主，代码和专有名词除外
