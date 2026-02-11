/**
 * Toast notification store.
 */
import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: number;
	message: string;
	type: ToastType;
	dismissAt: number;
}

let _nextId = 0;

export const toasts = writable<Toast[]>([]);

/**
 * Show a toast notification. Auto-dismisses after `durationMs` (default 4000).
 */
export function addToast(message: string, type: ToastType = 'info', durationMs = 4000): void {
	const id = ++_nextId;
	const dismissAt = Date.now() + durationMs;

	toasts.update((list) => [...list, { id, message, type, dismissAt }]);

	setTimeout(() => {
		dismissToast(id);
	}, durationMs);
}

export function dismissToast(id: number): void {
	toasts.update((list) => list.filter((t) => t.id !== id));
}
