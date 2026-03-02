import type { Session } from 'perso-interactive-sdk-web/client';

export function detectFormat(fileName: string): 'mp3' | 'wav' | null {
	const lowerName = fileName.toLowerCase();
	if (lowerName.endsWith('.mp3')) return 'mp3';
	if (lowerName.endsWith('.wav')) return 'wav';
	return null;
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export async function processSTF(session: Session, file: File, format: 'mp3' | 'wav'): Promise<void> {
	await session.processSTF(file, format, '');
}

export function setupDropZone(
	elements: {
		dropZone: HTMLDivElement;
		fileInput: HTMLInputElement;
		fileInfo: HTMLDivElement;
		statusSpan: HTMLSpanElement;
		removeButton: HTMLButtonElement;
		executeButton: HTMLButtonElement;
	},
	onFile: (file: File) => void
): void {
	const { dropZone, fileInput, fileInfo, statusSpan, removeButton, executeButton } = elements;

	dropZone.addEventListener('click', () => fileInput.click());

	dropZone.addEventListener('dragenter', (e: DragEvent) => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragover', (e: DragEvent) => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragleave', () => {
		dropZone.classList.remove('dragover');
	});
	dropZone.addEventListener('drop', (e: DragEvent) => {
		e.preventDefault();
		dropZone.classList.remove('dragover');
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			onFile(files[0]);
		}
	});

	fileInput.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		if (file) {
			onFile(file);
		}
	});

	removeButton.addEventListener('click', (e: MouseEvent) => {
		e.stopPropagation();
		fileInput.value = '';
		fileInfo.style.display = 'none';
		statusSpan.innerText = '';
		statusSpan.className = 'status';
		executeButton.disabled = true;
	});
}
