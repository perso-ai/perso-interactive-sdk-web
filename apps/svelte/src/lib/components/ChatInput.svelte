<script lang="ts">
	export let enableSendButton: boolean;
	export let onMessageSubmit: (message: string) => void;

	let message: string = '';
	let trimmedMessage: string;
	$: {
		trimmedMessage = message.trim();
	}
	let sendButton: HTMLButtonElement;

	function messageSubmit() {
		onMessageSubmit(trimmedMessage);
		message = '';
	}
</script>

<div class="row chat-input-row">
	<input
		type="text"
		placeholder="Type a message..."
		on:keypress={(keyEvent) => {
			if (keyEvent.key === 'Enter' && !sendButton.disabled) {
				messageSubmit();
			}
		}}
		bind:value={message}
	/>
	<button
		bind:this={sendButton}
		class="btn-sm"
		on:click={() => messageSubmit()}
		disabled={!enableSendButton || trimmedMessage.length === 0}
	>
		Send
	</button>
</div>
