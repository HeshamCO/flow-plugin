<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../components/Button.svelte';
	import Badge from '../components/Badge.svelte';
	import Alert from '../components/Alert.svelte';
	import {
		appState,
		updateState,
		navigateTo,
		selectedArtboardIds,
		selectAllArtboards,
		deselectAllArtboards,
		toggleArtboard,
		togglePageArtboards,
		setSelectedVersion,
		clearVersionSelection,
	} from '../stores/state';
	import { pluginCall, onPluginMessage } from '../lib/bridge';
	import { fetchProjectDetail, getUploadedScreenIds } from '../lib/api';
	import type { DocumentData, PageData, ArtboardMeta, Version } from '../../types/index';

	let error = '';
	let loading = true;
	let versionsLoading = false;

	$: documentData = $appState.documentData;
	$: selectedCount = $selectedArtboardIds.size;
	$: totalArtboards = documentData
		? documentData.pages.reduce((sum: number, p: PageData) => sum + p.artboards.length, 0)
		: 0;
	$: totalFlows = documentData
		? documentData.pages.reduce(
				(sum: number, p: PageData) =>
					sum + p.artboards.reduce((s: number, a: ArtboardMeta) => s + a.flowCount, 0),
				0,
			)
		: 0;
	$: allIds = documentData
		? documentData.pages.flatMap((p: PageData) => p.artboards.map((a: ArtboardMeta) => a.id))
		: [];
	$: allSelected = allIds.length > 0 && allIds.every((id: string) => $selectedArtboardIds.has(id));
	$: versions = $appState.projectVersions;
	$: selectedVersionId = $appState.selectedVersionId;
	$: alreadyUploadedIds = $appState.alreadyUploadedIds;
	$: uploadedCount = alreadyUploadedIds.size;
	$: loadingVersionScreens = $appState.loadingVersionScreens;

	// Compute how many selected screens are new vs overwrite
	$: newCount = selectedVersionId
		? [...$selectedArtboardIds].filter((id) => !alreadyUploadedIds.has(id)).length
		: selectedCount;
	$: overwriteCount = selectedVersionId
		? [...$selectedArtboardIds].filter((id) => alreadyUploadedIds.has(id)).length
		: 0;

	onMount(() => {
		const unsub = onPluginMessage('documentData', (data: DocumentData) => {
			loading = false;
			error = '';
			// Select all artboards by default (only when no version is selected)
			if (!$appState.selectedVersionId) {
				const ids = data.pages.flatMap((p) => p.artboards.map((a) => a.id));
				selectAllArtboards(ids);
			}
		});

		const unsubErr = onPluginMessage('extractError', (payload: { message: string }) => {
			loading = false;
			error = payload.message;
		});

		// Request extraction
		pluginCall('extractDocument');
		loading = true;

		// Load project versions
		loadVersions();

		return () => {
			unsub();
			unsubErr();
		};
	});

	async function loadVersions() {
		const projectId = $appState.selectedProjectId;
		if (!projectId) return;

		versionsLoading = true;
		try {
			const detail = await fetchProjectDetail($appState.serverUrl, projectId);
			updateState({ projectVersions: detail.versions || [] });

			if (!$appState.selectedVersionId && detail.versions && detail.versions.length > 0) {
				setSelectedVersion(detail.versions[0].id);
			}
		} catch (err: any) {
			console.warn('[PublishView] Failed to load versions:', err.message);
			updateState({ projectVersions: [] });
		} finally {
			versionsLoading = false;
		}
	}

	async function handleVersionChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		if (value === '__new__') {
			clearVersionSelection();
			// Re-select all artboards for new version
			if (allIds.length > 0) {
				selectAllArtboards(allIds);
			}
			return;
		}

		setSelectedVersion(value);
		updateState({ loadingVersionScreens: true });

		try {
			const ids = await getUploadedScreenIds(
				$appState.serverUrl,
				$appState.selectedProjectId!,
				value,
			);
			const uploadedSet = new Set(ids);
			updateState({ alreadyUploadedIds: uploadedSet, loadingVersionScreens: false });

			// Auto-select only NEW artboards (deselect already-uploaded ones)
			const newIds = allIds.filter((id: string) => !uploadedSet.has(id));
			selectAllArtboards(newIds);
		} catch (err: any) {
			console.warn('[PublishView] Failed to load uploaded screens:', err.message);
			updateState({ alreadyUploadedIds: new Set(), loadingVersionScreens: false });
			selectAllArtboards(allIds);
		}
	}

	function handleNewVersion() {
		clearVersionSelection();
		if (allIds.length > 0) {
			selectAllArtboards(allIds);
		}
	}

	function refresh() {
		loading = true;
		error = '';
		pluginCall('refreshDocument');
	}

	function toggleAll() {
		if (allSelected) {
			deselectAllArtboards();
		} else {
			selectAllArtboards(allIds);
		}
	}

	function isPageAllSelected(artboards: ArtboardMeta[]): boolean {
		return artboards.every((a) => $selectedArtboardIds.has(a.id));
	}

	function togglePage(artboards: ArtboardMeta[]) {
		const ids = artboards.map((a) => a.id);
		const allChecked = isPageAllSelected(artboards);
		togglePageArtboards(ids, !allChecked);
	}

	function formatVersionDate(dateStr: string): string {
		try {
			const d = new Date(dateStr);
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return dateStr;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') navigateTo('projects');
		if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
			e.preventDefault();
			toggleAll();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="publish-view">
	<div class="publish-header">
		<Button variant="ghost" size="sm" on:click={() => navigateTo('projects')}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M19 12H5m7-7l-7 7 7 7" />
			</svg>
		</Button>
		<div>
			<div class="section-title">Publish to</div>
			<div class="project-name">{$appState.selectedProjectName}</div>
		</div>
	</div>

	<Alert type="error" message={error} show={!!error} />

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<span class="text-secondary">Extracting document…</span>
		</div>
	{:else if documentData}
		<div class="doc-info card">
			<div class="doc-info-content">
				<div>
					<div class="card-title">{documentData.documentName}</div>
					<div class="card-meta">
						{documentData.pages.length} page{documentData.pages.length !== 1 ? 's' : ''} ·
						{totalArtboards} artboard{totalArtboards !== 1 ? 's' : ''} ·
						{totalFlows} prototype link{totalFlows !== 1 ? 's' : ''}
					</div>
				</div>
				<Button variant="secondary" size="sm" on:click={refresh}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M1 4v6h6" />
						<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
					</svg>
					Refresh
				</Button>
			</div>
		</div>

		<!-- Version Selector -->
		<div class="version-section card">
			<div class="version-header">
				<div class="version-label">Version</div>
				<Button variant="secondary" size="sm" on:click={handleNewVersion}>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					New version
				</Button>
			</div>
			{#if versionsLoading}
				<div class="version-loading">
					<div class="spinner-sm"></div>
					<span class="text-secondary text-xs">Loading versions…</span>
				</div>
			{:else}
				<select
					class="version-select"
					value={selectedVersionId || '__new__'}
					on:change={handleVersionChange}
				>
					<option value="__new__">New version</option>
					{#each versions as version, i (version.id)}
						<option value={version.id}>
							v{versions.length - i}{version.status === 'complete' ? '' : ' (uploading)'}
							— {formatVersionDate(version.createdAt)}{version._count
								? ` · ${version._count.screens} screens`
								: ''}
						</option>
					{/each}
				</select>
			{/if}
			{#if loadingVersionScreens}
				<div class="version-loading">
					<div class="spinner-sm"></div>
					<span class="text-secondary text-xs">Checking uploaded screens…</span>
				</div>
			{:else if selectedVersionId && uploadedCount > 0}
				<div class="version-note">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span
						>{uploadedCount} screen{uploadedCount !== 1 ? 's' : ''} already uploaded — check to overwrite</span
					>
				</div>
			{/if}
		</div>

		<!-- Select All / None -->
		<div class="select-actions">
			<label class="check-item">
				<input type="checkbox" checked={allSelected} on:change={toggleAll} />
				<span class="text-sm">
					{allSelected ? 'Deselect all' : 'Select all'} ({selectedCount}/{totalArtboards})
				</span>
			</label>
		</div>

		<!-- Artboards grouped by page -->
		{#each documentData.pages as page (page.name)}
			{#if page.artboards.length > 0}
				<div class="page-group">
					<label class="check-item check-group-header">
						<input
							type="checkbox"
							checked={isPageAllSelected(page.artboards)}
							on:change={() => togglePage(page.artboards)}
						/>
						<span>
							{page.name}
							<span class="text-secondary text-xs">({page.artboards.length})</span>
						</span>
					</label>
					<div class="check-group">
						{#each page.artboards as artboard (artboard.id)}
							<label class="check-item">
								<input
									type="checkbox"
									checked={$selectedArtboardIds.has(artboard.id)}
									on:change={() => toggleArtboard(artboard.id)}
								/>
								<span class="artboard-label">
									{artboard.name}
									<span class="text-xs text-secondary">{artboard.width}×{artboard.height}</span>
									{#if alreadyUploadedIds.has(artboard.id)}
										<Badge variant="success">Uploaded</Badge>
									{/if}
									{#if artboard.flowCount > 0}
										<Badge variant="secondary">{artboard.flowCount} flows</Badge>
									{/if}
								</span>
							</label>
						{/each}
					</div>
				</div>
			{/if}
		{/each}

		<div class="publish-options">
			<label class="check-item">
				<input type="checkbox" id="opt-tokens" checked />
				<span>Include design tokens (colors, text styles)</span>
			</label>
		</div>
	{/if}
</div>

<style>
	.publish-view {
		animation: fadeIn 200ms ease;
	}

	.publish-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.section-title {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		margin: 0;
	}

	.project-name {
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.2px;
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 14px;
		background: var(--bg);
		margin-bottom: 12px;
	}

	.doc-info-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.card-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--text);
	}

	.card-meta {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.version-section {
		padding: 12px 14px;
	}

	.version-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.version-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.version-select {
		width: 100%;
		padding: 7px 10px;
		border: 1px solid var(--input);
		border-radius: var(--radius);
		font-size: 12px;
		font-family: var(--font);
		color: var(--text);
		background: transparent;
		outline: none;
		cursor: pointer;
		transition:
			border-color var(--transition),
			box-shadow var(--transition);
		-webkit-appearance: none;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 8px center;
		padding-right: 28px;
	}

	.version-select:focus {
		border-color: var(--ring);
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--ring);
	}

	.version-note {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		padding: 6px 8px;
		border-radius: var(--radius);
		background: var(--success-light);
		color: var(--success);
		font-size: 11px;
		font-weight: 500;
	}

	.version-loading {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 0;
	}

	.spinner-sm {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 600ms linear infinite;
	}

	.select-actions {
		margin-bottom: 4px;
		padding: 4px 0;
		border-bottom: 1px solid var(--border);
	}

	.check-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		font-size: 13px;
		cursor: pointer;
	}

	.check-item input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--text);
		flex-shrink: 0;
		cursor: pointer;
	}

	.check-group-header {
		font-weight: 500;
		color: var(--text);
		padding: 8px 0 4px;
	}

	.check-group {
		margin-left: 24px;
	}

	.artboard-label {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.page-group {
		margin-bottom: 4px;
	}

	.publish-options {
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	.text-secondary {
		color: var(--text-secondary);
	}
	.text-xs {
		font-size: 11px;
	}
	.text-sm {
		font-size: 12px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 32px 16px;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2.5px solid var(--border);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 600ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
