<script lang="ts">
	import type { Session } from 'perso-interactive-sdk-web/client';

	export let session: Session;
	export let enableButton: boolean;

	let stfFileInput: HTMLInputElement;
	let stfStatus: string = '';
	let stfStatusClass: string = '';
	let isProcessing: boolean = false;
	let isDragover: boolean = false;
	let selectedFile: File | null = null;

	function getStatusClass(status: string): string {
		if (status === 'Completed') return 'success';
		if (status.startsWith('Error')) return 'error';
		if (status === 'Processing...') return 'processing';
		return '';
	}

	$: stfStatusClass = getStatusClass(stfStatus);

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		isDragover = true;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragover = true;
	}

	function handleDragLeave() {
		isDragover = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragover = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			selectFile(files[0]);
		}
	}

	function onFileChanged(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			selectFile(file);
		}
	}

	function removeFile() {
		selectedFile = null;
		stfFileInput.value = '';
		stfStatus = '';
	}

	function selectFile(file: File) {
		const isMp3 = file.name.toLowerCase().endsWith('.mp3');
		const isWav = file.name.toLowerCase().endsWith('.wav');
		if (!isMp3 && !isWav) {
			stfStatus = 'Error: Only mp3 and wav files are supported';
			stfFileInput.value = '';
			return;
		}

		selectedFile = file;
		stfStatus = '';
	}

	async function executeSTF() {
		if (!selectedFile) return;

		const isMp3 = selectedFile.name.toLowerCase().endsWith('.mp3');
		const format = isMp3 ? 'mp3' : 'wav';

		try {
			stfStatus = 'Processing...';
			isProcessing = true;

			await session.processSTF(selectedFile, format, '');

			stfStatus = 'Completed';
		} catch (error) {
			stfStatus = `Error: ${(error as Error).message}`;
		} finally {
			isProcessing = false;
		}
	}
</script>

<h2>STF (Speech-to-Face)</h2>
<div class="stf-row">
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="drop-zone"
		class:dragover={isDragover}
		role="button"
		tabindex="0"
		on:click={() => stfFileInput.click()}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') stfFileInput.click();
		}}
		on:dragenter={handleDragEnter}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
	>
		<div class="drop-zone-label">
			<span>&#8683;</span>
			<span>Drop files or <span class="browse">browse</span></span>
		</div>
		<input
			bind:this={stfFileInput}
			type="file"
			accept=".mp3,.wav"
			on:change={onFileChanged}
			disabled={!enableButton || isProcessing}
		/>
	</div>
	<div class="stf-file-panel">
		{#if selectedFile}
			<div class="file-info">
				<div class="file-info-icon">&#127925;</div>
				<div class="file-info-details">
					<div class="file-info-name">{selectedFile.name}</div>
					<div class="file-info-size">{formatFileSize(selectedFile.size)}</div>
				</div>
				<button
					class="btn-sm stf-execute"
					disabled={isProcessing}
					on:click={executeSTF}>Execute</button
				>
				<button class="file-info-remove" on:click={removeFile}>&times;</button>
			</div>
		{/if}
		{#if stfStatus}
			<span class="status {stfStatusClass}">{stfStatus}</span>
		{/if}
	</div>
</div>
