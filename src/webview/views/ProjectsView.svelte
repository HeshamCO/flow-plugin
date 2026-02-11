<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Alert from '../components/Alert.svelte';
	import Badge from '../components/Badge.svelte';
	import { appState, updateState, navigateTo } from '../stores/state';
	import { addToast } from '../stores/toast';
	import { fetchProjects as apiFetchProjects, createProject as apiCreateProject } from '../lib/api';
	import { pluginCall } from '../lib/bridge';

	let loading = true;
	let error = '';
	let showCreateForm = false;
	let newProjectName = '';
	let newProjectDesc = '';
	let creating = false;
	let searchQuery = '';

	$: projects = $appState.projects;
	$: filteredProjects = searchQuery
		? projects.filter(
				(p) =>
					p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					(p.description || '').toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: projects;

	onMount(() => {
		loadProjects();
	});

	async function loadProjects() {
		loading = true;
		error = '';
		try {
			const list = await apiFetchProjects($appState.serverUrl);
			updateState({ projects: list });
		} catch (err: any) {
			error = err.message || 'Failed to load projects';
		} finally {
			loading = false;
		}
	}

	function selectProject(id: string, name: string) {
		updateState({ selectedProjectId: id, selectedProjectName: name });
		pluginCall('saveLastProject', id);
		navigateTo('publish');
	}

	async function handleCreate() {
		if (!newProjectName.trim()) {
			error = 'Please enter a project name.';
			return;
		}

		creating = true;
		error = '';

		try {
			const project = await apiCreateProject(
				$appState.serverUrl,
				newProjectName.trim(),
				newProjectDesc.trim() || undefined,
			);

			addToast(`Project "${project.name}" created!`, 'success');
			showCreateForm = false;
			newProjectName = '';
			newProjectDesc = '';

			// Select it immediately
			selectProject(project.id, project.name);
		} catch (err: any) {
			error = err.message;
		} finally {
			creating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && showCreateForm) handleCreate();
		if (e.key === 'Escape') showCreateForm = false;
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="projects-view">
	<div class="projects-header">
		<span class="section-title">Your Projects</span>
		<Button variant="primary" size="sm" on:click={() => (showCreateForm = true)}>+ New</Button>
	</div>

	<Alert type="error" message={error} show={!!error} />

	{#if showCreateForm}
		<div class="card create-form">
			<Input placeholder="Project name" bind:value={newProjectName} />
			<Input placeholder="Description (optional)" bind:value={newProjectDesc} />
			<div class="create-actions">
				<Button variant="primary" size="sm" loading={creating} on:click={handleCreate}
					>Create</Button
				>
				<Button variant="secondary" size="sm" on:click={() => (showCreateForm = false)}
					>Cancel</Button
				>
			</div>
		</div>
	{/if}

	{#if projects.length > 3}
		<div class="search-wrapper">
			<input
				class="search-input"
				type="text"
				placeholder="Search projects…"
				bind:value={searchQuery}
			/>
		</div>
	{/if}

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<span class="text-secondary">Loading projects…</span>
		</div>
	{:else if filteredProjects.length === 0 && projects.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📁</div>
			<p>No projects yet.</p>
			<p class="text-sm text-secondary">Create your first project to start publishing designs.</p>
		</div>
	{:else if filteredProjects.length === 0}
		<div class="empty-state">
			<p class="text-secondary">No matching projects.</p>
		</div>
	{:else}
		<div class="projects-list">
			{#each filteredProjects as project (project.id)}
				<button
					class="card card-clickable"
					on:click={() => selectProject(project.id, project.name)}
				>
					<div class="card-content">
						<div class="card-left">
							<div class="card-title">📁 {project.name}</div>
							<div class="card-meta">{project.description || 'No description'}</div>
						</div>
						<Badge variant="secondary">
							{project._count ? project._count.versions : 0} versions
						</Badge>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.projects-view {
		animation: fadeIn 200ms ease;
	}

	.projects-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.section-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 14px;
		background: var(--bg);
		transition: border-color var(--transition);
	}

	.create-form {
		margin-bottom: 12px;
	}

	.create-form :global(.form-group) {
		margin-bottom: 8px;
	}

	.create-actions {
		display: flex;
		gap: 8px;
	}

	.search-wrapper {
		margin-bottom: 12px;
	}

	.search-input {
		width: 100%;
		padding: 7px 10px;
		border: 1px solid var(--input);
		border-radius: var(--radius);
		font-size: 12px;
		font-family: var(--font);
		color: var(--text);
		background: transparent;
		outline: none;
		transition:
			border-color var(--transition),
			box-shadow var(--transition);
	}

	.search-input:focus {
		border-color: var(--ring);
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--ring);
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}

	.projects-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.card-clickable {
		cursor: pointer;
		text-align: left;
		font-family: var(--font);
		font-size: 13px;
		width: 100%;
	}

	.card-clickable:hover {
		border-color: var(--ring);
		background: var(--surface);
	}

	.card-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.card-left {
		flex: 1;
		min-width: 0;
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

	.text-secondary {
		color: var(--text-secondary);
		font-size: 12px;
	}

	.text-sm {
		font-size: 12px;
	}

	.empty-state {
		text-align: center;
		padding: 32px 16px;
		color: var(--text-muted);
	}

	.empty-icon {
		font-size: 36px;
		margin-bottom: 8px;
		opacity: 0.3;
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
