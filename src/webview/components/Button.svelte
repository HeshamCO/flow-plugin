<script lang="ts">
	export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary';
	export let size: 'default' | 'sm' | 'icon' = 'default';
	export let block = false;
	export let disabled = false;
	export let loading = false;
	export let type: 'button' | 'submit' = 'button';
</script>

<button
	{type}
	{disabled}
	class="btn btn-{variant} {size === 'sm' ? 'btn-sm' : ''} {size === 'icon'
		? 'btn-icon'
		: ''} {block ? 'btn-block' : ''}"
	class:loading
	on:click
	on:keydown
>
	{#if loading}
		<span class="spinner"></span>
	{:else}
		<slot />
	{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 16px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		font-size: 13px;
		font-weight: 500;
		font-family: var(--font);
		cursor: pointer;
		transition: all var(--transition);
		outline: none;
		text-decoration: none;
		white-space: nowrap;
		min-height: 34px;
	}

	.btn:focus-visible {
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--ring);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--primary-hover);
	}

	.btn-secondary {
		background: var(--bg);
		color: var(--text);
		border-color: var(--border);
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--accent);
		color: var(--accent-foreground);
	}

	.btn-ghost {
		background: transparent;
		color: var(--text-secondary);
		padding: 6px 8px;
	}
	.btn-ghost:hover:not(:disabled) {
		color: var(--text);
		background: var(--accent);
	}

	.btn-danger {
		background: var(--error);
		color: #fff;
	}
	.btn-danger:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-block {
		width: 100%;
	}

	.btn-sm {
		padding: 5px 10px;
		font-size: 12px;
		min-height: 28px;
	}

	.btn-icon {
		width: 30px;
		height: 30px;
		padding: 0;
		border-radius: 6px;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 600ms linear infinite;
	}

	.btn-secondary .spinner,
	.btn-ghost .spinner {
		border-color: var(--border);
		border-top-color: var(--text);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
