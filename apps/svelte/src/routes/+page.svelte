<script lang="ts">
	import { onMount } from 'svelte';
	import LiveChat from '$lib/components/LiveChat.svelte';
	import { getDefaultClientTools, PersoInteractiveConfig } from '$lib/perso-interactive';

	let submitted: boolean = false;
	let persoInteractiveConfig: PersoInteractiveConfig;

	// Enter the LiveChat configuration.
	const chatbotWidth = 1080;
	const chatbotHeight = 1920;
	const enableVoiceChat = true;

	async function createSession() {
		const response = await fetch('./session', { method: 'GET' });
		if (response.ok) {
			submitted = true;
			const json = await response.json();
			const persoInteractiveApiServerUrl = json.persoInteractiveApiServerUrl;
			const sessionId = json.sessionId;
			const introMessage = json.introMessage;

			persoInteractiveConfig = new PersoInteractiveConfig(
				persoInteractiveApiServerUrl,
				sessionId,
				chatbotWidth,
				chatbotHeight,
				enableVoiceChat,
				introMessage,
				getDefaultClientTools()
			);
		}
	}

	onMount(async () => {
		if (enableVoiceChat) {
			await createSession();
		}
	});
</script>

<svelte:head>
	<title>Perso Interactive SDK demo</title>
	<link
		href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&display=swap"
		rel="stylesheet"
	/>
	<!-- SDK Loader -->
	 <script defer src="https://cdn.jsdelivr.net/gh/perso-ai/perso-interactive-sdk-web/core/1.0.0/perso-interactive-sdk.js"></script>
</svelte:head>

{#if !enableVoiceChat && !submitted}
	<button on:click={createSession} style="width: 96px; height : 48px; font-size:16px">Start</button>
{:else if persoInteractiveConfig != null}
	<LiveChat {persoInteractiveConfig}></LiveChat>
{/if}
