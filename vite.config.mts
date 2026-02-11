import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

/**
 * Vite config for building the Svelte webview into a single self-contained HTML file.
 * sketch-module-web-view's BrowserWindow.loadURL requires a single HTML file.
 */
export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: {
				// Svelte 4 compatibility
				css: 'injected',
			},
		}),
		viteSingleFile(),
	],
	root: 'src/webview',
	build: {
		outDir: resolve(__dirname, 'resources'),
		emptyOutDir: false,
		target: 'safari13', // Sketch uses a WebKit-based webview
		minify: 'terser',
		cssMinify: true,
		rollupOptions: {
			input: resolve(__dirname, 'src/webview/webview.html'),
			output: {
				// Output as webview.html so skpm can reference it
				entryFileNames: 'webview-assets/[name].js',
				chunkFileNames: 'webview-assets/[name].js',
				assetFileNames: 'webview-assets/[name][extname]',
			},
		},
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
