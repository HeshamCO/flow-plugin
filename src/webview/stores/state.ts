/**
 * Core application state store.
 */
import { writable, derived, get } from 'svelte/store';
import type {
	PluginSettings,
	DocumentData,
	Project,
	Version,
	HandoffLock,
	VersionRevision,
	PublishStats,
} from '../../types/index';
import { pluginCall } from '../lib/bridge';

// ─── View Management ─────────────────────────────────────────────────

export type ViewName = 'connect' | 'projects' | 'publish' | 'progress' | 'success' | 'settings';

export const currentView = writable<ViewName>('connect');
export const previousView = writable<ViewName>('connect');

export function navigateTo(view: ViewName): void {
	previousView.set(get(currentView));
	currentView.set(view);
}

// ─── App State ───────────────────────────────────────────────────────

export interface AppState {
	serverUrl: string;
	authToken: string;
	userEmail: string;
	userName: string;
	lastProjectId: string;
	exportScale: number;
	ignoreSslErrors: boolean;
	authMode: 'login' | 'register';
	projects: Project[];
	selectedProjectId: string | null;
	selectedProjectName: string;
	documentData: DocumentData | null;
	// Version selection
	projectVersions: Version[];
	selectedVersionId: string | null;
	alreadyUploadedIds: Set<string>;
	loadingVersionScreens: boolean;
	handoffLock: HandoffLock | null;
	versionRevisions: VersionRevision[];
	selectedRevisionId: string | null;
	checkinNote: string;
}

const defaultState: AppState = {
	serverUrl: '',
	authToken: '',
	userEmail: '',
	userName: '',
	lastProjectId: '',
	exportScale: 1,
	ignoreSslErrors: false,
	authMode: 'login',
	projects: [],
	selectedProjectId: null,
	selectedProjectName: '',
	documentData: null,
	projectVersions: [],
	selectedVersionId: null,
	alreadyUploadedIds: new Set(),
	loadingVersionScreens: false,
	handoffLock: null,
	versionRevisions: [],
	selectedRevisionId: null,
	checkinNote: '',
};

export const appState = writable<AppState>({ ...defaultState });

export function updateState(partial: Partial<AppState>): void {
	appState.update((s) => ({ ...s, ...partial }));
}

export function resetAuth(): void {
	updateState({
		authToken: '',
		userEmail: '',
		userName: '',
	});
	pluginCall('logout');
	navigateTo('connect');
}

// ─── Derived Stores ──────────────────────────────────────────────────

export const isAuthenticated = derived(appState, ($s) => !!$s.serverUrl && !!$s.authToken);
export const isConfigured = derived(appState, ($s) => !!$s.serverUrl);

// ─── Artboard Selection ──────────────────────────────────────────────

export const selectedArtboardIds = writable<Set<string>>(new Set());

export function toggleArtboard(id: string): void {
	selectedArtboardIds.update((set) => {
		const next = new Set(set);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		return next;
	});
}

export function selectAllArtboards(ids: string[]): void {
	selectedArtboardIds.set(new Set(ids));
}

export function deselectAllArtboards(): void {
	selectedArtboardIds.set(new Set());
}

export function togglePageArtboards(artboardIds: string[], select: boolean): void {
	selectedArtboardIds.update((set) => {
		const next = new Set(set);
		artboardIds.forEach((id) => {
			if (select) next.add(id);
			else next.delete(id);
		});
		return next;
	});
}

// ─── Version Selection ───────────────────────────────────────────────

export function setSelectedVersion(versionId: string | null): void {
	updateState({ selectedVersionId: versionId });
}

export function clearVersionSelection(): void {
	updateState({
		selectedVersionId: null,
		alreadyUploadedIds: new Set(),
		versionRevisions: [],
		selectedRevisionId: null,
	});
}

// ─── Settings initialization from plugin ─────────────────────────────

export function initFromSettings(settings: PluginSettings, initialView?: string | null): void {
	updateState({
		serverUrl: settings.serverUrl || '',
		authToken: settings.authToken || '',
		userEmail: settings.userEmail || '',
		userName: settings.userName || '',
		lastProjectId: settings.lastProjectId || '',
		exportScale: settings.exportScale || 2,
		ignoreSslErrors: !!settings.ignoreSslErrors,
	});

	if (settings.serverUrl && settings.authToken) {
		navigateTo(initialView === 'settings' ? 'settings' : 'projects');
	} else if (settings.serverUrl) {
		navigateTo(initialView === 'settings' ? 'settings' : 'connect');
	} else {
		navigateTo(initialView === 'settings' ? 'settings' : 'connect');
	}
}
