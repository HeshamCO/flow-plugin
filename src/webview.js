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
	setExportScale,
	setIgnoreSslErrors,
	getExportScale,
	getIgnoreSslErrors,
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

function writeStringToFile(text, suffix = '.tmp') {
	const filePath = `${String(NSTemporaryDirectory())}flow-${String(NSUUID.UUID().UUIDString())}${suffix}`;
	const nsText = NSString.stringWithString(String(text || ''));
	const ok = nsText.writeToFile_atomically_encoding_error(
		filePath,
		true,
		NSUTF8StringEncoding,
		null,
	);
	if (!ok) {
		throw new Error(`Failed to write temporary file: ${filePath}`);
	}
	return filePath;
}

function writeDataToFile(data, suffix = '.tmp') {
	const filePath = `${String(NSTemporaryDirectory())}flow-${String(NSUUID.UUID().UUIDString())}${suffix}`;
	const ok = data.writeToFile_atomically(filePath, true);
	if (!ok) {
		throw new Error(`Failed to write temporary file: ${filePath}`);
	}
	return filePath;
}

function runCurl(args) {
	const task = NSTask.alloc().init();
	task.setLaunchPath('/usr/bin/curl');
	task.setArguments(args);

	const stdoutPipe = NSPipe.pipe();
	const stderrPipe = NSPipe.pipe();
	task.setStandardOutput(stdoutPipe);
	task.setStandardError(stderrPipe);

	task.launch();
	task.waitUntilExit();

	const outData = stdoutPipe.fileHandleForReading().readDataToEndOfFile();
	const errData = stderrPipe.fileHandleForReading().readDataToEndOfFile();
	const stdout = String(NSString.alloc().initWithData_encoding(outData, NSUTF8StringEncoding) || '');
	const stderr = String(NSString.alloc().initWithData_encoding(errData, NSUTF8StringEncoding) || '');

	return {
		code: Number(task.terminationStatus()),
		stdout,
		stderr,
	};
}

function performNativeApiRequest(rawPayload) {
	const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload || '{}') : rawPayload || {};
	const {
		url,
		method = 'GET',
		headers = {},
		body = '',
		insecure = false,
		timeoutMs = 120000,
		multipart = null,
	} = payload;

	if (!url) throw new Error('Missing URL for native API request.');

	const timeoutSec = Math.max(1, Math.ceil(Number(timeoutMs) / 1000));
	const args = [
		'-sS',
		'-L',
		'--connect-timeout',
		String(timeoutSec),
		'--max-time',
		String(timeoutSec),
		'-X',
		String(method || 'GET').toUpperCase(),
	];

	if (insecure) args.push('-k');

	const headerEntries = Object.entries(headers || {});
	for (const [key, value] of headerEntries) {
		if (value === undefined || value === null) continue;
		args.push('-H', `${key}: ${value}`);
	}

	const tempPaths = [];
	try {
		if (multipart && typeof multipart === 'object') {
			const files = Array.isArray(multipart.files) ? multipart.files : [];
			for (const file of files) {
				const fieldName = String(file.name || 'file');
				const fileName = String(file.filename || 'upload.bin');
				const contentType = String(file.contentType || 'application/octet-stream');

				let filePath = file.path ? String(file.path) : '';
				if (!filePath && file.base64) {
					const rawBase64 = String(file.base64).replace(/^data:[^;]+;base64,/, '');
					const data = NSData.alloc().initWithBase64EncodedString_options(rawBase64, 0);
					if (!data) throw new Error(`Invalid base64 payload for multipart file field "${fieldName}"`);
					filePath = writeDataToFile(data, '.bin');
					tempPaths.push(filePath);
				}

				if (!filePath) throw new Error(`Missing file path/base64 for multipart field "${fieldName}"`);

				args.push(
					'-F',
					`${fieldName}=@${filePath};type=${contentType};filename=${fileName}`,
				);
			}

			const fields = multipart.fields || {};
			for (const [fieldName, fieldValue] of Object.entries(fields)) {
				const fieldPath = writeStringToFile(String(fieldValue ?? ''), '.txt');
				tempPaths.push(fieldPath);
				args.push('-F', `${fieldName}=<${fieldPath}`);
			}
		} else if (typeof body === 'string' && body.length > 0) {
			const bodyPath = writeStringToFile(body, '.json');
			tempPaths.push(bodyPath);
			args.push('--data-binary', `@${bodyPath}`);
		}

		args.push(url);
		args.push('-w', '\n__FLOW_HTTP_CODE__:%{http_code}');

		const result = runCurl(args);
		const marker = '\n__FLOW_HTTP_CODE__:';
		const markerIndex = result.stdout.lastIndexOf(marker);
		if (markerIndex < 0) {
			const msg = result.stderr || 'Native request failed with unexpected response format.';
			throw new Error(msg);
		}

		const bodyText = result.stdout.slice(0, markerIndex);
		const statusText = result.stdout.slice(markerIndex + marker.length).trim();
		const status = Number(statusText);
		if (!Number.isFinite(status) || status <= 0) {
			const msg = result.stderr || 'Native request failed to parse HTTP status.';
			throw new Error(msg);
		}

		return {
			ok: status >= 200 && status < 300,
			status,
			bodyText,
		};
	} finally {
		const fm = NSFileManager.defaultManager();
		for (const path of tempPaths) {
			try {
				fm.removeItemAtPath_error(path, null);
			} catch (_) {}
		}
	}
}

function uploadCurrentSketchFile(payload) {
	const { serverUrl, authToken, projectId, versionId, revisionId, ignoreSslErrors } = payload;
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

	const endpoint = `${serverUrl}/projects/${projectId}/versions/${versionId}/revisions/${revisionId}/sketch-file`;

	const shouldIgnoreSsl = !!ignoreSslErrors || getIgnoreSslErrors();
	if (shouldIgnoreSsl && /^https:\/\//i.test(endpoint)) {
		const nativeResult = performNativeApiRequest({
			url: endpoint,
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${authToken}`,
			},
			insecure: true,
			timeoutMs: 10 * 60 * 1000,
			multipart: {
				files: [
					{
						name: 'file',
						path: filePath,
						filename: fileName,
						contentType: 'application/octet-stream',
					},
				],
			},
		});

		let parsed = {};
		try {
			parsed = JSON.parse(nativeResult.bodyText || '{}');
		} catch (_) {
			parsed = {};
		}
		if (!nativeResult.ok) {
			throw new Error(parsed.error || `Sketch upload failed (${nativeResult.status})`);
		}
		return parsed.artifact || null;
	}

	const boundary = `----FlowBoundary${String(NSUUID.UUID().UUIDString())}`;
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
		sendToWebView(webContents, 'settingsSaved', getAllSettings());
	});

	webContents.on('saveSettings', (raw) => {
		const payload = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
		if (typeof payload.serverUrl === 'string') {
			setServerUrl(payload.serverUrl);
		}
		if (payload.exportScale !== undefined) {
			setExportScale(payload.exportScale);
		}
		if (payload.ignoreSslErrors !== undefined) {
			setIgnoreSslErrors(payload.ignoreSslErrors);
		}
		sendToWebView(webContents, 'settingsSaved', getAllSettings());
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

	webContents.on('nativeApiRequest', (raw) => {
		try {
			return performNativeApiRequest(raw);
		} catch (err) {
			return {
				ok: false,
				status: 0,
				bodyText: JSON.stringify({
					error: err.message || 'Native API request failed.',
				}),
			};
		}
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
			const base64 = exportArtboardImage(artboardId, getExportScale());
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
