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
      // This link opens the whole guide; section links carry their own active state.
      { text: 'Guide', link: '/', activeMatch: '(?!)' },
      { text: 'Commands', link: '/#commands' },
      { text: 'Configuration', link: '/#configuration' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/pruven/zeke' }],
    outline: { level: [2, 3], label: 'In this guide' },
    search: { provider: 'local' },
    footer: { message: 'Zeke · Released under the MIT License.' },
  },
});
