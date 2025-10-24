<script lang="ts">
        import '../app.css';
        import favicon from '$lib/assets/favicon.svg';

        let { children } = $props();
</script>

<svelte:head>
        <link rel="icon" href={favicon} />
        <link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<div class="min-h-screen bg-surface-100-900 text-surface-900-100">
        {@render children?.()}
</div>
