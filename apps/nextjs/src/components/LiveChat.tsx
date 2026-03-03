'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Video from './Video';
import ChatLog from './ChatLog';
import ChatInput from './ChatInput';
import STTInput from './STTInput';
import TTSInput from './TTSInput';
import STFInput from './STFInput';
import TTSTFInput from './TTSTFInput';
import { getDefaultClientTools } from '@/lib/perso-interactive';
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

const CHATBOT_WIDTH = 1080;
const CHATBOT_HEIGHT = 1920;
/** Delay before fetching session info after unexpected close, allowing server to finalize termination. */
const SESSION_INFO_FETCH_DELAY_MS = 500;
const clientTools = getDefaultClientTools();

export default function LiveChat() {
	const [session, setSession] = useState<Session | null>(null);
	const [chatStates, setChatStates] = useState<Set<ChatState>>(new Set());
	const [chatLog, setChatLog] = useState<Array<Chat>>([]);
	const [sessionState, setSessionState] = useState(0);
	const [error, setError] = useState('');

	const sessionRef = useRef<Session | null>(null);
	const apiServerUrlRef = useRef('');
	const sessionIdRef = useRef('');
	const unsubscribesRef = useRef<Array<() => void>>([]);

	const available = chatStates.size === 0;
	const recording = chatStates.has(ChatState.RECORDING);

	function getChatStateDescription(): string {
		if (available) return 'Available';
		const arr: string[] = [];
		if (chatStates.has(ChatState.RECORDING)) arr.push('Recording');
		if (chatStates.has(ChatState.LLM)) arr.push('LLM');
		if (chatStates.has(ChatState.ANALYZING)) arr.push('Analyzing');
		if (chatStates.has(ChatState.SPEAKING)) arr.push('AI Speaking');
		if (chatStates.has(ChatState.TTS)) arr.push('TTS');
		return arr.join(' / ');
	}

	useEffect(() => {
		const abortController = new AbortController();
		let cancelled = false;

		async function init() {
			try {
				const response = await fetch('/api/session', {
					signal: abortController.signal
				});
				if (!response.ok) {
					throw new Error(`Session creation failed: ${response.status}`);
				}
				const json = await response.json();
				if (cancelled) return;

				const sess = await createSession(
					json.persoInteractiveApiServerUrl,
					json.sessionId,
					CHATBOT_WIDTH,
					CHATBOT_HEIGHT,
					clientTools
				);

				if (cancelled) {
					sess.stopSession();
					return;
				}

				sessionRef.current = sess;
				apiServerUrlRef.current = json.persoInteractiveApiServerUrl;
				sessionIdRef.current = json.sessionId;
				setSession(sess);
				setSessionState(2);

				const unsubscribeChatStates = sess.subscribeChatStates(
					(states: Set<ChatState>) => {
						setChatStates(new Set(states));
					}
				);

				const removeErrorHandler = sess.setErrorHandler((err: Error) => {
					if (err instanceof LLMError) {
						const llmError = err as LLMError;
						if (llmError.underlyingError instanceof ApiError) {
							alert(llmError.underlyingError);
						} else if (
							llmError.underlyingError instanceof LLMStreamingResponseError
						) {
							alert(llmError.underlyingError.description);
						}
					} else if (err instanceof TTSError) {
						const ttsError = err as TTSError;
						if (ttsError.underlyingError instanceof ApiError) {
							alert(`TTS API Error: ${ttsError.underlyingError}`);
						} else if (ttsError.underlyingError instanceof TTSDecodeError) {
							alert(
								`TTS Decode Error: ${ttsError.underlyingError.description}`
							);
						}
					}
				});

				const removeOnClose = sess.onClose((manualClosed: boolean) => {
					if (!manualClosed) {
						setTimeout(() => {
							getSessionInfo(
								apiServerUrlRef.current,
								sessionIdRef.current
							)
								.then((res: { termination_reason?: string }) => {
									if (res.termination_reason) {
										alert(res.termination_reason);
									}
								})
								.catch((err: unknown) => {
									console.error('Failed to get session info:', err);
								});
						}, SESSION_INFO_FETCH_DELAY_MS);
					}
					setSessionState(0);
				});

				unsubscribesRef.current = [
					unsubscribeChatStates,
					removeErrorHandler,
					removeOnClose,
				];
			} catch (e) {
				if ((e as Error).name === 'AbortError') return;
				if (!cancelled) {
					setError(`Session creation failed: ${(e as Error).message}`);
					setSessionState(0);
				}
			}
		}

		init();

		return () => {
			cancelled = true;
			abortController.abort();
			unsubscribesRef.current.forEach((unsub) => unsub());
			sessionRef.current?.stopSession();
		};
	}, []);

	const onVideoReady = useCallback(
		(video: HTMLVideoElement) => {
			sessionRef.current?.setSrc(video);
		},
		[]
	);

	function onStopSpeechClicked() {
		sessionRef.current?.clearBuffer();
	}

	function onMessageSubmit(message: string) {
		void processCompleteStreaming(message);
	}

	async function synthesizeChunk(currentSession: Session, chunk: string) {
		const audioBlob = await currentSession.processTTS(chunk);
		if (!audioBlob) {
			console.warn('TTS returned no audio for chunk');
			return;
		}
		await currentSession.processSTF(audioBlob, 'wav', chunk);
	}

	/** Sequential: collects all LLM chunks first, then runs TTS/STF one by one. Simpler flow, useful for debugging. */
	async function processComplete(text: string) {
		const currentSession = sessionRef.current;
		if (!currentSession) return;

		try {
			setChatLog((prev) => [...prev, { text, isUser: true, timestamp: new Date() }]);

			const llmGenerator = currentSession.processLLM({ message: text });
			const messageChunks: string[] = [];
			let finished = false;

			for await (const chunk of llmGenerator) {
				if (chunk.type === 'message') {
					if (chunk.finish) finished = true;

					const newChunks = chunk.chunks.slice(messageChunks.length);
					messageChunks.push(...newChunks);
				} else if (chunk.type === 'error') {
					console.error('LLM error:', chunk.error);
					return;
				}
			}

			if (!finished || messageChunks.length === 0) {
				console.warn('LLM returned empty response');
				return;
			}

			const llmResponse = messageChunks.join('');
			setChatLog((prev) => [
				...prev,
				{ text: llmResponse, isUser: false, timestamp: new Date() },
			]);

			for (const c of messageChunks) {
				if (c.trim().length === 0) continue;
				await synthesizeChunk(currentSession, c);
			}
		} catch (error) {
			console.error('processComplete error:', error);
		}
	}

	/** Streaming: enqueues TTS/STF via promise chain as LLM chunks arrive. Lower time-to-first-speech, suited for production. */
	async function processCompleteStreaming(text: string) {
		const currentSession = sessionRef.current;
		if (!currentSession) return;

		try {
			setChatLog((prev) => [...prev, { text, isUser: true, timestamp: new Date() }]);

			const llmGenerator = currentSession.processLLM({ message: text });
			const messageChunks: string[] = [];
			let queue = Promise.resolve();
			let finished = false;

			for await (const chunk of llmGenerator) {
				if (chunk.type === 'message') {
					if (chunk.finish) finished = true;

					const newChunks = chunk.chunks.slice(messageChunks.length);
					messageChunks.push(...newChunks);

					for (const c of newChunks) {
						if (c.trim().length === 0) continue;
						queue = queue.then(() => synthesizeChunk(currentSession, c));
					}
				} else if (chunk.type === 'error') {
					console.error('LLM error:', chunk.error);
					return;
				}
			}

			if (!finished || messageChunks.length === 0) {
				console.warn('LLM returned empty response');
				return;
			}

			const llmResponse = messageChunks.join('');
			setChatLog((prev) => [
				...prev,
				{ text: llmResponse, isUser: false, timestamp: new Date() },
			]);

			await queue;
		} catch (error) {
			console.error('processCompleteStreaming error:', error);
		}
	}

	async function onVoiceChatClicked() {
		const currentSession = sessionRef.current;
		if (!currentSession) return;

		try {
			if (available) {
				currentSession.startProcessSTT();
			} else {
				const text = await currentSession.stopProcessSTT();
				if (text.trim().length === 0) {
					console.warn('STT returned empty text');
					return;
				}
				await processCompleteStreaming(text);
			}
		} catch (error) {
			console.error(error);
		}
	}

	if (error) {
		return <p className="status error">{error}</p>;
	}

	if (sessionState === 0 && !session) {
		return <p className="status">Creating session...</p>;
	}

	return (
		<div className="avatar-row">
			{/* STT Section */}
			<section className="section">
				{session ? (
					<STTInput session={session} enableButton={available} />
				) : (
					<>
						<h2>STT (Speech-to-Text)</h2>
						<p className="empty-hint">Session not connected</p>
					</>
				)}
			</section>

			{/* TTS Section */}
			<section className="section">
				{session ? (
					<TTSInput session={session} enableButton={available} />
				) : (
					<>
						<h2>TTS (Text-to-Speech)</h2>
						<p className="empty-hint">Session not connected</p>
					</>
				)}
			</section>

			{/* Avatar + STF + Chat row */}
			<div className="avatar-bottom-row">
				{/* Avatar Section */}
				<section className="section avatar-section">
					<h2>Avatar</h2>
					{session ? <Video onVideoReady={onVideoReady} /> : <video />}
					<div className="state-panel">
						<p>
							Chat State:{' '}
							<span
								id="chatStateDescription"
								className={available ? 'state-available' : 'state-busy'}
							>
								{getChatStateDescription()}
							</span>
						</p>
						<div className="row avatar-buttons">
							<button
								id="voice"
								className={`btn-sm ${recording ? 'recording' : ''}`}
								disabled={!available && !recording}
								onClick={onVoiceChatClicked}
							>
								{recording ? 'Stop Voice' : 'Voice Chat'}
							</button>
							<button
								className="btn-sm"
								onClick={onStopSpeechClicked}
								disabled={!chatStates.has(ChatState.SPEAKING)}
							>
								Stop Avatar Speech
							</button>
						</div>
						<p className="section-hint">
							Voice Chat uses STT &rarr; LLM &rarr; TTS &rarr; STF pipeline
						</p>
					</div>
				</section>

				{/* Right side: TTSTF + STF + Chat */}
				<div className="avatar-right">
					{/* TTSTF Section */}
					<section className="section">
						{session ? (
							<TTSTFInput session={session} enableButton={available} />
						) : (
							<>
								<h2>TTSTF (Text-to-Speech-to-Face)</h2>
								<p className="empty-hint">Session not connected</p>
							</>
						)}
					</section>

					{/* STF Section */}
					<section className="section">
						{session ? (
							<STFInput session={session} enableButton={available} />
						) : (
							<>
								<h2>STF (Speech-to-Face)</h2>
								<p className="empty-hint">Session not connected</p>
							</>
						)}
					</section>

					{/* Chat Section */}
					<section className="section">
						<h2>Chat</h2>
						<ChatLog chatLog={chatLog} />
						<ChatInput
							enableSendButton={available}
							onMessageSubmit={onMessageSubmit}
						/>
					</section>
				</div>
			</div>
		</div>
	);
}
