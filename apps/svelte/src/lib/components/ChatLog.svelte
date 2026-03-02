<script lang="ts">
	import type { Chat } from 'perso-interactive-sdk-web/client';

	export let chatLog: Array<Chat>;

	function formatTime(date: Date): string {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="chat-log">
	{#each chatLog as message}
		<div class="chat-bubble {message.isUser ? 'user' : 'ai'}">
			<span class="chat-role">{message.isUser ? 'You' : 'AI'}</span>
			<div class="chat-text">{message.text}</div>
			<span class="chat-time">{formatTime(message.timestamp)}</span>
		</div>
	{/each}
	{#if chatLog.length === 0}
		<p class="empty-hint">No messages yet</p>
	{/if}
</div>
