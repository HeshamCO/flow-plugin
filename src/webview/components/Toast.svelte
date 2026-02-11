<script lang="ts">
	import { toasts, dismissToast, type Toast } from '../stores/toast';
	import { fly } from 'svelte/transition';
</script>

{#if $toasts.length > 0}
	<div class="toast-container">
		{#each $toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}" transition:fly={{ y: -20, duration: 200 }}>
				<span class="toast-icon">
					{#if toast.type === 'success'}✓
					{:else if toast.type === 'error'}✕
					{:else if toast.type === 'warning'}⚠
					{:else}ℹ
					{/if}
				</span>
				<span class="toast-message">{toast.message}</span>
				<button class="toast-dismiss" on:click={() => dismissToast(toast.id)}> ✕ </button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: 8px;
		left: 8px;
		right: 8px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 6px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: var(--radius);
		font-size: 12px;
		font-weight: 500;
		pointer-events: all;
		box-shadow: var(--shadow);
		border: 1px solid transparent;
	}

	.toast-success {
		background: var(--success-light);
		border-color: var(--success);
		color: #065f46;
	}
	.toast-error {
		background: var(--error-light);
		border-color: var(--error);
		color: #991b1b;
	}
	.toast-warning {
		background: var(--warning-light);
		border-color: var(--warning);
		color: #92400e;
	}
	.toast-info {
		background: var(--accent);
		border-color: var(--border);
		color: var(--text);
	}

	:global([data-theme='dark'] .toast-success) {
		color: var(--success);
	}
	:global([data-theme='dark'] .toast-error) {
		color: var(--error);
	}
	:global([data-theme='dark'] .toast-warning) {
		color: var(--warning);
	}
	:global([data-theme='dark'] .toast-info) {
		color: var(--text);
	}

	.toast-icon {
		font-weight: 700;
		flex-shrink: 0;
	}

	.toast-message {
		flex: 1;
	}

	.toast-dismiss {
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		opacity: 0.6;
		padding: 0 2px;
		font-size: 12px;
	}

	.toast-dismiss:hover {
		opacity: 1;
	}
</style>
