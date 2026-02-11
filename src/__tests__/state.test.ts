import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../webview/lib/bridge', () => ({
	pluginCall: vi.fn(),
	onPluginMessage: vi.fn(),
	initBridge: vi.fn(),
	initBridgeHandlers: vi.fn(),
}));
import { get } from 'svelte/store';
import {
	currentView,
	appState,
	updateState,
	resetAuth,
	navigateTo,
	selectedArtboardIds,
	toggleArtboard,
	selectAllArtboards,
	deselectAllArtboards,
	isAuthenticated,
	isConfigured,
} from '../webview/stores/state';

describe('state store', () => {
	beforeEach(() => {
		// Reset to defaults
		updateState({
			serverUrl: '',
			authToken: '',
			userEmail: '',
			userName: '',
			selectedProjectId: null,
			documentData: null,
		});
		deselectAllArtboards();
		navigateTo('connect');
	});

	describe('navigateTo', () => {
		it('updates currentView', () => {
			navigateTo('projects');
			expect(get(currentView)).toBe('projects');
		});
	});

	describe('updateState', () => {
		it('merges partial state', () => {
			updateState({ serverUrl: 'http://localhost:3000', authToken: 'token-1' });
			const s = get(appState);
			expect(s.serverUrl).toBe('http://localhost:3000');
			expect(s.authToken).toBe('token-1');
		});
	});

	describe('resetAuth', () => {
		it('clears auth fields', () => {
			updateState({ authToken: 'tok', userEmail: 'a@b.com', userName: 'A' });
			resetAuth();
			const s = get(appState);
			expect(s.authToken).toBe('');
			expect(s.userEmail).toBe('');
			expect(s.userName).toBe('');
		});
	});

	describe('derived stores', () => {
		it('isAuthenticated is true when authToken is set', () => {
			updateState({ serverUrl: 'http://localhost', authToken: 'some-token' });
			expect(get(isAuthenticated)).toBe(true);
		});

		it('isAuthenticated is false when authToken is empty', () => {
			updateState({ authToken: '' });
			expect(get(isAuthenticated)).toBe(false);
		});

		it('isConfigured is true when serverUrl is set', () => {
			updateState({ serverUrl: 'http://localhost' });
			expect(get(isConfigured)).toBe(true);
		});
	});

	describe('artboard selection', () => {
		it('toggleArtboard adds and removes', () => {
			toggleArtboard('art-1');
			expect(get(selectedArtboardIds).has('art-1')).toBe(true);

			toggleArtboard('art-1');
			expect(get(selectedArtboardIds).has('art-1')).toBe(false);
		});

		it('selectAllArtboards adds all given ids', () => {
			selectAllArtboards(['a', 'b', 'c']);
			const ids = get(selectedArtboardIds);
			expect(ids.size).toBe(3);
			expect(ids.has('a')).toBe(true);
			expect(ids.has('b')).toBe(true);
			expect(ids.has('c')).toBe(true);
		});

		it('deselectAllArtboards clears selection', () => {
			selectAllArtboards(['a', 'b']);
			deselectAllArtboards();
			expect(get(selectedArtboardIds).size).toBe(0);
		});
	});
});
