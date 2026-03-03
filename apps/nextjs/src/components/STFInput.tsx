'use client';

import { useRef, useState } from 'react';
import type { Session } from 'perso-interactive-sdk-web/client';

interface STFInputProps {
	session: Session;
	enableButton: boolean;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function STFInput({ session, enableButton }: STFInputProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [stfStatus, setStfStatus] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragover, setIsDragover] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	function getStatusClass(status: string): string {
		if (status === 'Completed') return 'success';
		if (status.startsWith('Error')) return 'error';
		if (status === 'Processing...') return 'processing';
		return '';
	}

	const stfStatusClass = getStatusClass(stfStatus);

	function selectFile(file: File) {
		const isMp3 = file.name.toLowerCase().endsWith('.mp3');
		const isWav = file.name.toLowerCase().endsWith('.wav');
		if (!isMp3 && !isWav) {
			setStfStatus('Error: Only mp3 and wav files are supported');
			if (fileInputRef.current) fileInputRef.current.value = '';
			return;
		}

		setSelectedFile(file);
		setStfStatus('');
	}

	function handleDragEnter(e: React.DragEvent) {
		e.preventDefault();
		setIsDragover(true);
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		setIsDragover(true);
	}

	function handleDragLeave() {
		setIsDragover(false);
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setIsDragover(false);
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			selectFile(files[0]);
		}
	}

	function onFileChanged(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (file) {
			selectFile(file);
		}
	}

	function removeFile() {
		setSelectedFile(null);
		if (fileInputRef.current) fileInputRef.current.value = '';
		setStfStatus('');
	}

	async function executeSTF() {
		if (!selectedFile) return;

		const isMp3 = selectedFile.name.toLowerCase().endsWith('.mp3');
		const format = isMp3 ? 'mp3' : 'wav';

		try {
			setStfStatus('Processing...');
			setIsProcessing(true);

			await session.processSTF(selectedFile, format, '');

			setStfStatus('Completed');
		} catch (error) {
			setStfStatus(`Error: ${(error as Error).message}`);
		} finally {
			setIsProcessing(false);
		}
	}

	return (
		<>
			<h2>STF (Speech-to-Face)</h2>
			<div className="stf-row">
				<div
					className={`drop-zone${isDragover ? ' dragover' : ''}`}
					role="button"
					tabIndex={0}
					onClick={() => fileInputRef.current?.click()}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
					}}
					onDragEnter={handleDragEnter}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
				>
					<div className="drop-zone-label">
						<span>&#8683;</span>
						<span>
							Drop files or <span className="browse">browse</span>
						</span>
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept=".mp3,.wav"
						onChange={onFileChanged}
						disabled={!enableButton || isProcessing}
					/>
				</div>
				<div className="stf-file-panel">
					{selectedFile && (
						<div className="file-info">
							<div className="file-info-icon">&#127925;</div>
							<div className="file-info-details">
								<div className="file-info-name">{selectedFile.name}</div>
								<div className="file-info-size">
									{formatFileSize(selectedFile.size)}
								</div>
							</div>
							<button
								className="btn-sm stf-execute"
								disabled={isProcessing}
								onClick={executeSTF}
							>
								Execute
							</button>
							<button className="file-info-remove" onClick={removeFile}>
								&times;
							</button>
						</div>
					)}
					{stfStatus && (
						<span className={`status ${stfStatusClass}`}>{stfStatus}</span>
					)}
				</div>
			</div>
		</>
	);
}
