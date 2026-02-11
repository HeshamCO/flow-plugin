import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { toasts, addToast, dismissToast } from '../webview/stores/toast';

describe('toast store', () => {
	beforeEach(() => {
		// Clear all toasts
		toasts.set([]);
	});

	it('adds a toast', () => {
		addToast('Hello!', 'success');
		const list = get(toasts);
		expect(list.length).toBe(1);
		expect(list[0].message).toBe('Hello!');
		expect(list[0].type).toBe('success');
	});

	it('adds multiple toasts', () => {
		addToast('First', 'info');
		addToast('Second', 'error');
		expect(get(toasts).length).toBe(2);
	});

	it('dismisses a toast by id', () => {
		addToast('To remove', 'warning');
		const list = get(toasts);
		const id = list[0].id;
		dismissToast(id);
		expect(get(toasts).length).toBe(0);
	});
});
