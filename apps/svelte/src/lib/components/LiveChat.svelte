<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Video from './Video.svelte';
	import ChatLog from './ChatLog.svelte';
	import ChatInput from './ChatInput.svelte';
	import STTInput from './STTInput.svelte';
	import TTSInput from './TTSInput.svelte';
	import STFInput from './STFInput.svelte';
	import TTSTFInput from './TTSTFInput.svelte';
	import { type PersoInteractiveConfig } from '$lib/perso-interactive';
	import {
		createSession,
		getSessionInfo,
		ChatState,
		LLMError,
		ApiError,
		LLMStreamingResponseError,
		TTSError,
		TTSDecodeError,
		type Session,
		type Chat
	} from 'perso-interactive-sdk-web/client';

	export let persoInteractiveConfig: PersoInteractiveConfig;
	let session: Session;
	let unsubscribes: (() => void)[] = [];

	let chatStates: Set<ChatState> = new Set();
	let sessionState: number = 0;

	let chatLog: Array<Chat> = [];

	let available: boolean = false;
	let processing: boolean = false;
	let recording: boolean = false;
	let chatStateDescriptionText: string = '';

	$: available = chatStates.size === 0;

	$: processing =
		chatStates.has(ChatState.LLM) ||
		chatStates.has(ChatState.ANALYZING) ||
		chatStates.has(ChatState.SPEAKING);

	$: recording = chatStates.has(ChatState.RECORDING);

	$: resetChatStateDescriptionText(chatStates);

	onMount(async () => {
		sessionState = 0;

		try {
			session = await createSession(
				persoInteractiveConfig.persoInteractiveApiServerUrl,
				persoInteractiveConfig.sessionId,
				persoInteractiveConfig.chatbotWidth,
				persoInteractiveConfig.chatbotHeight,
				persoInteractiveConfig.clientTools
			);

			sessionState = 2;
		} catch (e) {
			alert(e);
			sessionState = 0;
			return;
		}

		const unsubscribeChatStates = session.subscribeChatStates((states: Set<ChatState>) => {
			chatStates = states;
		});
		const removeErrorHandler = session.setErrorHandler((error: Error) => {
			if (error instanceof LLMError) {
				const llmError = error as LLMError;
				if (llmError.underlyingError instanceof ApiError) {
					alert(llmError.underlyingError);
				} else if (llmError.underlyingError instanceof LLMStreamingResponseError) {
					alert(llmError.underlyingError.description);
				}
			} else if (error instanceof TTSError) {
				const ttsError = error as TTSError;
				if (ttsError.underlyingError instanceof ApiError) {
					alert(`TTS API Error: ${ttsError.underlyingError}`);
				} else if (ttsError.underlyingError instanceof TTSDecodeError) {
					alert(`TTS Decode Error: ${ttsError.underlyingError.description}`);
				}
			}
		});
		const removeOnClose = session.onClose((manualClosed: boolean) => {
			if (!manualClosed) {
				setTimeout(() => {
					getSessionInfo(
						persoInteractiveConfig.persoInteractiveApiServerUrl,
						persoInteractiveConfig.sessionId
					)
						.then((response: any) => {
							if (response.termination_reason) {
								alert(response.termination_reason);
							}
						})
						.catch((error: unknown) => {
							console.error('Failed to get session info:', error);
						});
				}, 500);
			}

			sessionState = 0;
		});
		unsubscribes.push(unsubscribeChatStates, removeErrorHandler, removeOnClose);
	});

	onDestroy(() => {
		unsubscribes.forEach((unsubscribe) => {
			unsubscribe();
		});
		session?.stopSession();
	});

	function onStopSpeechClicked() {
		session.clearBuffer();
	}

	function onMessageSubmit(message: string) {
		void processComplete(message);
	}

	async function processComplete(text: string) {
		try {
			chatLog = [...chatLog, { text, isUser: true, timestamp: new Date() }];

			const llmGenerator = session.processLLM({ message: text });
			let llmResponse = '';
			const messageChunks: string[] = [];
			for await (const chunk of llmGenerator) {
				if (chunk.type === 'message') {
					for (let i = messageChunks.length; i < chunk.chunks.length; i++) {
						messageChunks.push(chunk.chunks[i]);
					}
					if (chunk.finish) {
						llmResponse = chunk.message;
					}
				} else if (chunk.type === 'error') {
					console.error('LLM error:', chunk.error);
					return;
				}
			}

			if (llmResponse.trim().length === 0) {
				console.warn('LLM returned empty response');
				return;
			}

			chatLog = [...chatLog, { text: llmResponse, isUser: false, timestamp: new Date() }];

			const audioBlob = await session.processTTS(llmResponse);
			if (!audioBlob) {
				console.warn('TTS returned no audio');
				return;
			}

			await session.processSTF(audioBlob, 'wav', llmResponse);
		} catch (error) {
			console.error('processComplete error:', error);
		}
	}

	async function onVoiceChatClicked() {
		try {
			if (available) {
				session.startProcessSTT();
			} else {
				const text = await session.stopProcessSTT();
				if (text.trim().length === 0) {
					console.warn('STT returned empty text');
					return;
				}

				await processComplete(text);
			}
		} catch (error) {
			console.error(error);
		}
	}

	function onVideoReady(video: HTMLVideoElement) {
		session.setSrc(video);
	}

	function resetChatStateDescriptionText(states: Set<ChatState>) {
		if (available) {
			chatStateDescriptionText = 'Available';
			return;
		}
		const arr = [];
		if (states.has(ChatState.RECORDING)) arr.push('Recording');
		if (states.has(ChatState.LLM)) arr.push('LLM');
		if (states.has(ChatState.ANALYZING)) arr.push('Analyzing');
		if (states.has(ChatState.SPEAKING)) arr.push('AI Speaking');
		if (states.has(ChatState.TTS)) arr.push('TTS');
		chatStateDescriptionText = arr.join(' / ');
	}
