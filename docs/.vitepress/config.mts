import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "HConzbra's Personal Website",
  description: "A VitePress Site",
  base: '/',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    [
      'style',
      {},
      `
      .VPNav, .VPContent, .VPFooter {
        animation: fadeInUp 0.8s cubic-bezier(0.2, 0.9, 0.4, 1.1);
      }
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(250px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      `
    ]
  ],
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Posts', link: '/posts/' },
      { text: 'About HC', link: '/about/' },
    ],
    sidebar: {
      '/posts/': [
        {
          text: '所有文章',
          items: [
            { text: 'Hello World', link: '/posts/hello' },
            { text: 'another', link: '/posts/another' },
          ]
        }
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/HConzbra' }
    ]
  }
})