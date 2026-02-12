/**
 * Flow Plugin – Main WebView Command
 *
 * Opens a persistent panel where designers can:
 *  1. Configure the Flow server URL
 *  2. Login / register
 *  3. Create or select a project
 *  4. Publish artboards with full layer data, styles, and prototype flows
 */
import BrowserWindow from 'sketch-module-web-view';
import { getWebview } from 'sketch-module-web-view/remote';
import sketch from 'sketch';
import {
	extractDocument,
	exportArtboardImage,
	extractArtboardData,
	invalidateCache,
} from './lib/extract';
import {
	getAllSettings,
	setServerUrl,
	setAuthToken,
	setUserInfo,
	setLastProjectId,
	setLastPublishTime,
	clearAuth,
} from './lib/settings';

const WEBVIEW_ID = 'Flow.panel';

// ─── Document metadata cache ─────────────────────────────────────────
let _cachedDocData = null;
let _cachedDocId = null;

// ─── Helpers ─────────────────────────────────────────────────────────

function sendToWebView(target, type, payload) {
	const msg = JSON.stringify({ type, payload });
	const script = `window.__onPluginMessage(${msg})`;

	// sketch-module-web-view can return either:
	// 1) win.webContents (has executeJavaScript), or
	// 2) BrowserWindow wrapper (has .webContents)
	const candidates = [
		target,
		target && target.webContents ? target.webContents : null,
	].filter(Boolean);

	for (const candidate of candidates) {
		try {
			if (typeof candidate.executeJavaScript === 'function') {
				candidate.executeJavaScript(script);
				return;
			}
			if (typeof candidate.evaluateJavaScript === 'function') {
				candidate.evaluateJavaScript(script);
				return;
			}
		} catch (err) {
			console.warn('[Flow] Failed to send message to webview candidate:', err);
		}
	}

	console.warn('[Flow] Unable to deliver message to webview; unsupported target shape.');
}

function resolveSketchPath(rawPath) {
	const candidates = [];
	const seen = new Set();
	const push = (value) => {
		if (!value) return;
		const normalized = String(value);
		if (!normalized || seen.has(normalized)) return;
		seen.add(normalized);
		candidates.push(normalized);
	};

	push(rawPath);

	// If Sketch gives us file:// URL, convert to file system path.
	try {
		const url = NSURL.URLWithString(String(rawPath));
		if (url && url.path) {
			push(String(url.path()));
		}
	} catch (_) {}

	// Try JS decode for percent-encoded paths.
	try {
		push(decodeURIComponent(String(rawPath)));
	} catch (_) {}

	// Try NSString decode for percent-encoded paths.
	try {
		const ns = NSString.stringWithString(String(rawPath));
		const decoded = ns.stringByRemovingPercentEncoding();
		if (decoded) push(String(decoded));
	} catch (_) {}

	const fileManager = NSFileManager.defaultManager();
	for (const path of candidates) {
		try {
			if (fileManager.fileExistsAtPath(path)) {
				return path;
			}
		} catch (_) {}
	}

	return null;
}

function readSketchFileData(path) {
	let data = NSData.dataWithContentsOfFile(path);
	if (data) return data;
	try {
		const fileUrl = NSURL.fileURLWithPath(path);
		data = NSData.dataWithContentsOfURL(fileUrl);
	} catch (_) {}
	return data || null;
}

