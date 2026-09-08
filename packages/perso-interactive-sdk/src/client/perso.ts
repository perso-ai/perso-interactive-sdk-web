import { STFError, Timeout } from '../shared/error';
import { PersoUtil, SessionCapabilityName, SessionEvent } from '../shared/perso_util';
import { decodeTTSAudio } from '../shared/audio';
import { VideoCodec } from './types';

interface Status {
	live: boolean;
	code: number;
	reason: string;
}

/**
 * High-level controller around a WebRTC PeerConnection that proxies Perso's
 * real-time APIs through convenience helpers.
 */
export class Perso extends EventTarget {
	streams: Array<MediaStream> = [];
	pingTime: number;
	pingIntervalId: ReturnType<typeof setInterval> | null = null;

	/**
	 * Hooks a peer/data channel pair to status/ping listeners so consumers can
	 * interact with the remote Perso session through a single object.
	 * @param pc WebRTC peer connection that handles the media tracks.
	 * @param dc Data channel dedicated to control-plane messages.
	 */
	constructor(
		public pc: RTCPeerConnection,
		public dc: RTCDataChannel
	) {
		super();

		this.pingTime = Date.now() + 3000;

		this.pc.addEventListener('track', (evt) => {
			this.streams = this.streams.concat(evt.streams);
		});
		this.pc.addEventListener('connectionstatechange', () => {
			if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
				this.close();
			}
		});
		this.dc.onopen = () => {
			this.pingIntervalId = setInterval(() => {
				// A tick can land while the channel is already closing, and this runs
				// on a timer where a throw is an uncaught exception once per second
				// instead of something a caller can handle. Stopping the keepalive is
				// the whole response: `onclose` and the timeout below close the rest.
				try {
					this.ping();
				} catch {
					return;
				}
				if (Date.now() - this.pingTime > 30000) {
					this.close();
				}
			}, 1000);
		};
		this.dc.onclose = () => {
			if (this.pingIntervalId != null) {
				clearInterval(this.pingIntervalId);
			}
			// The control channel is the only way to reach the avatar, so losing it
			// ends the session for every practical purpose. Reporting it keeps the
			// heartbeat from holding a session nobody can talk to, and lets
			// `onClose` subscribers react. Previously only a failed PeerConnection
			// or an explicit teardown emitted this, so a server that dropped just
			// the channel left the SDK believing everything was fine until the next
			// frame threw.
			this.#changeStatus({
				live: false,
				code: 503,
				reason: 'Control channel closed'
			});
		};

		this.#changeStatus({
			live: true,
			code: 200,
			reason: 'OK'
		});

		this.setMessageCallback('ping', () => {
			this.pingTime = Date.now();
		});
	}

	/**
	 * Negotiates WebRTC connectivity and waits until the first remote stream is ready.
	 *
	 * When an optional `stream` is provided (legacy bidirectional mode), the stream's
	 * tracks are added to the peer connection so the server can receive client audio.
	 * Without a stream the audio transceiver is set to receive-only.
	 *
	 * @param apiServer Perso API server URL.
	 * @param sessionId Session identifier created via `createSessionId`.
	 * @param width Desired avatar canvas width.
	 * @param height Desired avatar canvas height.
	 * @param stream Optional local media stream for bidirectional audio (legacy mode).
	 * @param videoCodec Optional video codec to pin. When set, the SDP offer is
	 *   filtered to this codec so the server must answer with it; when omitted the
	 *   server selects a codec during negotiation.
	 * @returns Ready-to-use `Perso` instance, or `null` when the session has no STF capability.
	 * @throws ApiError When session event or WebRTC negotiation fails.
	 * @throws Timeout When remote streams fail to arrive in time.
	 * @throws Error When `videoCodec` is set but the browser cannot decode it.
	 */
	static async create(
		apiServer: string,
		sessionId: string,
		width: number,
		height: number,
		stream?: MediaStream,
		videoCodec?: VideoCodec
	): Promise<Perso | null> {
		const sessionInfo = await PersoUtil.getSessionInfo(apiServer, sessionId);
		const hasSTF =
			Array.isArray(sessionInfo.capability) &&
			sessionInfo.capability.some(
				(cap: { name: keyof typeof SessionCapabilityName }) =>
					cap.name === SessionCapabilityName.STF_ONPREMISE ||
					cap.name === SessionCapabilityName.STF_WEBRTC
			);

		if (!hasSTF) {
			await PersoUtil.sessionEvent(apiServer, sessionId, SessionEvent.SESSION_START);
			return null;
		}

		// Resolve the video codec preference before allocating any WebRTC
		// resources, so a rejected codec pin fails without leaking a peer
		// connection or data channel (see coding-style WebRTC cleanup rule).
		const videoCapabilities = RTCRtpReceiver.getCapabilities('video');
		if (videoCapabilities == null && videoCodec) {
			// The caller asked to pin a codec but the browser exposes no receive
			// capabilities to filter (e.g. older Safari). Silently negotiating a
			// server-chosen codec would defeat the request, so fail loudly.
			throw videoCodecUnsupportedError(
				`Cannot pin video codec "${videoCodec}": this browser does not report video receive capabilities`
			);
		}
		const videoCodecs =
			videoCapabilities != null && videoCodec
				? filterVideoCodecs(videoCapabilities.codecs, videoCodec)
				: (videoCapabilities?.codecs ?? null);

		const iceServers = await PersoUtil.getIceServers(apiServer, sessionId);

		let pc = await Perso.createPeerConnection(iceServers);
		let dc = pc.createDataChannel('message', { protocol: 'message' });
		let obj = new Perso(pc, dc);

		if (stream) {
			// Legacy bidirectional mode: send local audio tracks to the server
			stream.getTracks().forEach(function (track) {
				pc.addTrack(track, stream);
			});
		} else {
			// New mode: receive-only audio
			pc.addTransceiver('audio', { direction: 'recvonly' });
		}

		const transceiver = pc.addTransceiver('video', { direction: 'recvonly' });
		if (videoCodecs != null) {
			transceiver.setCodecPreferences(videoCodecs);
		}

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		const serverSdp = await PersoUtil.exchangeSDP(apiServer, sessionId, offer);
		await pc.setRemoteDescription(serverSdp);

		await Perso.waitFor(() => obj.isReady(), 100, 50);
		obj.changeSize(width, height);

		return obj;
	}

	/**
	 * Configures a browser `RTCPeerConnection` with the ICE servers provided by
	 * the Perso API.
	 * @param iceServers ICE server configuration list.
	 * @returns Initialized RTCPeerConnection.
	 */
	private static async createPeerConnection(iceServers: Array<RTCIceServer>) {
		const config = {
			sdpSemantics: 'unified-plan',
			iceServers: iceServers
		};

		let pc = new RTCPeerConnection(config);

		return pc;
	}

	/**
	 * Resolves once `condition()` passes or throws a `Timeout` when the maximum
	 * number of checks is exceeded.
	 * @param condition Predicate that signals readiness.
	 * @param interval Interval between checks in milliseconds.
	 * @param times Maximum number of attempts before timing out.
	 * @throws Timeout When the predicate never returns true.
	 */
	private static async waitFor(condition: Function, interval: number, times: number) {
		let i = 0;
		await new Promise((resolve) => {
			const intervalId = setInterval(() => {
				i = i + 1;
				if (i >= times) {
					clearInterval(intervalId);
					resolve('bad');
				}
				if (condition()) {
					clearInterval(intervalId);
					resolve('good');
				}
			}, interval);
		});
		if (i >= times) {
			throw new Timeout();
		}
	}

	/**
	 * Returns true when the first remote track has been attached and the data
	 * channel is open.
	 * @returns Whether the instance is ready for interaction.
	 */
	isReady() {
		return this.streams.length > 0 && this.dc.readyState === 'open';
	}

	/**
	 * Emits a `status` custom event so that UI-layer consumers can react to
	 * connection lifecycle updates.
	 * @param status Status payload describing the session health.
	 */
	#changeStatus(status: Status) {
		this.dispatchEvent(
			new CustomEvent('status', {
				detail: status
			})
		);
	}

	/**
	 * Subscribes to status updates and returns an unsubscribe helper to mirror
	 * the EventTarget subscription pattern.
	 * @param callback Listener invoked for each status event.
	 * @returns Unsubscribe function that removes the listener.
	 */
	subscribeStatus(callback: (event: CustomEvent) => void) {
		this.addEventListener('status', callback as EventListener);
		return () => {
			this.removeEventListener('status', callback as EventListener);
		};
	}

	/**
	 * Returns the first incoming remote stream if available.
	 * @returns Primary remote `MediaStream`.
	 */
	getStream() {
		return this.streams[0];
	}

	/**
	 * Sends a typed JSON payload through the control data channel. All higher
	 * level helpers eventually defer to this method.
	 * @param type Message type identifier.
	 * @param data Arbitrary JSON-serializable payload.
	 */
	sendMessage(type: string, data: object) {
		// Without this the browser raises a bare `InvalidStateError` DOMException,
		// which tells the caller nothing about which frame failed and is not one
		// of the SDK's error types. The channel can be gone without the session
		// being gone: the server may drop it while the PeerConnection stays up.
		if (this.dc.readyState !== 'open') {
			throw new STFError(
				`control channel is not open (readyState=${this.dc.readyState}), dropped "${type}"`,
				'channel_closed'
			);
		}

		this.dc.send(
			JSON.stringify({
				type,
				data
			})
		);
	}

	/**
	 * Requests a TTS-to-face (TTSTF) playback with the provided text.
	 * @param message Text to synthesize and animate.
	 */
	ttstf(message: string) {
		this.sendMessage('ttstf', {
			message
		});
	}

	/**
	 * Opens a streaming STF turn — the only way audio reaches the server.
	 *
	 * The server starts lip-syncing the audio that follows before it has seen
	 * the end of it. Send the audio with `stfStreamingData()` and close the turn
	 * with `stfStreamingEnd()`.
	 *
	 * @param message Optional caption echoed back on the server's `stf` response.
	 */
	stfStreamingStart(message: string = '') {
		this.sendMessage('stf-streaming-start', {
			message
		});
	}

	/**
	 * Sends one slice of a streaming STF turn.
	 * @param data Base64-encoded raw PCM — mono, 24 kHz, signed 16-bit little-endian.
	 */
	stfStreamingData(data: string) {
		this.sendMessage('stf-streaming-data', {
			data
		});
	}

	/**
	 * Closes a streaming STF turn so the server can render the tail of the audio.
	 */
	stfStreamingEnd() {
		this.sendMessage('stf-streaming-end', {});
	}

	/**
	 * Signals the remote agent to start buffering microphone audio.
	 */
	recordStart() {
		this.sendMessage('record-start', {});
	}

	/**
	 * Stops recording and asks the server to run speech-to-text optionally using
	 * a specific language.
	 * @param language Optional language code for STT.
	 */
	recordEndStt(language?: string) {
		this.sendMessage('record-end-stt', {
			language
		});
	}

	/**
	 * Stops recording and translates the captured speech from `src_lang` to
	 * `dst_lang`.
	 * @param src_lang Source language code.
	 * @param dst_lang Destination language code.
	 */
	recordEndTranslate(src_lang: string, dst_lang: string) {
		this.sendMessage('record-end-translate', {
			src_lang,
			dst_lang
		});
	}

	/**
	 * Resizes the render canvas of the avatar/video surface on the remote side.
	 * @param width Target width in CSS pixels.
	 * @param height Target height in CSS pixels.
	 */
	changeSize(width: number, height: number) {
		this.sendMessage('change-size', {
			width,
			height
		});
	}

	/**
	 * Switches the avatar template (model + dress) at runtime.
	 * @param model Optional avatar model ID.
	 * @param dress Optional outfit ID.
	 */
	setTemplate(model?: string, dress?: string) {
		this.sendMessage('set-template', {
			model,
			dress
		});
	}

	/**
	 * Drops any buffered speech or text that has not been processed yet.
	 */
	clearBuffer() {
		this.sendMessage('clear-buffer', {});
	}

	/**
	 * Sends a heartbeat over the data channel to keep the connection alive.
	 */
	ping() {
		this.sendMessage('ping', {});
	}

	/**
	 * Registers a data-channel handler for a specific message `type` and returns
	 * a remover so callers can dispose of the listener cleanly.
	 * @param type Message type to watch for.
	 * @param callback Handler invoked with the parsed payload.
	 * @returns Function that removes the listener.
	 */
	setMessageCallback<T = any>(type: string, callback: (data: T) => void) {
		const wrapper = (event: MessageEvent<string>) => {
			const message = JSON.parse(event.data);
			if (message.type === type) {
				callback(message.data);
			}
		};
		this.dc.addEventListener('message', wrapper);
		return () => {
			this.dc.removeEventListener('message', wrapper);
		};
	}

	async tts(base64: string, resample: boolean = true): Promise<Blob> {
		return decodeTTSAudio(base64, resample);
	}

	/**
	 * Tears down the PeerConnection due to remote/network failure and emits a
	 * timeout status so the UI can inform users.
	 */
	private close() {
		this.dc.close();
		this.pc.close();
		this.#changeStatus({
			live: false,
			code: 408,
			reason: 'Request Timeout'
		});
	}

	/**
	 * Allows callers to gracefully terminate a session themselves and emit a
	 * successful status code for analytics.
	 */
	closeSelf() {
		this.dc.close();
		this.pc.close();
		this.#changeStatus({
			live: false,
			code: 200,
			reason: 'OK'
		});
	}
}

