/**
 * Publish pipeline state store.
 */
import { writable, derived, get } from 'svelte/store';
import type {
	ArtboardMeta,
	PublishStats,
	ArtboardStatus,
	PublishStep,
	DesignTokens,
} from '../../types/index';

// ─── Types ───────────────────────────────────────────────────────────

export interface PublishQueueItem extends ArtboardMeta {
	status: ArtboardStatus;
	error?: string;
}

export interface PublishState {
	isPublishing: boolean;
	step: PublishStep;
	versionId: string | null;
	queue: PublishQueueItem[];
	uploadedIds: Set<string>;
	stats: PublishStats;
	percent: number;
	detail: string;
	startTime: number;
	elapsed: string;
	error: string | null;
	cancelled: boolean;
}

const defaultPublishState: PublishState = {
	isPublishing: false,
	step: 'creating',
	versionId: null,
	queue: [],
	uploadedIds: new Set(),
	stats: { screens: 0, flows: 0, tokens: 0 },
	percent: 0,
	detail: 'Preparing…',
	startTime: 0,
	elapsed: '0s',
	error: null,
	cancelled: false,
};

export const publishState = writable<PublishState>({ ...defaultPublishState });

export function updatePublish(partial: Partial<PublishState>): void {
	publishState.update((s) => ({ ...s, ...partial }));
}

export function resetPublish(): void {
	publishState.set({ ...defaultPublishState });
}

export function setQueueItemStatus(
	artboardId: string,
	status: ArtboardStatus,
	error?: string,
): void {
	publishState.update((s) => ({
		...s,
		queue: s.queue.map((item) => (item.id === artboardId ? { ...item, status, error } : item)),
	}));
}

// ─── Timer ───────────────────────────────────────────────────────────

let _timerInterval: ReturnType<typeof setInterval> | null = null;

export function startPublishTimer(): void {
	updatePublish({ startTime: Date.now() });
	stopPublishTimer();
	_timerInterval = setInterval(() => {
		publishState.update((s) => {
			const secs = Math.floor((Date.now() - s.startTime) / 1000);
			const m = Math.floor(secs / 60);
			const sec = secs % 60;
			return { ...s, elapsed: m > 0 ? `${m}m ${sec}s` : `${sec}s` };
		});
	}, 1000);
}

export function stopPublishTimer(): void {
	if (_timerInterval) {
		clearInterval(_timerInterval);
		_timerInterval = null;
	}
}

// ─── Derived ─────────────────────────────────────────────────────────

export const publishProgress = derived(publishState, ($s) => ({
	percent: $s.percent,
	detail: $s.detail,
	elapsed: $s.elapsed,
	step: $s.step,
	error: $s.error,
	stats: $s.stats,
	queue: $s.queue,
	isPublishing: $s.isPublishing,
	cancelled: $s.cancelled,
}));
