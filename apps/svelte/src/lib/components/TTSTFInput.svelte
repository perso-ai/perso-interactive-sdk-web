<script lang="ts">
	import type { Session } from 'perso-interactive-sdk-web/client';

	export let session: Session;
	export let enableButton: boolean;

	let message: string = '';
	let trimmedMessage: string;
	$: {
		trimmedMessage = message.trim();
	}
	let sendButton: HTMLButtonElement;

	function handleSend() {
		session.processTTSTF(trimmedMessage);
		message = '';
	}
</script>

<h2>TTSTF (Text-to-Speech-to-Face)</h2>
<div class="row chat-input-row">
	<input
		type="text"
		placeholder="Type text for avatar to speak..."
		on:keypress={(e) => {
			if (e.key === 'Enter' && !sendButton.disabled) {
				handleSend();
			}
		}}
		bind:value={message}
	/>
	<button
		bind:this={sendButton}
		class="btn-sm"
		on:click={handleSend}
		disabled={!enableButton || trimmedMessage.length === 0}
	>
		Send
	</button>
</div>
<p class="section-hint">Sends text directly to TTS &rarr; STF (bypasses LLM)</p>
