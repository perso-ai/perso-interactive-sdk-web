'use client';

import { useRef, useState } from 'react';

interface ChatInputProps {
	enableSendButton: boolean;
	onMessageSubmit: (message: string) => void;
}

export default function ChatInput({ enableSendButton, onMessageSubmit }: ChatInputProps) {
	const [message, setMessage] = useState('');
	const sendButtonRef = useRef<HTMLButtonElement>(null);

	const trimmedMessage = message.trim();

	function messageSubmit() {
		onMessageSubmit(trimmedMessage);
		setMessage('');
	}

	return (
		<div className="row chat-input-row">
			<input
				type="text"
				placeholder="Type a message..."
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !sendButtonRef.current?.disabled) {
						messageSubmit();
					}
				}}
			/>
			<button
				ref={sendButtonRef}
				className="btn-sm"
				onClick={messageSubmit}
				disabled={!enableSendButton || trimmedMessage.length === 0}
			>
				Send
			</button>
		</div>
	);
}
