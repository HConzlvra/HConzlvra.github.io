---
title: Welcome to Docs
description: What this section is, and how to add new articles to it.
category: Guide
pubDate: 2026-09-13
order: 1
---

This is Docs — where I keep the articles I've actually sat down and organized, as opposed to the casual stuff over in Posts.

It's a freshly built skeleton for now; content will fill in over time.

## How to add a new doc

1. Create a `.md` file under `src/content/docs/`
2. Write the frontmatter:

````md
---
title: Doc title
description: One-line summary
category: Category name
pubDate: 2026-01-01
order: 1
---

Body…
````

3. Docs sharing the same `category` are grouped together automatically — the filter chips on this page are generated from it too
4. Smaller `order` comes first (default 0); ties break by newer date first

## Conventions

- One doc, one topic — keep it focused
- Write however you like, just keep it readable