function uploadCurrentSketchFile(payload) {
	const { serverUrl, authToken, projectId, versionId, revisionId } = payload;
	const doc = sketch.Document.getSelectedDocument();
	if (!doc) throw new Error('No document is open.');
	if (!doc.path) throw new Error('Save the Sketch document before check-in.');

	const rawPath = String(doc.path);
	const filePath = resolveSketchPath(rawPath);
	if (!filePath) {
		throw new Error(
			`Could not locate Sketch file on disk. Save the file locally and try again. Path: ${rawPath}`,
		);
	}
	const fileName = String(filePath.split('/').pop() || `revision-${revisionId}.sketch`);
	const fileData = readSketchFileData(filePath);
	if (!fileData) {
		throw new Error(`Failed to read Sketch file from disk at: ${filePath}`);
	}

	const boundary = `----FlowBoundary${String(NSUUID.UUID().UUIDString())}`;
	const endpoint = `${serverUrl}/projects/${projectId}/versions/${versionId}/revisions/${revisionId}/sketch-file`;
	const url = NSURL.URLWithString(endpoint);
	if (!url) throw new Error('Invalid server URL.');

	const body = NSMutableData.data();
	const appendText = (text) => {
		const ns = NSString.stringWithString(text);
		body.appendData(ns.dataUsingEncoding(NSUTF8StringEncoding));
	};

	appendText(`--${boundary}\r\n`);
	appendText(
		`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
	);
	body.appendData(fileData);
	appendText(`\r\n--${boundary}--\r\n`);

	const request = NSMutableURLRequest.requestWithURL(url);
	request.setHTTPMethod('PUT');
	request.setValue_forHTTPHeaderField(`Bearer ${authToken}`, 'Authorization');
	request.setValue_forHTTPHeaderField(`multipart/form-data; boundary=${boundary}`, 'Content-Type');
	request.setHTTPBody(body);

	const responseRef = MOPointer.alloc().init();
	const errorRef = MOPointer.alloc().init();
	const responseData = NSURLConnection.sendSynchronousRequest_returningResponse_error(
		request,
		responseRef,
		errorRef,
	);

	const nativeErr = errorRef.value();
	if (nativeErr) {
		throw new Error(String(nativeErr.localizedDescription() || 'Sketch upload request failed.'));
	}
	if (!responseData) throw new Error('Sketch upload request returned empty response.');

	const response = responseRef.value();
	const status = Number(response.statusCode());
	const jsonText = String(NSString.alloc().initWithData_encoding(responseData, NSUTF8StringEncoding));

	let parsed = {};
	try {
		parsed = JSON.parse(jsonText || '{}');
	} catch (_) {
		parsed = {};
	}

	if (status < 200 || status >= 300) {
		throw new Error(parsed.error || `Sketch upload failed (${status})`);
	}

	return parsed.artifact || null;
}

function openPanel(initialView) {
	const existingWebview = getWebview(WEBVIEW_ID);
	if (existingWebview) {
		if (initialView) {
			sendToWebView(existingWebview, 'navigate', { view: initialView });
		}
		return;
	}

	const win = new BrowserWindow({
		identifier: WEBVIEW_ID,
		title: 'Flow – Design Handoff',
		width: 420,
		height: 680,
		minWidth: 360,
		minHeight: 500,
		show: false,
		resizable: true,
		alwaysOnTop: true,
	});

	win.once('ready-to-show', () => {
		win.show();
	});

	const webContents = win.webContents;

	// ── Send initial settings when WebView loads ──
	webContents.on('did-finish-load', () => {
		const settings = getAllSettings();
		sendToWebView(webContents, 'init', {
			settings,
			initialView: initialView || null,
		});
	});

	// ── Handle messages from WebView ──

	// Settings
	webContents.on('saveServerUrl', (url) => {
		setServerUrl(url);
		sendToWebView(webContents, 'settingsSaved', { serverUrl: url });
	});

	webContents.on('saveAuth', (data) => {
		const { token, email, name } = JSON.parse(data);
		setAuthToken(token);
		setUserInfo(email, name);
		sendToWebView(webContents, 'authSaved', { email, name });
	});

	webContents.on('logout', () => {
		clearAuth();
		sendToWebView(webContents, 'loggedOut', {});
	});

	webContents.on('saveLastProject', (projectId) => {
		setLastProjectId(projectId);
	});

	webContents.on('getSettings', () => {
		sendToWebView(webContents, 'settings', getAllSettings());
	});

	// ── Document extraction (with cache) ──

	webContents.on('extractDocument', (forceRefresh) => {
		try {
			const doc = sketch.Document.getSelectedDocument();
			if (!doc) {
				sendToWebView(webContents, 'extractError', {
					message: 'No document is open. Please open a Sketch file first.',
				});
				return;
			}

			const docId = doc.id || doc.path || '';
			const shouldUseCache = !forceRefresh && _cachedDocId === docId && _cachedDocData;

			if (shouldUseCache) {
				sendToWebView(webContents, 'documentData', _cachedDocData);
				return;
			}

			// Invalidate extraction cache on fresh read
			invalidateCache();
			const data = extractDocument();

			// Cache it
			_cachedDocData = data;
			_cachedDocId = docId;

			sendToWebView(webContents, 'documentData', data);
		} catch (err) {
			sendToWebView(webContents, 'extractError', {
				message: err.message || 'Failed to extract document data.',
			});
		}
	});

	// Force refresh
	webContents.on('refreshDocument', () => {
		_cachedDocData = null;
		_cachedDocId = null;
		invalidateCache();

		try {
			const doc = sketch.Document.getSelectedDocument();
			if (!doc) {
				sendToWebView(webContents, 'extractError', {
					message: 'No document is open. Please open a Sketch file first.',
				});
				return;
			}
			const data = extractDocument();
			_cachedDocData = data;
			_cachedDocId = doc.id || doc.path || '';
			sendToWebView(webContents, 'documentData', data);
		} catch (err) {
			sendToWebView(webContents, 'extractError', {
				message: err.message || 'Failed to extract document data.',
			});
		}
	});

	// Export a single artboard image
	webContents.on('exportArtboard', (artboardId) => {
		try {
			const base64 = exportArtboardImage(artboardId);
			sendToWebView(webContents, 'artboardImage', {
				artboardId,
				imageBase64: base64,
			});
		} catch (err) {
			sendToWebView(webContents, 'artboardImageError', {
				artboardId,
				message: err.message || 'Failed to export artboard image.',
			});
		}
	});

	// Extract layer tree + flows for a single artboard
	webContents.on('extractArtboardData', (artboardId) => {
		try {
			const data = extractArtboardData(artboardId);
			sendToWebView(webContents, 'artboardData', data);
		} catch (err) {
			sendToWebView(webContents, 'artboardDataError', {
				artboardId,
				message: err.message || 'Failed to extract artboard data.',
			});
		}
	});

	// Upload the current .sketch file to a revision endpoint
	webContents.on('uploadSketchFile', (raw) => {
		try {
			const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
			const artifact = uploadCurrentSketchFile(payload);
			sendToWebView(webContents, 'sketchFileUploaded', {
				revisionId: payload.revisionId,
				artifact,
			});
		} catch (err) {
			let revisionId = '';
			try {
				revisionId = typeof raw === 'string' ? JSON.parse(raw).revisionId : raw.revisionId;
			} catch (_) {}
			sendToWebView(webContents, 'sketchFileUploadError', {
				revisionId,
				message: err.message || 'Failed to upload Sketch file.',
			});
		}
	});

	// Record publish timestamp
	webContents.on('publishComplete', () => {
		setLastPublishTime();
	});

	// Show a native Sketch notification
	webContents.on('showMessage', (msg) => {
		sketch.UI.message(msg);
	});

	// Open URL in default browser
	webContents.on('openUrl', (url) => {
		NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(url));
	});

	// Load the WebView HTML
	win.loadURL(require('../resources/webview.html'));
}

// ─── Exported Command Handlers ───────────────────────────────────────

export function onPublish() {
	openPanel('publish');
}

export function onSettings() {
	openPanel('settings');
}

export default function () {
	openPanel();
}

export function onShutdown() {
	const existingWebview = getWebview(WEBVIEW_ID);
	if (existingWebview) {
		existingWebview.close();
	}
}
