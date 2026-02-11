<script lang="ts">
	export let type: 'error' | 'success' | 'warning' = 'error';
	export let message = '';
	export let show = false;
</script>

{#if show && message}
	<div class="alert alert-{type}">
		{message}
	</div>
{/if}

<style>
	.alert {
		padding: 10px 12px;
		border-radius: var(--radius);
		font-size: 12px;
		font-weight: 500;
		margin-bottom: 12px;
		border: 1px solid transparent;
		animation: fadeIn 150ms ease;
	}

	.alert-error {
		background: var(--error-light);
		border-color: var(--error);
		color: #991b1b;
	}

	.alert-success {
		background: var(--success-light);
		border-color: var(--success);
		color: #065f46;
	}

	.alert-warning {
		background: var(--warning-light);
		border-color: var(--warning);
		color: #92400e;
	}

	:global([data-theme='dark'] .alert-error) {
		color: var(--error);
	}
	:global([data-theme='dark'] .alert-success) {
		color: var(--success);
	}
	:global([data-theme='dark'] .alert-warning) {
		color: var(--warning);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
