import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.labstride.dev',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Labstride',
      description: 'Technical documentation for the Labstride development workflow coordinator.',
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/engshort/labstride' }],
      editLink: { baseUrl: 'https://github.com/engshort/labstride/edit/main/docs-site/' },
      sidebar: [
        { label: 'Overview', link: '/' },
        { label: 'Start here', items: ['getting-started/project-status'] },
        { label: 'Concepts', items: ['concepts/architecture'] },
        { label: 'Reference', items: ['reference/specifications'] },
        { slug: 'contributing' },
      ],
    }),
  ],
});
