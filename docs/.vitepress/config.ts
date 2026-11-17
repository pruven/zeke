import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Zeke',
  description: 'Your local environment files, automatically available in every new Git worktree.',
  lang: 'en',
  head: [
    ['meta', { name: 'page-type', content: 'software' }],
    ['meta', { name: 'site-kind', content: 'software' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap' }],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/' },
      { text: 'Reference', link: '/reference' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/pruven/zeke' }],
    outline: { level: [2, 3], label: 'On this page' },
    search: { provider: 'local' },
    footer: { message: 'Zeke · Released under the MIT License.' },
  },
});
