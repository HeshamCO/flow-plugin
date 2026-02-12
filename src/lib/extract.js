/**
 * Flow Plugin – Sketch Document Extraction
 *
 * Extracts artboards, layer trees, styles, prototype flows, and design tokens
 * from the current Sketch document so developers can inspect specs and play
 * through the prototype journey.
 *
 * Performance optimizations:
 * - Artboard lookup map built once during extractDocument() → O(1) findLayerById
 * - Flow count captured during meta extraction (no duplicate tree walk)
 * - Lazy per-artboard extraction to avoid OOM on large documents
 * - Hidden layers excluded from layer tree, flow extraction, and flow counts
 * - Style extraction skips empty collections (fills, borders, shadows)
 * - Dedicated fill/border/shadow extractors avoid closure allocation in hot loops
 * - Default symbol overrides omitted to reduce payload size
 * - Image export uses persistent temp dir (avoids mkdir/rmdir per artboard)
 * - Export uses 'use-id-for-name' for predictable filenames
 * - for-loops replace .map()/.forEach() in hot paths
 *
 * @typedef {import('../types/index').DocumentData} DocumentData
 * @typedef {import('../types/index').ArtboardData} ArtboardData
 * @typedef {import('../types/index').ArtboardMeta} ArtboardMeta
 * @typedef {import('../types/index').LayerData} LayerData
 * @typedef {import('../types/index').FlowData} FlowData
 * @typedef {import('../types/index').DesignTokens} DesignTokens
 */
import sketch from 'sketch';

// ─── Artboard Lookup Cache ───────────────────────────────────────────
// Built once per extractDocument() call. O(1) artboard lookups instead of O(n).
/** @type {Map<string, any>} */
let _artboardMap = new Map();
/** @type {string|null} */
let _cachedDocId = null;

/**
 * Build or refresh the artboard lookup map for the current document.
 * @param {any} document - Sketch document
 */
function buildArtboardMap(document) {
	const docId = document.id || document.path || '';
	if (_cachedDocId === docId && _artboardMap.size > 0) return;

	_artboardMap = new Map();
	for (const page of document.pages) {
		for (const layer of page.layers) {
			if (layer.type === 'Artboard' || layer.type === 'SymbolMaster') {
				_artboardMap.set(layer.id, layer);
			}
		}
	}
	_cachedDocId = docId;
}

/**
 * Invalidate the artboard map cache (call when document may have changed).
 */
