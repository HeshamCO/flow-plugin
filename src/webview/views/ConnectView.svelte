<script lang="ts">
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Alert from '../components/Alert.svelte';
	import flowWelcomeIcon from '../../../assets/logo.png';
	import { appState, updateState, navigateTo } from '../stores/state';
	import { addToast } from '../stores/toast';
	import { login, register, isValidUrl, checkServerHealth } from '../lib/api';
	import { pluginCall } from '../lib/bridge';

	let serverUrl = $appState.serverUrl;
	let email = '';
	let password = '';
	let username = '';
	let name = '';
	let loading = false;
	let error = '';

	$: authMode = $appState.authMode;

	function toggleAuthMode() {
		updateState({ authMode: authMode === 'login' ? 'register' : 'login' });
		error = '';
	}

	async function handleSubmit() {
		error = '';
		const cleanUrl = serverUrl.replace(/\/+$/, '');

		if (!cleanUrl) {
			error = 'Please enter the server URL.';
			return;
		}

		if (!isValidUrl(cleanUrl)) {
			error = 'Please enter a valid URL (http:// or https://).';
			return;
		}

		if (!email || !password) {
			error = 'Please enter email and password.';
			return;
		}

		if (authMode === 'register' && password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		if (authMode === 'register' && username.length < 3) {
			error = 'Username must be at least 3 characters.';
			return;
		}

		if (authMode === 'register' && !/^[a-zA-Z0-9_-]+$/.test(username)) {
			error = 'Username can only contain letters, numbers, underscores, and dashes.';
			return;
		}

		loading = true;

		try {
			// Optional health check
			const healthy = await checkServerHealth(cleanUrl);
			if (!healthy) {
				error = 'Server is unreachable. Please check the URL and try again.';
				loading = false;
				return;
			}

			const data =
				authMode === 'register'
					? await register(cleanUrl, email, username, password, name || undefined)
					: await login(cleanUrl, email, password);

			updateState({
				serverUrl: cleanUrl,
				authToken: data.token,
				userEmail: data.user.email,
				userName: data.user.name || '',
			});

			pluginCall('saveServerUrl', cleanUrl);
			pluginCall(
				'saveAuth',
				JSON.stringify({
					token: data.token,
					email: data.user.email,
					name: data.user.name || '',
				}),
			);

			addToast(
				authMode === 'register' ? 'Account created! Welcome to Flow.' : 'Logged in successfully.',
				'success',
			);

			navigateTo('projects');
		} catch (err: any) {
			error = err.message || 'Could not connect to server.';
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<div class="connect-view">
	<div class="welcome">
		<div class="welcome-icon">
			<img src={flowWelcomeIcon} alt="Flow Logo" width="48" height="48" />
		</div>
		<h2>Welcome to Flow</h2>
		<p class="text-secondary">Connect to your Flow server to start publishing designs.</p>
	</div>

	<Alert type="error" message={error} show={!!error} />

	<Input
		label="Server URL"
		type="url"
		placeholder="http://localhost:4400"
		hint="The URL of your Flow server instance"
		bind:value={serverUrl}
		on:keydown={handleKeydown}
	/>

	<div class="divider"></div>

	<div class="auth-header">
		<span class="section-title">Account</span>
		<Button variant="ghost" size="sm" on:click={toggleAuthMode}>
			{authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
		</Button>
	</div>

	<Input
		label="Email"
		type="email"
		placeholder="you@company.com"
		bind:value={email}
		on:keydown={handleKeydown}
	/>

	<Input
		label="Password"
		type="password"
		placeholder="••••••••"
		showPasswordToggle={true}
		bind:value={password}
		on:keydown={handleKeydown}
	/>

	{#if authMode === 'register'}
		<Input
			label="Username"
			type="text"
			placeholder="your_username"
			hint="3-30 characters, letters, numbers, _ and -"
			bind:value={username}
			on:keydown={handleKeydown}
		/>
		<Input
			label="Name (optional)"
			type="text"
			placeholder="Your name"
			bind:value={name}
			on:keydown={handleKeydown}
		/>
	{/if}

	<Button variant="primary" block {loading} on:click={handleSubmit}>
		{authMode === 'register' ? 'Register' : 'Login'}
	</Button>
</div>

<style>
	.connect-view {
		animation: fadeIn 200ms ease;
	}

	.welcome {
		text-align: center;
		margin-bottom: 20px;
	}

	.welcome-icon {
		font-size: 36px;
		margin-bottom: 8px;
	}

	.welcome h2 {
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.3px;
		margin-bottom: 4px;
	}

	.welcome .text-secondary {
		color: var(--text-muted);
		font-size: 12px;
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: 16px 0;
	}

	.auth-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.section-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
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
