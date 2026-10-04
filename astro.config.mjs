// @ts-check

import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { defineConfig, fontProviders } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import rehypeMermaid from 'rehype-mermaid';

export default defineConfig({
	site: 'https://martiniio.dev',
	vite: {},
	integrations: [
		expressiveCode({
			plugins: [pluginLineNumbers()],
			themes: ['github-light', 'github-dark'],
			defaultProps: {
				wrap: true,
				showLineNumbers: true,
				frame: 'terminal',
			},
			styleOverrides: {
				codeFontSize: '0.9rem',
				codeFontFamily:
					"var(--font-code), 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
				codeLineHeight: '1.7em',
				borderRadius: '0.5rem',
				frameBorderWidth: '1px',
				frameShadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
				containerPaddingBlock: '0.85rem',
				containerPaddingInline: '1rem',
				lineNumberMarginInline: '1rem',
				lineNumberWidth: '2rem',
			},
			frames: {
				showCopyToClipboardButton: true,
				showLanguageBadge: true,
			},
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme) => {
				if (theme.name === 'github-dark') return '.dark';
				return false;
			},
		}),
		mdx(),
		sitemap(),
	],
	markdown: {
		processor: unified({
			rehypePlugins: [[rehypeMermaid, { strategy: 'inline-svg' }]],
		}),
		syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid', 'math'] },
	},
	fonts: [
		{
			provider: fontProviders.fontsource(),
			name: 'Inconsolata',
			cssVariable: '--font-code',
			fallbacks: ['ui-monospace', 'monospace'],
		},
	],
});