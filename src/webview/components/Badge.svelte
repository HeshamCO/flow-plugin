<script lang="ts">
	export let variant: 'default' | 'secondary' | 'success' | 'destructive' = 'default';
</script>

<span class="badge badge-{variant}">
	<slot />
</span>

<style>
	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 99px;
		font-size: 11px;
		font-weight: 500;
		border: 1px solid transparent;
	}

	.badge-default {
		background: var(--primary);
		color: var(--primary-foreground);
	}

	.badge-secondary {
		background: var(--accent);
		color: var(--text-secondary);
		border-color: var(--border);
	}

	.badge-success {
		background: var(--success-light);
		color: var(--success);
	}

	.badge-destructive {
		background: var(--error-light);
		color: var(--error);
	}
</style>
