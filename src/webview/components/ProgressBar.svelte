<script lang="ts">
	export let percent = 0;
</script>

<div class="progress-bar">
	<div class="progress-fill" style="width: {percent}%"></div>
</div>

<style>
	.progress-bar {
		width: 100%;
		height: 6px;
		background: var(--accent);
		border-radius: 99px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--primary);
		border-radius: 99px;
		transition: width 300ms ease;
	}
</style>
