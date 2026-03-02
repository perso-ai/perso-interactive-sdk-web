<script lang="ts">
	import {
		TTSError,
		TTSDecodeError,
		ApiError,
		type Session
	} from 'perso-interactive-sdk-web/client';

	export let session: Session;
	export let enableButton: boolean;

	let message: string = '';
	let trimmedMessage: string;
	$: {
		trimmedMessage = message.trim();
	}
	let generateButton: HTMLButtonElement;
	let audioElement: HTMLAudioElement;
	let audioUrl: string | null = null;

	async function onTtsSubmit() {
		if (trimmedMessage.length === 0) return;

		try {
			const audioBlob = await session.processTTS(trimmedMessage);
			if (audioBlob) {
				if (audioUrl) {
					URL.revokeObjectURL(audioUrl);
				}
				audioUrl = URL.createObjectURL(audioBlob);
				audioElement.src = audioUrl;
				audioElement.play();
			}
		} catch (error) {
			if (error instanceof TTSError) {
				if (error.underlyingError instanceof ApiError) {
					alert(`TTS API Error: ${error.underlyingError}`);
				} else if (error.underlyingError instanceof TTSDecodeError) {
					alert(`TTS Decode Error: ${error.underlyingError.description}`);
				}
			}
		}
	}
</script>

<h2>TTS (Text-to-Speech)</h2>
<div class="field">
	<label for="ttsMessage">Message</label>
	<input
		id="ttsMessage"
		type="text"
		placeholder="Enter text to convert to audio"
		on:keypress={(keyEvent) => {
			if (keyEvent.key === 'Enter' && !generateButton.disabled) {
				onTtsSubmit();
			}
		}}
		bind:value={message}
		disabled={!enableButton}
	/>
	<button
		bind:this={generateButton}
		class="btn-sm"
		on:click={() => onTtsSubmit()}
		disabled={!enableButton || trimmedMessage.length === 0}
	>
		Generate
	</button>
</div>
<audio bind:this={audioElement} controls></audio>
