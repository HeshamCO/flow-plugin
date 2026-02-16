<script lang="ts">
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Alert from '../components/Alert.svelte';
	import { appState, updateState, navigateTo, resetAuth } from '../stores/state';
	import { addToast } from '../stores/toast';
	import { pluginCall } from '../lib/bridge';
	import { isValidUrl } from '../lib/api';

	let serverUrl = $appState.serverUrl;
	let exportScale = String($appState.exportScale || 2);
	let ignoreSslErrors = !!$appState.ignoreSslErrors;
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

		const parsedScale = Number(exportScale);
		if (![1, 2, 3, 4].includes(parsedScale)) {
			alertMsg = 'Export scale must be between 1x and 4x.';
			alertType = 'error';
			return;
		}

		updateState({
			serverUrl: cleaned,
			exportScale: parsedScale,
			ignoreSslErrors,
		});
		pluginCall('saveSettings', {
			serverUrl: cleaned,
			exportScale: parsedScale,
			ignoreSslErrors,
		});
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

	<div class="form-group">
		<label class="form-label" for="export-scale">Image Export Scale</label>
		<select id="export-scale" class="form-select" bind:value={exportScale}>
			<option value="1">1x (fastest)</option>
			<option value="2">2x (balanced)</option>
			<option value="3">3x (slower)</option>
			<option value="4">4x (slowest)</option>
		</select>
		<p class="form-hint">Higher scale improves image quality but increases export time.</p>
	</div>

	<label class="checkbox-row">
		<input type="checkbox" bind:checked={ignoreSslErrors} />
		<span>Ignore invalid HTTPS certificates (self-signed)</span>
	</label>
	<p class="ssl-hint">
		Use only for trusted internal servers. This disables certificate validation in plugin API calls.
	</p>

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

	.form-group {
		margin-bottom: 14px;
	}

	.form-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: var(--text);
		margin-bottom: 6px;
	}

	.form-select {
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

	.form-select:focus {
		border-color: var(--ring);
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--ring);
	}

	.form-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 4px;
	}

	.checkbox-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 12px;
		color: var(--text);
		margin-bottom: 4px;
		cursor: pointer;
		user-select: none;
	}

	.checkbox-row input {
		margin-top: 2px;
	}

	.ssl-hint {
		font-size: 11px;
		color: var(--warning);
		margin-bottom: 14px;
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
