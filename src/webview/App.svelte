<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import './styles/variables.css';

	// Bridge
	import { initBridge, initBridgeHandlers, pluginCall, onPluginMessage } from './lib/bridge';
	import { requestArtboardData, requestArtboardImageWithRetry } from './lib/bridge';
	import { initTheme } from './lib/theme';

	// Stores
	import {
		currentView,
		appState,
		updateState,
		initFromSettings,
		navigateTo,
		selectedArtboardIds,
	} from './stores/state';
	import {
		publishState,
		updatePublish,
		resetPublish,
		setQueueItemStatus,
		startPublishTimer,
		stopPublishTimer,
	} from './stores/publish';
	import type { PublishQueueItem } from './stores/publish';
	import { addToast } from './stores/toast';

	// API
	import {
		createVersion,
		getUploadedScreenIds,
		uploadScreen,
		uploadTokens,
		finalizeVersion,
	} from './lib/api';

	// Views
	import ConnectView from './views/ConnectView.svelte';
	import ProjectsView from './views/ProjectsView.svelte';
	import PublishView from './views/PublishView.svelte';
	import ProgressView from './views/ProgressView.svelte';
	import SuccessView from './views/SuccessView.svelte';
	import SettingsView from './views/SettingsView.svelte';

	// Components
	import Toast from './components/Toast.svelte';
	import Button from './components/Button.svelte';

	// ─── Lifecycle ────────────────────────────────────────────────

	let unsubscribers: (() => void)[] = [];

	onMount(() => {
		initBridge();
		initBridgeHandlers();
		initTheme();

		// Handle init message from plugin
		unsubscribers.push(
			onPluginMessage('init', (payload) => {
				initFromSettings(payload.settings, payload.initialView);
			}),
		);

		// Handle navigate messages
		unsubscribers.push(
			onPluginMessage('navigate', (payload) => {
				navigateTo(payload.view);
			}),
		);

		// Handle settings updates
		unsubscribers.push(
			onPluginMessage('settingsSaved', (payload) => {
				updateState({ serverUrl: payload.serverUrl });
			}),
		);

		unsubscribers.push(
			onPluginMessage('authSaved', (payload) => {
				updateState({ userEmail: payload.email, userName: payload.name });
			}),
		);

		unsubscribers.push(
			onPluginMessage('loggedOut', () => {
				updateState({ authToken: '', userEmail: '', userName: '' });
				navigateTo('connect');
			}),
		);

		// Handle document data
		unsubscribers.push(
			onPluginMessage('documentData', (payload) => {
				updateState({ documentData: payload });
			}),
		);
	});

	onDestroy(() => {
		unsubscribers.forEach((fn) => fn());
		stopPublishTimer();
	});

	// ─── Publish Pipeline ─────────────────────────────────────────

	// AbortController for cancellation
	let publishAbort: AbortController | null = null;

	/** Concurrency limit for parallel artboard processing */
	const CONCURRENCY = 3;

	async function startPublish(isResume = false) {
		const state = get(appState);
		if (!state.selectedProjectId || !state.documentData) return;

		const selected = get(selectedArtboardIds);
		if (selected.size === 0) {
			addToast('Please select at least one artboard to publish.', 'warning');
			return;
		}

		// Build queue
		const queue: PublishQueueItem[] = [];
		state.documentData.pages.forEach((page) => {
			page.artboards.forEach((artboard) => {
				if (selected.has(artboard.id)) {
					queue.push({
						...artboard,
						pageName: page.name,
						status: 'queued',
					});
				}
			});
		});

		publishAbort = new AbortController();

		if (!isResume) {
			resetPublish();
		}

		updatePublish({
			isPublishing: true,
			queue,
			step: 'creating',
			percent: 0,
			detail: isResume ? 'Resuming…' : 'Creating version…',
			error: null,
			cancelled: false,
		});

		navigateTo('progress');
		startPublishTimer();

		try {
			let versionId = get(publishState).versionId;
			let uploadedIds = new Set<string>();

			// 1. Create version or reuse existing
			const chosenVersionId = state.selectedVersionId;

			if (chosenVersionId && !isResume) {
				// User selected an existing version
				versionId = chosenVersionId;
				updatePublish({ versionId, detail: 'Using selected version…' });

				// Fetch uploaded screens to skip them (unless user checked them for overwrite)
				const ids = await getUploadedScreenIds(state.serverUrl, state.selectedProjectId, versionId);

				// Only skip screens that are uploaded AND not selected by the user.
				// If the user re-checked an uploaded screen, it means they want to overwrite it.
				uploadedIds = new Set(ids.filter((id) => !selected.has(id)));
				updatePublish({ uploadedIds });
			} else if (!isResume || !versionId) {
				updatePublish({ step: 'creating', detail: 'Creating version…' });
				const version = await createVersion(state.serverUrl, state.selectedProjectId);
				versionId = version.id;
				updatePublish({ versionId });
			} else {
				// Resuming: check what's already uploaded
				updatePublish({ detail: 'Checking previously uploaded screens…' });
				const ids = await getUploadedScreenIds(state.serverUrl, state.selectedProjectId, versionId);
				uploadedIds = new Set(ids);
				updatePublish({ uploadedIds });
			}

			// 2. Upload artboards with concurrency
			updatePublish({ step: 'screens' });
			const toUpload = queue.filter((a) => !uploadedIds.has(a.id));
			const skipped = queue.length - toUpload.length;
			let completedCount = skipped;
			let totalFlows = 0;

			// Mark skipped as done
			queue.forEach((item) => {
				if (uploadedIds.has(item.id)) {
					setQueueItemStatus(item.id, 'done');
				}
			});

			// Process with semaphore for concurrency control
			const semaphore = new Semaphore(CONCURRENCY);

			const uploadPromises = toUpload.map((artboard) =>
				semaphore.acquire().then(async (release) => {
					if (publishAbort?.signal.aborted) {
						release();
						return;
					}

					try {
						// Extract
						setQueueItemStatus(artboard.id, 'extracting');
						updatePublish({
							detail: `Extracting: ${artboard.name}`,
							percent: Math.round((completedCount / queue.length) * 85) + 5,
						});

						const artboardData = await requestArtboardData(artboard.id);

						if (publishAbort?.signal.aborted) {
							release();
							return;
						}

						// Export image
						setQueueItemStatus(artboard.id, 'exporting');
						updatePublish({ detail: `Exporting: ${artboard.name}` });
						const imageBase64 = await requestArtboardImageWithRetry(artboard.id, artboard.name);

						if (publishAbort?.signal.aborted) {
							release();
							return;
						}

						// Upload
						setQueueItemStatus(artboard.id, 'uploading');
						updatePublish({ detail: `Uploading: ${artboard.name}` });
						await uploadScreen(state.serverUrl, state.selectedProjectId!, versionId!, {
							name: artboard.name,
							sketchId: artboard.id,
							pageName: artboard.pageName,
							width: artboard.width,
							height: artboard.height,
							imageBase64,
							layers: artboardData.layers,
							flows: artboardData.flows,
							displayOrder: artboard.displayOrder,
							isFlowHome: artboard.isFlowHome || false,
						});

						setQueueItemStatus(artboard.id, 'done');
						completedCount++;
						totalFlows += (artboardData.flows || []).length;

						updatePublish({
							stats: {
								screens: completedCount,
								flows: totalFlows,
								tokens: get(publishState).stats.tokens,
							},
							percent: Math.round((completedCount / queue.length) * 85) + 5,
							detail: `Uploaded ${completedCount}/${queue.length}: ${artboard.name}`,
						});
					} catch (err: any) {
						setQueueItemStatus(artboard.id, 'failed', err.message);
						throw err;
					} finally {
						release();
					}
				}),
			);

			await Promise.all(uploadPromises);

			if (publishAbort?.signal.aborted) return;

			// 3. Upload design tokens
			updatePublish({ step: 'tokens', percent: 92, detail: 'Uploading design tokens…' });
			const includeTokens = true; // Could bind to checkbox
			if (includeTokens && state.documentData.designTokens) {
				const tokens = state.documentData.designTokens;
				const tokenCount =
					(tokens.colors?.length || 0) +
					(tokens.textStyles?.length || 0) +
					(tokens.layerStyles?.length || 0);

				updatePublish({
					stats: { ...get(publishState).stats, tokens: tokenCount },
				});

				await uploadTokens(state.serverUrl, state.selectedProjectId!, versionId!, tokens);
			}

			if (publishAbort?.signal.aborted) return;

			// 4. Finalize
			updatePublish({ step: 'finalizing', percent: 97, detail: 'Finalizing…' });
			await finalizeVersion(state.serverUrl, state.selectedProjectId!, versionId!);

			// Success
			updatePublish({ step: 'done', percent: 100, detail: 'Done!', isPublishing: false });
			stopPublishTimer();

			pluginCall('publishComplete');
			pluginCall(
				'showMessage',
				`✅ Published ${completedCount} screens with ${totalFlows} prototype links!`,
			);

			setTimeout(() => navigateTo('success'), 400);
		} catch (err: any) {
			if (publishAbort?.signal.aborted) return;
			stopPublishTimer();
			updatePublish({
				step: 'failed',
				error: err.message || 'Publish failed.',
				isPublishing: false,
			});
		}
	}

	function handleResume() {
		startPublish(true);
	}

	function handleCancel() {
		if (publishAbort) {
			publishAbort.abort();
		}
		stopPublishTimer();
		updatePublish({ cancelled: true, isPublishing: false });
		resetPublish();
		navigateTo('publish');
	}

	// ─── Semaphore for concurrency control ────────────────────────

	class Semaphore {
		private queue: (() => void)[] = [];
		private active = 0;
		private limit: number;

		constructor(limit: number) {
			this.limit = limit;
		}

		acquire(): Promise<() => void> {
			return new Promise((resolve) => {
				const tryAcquire = () => {
					if (this.active < this.limit) {
						this.active++;
						resolve(() => {
							this.active--;
							if (this.queue.length > 0) {
								this.queue.shift()!();
							}
						});
					} else {
						this.queue.push(tryAcquire);
					}
				};
				tryAcquire();
			});
		}
	}
