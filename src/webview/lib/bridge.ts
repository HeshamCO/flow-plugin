/**
 * Typed bridge for communication between the Svelte WebView and the Sketch plugin native side.
 *
 * WebView → Plugin: window.postMessage(handler, data)
 * Plugin → WebView: window.__onPluginMessage({ type, payload })
 */
import type { PluginToWebViewMessage } from '../../types/index';

type MessageHandler = (payload: any) => void;

const handlers = new Map<string, MessageHandler[]>();

/**
 * Send a message from the WebView to the plugin native side.
 */
export function pluginCall(handler: string, data?: string | object): void {
	try {
		const serialized = typeof data === 'string' ? data : JSON.stringify(data ?? '');
		(window as any).postMessage(handler, serialized);
	} catch (e) {
		console.error('[bridge] pluginCall error:', e);
	}
}

/**
 * Send a message and return the first plugin listener result.
 */
export async function pluginRequest<T = unknown>(
	handler: string,
	data?: string | object,
): Promise<T> {
	const serialized = typeof data === 'string' ? data : JSON.stringify(data ?? '');
	const raw = await (window as any).postMessage(handler, serialized);
	if (Array.isArray(raw)) {
		return raw[0] as T;
	}
	return raw as T;
}

/**
 * Register a handler for messages from the plugin native side.
 */
export function onPluginMessage(type: string, handler: MessageHandler): () => void {
	if (!handlers.has(type)) {
		handlers.set(type, []);
	}
	handlers.get(type)!.push(handler);

	// Return unsubscribe function
	return () => {
		const list = handlers.get(type);
		if (list) {
			const idx = list.indexOf(handler);
			if (idx >= 0) list.splice(idx, 1);
		}
	};
}

/**
 * Initialize the global message receiver. Called once on app startup.
 */
export function initBridge(): void {
	(window as any).__onPluginMessage = function (msg: PluginToWebViewMessage) {
		const { type, payload } = msg;
		const list = handlers.get(type);
		if (list) {
			list.forEach((fn) => fn(payload));
		}
	};
}

// ─── Promise-based request helpers ───────────────────────────────────
// Uses a Map keyed by artboard ID so multiple concurrent requests are supported.

type PendingRequest = {
	resolve: (value: any) => void;
	reject: (reason: any) => void;
	timer: ReturnType<typeof setTimeout>;
};

const pendingDataRequests = new Map<string, PendingRequest>();
const pendingImageRequests = new Map<string, PendingRequest>();
const pendingSketchUploads = new Map<string, PendingRequest>();

/**
 * Request artboard layer data from the native side. Returns a Promise.
 */
export function requestArtboardData(artboardId: string, timeoutMs = 60_000): Promise<any> {
	return new Promise((resolve, reject) => {
		// Cancel any existing request for this artboard
		const existing = pendingDataRequests.get(artboardId);
		if (existing) {
			clearTimeout(existing.timer);
			existing.reject(new Error('Superseded by new request'));
		}

		const timer = setTimeout(() => {
			pendingDataRequests.delete(artboardId);
			reject(new Error(`Artboard data extraction timed out for "${artboardId}"`));
		}, timeoutMs);

		pendingDataRequests.set(artboardId, { resolve, reject, timer });
		pluginCall('extractArtboardData', artboardId);
	});
}

/**
 * Request artboard image export from the native side. Returns a Promise.
 */
export function requestArtboardImage(artboardId: string, timeoutMs = 120_000): Promise<string> {
	return new Promise((resolve, reject) => {
		const existing = pendingImageRequests.get(artboardId);
		if (existing) {
			clearTimeout(existing.timer);
			existing.reject(new Error('Superseded by new request'));
		}

		const timer = setTimeout(() => {
			pendingImageRequests.delete(artboardId);
			reject(new Error(`Image export timed out for "${artboardId}"`));
		}, timeoutMs);

		pendingImageRequests.set(artboardId, { resolve, reject, timer });
		pluginCall('exportArtboard', artboardId);
	});
}

/**
 * Request artboard image with retry logic.
 */
export async function requestArtboardImageWithRetry(
	artboardId: string,
	name: string,
	maxRetries = 3,
): Promise<string> {
	let lastErr: Error | undefined;
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await requestArtboardImage(artboardId);
		} catch (err) {
			lastErr = err as Error;
			if (attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
	}
	throw lastErr;
}

/**
 * Request native-side upload of the current .sketch document.
 */
export function requestSketchFileUpload(
	payload: {
		serverUrl: string;
		authToken: string;
		projectId: string;
		versionId: string;
		revisionId: string;
		ignoreSslErrors?: boolean;
	},
	timeoutMs = 10 * 60_000,
): Promise<any> {
	return new Promise((resolve, reject) => {
		const key = payload.revisionId;
		const existing = pendingSketchUploads.get(key);
		if (existing) {
			clearTimeout(existing.timer);
			existing.reject(new Error('Superseded by new upload request'));
		}

		const timer = setTimeout(() => {
			pendingSketchUploads.delete(key);
			reject(new Error('Sketch file upload timed out'));
		}, timeoutMs);

		pendingSketchUploads.set(key, { resolve, reject, timer });
		pluginCall('uploadSketchFile', payload);
	});
}

// ─── Register native message handlers for promise resolution ─────────

export function initBridgeHandlers(): void {
	onPluginMessage('artboardData', (payload) => {
		const id = payload.artboardId;
		const pending = pendingDataRequests.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.resolve(payload);
			pendingDataRequests.delete(id);
		}
	});

	onPluginMessage('artboardDataError', (payload) => {
		const id = payload.artboardId;
		const pending = pendingDataRequests.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(payload.message));
			pendingDataRequests.delete(id);
		}
	});

	onPluginMessage('artboardImage', (payload) => {
		const id = payload.artboardId;
		const pending = pendingImageRequests.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.resolve(payload.imageBase64);
			pendingImageRequests.delete(id);
		}
	});

	onPluginMessage('artboardImageError', (payload) => {
		const id = payload.artboardId;
		const pending = pendingImageRequests.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(payload.message));
			pendingImageRequests.delete(id);
		}
	});

	onPluginMessage('sketchFileUploaded', (payload) => {
		const id = payload.revisionId;
		const pending = pendingSketchUploads.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.resolve(payload.artifact);
			pendingSketchUploads.delete(id);
		}
	});

	onPluginMessage('sketchFileUploadError', (payload) => {
		const id = payload.revisionId;
		const pending = pendingSketchUploads.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(payload.message));
			pendingSketchUploads.delete(id);
		}
	});
}
