'use client';

import { useEffect, useRef } from 'react';

interface VideoProps {
	onVideoReady: (element: HTMLVideoElement) => void;
}

export default function Video({ onVideoReady }: VideoProps) {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (videoRef.current) {
			onVideoReady(videoRef.current);
		}
	}, [onVideoReady]);

	return <video ref={videoRef} autoPlay playsInline />;
}
