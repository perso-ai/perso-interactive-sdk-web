export function detectFormat(fileName) {
	const lowerName = fileName.toLowerCase();
	if (lowerName.endsWith('.mp3')) return 'mp3';
	if (lowerName.endsWith('.wav')) return 'wav';
	return null;
}

export function formatSize(bytes) {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export async function processSTF(session, file, format) {
	await session.processSTF(file, format, '');
}

export function setupDropZone(elements, onFile) {
	const { dropZone, fileInput, fileInfo, statusSpan, removeButton, executeButton } = elements;

	dropZone.addEventListener('click', () => fileInput.click());

	dropZone.addEventListener('dragenter', (e) => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragover', (e) => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragleave', () => {
		dropZone.classList.remove('dragover');
	});
	dropZone.addEventListener('drop', (e) => {
		e.preventDefault();
		dropZone.classList.remove('dragover');
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			onFile(files[0]);
		}
	});

	fileInput.addEventListener('change', () => {
		const file = fileInput.files[0];
		if (file) {
			onFile(file);
		}
	});

	removeButton.addEventListener('click', (e) => {
		e.stopPropagation();
		fileInput.value = '';
		fileInfo.style.display = 'none';
		statusSpan.innerText = '';
		statusSpan.className = 'status';
		executeButton.disabled = true;
	});
}
