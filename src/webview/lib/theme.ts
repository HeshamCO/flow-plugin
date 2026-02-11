/**
 * Theme detection and management.
 * Detects Sketch dark mode via prefers-color-scheme media query.
 */
import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

export const theme = writable<Theme>('light');

/**
 * Initialize theme detection. Listens for system preference changes.
 */
export function initTheme(): void {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');

	function applyTheme(isDark: boolean) {
		const t: Theme = isDark ? 'dark' : 'light';
		theme.set(t);
		document.documentElement.setAttribute('data-theme', t);
	}

	applyTheme(mq.matches);
	mq.addEventListener('change', (e) => applyTheme(e.matches));
}
