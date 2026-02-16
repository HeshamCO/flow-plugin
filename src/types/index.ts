/**
 * Flow Plugin – Shared Type Definitions
 *
 * Types shared between the native plugin side and the Svelte webview.
 */

// ─── Settings ────────────────────────────────────────────────────────

export interface PluginSettings {
	serverUrl: string;
	authToken: string;
	userEmail: string;
	userName: string;
	lastProjectId: string;
	exportScale: number;
	ignoreSslErrors: boolean;
}

// ─── Document Extraction ─────────────────────────────────────────────

export interface DocumentData {
	documentName: string;
	pages: PageData[];
	designTokens: DesignTokens;
}

export interface PageData {
	name: string;
	artboards: ArtboardMeta[];
}

export interface ArtboardMeta {
	id: string;
	name: string;
	pageName: string;
	width: number;
	height: number;
	displayOrder: number;
	flowCount: number;
	isSymbolMaster: boolean;
	isFlowHome: boolean;
}

export interface ArtboardData {
	artboardId: string;
	layers: LayerData[];
	flows: FlowData[];
}

// ─── Layer Tree ──────────────────────────────────────────────────────

export interface Frame {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface LayerData {
	id: string;
	name: string;
	type: string;
	frame: Frame;
	isVisible: boolean;
	isLocked: boolean;
	opacity: number;
	rotation: number;
	style: StyleData | null;
	exportFormats: ExportFormat[];
	// Text-specific
	text?: string;
	textStyle?: TextStyleData | null;
	// Symbol instance
	symbolId?: string;
	overrides?: OverrideData[];
	// Prototype flow
	flow?: LayerFlowData | null;
	// Child layers
	children?: LayerData[];
}

export interface StyleData {
	fills: FillData[];
	borders: BorderData[];
	shadows: ShadowData[];
	innerShadows: ShadowData[];
	blur: BlurData | null;
	borderOptions: BorderOptionsData | null;
	opacity: number;
	blendingMode: string;
}

export interface FillData {
	color: string;
	fillType: string;
	gradient: GradientData | null;
}

export interface GradientData {
	gradientType: string;
	from: { x: number; y: number };
	to: { x: number; y: number };
	stops: GradientStop[];
}

export interface GradientStop {
	position: number;
	color: string;
}

export interface BorderData {
	color: string;
	thickness: number;
	position: string;
	fillType: string;
}

export interface ShadowData {
	color: string;
	x: number;
	y: number;
	blur: number;
	spread: number;
}

export interface BlurData {
	blurType: string;
	radius: number;
}

export interface BorderOptionsData {
	dashPattern: number[];
	lineEnd: string;
	lineJoin: string;
}

export interface TextStyleData {
	fontFamily: string | null;
	fontSize: number | null;
	fontWeight: number | null;
	fontStyle: string | null;
	textColor: string | null;
	lineHeight: number | null;
	letterSpacing: number | null;
	textAlignment: string | null;
	textTransform: string;
	textDecoration: string;
	paragraphSpacing: number;
}

export interface ExportFormat {
	fileFormat: string;
	prefix: string;
	suffix: string;
	size: string;
}

export interface OverrideData {
	id: string;
	path: string;
	property: string;
	value: unknown;
	isDefault: boolean;
}

export interface LayerFlowData {
	targetId: string | null;
	targetName: string | null;
	animationType: string;
	isBackAction: boolean;
}

// ─── Prototype Flows ─────────────────────────────────────────────────

export interface FlowData {
	sourceLayerId: string;
	sourceLayerName: string;
	sourceRect: Frame;
	targetArtboardId: string;
	targetArtboardName: string | null;
	animationType: string;
	isBackAction: boolean;
}

// ─── Design Tokens ───────────────────────────────────────────────────

export interface DesignTokens {
	colors: ColorToken[];
	textStyles: TextStyleToken[];
	layerStyles: LayerStyleToken[];
}

export interface ColorToken {
	name: string;
	color: string;
}

export interface TextStyleToken {
	id: string;
	name: string;
	fontFamily: string | null;
	fontSize: number | null;
	fontWeight: number | null;
	textColor: string | null;
	lineHeight: number | null;
	letterSpacing: number | null;
	textAlignment: string | null;
	textTransform: string;
}

export interface LayerStyleToken {
	id: string;
	name: string;
	fills: { color: string; fillType: string }[];
	borders: { color: string; thickness: number; position: string }[];
	shadows: ShadowData[];
	opacity: number;
}

// ─── API Types ───────────────────────────────────────────────────────

export interface Project {
	id: string;
	name: string;
	description: string | null;
	createdAt: string;
	updatedAt: string;
	_count?: { versions: number };
	role?: 'owner' | 'maintainer' | 'viewer';
}

export interface Version {
	id: string;
	number: number;
	projectId: string;
	status: 'uploading' | 'complete';
	createdAt: string;
	_count?: { screens: number };
}

export interface ProjectDetail extends Project {
	versions: Version[];
}

export interface AuthResponse {
	token: string;
	user: {
		id: string;
		email: string;
		username: string;
		name: string | null;
	};
}

export interface ApiError {
	error: string;
	message?: string;
}

export interface HandoffLock {
	id: string;
	projectId: string;
	holderUserId: string;
	holder: { id: string; username: string; name: string | null };
	acquiredAt: string;
	expiresAt: string;
	versionId: string | null;
	revisionId: string | null;
	overrideReason: string | null;
}

export interface VersionRevision {
	id: string;
	versionId: string;
	revisionNumber: number;
	status: 'uploading' | 'complete' | 'failed';
	note: string;
	basedOnRevisionId: string | null;
	sketchArtifactId: string | null;
	diffSummary: any;
	createdAt: string;
	completedAt: string | null;
	uploadedByUser: { id: string; username: string; name: string | null };
	sketchArtifact?: {
		id: string;
		fileName: string;
		sizeBytes: number;
		sha256: string;
		createdAt: string;
	} | null;
}

export interface LayerDelta {
	layerId: string;
	name: string;
	change: 'added' | 'removed' | 'modified';
	baseFrame: Frame | null;
	headFrame: Frame | null;
}

export interface ScreenDeltaSummary {
	sketchId: string;
	name: string;
	pageName: string;
	change: 'added' | 'removed' | 'modified' | 'unchanged';
	baseImageUrl: string | null;
	headImageUrl: string | null;
	baseFrame: { width: number; height: number } | null;
	headFrame: { width: number; height: number } | null;
	layerCounts: {
		added: number;
		removed: number;
		modified: number;
	};
	layerDeltas: LayerDelta[];
}

export interface RevisionCompareResult {
	baseRevisionId: string | null;
	headRevisionId: string;
	totals: {
		screensAdded: number;
		screensRemoved: number;
		screensModified: number;
		screensUnchanged: number;
		layersAdded: number;
		layersRemoved: number;
		layersModified: number;
	};
	screens: ScreenDeltaSummary[];
}

// ─── Plugin ↔ WebView Messages ───────────────────────────────────────

/** Messages sent from the WebView to the native plugin via postMessage */
export type WebViewToPluginMessage =
	| { handler: 'saveServerUrl'; data: string }
	| {
			handler: 'saveSettings';
			data: { serverUrl: string; exportScale: number; ignoreSslErrors: boolean };
	  }
	| { handler: 'saveAuth'; data: string }
	| { handler: 'logout'; data: '' }
	| { handler: 'saveLastProject'; data: string }
	| { handler: 'nativeApiRequest'; data: string }
	| { handler: 'getSettings'; data: '' }
	| { handler: 'extractDocument'; data: '' }
	| { handler: 'exportArtboard'; data: string }
	| { handler: 'extractArtboardData'; data: string }
	| { handler: 'uploadSketchFile'; data: string }
	| { handler: 'showMessage'; data: string }
	| { handler: 'openUrl'; data: string };

/** Messages sent from the native plugin to the WebView */
export type PluginToWebViewMessage =
	| { type: 'init'; payload: { settings: PluginSettings; initialView: string | null } }
	| { type: 'navigate'; payload: { view: string } }
	| { type: 'settings'; payload: PluginSettings }
	| { type: 'settingsSaved'; payload: PluginSettings }
	| { type: 'authSaved'; payload: { email: string; name: string } }
	| { type: 'loggedOut'; payload: Record<string, never> }
	| { type: 'documentData'; payload: DocumentData }
	| { type: 'extractError'; payload: { message: string } }
	| { type: 'artboardImage'; payload: { artboardId: string; imageBase64: string } }
	| { type: 'artboardImageError'; payload: { artboardId: string; message: string } }
	| { type: 'artboardData'; payload: ArtboardData }
	| { type: 'artboardDataError'; payload: { artboardId: string; message: string } }
	| { type: 'sketchFileUploaded'; payload: { revisionId: string; artifact: any } }
	| { type: 'sketchFileUploadError'; payload: { revisionId: string; message: string } };

// ─── Publish Pipeline ────────────────────────────────────────────────

export type ArtboardStatus =
	| 'queued'
	| 'extracting'
	| 'exporting'
	| 'uploading'
	| 'done'
	| 'failed';

export interface PublishQueueItem extends ArtboardMeta {
	status: ArtboardStatus;
	error?: string;
}

export interface PublishStats {
	screens: number;
	flows: number;
	tokens: number;
}

export type PublishStep = 'creating' | 'screens' | 'tokens' | 'finalizing' | 'done' | 'failed';