</script>

<div id="app-root">
	<!-- Header -->
	<div class="header">
		<div class="header-title">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				width="20"
				height="20"
			>
				<path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4z" />
				<path d="M9 3v14" />
				<path d="M15 7v14" />
			</svg>
			Flow
		</div>
		<div class="header-actions">
			{#if $currentView !== 'settings' && $currentView !== 'progress'}
				<Button variant="ghost" size="icon" on:click={() => navigateTo('settings')}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="3" />
						<path
							d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
						/>
					</svg>
				</Button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="content">
		{#if $currentView === 'connect'}
			<ConnectView />
		{:else if $currentView === 'projects'}
			<ProjectsView />
		{:else if $currentView === 'publish'}
			<PublishView />
		{:else if $currentView === 'progress'}
			<ProgressView onResume={handleResume} onCancel={handleCancel} />
		{:else if $currentView === 'success'}
			<SuccessView />
		{:else if $currentView === 'settings'}
			<SettingsView />
		{/if}
	</div>

	<!-- Footer (publish action) -->
	{#if $currentView === 'publish'}
		{@const _selected = $selectedArtboardIds}
		{@const _uploaded = $appState.alreadyUploadedIds}
		{@const _versionId = $appState.selectedVersionId}
		{@const _newCount = _versionId
			? [..._selected].filter((id) => !_uploaded.has(id)).length
			: _selected.size}
		{@const _overwriteCount = _versionId
			? [..._selected].filter((id) => _uploaded.has(id)).length
			: 0}
		<div class="footer">
			<Button
				variant="primary"
				block
				on:click={() => startPublish()}
				disabled={_selected.size === 0}
			>
				{#if !_versionId}
					Publish ({_selected.size} artboard{_selected.size !== 1 ? 's' : ''})
				{:else if _overwriteCount > 0 && _newCount > 0}
					Publish ({_newCount} new, {_overwriteCount} overwrite)
				{:else if _overwriteCount > 0}
					Publish ({_overwriteCount} overwrite)
				{:else}
					Publish ({_newCount} new screen{_newCount !== 1 ? 's' : ''})
				{/if}
			</Button>
		</div>
	{/if}

	<!-- Toast notifications -->
	<Toast />
</div>

<style>
	#app-root {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg);
		flex-shrink: 0;
		-webkit-app-region: drag;
	}

	.header-title {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.2px;
		color: var(--text);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.header-title svg {
		opacity: 0.7;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		-webkit-app-region: no-drag;
	}

	.content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	.footer {
		flex-shrink: 0;
		padding: 12px 16px;
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
</style>
