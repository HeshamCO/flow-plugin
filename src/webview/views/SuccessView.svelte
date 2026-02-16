<script lang="ts">
	import Button from '../components/Button.svelte';
	import { appState, navigateTo } from '../stores/state';
	import { publishState } from '../stores/publish';
	import { pluginCall } from '../lib/bridge';

	$: stats = $publishState.stats;
	$: projectName = $appState.selectedProjectName;

	function openInBrowser() {
		// Use the server URL directly — don't rewrite the port
		// replace -api in the url base if it exists, to get the project page instead of the API the api flow-api.hir.sa and fe flow.hir.sa or any other name same setup
		// not nusseary .hir.sa could be any domain
		const baseUrl = $appState.serverUrl.replace(/-api/, '').replace('-server', '');
		const url = `${baseUrl}/projects/${$appState.selectedProjectId}`;
		pluginCall('openUrl', url);
	}
</script>

<div class="success-view">
	<div class="success-content">
		<div class="success-icon">✓</div>
		<h3>Published Successfully!</h3>
		<p class="text-secondary text-sm">Version published to "{projectName}"</p>
	</div>

	<div class="stats">
		<div class="stat">
			<div class="stat-value">{stats.screens}</div>
			<div class="stat-label">Screens</div>
		</div>
		<div class="stat">
			<div class="stat-value">{stats.flows}</div>
			<div class="stat-label">Prototype Links</div>
		</div>
		<div class="stat">
			<div class="stat-value">{stats.tokens}</div>
			<div class="stat-label">Design Tokens</div>
		</div>
	</div>

	<div class="actions">
		<Button variant="primary" block on:click={openInBrowser}>Open in Browser</Button>
		<Button variant="secondary" block on:click={() => navigateTo('projects')}>
			Back to Projects
		</Button>
	</div>
</div>

<style>
	.success-view {
		animation: fadeIn 200ms ease;
	}

	.success-content {
		text-align: center;
		padding-top: 24px;
	}

	.success-icon {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: var(--success-light);
		color: var(--success);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 16px;
		font-size: 32px;
		font-weight: 700;
	}

	.success-content h3 {
		font-size: 18px;
		font-weight: 600;
	}

	.text-secondary {
		color: var(--text-secondary);
	}

	.text-sm {
		font-size: 12px;
		margin-top: 4px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 16px 0;
	}

	.stat {
		text-align: center;
		padding: 10px;
		background: var(--accent);
		border-radius: var(--radius);
	}

	.stat-value {
		font-size: 20px;
		font-weight: 600;
		color: var(--text);
	}

	.stat-label {
		font-size: 11px;
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 16px;
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
