import DefaultTheme from 'vitepress/theme-without-fonts';
import type { Theme } from 'vitepress';
import DocsIntro from './DocsIntro.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocsIntro', DocsIntro);
  },
} satisfies Theme;
