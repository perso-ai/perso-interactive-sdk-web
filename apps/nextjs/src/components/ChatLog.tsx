'use client';

import type { Chat } from 'perso-interactive-sdk-web/client';

interface ChatLogProps {
	chatLog: Array<Chat>;
}

function formatTime(date: Date): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatLog({ chatLog }: ChatLogProps) {
	return (
		<div className="chat-log">
			{chatLog.map((message) => (
				<div key={message.timestamp.getTime()} className={`chat-bubble ${message.isUser ? 'user' : 'ai'}`}>
					<span className="chat-role">{message.isUser ? 'You' : 'AI'}</span>
					<div className="chat-text">{message.text}</div>
					<span className="chat-time">{formatTime(message.timestamp)}</span>
				</div>
			))}
			{chatLog.length === 0 && <p className="empty-hint">No messages yet</p>}
		</div>
	);
}
