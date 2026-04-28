'use client';

import { useEffect, useRef } from 'react';

interface VideoProps {
	onVideoReady: (element: HTMLVideoElement | null) => void;
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
