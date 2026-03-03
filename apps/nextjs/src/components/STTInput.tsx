'use client';

import { useState } from 'react';
import { STTError, type Session } from 'perso-interactive-sdk-web/client';

interface STTInputProps {
	session: Session;
	enableButton: boolean;
}

function getStatusClass(recording: boolean, status: string): string {
	if (recording) return 'recording';
	if (status.startsWith('Error')) return 'error';
	if (status === 'Completed') return 'success';
	if (status === 'No speech detected') return 'warning';
	if (status === 'Processing...' || status === 'Starting...') return 'processing';
	return '';
}

export default function STTInput({ session, enableButton }: STTInputProps) {
	const [isRecording, setIsRecording] = useState(false);
	const [sttStatus, setSttStatus] = useState('');
	const [sttResult, setSttResult] = useState('');
	const [sttLanguage, setSttLanguage] = useState('ko');

	const sttStatusClass = getStatusClass(isRecording, sttStatus);

	async function onSttButtonClicked() {
		if (!isRecording) {
			try {
				setIsRecording(true);
				setSttStatus('Starting...');
				setSttResult('');

				await session.startProcessSTT();
				setSttStatus('Recording...');
			} catch (error) {
				setSttStatus(`Error: ${(error as Error).message}`);
				setIsRecording(false);
			}
		} else {
			try {
				setSttStatus('Processing...');

				const text = await session.stopProcessSTT(sttLanguage);
				setIsRecording(false);

				if (text && text.trim().length > 0) {
					setSttResult(text);
					setSttStatus('Completed');
				} else {
					setSttStatus('No speech detected');
				}
			} catch (error) {
				setIsRecording(false);
				setSttStatus(`Error: ${(error as Error).message}`);

				if (error instanceof STTError) {
					alert(`STT Error: ${error.message}`);
				}
			}
		}
	}

	return (
		<>
			<h2>STT (Speech-to-Text)</h2>
			<div className="field">
				<label htmlFor="sttLanguage">Language</label>
				<select
					id="sttLanguage"
					value={sttLanguage}
					onChange={(e) => setSttLanguage(e.target.value)}
				>
					<option value="ko">Korean</option>
					<option value="en">English</option>
					<option value="ja">Japanese</option>
					<option value="zh">Chinese</option>
				</select>
				<button
					className="btn-sm"
					onClick={onSttButtonClicked}
					disabled={!enableButton && !isRecording}
				>
					{isRecording ? 'Stop STT' : 'Start STT'}
				</button>
				{sttStatus && <span className={`status ${sttStatusClass}`}>{sttStatus}</span>}
			</div>
			<div className="field">
				<label htmlFor="sttResult">Result</label>
				<input
					id="sttResult"
					type="text"
					readOnly
					placeholder="STT result will appear here..."
					value={sttResult}
				/>
			</div>
		</>
	);
}
