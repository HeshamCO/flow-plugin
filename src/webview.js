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

function sendToWebView(webContents, type, payload) {
	const msg = JSON.stringify({ type, payload });
	webContents.executeJavaScript(`window.__onPluginMessage(${msg})`);
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
