<script lang="ts">
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Alert from '../components/Alert.svelte';
	import { appState, updateState, navigateTo, resetAuth } from '../stores/state';
	import { addToast } from '../stores/toast';
	import { pluginCall } from '../lib/bridge';
	import { isValidUrl } from '../lib/api';

	let serverUrl = $appState.serverUrl;
	let alertMsg = '';
	let alertType: 'success' | 'error' = 'success';

	$: hasAuth = !!$appState.authToken;
	$: userEmail = $appState.userEmail;
	$: userName = $appState.userName;

	function goBack() {
		if ($appState.serverUrl && $appState.authToken) {
			navigateTo('projects');
		} else {
			navigateTo('connect');
		}
	}

	function saveSettings() {
		const cleaned = serverUrl.replace(/\/+$/, '');
		if (!cleaned) {
			alertMsg = 'Please enter a server URL.';
			alertType = 'error';
			return;
		}

		if (!isValidUrl(cleaned)) {
			alertMsg = 'Please enter a valid URL (http:// or https://).';
			alertType = 'error';
			return;
		}

		updateState({ serverUrl: cleaned });
		pluginCall('saveServerUrl', cleaned);
		alertMsg = 'Settings saved.';
		alertType = 'success';
		setTimeout(() => (alertMsg = ''), 2000);
	}

	function handleLogout() {
		resetAuth();
		addToast('Logged out successfully.', 'info');
		navigateTo('connect');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveSettings();
		if (e.key === 'Escape') goBack();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="settings-view">
	<div class="settings-header">
		<Button variant="ghost" size="sm" on:click={goBack}>
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
		<span class="section-title">Settings</span>
	</div>

	<Alert type={alertType} message={alertMsg} show={!!alertMsg} />

	<Input label="Server URL" type="url" placeholder="http://localhost:4400" bind:value={serverUrl} />

	<Button variant="primary" block on:click={saveSettings}>Save</Button>

	<div class="divider"></div>

	{#if hasAuth}
		<div class="section-title">Account</div>
		<div class="card">
			<div class="card-title">{userEmail}</div>
			<div class="card-meta">{userName || 'No name set'}</div>
		</div>
		<div class="logout-action">
			<Button variant="danger" size="sm" block on:click={handleLogout}>Logout</Button>
		</div>
	{/if}
</div>

<style>
	.settings-view {
		animation: fadeIn 200ms ease;
	}

	.settings-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.section-title {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 8px;
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: 16px 0;
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 14px;
		background: var(--bg);
	}

	.card-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--text);
	}

	.card-meta {
		font-size: 12px;
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.logout-action {
		margin-top: 12px;
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
