import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	publishState,
	updatePublish,
	resetPublish,
	setQueueItemStatus,
	publishProgress,
} from '../webview/stores/publish';

describe('publish store', () => {
	beforeEach(() => {
		resetPublish();
	});

	it('has correct initial state', () => {
		const s = get(publishState);
		expect(s.isPublishing).toBe(false);
		expect(s.queue).toEqual([]);
		expect(s.step).toBe('creating');
		expect(s.percent).toBe(0);
	});

	it('updatePublish merges state', () => {
		updatePublish({ isPublishing: true, step: 'creating', detail: 'Test...' });
		const s = get(publishState);
		expect(s.isPublishing).toBe(true);
		expect(s.step).toBe('creating');
		expect(s.detail).toBe('Test...');
	});

	it('setQueueItemStatus updates specific item', () => {
		updatePublish({
			queue: [
				{
					id: 'a',
					name: 'A',
					pageName: 'Page',
					width: 100,
					height: 100,
					displayOrder: 0,
					status: 'queued',
				},
				{
					id: 'b',
					name: 'B',
					pageName: 'Page',
					width: 100,
					height: 100,
					displayOrder: 1,
					status: 'queued',
				},
			],
		});
		setQueueItemStatus('a', 'done');
		const s = get(publishState);
		expect(s.queue[0].status).toBe('done');
		expect(s.queue[1].status).toBe('queued');
	});

	it('setQueueItemStatus records error', () => {
		updatePublish({
			queue: [
				{
					id: 'a',
					name: 'A',
					pageName: 'Page',
					width: 100,
					height: 100,
					displayOrder: 0,
					status: 'queued',
				},
			],
		});
		setQueueItemStatus('a', 'failed', 'Upload error');
		const s = get(publishState);
		expect(s.queue[0].status).toBe('failed');
		expect(s.queue[0].error).toBe('Upload error');
	});

	it('resetPublish returns to defaults', () => {
		updatePublish({ isPublishing: true, percent: 50, step: 'screens' });
		resetPublish();
		const s = get(publishState);
		expect(s.isPublishing).toBe(false);
		expect(s.percent).toBe(0);
		expect(s.step).toBe('creating');
	});

	it('publishProgress derived store works', () => {
		updatePublish({ percent: 42, step: 'screens', detail: 'Uploading...' });
		const p = get(publishProgress);
		expect(p.percent).toBe(42);
		expect(p.step).toBe('screens');
		expect(p.detail).toBe('Uploading...');
	});
});