/**
 * Auxiliary video codecs (retransmission, redundancy, FEC) that must be kept
 * alongside the chosen primary codec so retransmission and error correction
 * keep working after the offer is filtered.
 */
const AUXILIARY_VIDEO_CODECS = new Set(['video/rtx', 'video/red', 'video/ulpfec', 'video/flexfec-03']);

/**
 * `error.name` for a `videoCodec` pin the browser cannot satisfy. Exposed as a
 * name rather than a public error class: the input is constrained to the
 * `VideoCodec` enum, so the only runtime failure is "this environment cannot use
 * the requested codec", and callers who want to react can branch on the name.
 */
const VIDEO_CODEC_UNSUPPORTED_ERROR = 'VideoCodecUnsupportedError';

/** Builds a named Error for an unsatisfiable `videoCodec` request. */
function videoCodecUnsupportedError(message: string): Error {
	const error = new Error(message);
	error.name = VIDEO_CODEC_UNSUPPORTED_ERROR;
	return error;
}

/**
 * Filters a receiver's video codec capabilities down to the requested codec
 * (all of its profile variants) plus the auxiliary codecs. Passing the result
 * to `setCodecPreferences` removes every other codec from the generated offer,
 * so the server must answer with the requested codec.
 *
 * @throws Error (`VideoCodecUnsupportedError`) When the browser reports no
 *   receive capability for the codec, since filtering to an empty list would
 *   make `setCodecPreferences` throw an opaque `InvalidAccessError` and silently
 *   pinning a different codec would defeat the point of requesting one.
 */
function filterVideoCodecs(
	codecs: RTCRtpCodec[],
	videoCodec: VideoCodec
): RTCRtpCodec[] {
	const wanted = `video/${videoCodec}`.toLowerCase();
	const primary = codecs.filter((codec) => codec.mimeType.toLowerCase() === wanted);
	if (primary.length === 0) {
		throw videoCodecUnsupportedError(
			`Requested video codec "${videoCodec}" is not supported by this browser`
		);
	}
	const auxiliary = codecs.filter((codec) => AUXILIARY_VIDEO_CODECS.has(codec.mimeType.toLowerCase()));
	return [...primary, ...auxiliary];
}

export interface STFMessage {
	message: string;
	duration: number;
}

export interface STTMessage {
	text: string;
}

/**
 * A command the server refused, echoed back with the `type` it refused.
 *
 * Sent for any control-channel command the server cannot serve — an unknown
 * one (`unknown_command`, e.g. a server without streaming STF) as much as a
 * malformed one.
 */
export interface ControlErrorMessage {
	code: string;
	type: string;
}

export interface STTErrorMessage {
	code: number;
}
