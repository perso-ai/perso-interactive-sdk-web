'use client';

import { useRef, useState } from 'react';
import type { Session } from 'perso-interactive-sdk-web/client';

interface TTSTFInputProps {
	session: Session;
	enableButton: boolean;
}

export default function TTSTFInput({ session, enableButton }: TTSTFInputProps) {
	const [message, setMessage] = useState('');
	const sendButtonRef = useRef<HTMLButtonElement>(null);

	const trimmedMessage = message.trim();

	function handleSend() {
		session.processTTSTF(trimmedMessage);
		setMessage('');
	}

	return (
		<>
			<h2>TTSTF (Text-to-Speech-to-Face)</h2>
			<div className="row chat-input-row">
				<input
					type="text"
					placeholder="Type text for avatar to speak..."
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !sendButtonRef.current?.disabled) {
							handleSend();
						}
					}}
				/>
				<button
					ref={sendButtonRef}
					className="btn-sm"
					onClick={handleSend}
					disabled={!enableButton || trimmedMessage.length === 0}
				>
					Send
				</button>
			</div>
			<p className="section-hint">
				Sends text directly to TTS &rarr; STF (bypasses LLM)
			</p>
		</>
	);
}
