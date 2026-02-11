<script lang="ts">
	export let label = '';
	export let type: 'text' | 'email' | 'password' | 'url' = 'text';
	export let placeholder = '';
	export let value = '';
	export let hint = '';
	export let disabled = false;
	export let showPasswordToggle = false;

	let showPassword = false;
	let inputId = `input-${Math.random().toString(36).slice(2, 9)}`;
	$: inputType = type === 'password' && showPassword ? 'text' : type;
</script>

<div class="form-group">
	{#if label}
		<label class="form-label" for={inputId}>{label}</label>
	{/if}
	<div class="input-wrapper">
		<input
			id={inputId}
			class="form-input"
			type={inputType}
			{placeholder}
			{disabled}
			bind:value
			on:input
			on:keydown
		/>
		{#if type === 'password' && showPasswordToggle}
			<button
				class="toggle-password"
				type="button"
				on:click={() => (showPassword = !showPassword)}
				tabindex="-1"
				title={showPassword ? 'Hide password' : 'Show password'}
			>
				{#if showPassword}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
						/>
						<line x1="1" y1="1" x2="23" y2="23" />
					</svg>
				{:else}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
						<circle cx="12" cy="12" r="3" />
					</svg>
				{/if}
			</button>
		{/if}
	</div>
	{#if hint}
		<p class="form-hint">{hint}</p>
	{/if}
</div>

<style>
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

	.input-wrapper {
		position: relative;
	}

	.form-input {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid var(--input);
		border-radius: var(--radius);
		font-size: 13px;
		font-family: var(--font);
		color: var(--text);
		background: transparent;
		transition:
			border-color var(--transition),
			box-shadow var(--transition);
		outline: none;
	}

	.form-input:focus {
		border-color: var(--ring);
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--ring);
	}

	.form-input::placeholder {
		color: var(--text-muted);
	}

	.form-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 4px;
	}

	.toggle-password {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 2px;
		display: flex;
		align-items: center;
	}

	.toggle-password:hover {
		color: var(--text-secondary);
	}
</style>
