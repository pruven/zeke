import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Zeke',
  description: 'Your local environment files, automatically available in every new Git worktree.',
  themeConfig: {
    nav: [{ text: 'Guide', link: '/' }],
    outline: [2, 3],
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.' },
  },
});
