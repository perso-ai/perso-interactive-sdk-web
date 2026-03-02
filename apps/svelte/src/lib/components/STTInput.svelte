<script lang="ts">
	import { STTError, type Session } from 'perso-interactive-sdk-web/client';

	export let session: Session;
	export let enableButton: boolean;

	let isRecording = false;
	let sttStatus = '';
	let sttStatusClass = '';
	let sttResult = '';
	let sttLanguage = 'ko';

	function getStatusClass(recording: boolean, status: string): string {
		if (recording) return 'recording';
		if (status.startsWith('Error')) return 'error';
		if (status === 'Completed') return 'success';
		if (status === 'No speech detected') return 'warning';
		if (status === 'Processing...' || status === 'Starting...') return 'processing';
		return '';
	}

	$: sttStatusClass = getStatusClass(isRecording, sttStatus);

	async function onSttButtonClicked() {
		if (!isRecording) {
			try {
				isRecording = true;
				sttStatus = 'Starting...';
				sttResult = '';

				await session.startProcessSTT();
				sttStatus = 'Recording...';
			} catch (error) {
				sttStatus = `Error: ${(error as Error).message}`;
				isRecording = false;
			}
		} else {
			try {
				sttStatus = 'Processing...';

				const text = await session.stopProcessSTT(sttLanguage);
				isRecording = false;

				if (text && text.trim().length > 0) {
					sttResult = text;
					sttStatus = 'Completed';
				} else {
					sttStatus = 'No speech detected';
				}
			} catch (error) {
				isRecording = false;
				sttStatus = `Error: ${(error as Error).message}`;

				if (error instanceof STTError) {
					alert(`STT Error: ${error.message}`);
				}
			}
		}
	}
</script>

<h2>STT (Speech-to-Text)</h2>
<div class="field">
	<label for="sttLanguage">Language</label>
	<select bind:value={sttLanguage} id="sttLanguage">
		<option value="ko">Korean</option>
		<option value="en">English</option>
		<option value="ja">Japanese</option>
		<option value="zh">Chinese</option>
	</select>
	<button class="btn-sm" on:click={onSttButtonClicked} disabled={!enableButton && !isRecording}>
		{isRecording ? 'Stop STT' : 'Start STT'}
	</button>
	{#if sttStatus}
		<span class="status {sttStatusClass}">{sttStatus}</span>
	{/if}
</div>
<div class="field">
	<label for="sttResult">Result</label>
	<input
		id="sttResult"
		type="text"
		readonly
		placeholder="STT result will appear here..."
		bind:value={sttResult}
	/>
</div>