</script>

<div class="avatar-row">
	<!-- STT Section -->
	<section class="section">
		{#if session != null}
			<STTInput {session} enableButton={available} />
		{:else}
			<h2>STT (Speech-to-Text)</h2>
			<p class="empty-hint">Session not connected</p>
		{/if}
	</section>

	<!-- TTS Section -->
	<section class="section">
		{#if session != null}
			<TTSInput {session} enableButton={available} />
		{:else}
			<h2>TTS (Text-to-Speech)</h2>
			<p class="empty-hint">Session not connected</p>
		{/if}
	</section>

	<!-- Avatar + STF + Chat row -->
	<div class="avatar-bottom-row">
		<!-- Avatar Section -->
		<section class="section avatar-section">
			<h2>Avatar</h2>
			{#if session != null}
				<Video {onVideoReady} />
			{:else}
				<video></video>
			{/if}
			<div class="state-panel">
				<p>
					Chat State:
					<span id="chatStateDescription" class={available ? 'state-available' : 'state-busy'}>
						{chatStateDescriptionText}
					</span>
				</p>
				<div class="row avatar-buttons">
					<button
						id="voice"
						class="btn-sm {recording ? 'recording' : ''}"
						disabled={!available && !recording}
						on:click={onVoiceChatClicked}
					>
						{recording ? 'Stop Voice' : 'Voice Chat'}
					</button>
					<button
						class="btn-sm"
						on:click={onStopSpeechClicked}
						disabled={!chatStates.has(ChatState.SPEAKING)}
					>
						Stop Avatar Speech
					</button>
				</div>
				<p class="section-hint">Voice Chat uses STT &rarr; LLM &rarr; TTS &rarr; STF pipeline</p>
			</div>
		</section>

		<!-- Right side: TTSTF + STF + Chat -->
		<div class="avatar-right">
			<!-- TTSTF Section -->
			<section class="section">
				{#if session != null}
					<TTSTFInput {session} enableButton={available} />
				{:else}
					<h2>TTSTF (Text-to-Speech-to-Face)</h2>
					<p class="empty-hint">Session not connected</p>
				{/if}
			</section>

			<!-- STF Section -->
			<section class="section">
				{#if session != null}
					<STFInput {session} enableButton={available} />
				{:else}
					<h2>STF (Speech-to-Face)</h2>
					<p class="empty-hint">Session not connected</p>
				{/if}
			</section>

			<!-- Chat Section -->
			<section class="section">
				<h2>Chat</h2>
				<ChatLog {chatLog} />
				<ChatInput enableSendButton={available} {onMessageSubmit} />
			</section>
		</div>
	</div>
</div>
