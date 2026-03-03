'use client';

import { useRef, useState } from 'react';
import { TTSError, TTSDecodeError, ApiError, type Session } from 'perso-interactive-sdk-web/client';

interface TTSInputProps {
	session: Session;
	enableButton: boolean;
}

export default function TTSInput({ session, enableButton }: TTSInputProps) {
	const [message, setMessage] = useState('');
	const generateButtonRef = useRef<HTMLButtonElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const audioUrlRef = useRef<string | null>(null);

	const trimmedMessage = message.trim();

	async function onTtsSubmit() {
		if (trimmedMessage.length === 0) return;

		try {
			const audioBlob = await session.processTTS(trimmedMessage);
			if (audioBlob && audioRef.current) {
				if (audioUrlRef.current) {
					URL.revokeObjectURL(audioUrlRef.current);
				}
				const url = URL.createObjectURL(audioBlob);
				audioUrlRef.current = url;
				audioRef.current.src = url;
				audioRef.current.play();
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

	return (
		<>
			<h2>TTS (Text-to-Speech)</h2>
			<div className="field">
				<label htmlFor="ttsMessage">Message</label>
				<input
					id="ttsMessage"
					type="text"
					placeholder="Enter text to convert to audio"
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !generateButtonRef.current?.disabled) {
							onTtsSubmit();
						}
					}}
					disabled={!enableButton}
				/>
				<button
					ref={generateButtonRef}
					className="btn-sm"
					onClick={onTtsSubmit}
					disabled={!enableButton || trimmedMessage.length === 0}
				>
					Generate
				</button>
			</div>
			<audio ref={audioRef} controls />
		</>
	);
}
