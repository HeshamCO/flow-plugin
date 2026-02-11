import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		globals: true,
	},
	resolve: {
		alias: {
			$lib: resolve(__dirname, 'src/webview/lib'),
			$components: resolve(__dirname, 'src/webview/components'),
			$views: resolve(__dirname, 'src/webview/views'),
			$stores: resolve(__dirname, 'src/webview/stores'),
		},
	},
});
