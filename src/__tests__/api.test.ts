import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	apiFetch,
	isValidUrl,
	checkServerHealth,
	login,
	register,
	fetchProjects,
	createProject,
} from '../webview/lib/api';

// Mock stores to avoid Svelte runtime dependency
vi.mock('../webview/stores/state', () => ({
	appState: {
		subscribe: (fn: Function) => {
			fn({ serverUrl: 'http://localhost:3000', authToken: 'test-token' });
			return () => {};
		},
	},
	resetAuth: vi.fn(),
}));
vi.mock('../webview/stores/toast', () => ({
	addToast: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('isValidUrl', () => {
	it('accepts valid http URLs', () => {
		expect(isValidUrl('http://localhost:3000')).toBe(true);
		expect(isValidUrl('https://Flow.example.com')).toBe(true);
		expect(isValidUrl('http://192.168.1.1:8080')).toBe(true);
	});

	it('rejects invalid URLs', () => {
		expect(isValidUrl('')).toBe(false);
		expect(isValidUrl('not-a-url')).toBe(false);
		expect(isValidUrl('ftp://files.example.com')).toBe(false);
	});
});

describe('checkServerHealth', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('returns true for a healthy server', async () => {
		mockFetch.mockResolvedValueOnce({ ok: true });
		const result = await checkServerHealth('http://localhost:3000');
		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/health',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it('returns false for an unreachable server', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Network error'));
		const result = await checkServerHealth('http://localhost:3000');
		expect(result).toBe(false);
	});

	it('returns false for non-ok response', async () => {
		mockFetch.mockResolvedValueOnce({ ok: false });
		const result = await checkServerHealth('http://localhost:3000');
		expect(result).toBe(false);
	});
});

describe('login', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('sends correct payload and returns response', async () => {
		const mockResponse = { token: 'jwt-token', user: { name: 'Test', email: 'test@test.com' } };
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const result = await login('http://localhost:3000', 'test@test.com', 'password123');
		expect(result).toEqual(mockResponse);
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/login',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'Content-Type': 'application/json',
					Authorization: 'Bearer test-token',
				}),
				body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
			}),
		);
	});

	it('throws on auth failure', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Invalid credentials' }),
		});

		await expect(login('http://localhost:3000', 'bad@test.com', 'wrong')).rejects.toThrow(
			'Invalid credentials',
		);
	});
});

describe('fetchProjects', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('returns projects list', async () => {
		const mockProjects = [
			{ id: '1', name: 'Project A' },
			{ id: '2', name: 'Project B' },
		];
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ projects: mockProjects }),
		});

		const result = await fetchProjects('http://localhost:3000');
		expect(result).toEqual(mockProjects);
	});
});

describe('createProject', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('creates project with name', async () => {
		const mockProject = { id: '3', name: 'New Project' };
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ project: mockProject }),
		});

		const result = await createProject('http://localhost:3000', 'New Project');
		expect(result).toEqual(mockProject);
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/projects',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ name: 'New Project' }),
			}),
		);
	});
});
