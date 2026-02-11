<script context="module" lang="ts">
	function getStepOrder(step: string): number {
		const order: Record<string, number> = {
			creating: 0,
			screens: 1,
			tokens: 2,
			finalizing: 3,
			done: 4,
			failed: -1,
		};
		return order[step] ?? -1;
	}
</script>

<script lang="ts">
	import ProgressBar from '../components/ProgressBar.svelte';
	import Button from '../components/Button.svelte';
	import { publishState, publishProgress } from '../stores/publish';
	import type { PublishQueueItem } from '../stores/publish';
	import type { ArtboardStatus } from '../../types/index';

	export let onResume: () => void = () => {};
	export let onCancel: () => void = () => {};

	$: progress = $publishProgress;
	$: showPatience = progress.elapsed && parseInt(progress.elapsed) > 8;

	function statusIcon(status: ArtboardStatus): string {
		switch (status) {
			case 'done':
				return '✓';
			case 'failed':
				return '✕';
			case 'extracting':
			case 'exporting':
			case 'uploading':
				return '⟳';
			default:
				return '○';
		}
	}

	function statusClass(status: ArtboardStatus): string {
		switch (status) {
			case 'done':
				return 'done';
			case 'failed':
				return 'failed';
			case 'extracting':
			case 'exporting':
			case 'uploading':
				return 'active';
			default:
				return '';
		}
	}

	function stepLabel(step: string): string {
		switch (step) {
			case 'creating':
				return 'Creating version…';
			case 'screens':
				return 'Uploading screens…';
			case 'tokens':
				return 'Uploading design tokens…';
			case 'finalizing':
				return 'Finalizing…';
			case 'done':
				return 'Done!';
			default:
				return step;
		}
	}
</script>

<div class="progress-view">
	{#if progress.error}
		<!-- Error state -->
		<div class="error-state">
			<div class="error-icon">✕</div>
			<h3>Publish Failed</h3>
			<p class="text-secondary text-sm">{progress.error}</p>
		</div>

		<ProgressBar percent={progress.percent} />

		<div class="progress-meta">
			<span class="text-xs text-secondary">{progress.percent}%</span>
			<span class="text-xs text-secondary">{progress.elapsed}</span>
		</div>

		<!-- Per-artboard status -->
		{#if progress.queue.length > 0}
			<div class="artboard-status-list">
				{#each progress.queue as item (item.id)}
					<div class="artboard-status {statusClass(item.status)}">
						<span class="status-icon">{statusIcon(item.status)}</span>
						<span class="artboard-name">{item.name}</span>
						{#if item.status === 'failed' && item.error}
							<span class="text-xs text-error">{item.error}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="resume-actions">
			<p class="text-sm text-secondary resume-info">
				{progress.stats.screens} of {progress.queue.length} screens uploaded. You can resume from where
				it stopped.
			</p>
			<Button variant="primary" on:click={onResume}>Resume Upload</Button>
			<Button variant="secondary" size="sm" on:click={onCancel}>Cancel & Discard</Button>
		</div>
	{:else}
		<!-- Active publishing state -->
		<div class="active-state">
			<div class="spinner-large"></div>
			<h3>Publishing…</h3>
			<p class="text-secondary text-sm">{progress.detail}</p>
		</div>

		<ProgressBar percent={progress.percent} />

		<div class="progress-meta">
			<span class="text-xs text-secondary">{progress.percent}%</span>
			<span class="text-xs text-secondary">{progress.elapsed}</span>
		</div>

		<!-- Progress steps -->
		<ul class="progress-steps">
			{#each ['creating', 'screens', 'tokens', 'finalizing'] as step}
				{@const isActive = progress.step === step}
				{@const isDone = getStepOrder(progress.step) > getStepOrder(step)}
				<li class="progress-step" class:active={isActive} class:done={isDone}>
					<span class="step-icon">
						{#if isDone}✓
						{:else if isActive}<span class="step-spinner"></span>
						{:else}○
						{/if}
					</span>
					{stepLabel(step)}
				</li>
			{/each}
		</ul>

		<!-- Per-artboard status during upload -->
		{#if progress.step === 'screens' && progress.queue.length > 0}
			<div class="artboard-status-list compact">
				{#each progress.queue as item (item.id)}
					<div class="artboard-status {statusClass(item.status)}">
						<span class="status-icon">
							{#if item.status === 'extracting' || item.status === 'exporting' || item.status === 'uploading'}
								<span class="mini-spinner"></span>
							{:else}
								{statusIcon(item.status)}
							{/if}
						</span>
						<span class="artboard-name">{item.name}</span>
						<span class="text-xs text-muted">{item.status}</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if showPatience}
			<p class="patience-msg">
				This may take a while for large documents — please don't close the window.
			</p>
		{/if}

		<div class="cancel-action">
			<Button variant="ghost" size="sm" on:click={onCancel}>Cancel</Button>
		</div>
	{/if}
</div>

<style>
	.progress-view {
		animation: fadeIn 200ms ease;
	}

	.active-state,
	.error-state {
		text-align: center;
		margin-top: 16px;
		margin-bottom: 12px;
	}

	.active-state h3,
	.error-state h3 {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.spinner-large {
		margin: 0 auto 12px;
		width: 32px;
		height: 32px;
		border: 3px solid var(--border);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 600ms linear infinite;
	}

	.error-icon {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--error-light);
		color: var(--error);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 12px;
		font-size: 24px;
		font-weight: 700;
	}

	.progress-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 8px;
	}

	.progress-steps {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
	}

	.progress-step {
		padding: 6px 0;
		font-size: 12px;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 8px;
		transition: color 200ms ease;
	}

	.progress-step.active {
		color: var(--text);
		font-weight: 500;
	}

	.progress-step.done {
		color: var(--success);
	}

	.step-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.step-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 600ms linear infinite;
	}

	.artboard-status-list {
		margin-top: 12px;
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 4px;
	}

	.artboard-status-list.compact {
		max-height: 140px;
		font-size: 11px;
	}

	.artboard-status {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-radius: 4px;
		margin-bottom: 5px;
	}

	.artboard-status.active {
		color: var(--text);
		background: var(--accent);
	}

	.artboard-status.done {
		color: var(--success);
	}

	.artboard-status.failed {
		color: var(--error);
	}

	.status-icon {
		width: 14px;
		flex-shrink: 0;
		text-align: center;
	}

	.artboard-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mini-spinner {
		display: inline-block;
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--border);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 600ms linear infinite;
	}

	.patience-msg {
		text-align: center;
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 12px;
		animation: pulse 2s ease-in-out infinite;
	}

	.resume-actions {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
	}

	.resume-info {
		text-align: center;
		max-width: 280px;
	}

	.cancel-action {
		text-align: center;
		margin-top: 16px;
	}

	.text-secondary {
		color: var(--text-secondary);
	}
	.text-muted {
		color: var(--text-muted);
	}
	.text-error {
		color: var(--error);
	}
	.text-xs {
		font-size: 11px;
	}
	.text-sm {
		font-size: 12px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
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
