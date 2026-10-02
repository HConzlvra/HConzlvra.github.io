# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Admin post publishing and GitHub sync

Admin-published posts are stored in the API's D1 database and are also synced as Markdown files to `src/content/posts/<slug>.md` in this repository. Each GitHub commit to `main` triggers the GitHub Pages workflow, so the post receives a static page and appears in the posts sidebar after deployment.

The API runs in the Cloudflare Pages Direct Upload project that serves `guestbook-9z8.pages.dev`. Configure these Production variables in Cloudflare Pages → project → Settings → Variables and Secrets:

| Name | Type | Value |
| --- | --- | --- |
| `GITHUB_TOKEN` | Secret | Fine-grained personal access token with access only to this repository and `Contents: Read and write` permission |
| `GITHUB_OWNER` | Variable | `HConzlvra` |
| `GITHUB_REPO` | Variable | `HConzlvra.github.io` |
| `GITHUB_BRANCH` | Variable | `main` |

Never put the GitHub token in frontend code, `.env` files committed to GitHub, or the admin page. The `deploy-guestbook-api.yml` workflow deploys `pages_dist/` to the existing Cloudflare Pages project when API files change on `main`. Add these GitHub Actions repository secrets so that workflow can deploy:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token scoped to this account's Pages project deployment permission |

Publishing or editing a post creates or updates its Markdown file; deleting a post removes its Markdown file. Use **Sync all to GitHub** in the admin post list once to backfill posts that were already in D1 before this integration was deployed.
