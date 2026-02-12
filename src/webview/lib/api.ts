/**
 * API client for communicating with the Flow server.
 *
 * Features:
 * - Automatic Content-Type handling (only for POST/PUT/PATCH)
 * - 401 interception → triggers auth expiry
 * - Typed responses
 */
import { get } from 'svelte/store';
import { appState, resetAuth } from '../stores/state';
import { addToast } from '../stores/toast';
import type {
	AuthResponse,
	Project,
	ProjectDetail,
	Version,
	ApiError,
	HandoffLock,
	VersionRevision,
	RevisionCompareResult,
} from '../../types/index';

/**
 * Base fetch wrapper with auth and error handling.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const state = get(appState);
	const headers: Record<string, string> = {
		...((options.headers as Record<string, string>) || {}),
	};

	// Only set Content-Type for methods that send a body AND when not using FormData
	const method = (options.method || 'GET').toUpperCase();
	const isFormData = options.body instanceof FormData;
	if (['POST', 'PUT', 'PATCH'].includes(method) && !isFormData) {
		headers['Content-Type'] = headers['Content-Type'] || 'application/json';
	}

	if (state.authToken) {
		headers['Authorization'] = `Bearer ${state.authToken}`;
	}

	const response = await fetch(url, { ...options, headers });

	// 401 interception: token expired or invalid
	if (response.status === 401) {
		resetAuth();
		addToast('Session expired — please log in again.', 'warning');
		throw new Error('Authentication expired');
	}

	return response;
}

// ─── Auth ────────────────────────────────────────────────────────────

export async function login(
	serverUrl: string,
	email: string,
	password: string,
): Promise<AuthResponse> {
	const res = await apiFetch(`${serverUrl}/auth/login`, {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	});

	if (!res.ok) {
		const err: ApiError = await res
			.json()
			.catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || `Server returned ${res.status}`);
	}

	return res.json();
}

export async function register(
	serverUrl: string,
	email: string,
	username: string,
	password: string,
	name?: string,
): Promise<AuthResponse> {
	const res = await apiFetch(`${serverUrl}/auth/register`, {
		method: 'POST',
		body: JSON.stringify({ email, username, password, name: name || undefined }),
	});

	if (!res.ok) {
		const err: ApiError = await res
			.json()
			.catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || `Server returned ${res.status}`);
	}

	return res.json();
}

// ─── Projects ────────────────────────────────────────────────────────

export async function fetchProjects(serverUrl: string): Promise<Project[]> {
	const res = await apiFetch(`${serverUrl}/projects`);
	if (!res.ok) throw new Error('Failed to load projects');
	const data = await res.json();
	return data.projects || [];
}

export async function createProject(
	serverUrl: string,
	name: string,
	description?: string,
): Promise<Project> {
	const res = await apiFetch(`${serverUrl}/projects`, {
		method: 'POST',
		body: JSON.stringify({ name, description: description || undefined }),
	});

	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: 'Failed to create project' }));
		throw new Error(err.error || 'Failed to create project');
	}

	const data = await res.json();
	return data.project;
}

export async function fetchProjectDetail(
	serverUrl: string,
	projectId: string,
): Promise<ProjectDetail> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}`);
	if (!res.ok) throw new Error('Failed to load project details');
	const data = await res.json();
	return data.project;
}

// ─── Publish ─────────────────────────────────────────────────────────

export async function createVersion(serverUrl: string, projectId: string): Promise<Version> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/versions`, {
		method: 'POST',
	});
	if (!res.ok) throw new Error('Failed to create version');
	const data = await res.json();
	return data.version;
}

export async function getUploadedScreenIds(
	serverUrl: string,
	projectId: string,
	versionId: string,
): Promise<string[]> {
	try {
		const res = await apiFetch(
			`${serverUrl}/projects/${projectId}/versions/${versionId}/uploaded-screens`,
		);
		if (res.ok) {
			const data = await res.json();
			return data.sketchIds || [];
		}
	} catch {
		// Continue without skip info
	}
	return [];
}

export async function fetchHandoffLock(serverUrl: string, projectId: string): Promise<HandoffLock | null> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/handoff/lock`);
	if (!res.ok) throw new Error('Failed to load handoff lock');
	const data = await res.json();
	return data.lock || null;
}

export async function checkoutHandoffLock(
	serverUrl: string,
	projectId: string,
	payload: { versionId?: string; revisionId?: string } = {},
): Promise<HandoffLock> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/handoff/checkout`, {
		method: 'POST',
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || 'Failed to checkout lock');
	}
	const data = await res.json();
	return data.lock;
}

export async function releaseHandoffLock(serverUrl: string, projectId: string): Promise<void> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/handoff/release`, {
		method: 'POST',
		body: JSON.stringify({}),
	});
	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || 'Failed to release lock');
	}
}

export async function overrideHandoffLock(
	serverUrl: string,
	projectId: string,
	payload: { reason: string; versionId?: string; revisionId?: string },
): Promise<HandoffLock> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/handoff/override`, {
		method: 'POST',
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || 'Failed to override lock');
	}
	const data = await res.json();
	return data.lock;
}

export async function createRevision(
	serverUrl: string,
	projectId: string,
	versionId: string,
	payload: { note: string; basedOnRevisionId?: string },
): Promise<VersionRevision> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/versions/${versionId}/revisions`, {
		method: 'POST',
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || 'Failed to create revision');
	}
	const data = await res.json();
	return data.revision;
}

export async function listRevisions(
	serverUrl: string,
	projectId: string,
	versionId: string,
): Promise<VersionRevision[]> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/versions/${versionId}/revisions`);
	if (!res.ok) throw new Error('Failed to load revisions');
	const data = await res.json();
	return data.revisions || [];
}

export async function compareRevisions(
	serverUrl: string,
	projectId: string,
	versionId: string,
	baseRevisionId: string | null,
	headRevisionId: string,
): Promise<RevisionCompareResult> {
	const params = new URLSearchParams({ head: headRevisionId });
	if (baseRevisionId) params.set('base', baseRevisionId);
	const res = await apiFetch(
		`${serverUrl}/projects/${projectId}/versions/${versionId}/revisions/compare?${params.toString()}`,
	);
	if (!res.ok) throw new Error('Failed to compare revisions');
	const data = await res.json();
	return data.diff;
}

export async function finalizeRevision(
	serverUrl: string,
	projectId: string,
	versionId: string,
	revisionId: string,
): Promise<void> {
	const res = await apiFetch(
		`${serverUrl}/projects/${projectId}/versions/${versionId}/revisions/${revisionId}/complete`,
		{
			method: 'PUT',
		},
	);
	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
		throw new Error(err.error || 'Failed to finalize revision');
	}
}

export async function uploadScreen(
	serverUrl: string,
	projectId: string,
	versionId: string,
	screenData: {
		name: string;
		sketchId: string;
		pageName: string;
		width: number;
		height: number;
		imageBase64: string;
		layers: any[];
		flows: any[];
		displayOrder: number;
		isFlowHome?: boolean;
		revisionId?: string;
	},
): Promise<void> {
	// Convert base64 to binary Blob and send as multipart/form-data
	const base64Data = screenData.imageBase64.replace(/^data:image\/\w+;base64,/, '');
	const binaryStr = atob(base64Data);
	const bytes = new Uint8Array(binaryStr.length);
	for (let i = 0; i < binaryStr.length; i++) {
		bytes[i] = binaryStr.charCodeAt(i);
	}
	const imageBlob = new Blob([bytes], { type: 'image/png' });

	const meta = {
		name: screenData.name,
		sketchId: screenData.sketchId,
		pageName: screenData.pageName,
		width: screenData.width,
		height: screenData.height,
		layers: screenData.layers,
		flows: screenData.flows,
		displayOrder: screenData.displayOrder,
		isFlowHome: screenData.isFlowHome || false,
		revisionId: screenData.revisionId,
	};

	const formData = new FormData();
	formData.append('image', imageBlob, `${screenData.sketchId}.png`);
	formData.append('meta', JSON.stringify(meta));

	const res = await apiFetch(`${serverUrl}/projects/${projectId}/versions/${versionId}/screens`, {
		method: 'POST',
		headers: {}, // Let browser set Content-Type with boundary
		body: formData,
	});

	if (!res.ok) {
		const err: ApiError = await res.json().catch(() => ({ error: `${res.status}` }));
		throw new Error(`Failed to upload "${screenData.name}": ${err.error || res.status}`);
	}
}

export async function uploadTokens(
	serverUrl: string,
	projectId: string,
	versionId: string,
	tokens: any,
): Promise<void> {
	const res = await apiFetch(`${serverUrl}/projects/${projectId}/versions/${versionId}/tokens`, {
		method: 'POST',
		body: JSON.stringify(tokens),
	});
	if (!res.ok) {
		console.warn('[api] Token upload failed, continuing…');
	}
}

export async function finalizeVersion(
	serverUrl: string,
	projectId: string,
	versionId: string,
): Promise<void> {
	await apiFetch(`${serverUrl}/projects/${projectId}/versions/${versionId}/complete`, {
		method: 'PUT',
	});
}

// ─── Health Check ────────────────────────────────────────────────────

export async function checkServerHealth(serverUrl: string): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);

		const res = await fetch(`${serverUrl}/health`, {
			signal: controller.signal,
		}).catch(() => null);

		clearTimeout(timeout);
		return res !== null && res.ok;
	} catch {
		return false;
	}
}

/**
 * Validate a URL string format.
 */
export function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}
