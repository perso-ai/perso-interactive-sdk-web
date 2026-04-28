import { NextResponse } from 'next/server';
import { persoInteractiveApiKey, persoInteractiveApiServerUrl } from '@/lib/constant';
import { createSessionId, getIntroMessage } from 'perso-interactive-sdk-web/server';
import { getConfig } from '@/lib/server-config';

export async function GET() {
	try {
		const config = await getConfig();

		// TODO(bisect): Restore background_image / mcp_servers / padding_* once
		// the Next.js-only WebRTC regression is isolated. Match the sdk-tester
		// PipelineDemoPage payload while debugging — those fields were observed
		// to differ between the working reference and this demo.
		const sessionId = await createSessionId(persoInteractiveApiServerUrl, persoInteractiveApiKey, {
			using_stf_webrtc: true,
			llm_type: config.llm,
			tts_type: config.tts,
			stt_type: config.stt,
			model_style: config.modelStyle,
			prompt: config.prompt,
			document: config.document || undefined
		});

		let introMessage: string = '';
		try {
			introMessage = await getIntroMessage(
				persoInteractiveApiServerUrl,
				persoInteractiveApiKey,
				config.prompt
			);
		} catch (error) {
			console.error('Failed to get intro message:', error);
		}

		return NextResponse.json({ persoInteractiveApiServerUrl, sessionId, introMessage });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'An unknown error occurred.';
		console.error('Failed to create session:', message);
		return NextResponse.json({ error: 'Failed to create session', message }, { status: 500 });
	}
}
