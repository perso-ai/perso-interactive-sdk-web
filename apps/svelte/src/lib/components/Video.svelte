<script lang="ts">
	import { onMount } from 'svelte';

	export let onVideoReady: (element: HTMLVideoElement) => void;

	let videoElement: HTMLVideoElement;

	onMount(() => {
		onVideoReady(videoElement);
	});
</script>

<!-- svelte-ignore a11y-media-has-caption -->
<video bind:this={videoElement} autoplay playsinline></video>