export function invalidateCache() {
	_artboardMap = new Map();
	_cachedDocId = null;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Extract lightweight document metadata for the WebView preview.
 * Does NOT include layer trees or full flow data to avoid OOM on large docs.
 * @returns {DocumentData}
 */
export function extractDocument() {
	const document = sketch.Document.getSelectedDocument();
	if (!document) {
		throw new Error('No document is open. Please open a Sketch file first.');
	}

	// Build the artboard lookup map for O(1) access later
	buildArtboardMap(document);

	const pages = document.pages.map((page) => ({
		name: page.name,
		artboards: page.layers
			.filter((l) => l.type === 'Artboard' || l.type === 'SymbolMaster')
			.map((artboard, idx) => extractArtboardMeta(artboard, page.name, idx)),
	}));

	const designTokens = extractDesignTokens(document);

	return {
		documentName: document.path
			? decodeURIComponent(
					String(document.path)
						.split('/')
						.pop()
						.replace(/\.sketch$/, ''),
				)
			: 'Untitled',
		pages,
		designTokens,
	};
}

/**
 * Extract the full layer tree + prototype flows for a single artboard.
 * Called lazily per-artboard during the publish flow to avoid OOM.
 * @param {string} artboardId
 * @returns {ArtboardData}
 */
export function extractArtboardData(artboardId) {
	const document = sketch.Document.getSelectedDocument();
	if (!document) throw new Error('No document open');

	// Use the cached map for O(1) lookup
	buildArtboardMap(document);
	const artboard = _artboardMap.get(artboardId) || findLayerById(document, artboardId);
	if (!artboard) throw new Error(`Artboard ${artboardId} not found`);

	const flows = extractFlows(artboard);

	return {
		artboardId,
		layers: extractLayerTree(artboard),
		flows,
		flowCount: flows.length, // Return count alongside data to avoid extra traversal
	};
}

/**
 * Export a single artboard to PNG and return its base64 data.
 * Called per-artboard during upload so we don't hold everything in memory.
 * @param {string} artboardId
 * @returns {string} data URI with base64 PNG
 */
// Persistent temp directory for exports – avoids mkdir/rmdir churn per artboard
const _exportBaseDir = String(NSTemporaryDirectory()) + 'Flow-exports/';

export function exportArtboardImage(artboardId) {
	const document = sketch.Document.getSelectedDocument();
	if (!document) throw new Error('No document open');

	buildArtboardMap(document);
	const artboard = _artboardMap.get(artboardId) || findLayerById(document, artboardId);
	if (!artboard) throw new Error(`Artboard ${artboardId} not found`);

	// Warn about oversized artboards (> 4096 in any dimension)
	const maxDim = Math.max(artboard.frame.width, artboard.frame.height);
	if (maxDim > 4096) {
		console.warn(
			`[Flow] Large artboard "${artboard.name}" (${artboard.frame.width}×${artboard.frame.height}). Export may be slow.`,
		);
	}

	const fileManager = NSFileManager.defaultManager();

	// Reuse a single temp dir, cleaning it before each export
	if (fileManager.fileExistsAtPath(_exportBaseDir)) {
		fileManager.removeItemAtPath_error(_exportBaseDir, null);
	}
	fileManager.createDirectoryAtPath_withIntermediateDirectories_attributes_error(
		_exportBaseDir,
		true,
		null,
		null,
	);

	sketch.export(artboard, {
		formats: 'png',
		scales: '1',
		output: _exportBaseDir,
		'save-for-web': true,
		overwriting: true,
		'use-id-for-name': true, // Predictable filename = artboardId.png
	});

	const files = fileManager.contentsOfDirectoryAtPath_error(_exportBaseDir, null);
	if (!files || files.count() === 0) {
		throw new Error('Export failed – no output file in ' + _exportBaseDir);
	}

	const allFiles = [];
	for (let i = 0; i < files.count(); i++) {
		allFiles.push(String(files.objectAtIndex(i)));
	}

	// Helper: check if a path is a directory using file attributes
	function isDirectory(fullPath) {
		const attrs = fileManager.attributesOfItemAtPath_error(fullPath, null);
		if (!attrs) return false;
		return String(attrs.fileType()) === 'NSFileTypeDirectory';
	}

	// Separate actual files from directories
	const actualFiles = allFiles.filter((f) => !isDirectory(_exportBaseDir + f));

	// If no files at top level, check inside subdirectories (Sketch may export into a folder)
	if (actualFiles.length === 0) {
		const subDirs = allFiles.filter((f) => isDirectory(_exportBaseDir + f));
		for (const dir of subDirs) {
			const subPath = _exportBaseDir + dir + '/';
			const subFiles = fileManager.contentsOfDirectoryAtPath_error(subPath, null);
			if (subFiles) {
				for (let i = 0; i < subFiles.count(); i++) {
					const name = String(subFiles.objectAtIndex(i));
					if (!isDirectory(subPath + name)) {
						actualFiles.push(dir + '/' + name);
					}
				}
			}
		}
	}

	const targetFile =
		actualFiles.find((f) => f.toLowerCase().endsWith('.png')) ||
		actualFiles.find((f) => /\.(png|jpg|jpeg|tiff|webp|bmp)$/i.test(f)) ||
		actualFiles.find((f) => {
			const base = f.includes('/') ? f.split('/').pop() : f;
			return !base.startsWith('.');
		});

	if (!targetFile) {
		throw new Error('Export failed – no image file found. Items in dir: ' + allFiles.join(', '));
	}

	const filePath = _exportBaseDir + targetFile;
	const fileData = NSData.dataWithContentsOfFile(filePath);

	if (!fileData) {
		throw new Error('Could not read exported image at: ' + filePath);
	}

	const base64 = String(fileData.base64EncodedStringWithOptions(0));

	// Clean up export dir (non-critical if it fails – will be overwritten next time)
	try {
		fileManager.removeItemAtPath_error(_exportBaseDir, null);
	} catch (_) {}

	return 'data:image/png;base64,' + base64;
}

// ─── Artboard Metadata ──────────────────────────────────────────────

/**
 * Lightweight metadata only – no layers, no flows. Safe to stringify for large docs.
 * @param {any} artboard
 * @param {string} pageName
 * @param {number} index
 * @returns {ArtboardMeta}
 */
function extractArtboardMeta(artboard, pageName, index) {
	return {
		id: artboard.id,
		name: artboard.name,
		pageName,
		width: Math.round(artboard.frame.width),
		height: Math.round(artboard.frame.height),
		displayOrder: index,
		flowCount: countFlows(artboard),
		isSymbolMaster: artboard.type === 'SymbolMaster',
		isFlowHome: artboard.flowStartPoint === true,
	};
}

// ─── Layer Tree Extraction ───────────────────────────────────────────

function extractLayerTree(parent) {
	if (!parent.layers || parent.layers.length === 0) return [];

	const result = [];
	for (let i = 0, len = parent.layers.length; i < len; i++) {
		const layer = parent.layers[i];
		// Skip hidden layers – they are irrelevant for developer handoff
		if (layer.hidden) continue;
		result.push(extractLayer(layer));
	}
	return result;
}

function extractLayer(layer) {
	const frame = layer.frame;
	const layerType = layer.type;
	const style = layer.style;

	const data = {
		id: layer.id,
		name: layer.name,
		type: layerType,
		frame: {
			x: Math.round(frame.x * 100) / 100,
			y: Math.round(frame.y * 100) / 100,
			width: Math.round(frame.width * 100) / 100,
			height: Math.round(frame.height * 100) / 100,
		},
		isVisible: true, // hidden layers are already filtered out in extractLayerTree
		isLocked: layer.locked || false,
		opacity: style ? safeGet(() => style.opacity, 1) : 1,
		rotation: layer.transform ? layer.transform.rotation : 0,
		style: style ? extractStyle(layer) : null,
		exportFormats: extractExportFormats(layer),
	};

	if (layerType === 'Text') {
		data.text = layer.text;
		data.textStyle = extractTextStyle(layer);
	} else if (layerType === 'SymbolInstance') {
		data.symbolId = layer.symbolId;
		data.overrides = extractOverrides(layer);
	}

	if (layer.flow) {
		const flow = layer.flow;
		data.flow = {
			targetId: flow.targetId || (flow.target ? flow.target.id : null),
			targetName: flow.target ? flow.target.name : null,
			animationType: flow.animationType || 'none',
			isBackAction: flow.isBackAction || false,
		};
	}

	if (layer.layers && layer.layers.length > 0) {
		data.children = extractLayerTree(layer);
	}

	return data;
}

// ─── Style Extraction ────────────────────────────────────────────────

function extractStyle(layer) {
	const style = layer.style;
	if (!style) return null;

	// Pre-check what this style actually has to avoid allocating empty arrays
	const hasFills = style.fills && style.fills.length > 0;
	const hasBorders = style.borders && style.borders.length > 0;
	const hasShadows = style.shadows && style.shadows.length > 0;
	const hasInnerShadows = style.innerShadows && style.innerShadows.length > 0;

	const result = {
		opacity: safeGet(() => style.opacity, 1),
		blendingMode: safeGet(() => style.blendingMode, 'Normal'),
	};

	// Only extract properties that actually have data
	result.fills = hasFills ? extractFills(style.fills) : [];

	result.borders = hasBorders ? extractBorders(style.borders) : [];

	result.shadows = hasShadows ? extractShadows(style.shadows) : [];

	result.innerShadows = hasInnerShadows ? extractShadows(style.innerShadows) : [];

	result.blur = safeGet(
		() =>
			style.blur && style.blur.enabled
				? { blurType: style.blur.blurType, radius: style.blur.radius }
				: null,
		null,
	);

	result.borderOptions = hasBorders
		? safeGet(
				() => ({
					dashPattern: style.borderOptions.dashPattern,
					lineEnd: style.borderOptions.lineEnd,
					lineJoin: style.borderOptions.lineJoin,
				}),
				null,
			)
		: null;

	return result;
}

/** Extract enabled fills – extracted to avoid repeated closure allocation */
function extractFills(fills) {
	const result = [];
	for (let i = 0, len = fills.length; i < len; i++) {
		const f = fills[i];
		if (!f.enabled) continue;
		const fill = { color: f.color, fillType: f.fillType, gradient: null };
		if (f.gradient) {
			const stops = f.gradient.stops;
			const mappedStops = new Array(stops.length);
			for (let j = 0; j < stops.length; j++) {
				mappedStops[j] = { position: stops[j].position, color: stops[j].color };
			}
			fill.gradient = {
				gradientType: f.gradient.gradientType,
				from: f.gradient.from,
				to: f.gradient.to,
				stops: mappedStops,
			};
		}
		result.push(fill);
	}
	return result;
}

/** Extract enabled borders */
function extractBorders(borders) {
	const result = [];
	for (let i = 0, len = borders.length; i < len; i++) {
		const b = borders[i];
		if (!b.enabled) continue;
		result.push({
			color: b.color,
			thickness: b.thickness,
			position: b.position,
			fillType: b.fillType,
		});
	}
	return result;
}

/** Extract enabled shadows (shared for shadows + innerShadows) */
function extractShadows(shadows) {
	const result = [];
	for (let i = 0, len = shadows.length; i < len; i++) {
		const s = shadows[i];
		if (!s.enabled) continue;
		result.push({
			color: s.color,
			x: s.x,
			y: s.y,
			blur: s.blur,
			spread: s.spread,
		});
	}
	return result;
}

function extractTextStyle(textLayer) {
	const style = textLayer.style;
	if (!style) return null;

	return {
		fontFamily: safeGet(() => style.fontFamily, null),
		fontSize: safeGet(() => style.fontSize, null),
		fontWeight: safeGet(() => style.fontWeight, null),
		fontStyle: safeGet(() => style.fontStyle, null),
		textColor: safeGet(() => style.textColor, null),
		lineHeight: safeGet(() => style.lineHeight, null),
		letterSpacing: safeGet(() => style.kerning, null),
		textAlignment: safeGet(() => style.alignment, null),
		textTransform: safeGet(() => style.textTransform, 'none'),
		textDecoration: safeGet(() => style.textDecoration, 'none'),
		paragraphSpacing: safeGet(() => style.paragraphSpacing, 0),
	};
}

function extractExportFormats(layer) {
	try {
		if (layer.exportFormats && layer.exportFormats.length > 0) {
			return layer.exportFormats.map((f) => ({
				fileFormat: f.fileFormat,
				prefix: f.prefix,
				suffix: f.suffix,
				size: f.size,
			}));
		}
	} catch (e) {
		/* no export formats */
	}
	return [];
}

function extractOverrides(symbolInstance) {
	try {
		if (symbolInstance.overrides) {
			const result = [];
			const overrides = symbolInstance.overrides;
			for (let i = 0, len = overrides.length; i < len; i++) {
				const o = overrides[i];
				// Skip default overrides – they carry no useful delta for developers
				if (o.isDefault) continue;
				result.push({
					id: o.id,
					path: o.path,
					property: o.property,
					value: o.value,
					isDefault: false,
				});
			}
			return result;
		}
	} catch (e) {
		/* no overrides */
	}
	return [];
}

// ─── Prototype Flow Extraction ───────────────────────────────────────

function extractFlows(artboard) {
	const flows = [];
	walkFlows(artboard, flows);
	return flows;
}

function walkFlows(layer, flows) {
	// Skip hidden layers – they contribute no visible flows
	if (layer.hidden) return;

	if (layer.flow) {
		const flow = layer.flow;
		const target = flow.target;
		const isBack = !target || target === sketch.Flow.BackTarget;

		let targetId = null;
		let targetName = null;

		if (!isBack) {
			if (target && target.id) {
				targetId = String(target.id);
				targetName = target.name ? String(target.name) : null;
			} else if (flow.targetId) {
				targetId = String(flow.targetId);
			}
		}

		if (targetId || isBack) {
			const absoluteFrame = getAbsoluteFrame(layer);
			flows.push({
				sourceLayerId: String(layer.id),
				sourceLayerName: String(layer.name),
				sourceRect: absoluteFrame,
				targetArtboardId: isBack ? '__back__' : targetId,
				targetArtboardName: targetName,
				animationType: String(flow.animationType || 'none'),
				isBackAction: isBack,
			});
		}
	}

	if (layer.layers) {
		for (let i = 0, len = layer.layers.length; i < len; i++) {
			walkFlows(layer.layers[i], flows);
		}
	}
}

function getAbsoluteFrame(layer) {
	let x = layer.frame.x;
	let y = layer.frame.y;
	let parent = layer.parent;

	while (parent && parent.type !== 'Artboard' && parent.type !== 'SymbolMaster' && parent.frame) {
		x += parent.frame.x;
		y += parent.frame.y;
		parent = parent.parent;
	}

	return {
		x: Math.round(x * 100) / 100,
		y: Math.round(y * 100) / 100,
		width: Math.round(layer.frame.width * 100) / 100,
		height: Math.round(layer.frame.height * 100) / 100,
	};
}

function countFlows(artboard) {
	let count = 0;
	function walk(layer) {
		// Skip hidden layers – they don't contribute visible flows
		if (layer.hidden) return;
		if (layer.flow) count++;
		if (layer.layers) {
			for (let i = 0, len = layer.layers.length; i < len; i++) {
				walk(layer.layers[i]);
			}
		}
	}
	walk(artboard);
	return count;
}

// ─── Design Token Extraction ─────────────────────────────────────────

function extractDesignTokens(document) {
	const tokens = {
		colors: [],
		textStyles: [],
		layerStyles: [],
	};

	try {
		if (document.swatches && document.swatches.length > 0) {
			tokens.colors = document.swatches.map((swatch) => ({
				name: swatch.name,
				color: swatch.color,
			}));
		}
	} catch (e) {
		// Swatches API may not be available in older Sketch versions
	}

	if (tokens.colors.length === 0) {
		try {
			if (document.colors && document.colors.length > 0) {
				tokens.colors = document.colors.map((color, i) => ({
					name: color.name || `Color ${i + 1}`,
					color: typeof color === 'string' ? color : color.color || color,
				}));
			}
		} catch (e) {
			/* no colors */
		}
	}

	try {
		if (document.sharedTextStyles && document.sharedTextStyles.length > 0) {
			tokens.textStyles = document.sharedTextStyles.map((shared) => {
				const s = shared.style;
				return {
					id: shared.id,
					name: shared.name,
					fontFamily: safeGet(() => s.fontFamily, null),
					fontSize: safeGet(() => s.fontSize, null),
					fontWeight: safeGet(() => s.fontWeight, null),
					textColor: safeGet(() => s.textColor, null),
					lineHeight: safeGet(() => s.lineHeight, null),
					letterSpacing: safeGet(() => s.kerning, null),
					textAlignment: safeGet(() => s.alignment, null),
					textTransform: safeGet(() => s.textTransform, 'none'),
				};
			});
		}
	} catch (e) {
		/* no text styles */
	}

	try {
		if (document.sharedLayerStyles && document.sharedLayerStyles.length > 0) {
			tokens.layerStyles = document.sharedLayerStyles.map((shared) => ({
				id: shared.id,
				name: shared.name,
				fills: safeGet(
					() =>
						shared.style.fills
							.filter((f) => f.enabled)
							.map((f) => ({ color: f.color, fillType: f.fillType })),
					[],
				),
				borders: safeGet(
					() =>
						shared.style.borders
							.filter((b) => b.enabled)
							.map((b) => ({
								color: b.color,
								thickness: b.thickness,
								position: b.position,
							})),
					[],
				),
				shadows: safeGet(
					() =>
						shared.style.shadows
							.filter((s) => s.enabled)
							.map((s) => ({
								color: s.color,
								x: s.x,
								y: s.y,
								blur: s.blur,
								spread: s.spread,
							})),
					[],
				),
				opacity: safeGet(() => shared.style.opacity, 1),
			}));
		}
	} catch (e) {
		/* no layer styles */
	}

	return tokens;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function findLayerById(document, id) {
	for (const page of document.pages) {
		const found = findInLayers(page.layers, id);
		if (found) return found;
	}
	return null;
}

function findInLayers(layers, id) {
	for (const layer of layers) {
		if (layer.id === id) return layer;
		if (layer.layers) {
			const found = findInLayers(layer.layers, id);
			if (found) return found;
		}
	}
	return null;
}

function safeGet(fn, fallback) {
	try {
		const val = fn();
		return val !== undefined && val !== null ? val : fallback;
	} catch (e) {
		return fallback;
	}
}
