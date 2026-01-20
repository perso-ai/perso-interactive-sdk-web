import { Timeout, PersoUtil } from "../shared";

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
  pingIntervalId: number | null = null;

  /**
   * Hooks a peer/data channel pair to status/ping listeners so consumers can
   * interact with the remote Perso session through a single object.
   * @param pc WebRTC peer connection that handles the media tracks.
   * @param dc Data channel dedicated to control-plane messages.
   */
  constructor(public pc: RTCPeerConnection, public dc: RTCDataChannel) {
    super();

    this.pingTime = Date.now() + 3000;

    this.pc.addEventListener("track", (evt) => {
      this.streams = this.streams.concat(evt.streams);
    });
    this.pc.addEventListener("connectionstatechange", () => {
      if (
        this.pc.connectionState === "disconnected" ||
        this.pc.connectionState === "failed"
      ) {
        this.close();
      }
    });
    this.dc.onopen = () => {
      this.pingIntervalId = setInterval(() => {
        this.ping();
        if (Date.now() - this.pingTime > 5000) {
          this.close();
        }
      }, 1000);
    };
    this.dc.onclose = () => {
      if (this.pingIntervalId != null) {
        clearInterval(this.pingIntervalId);
      }
    };

    this.#changeStatus({
      live: true,
      code: 200,
      reason: "OK",
    });

    this.setMessageCallback("ping", () => {
      this.pingTime = Date.now();
    });
  }

  /**
   * Attaches a local `MediaStream` to the Perso session, negotiates WebRTC
   * connectivity, and waits until the first remote stream is ready.
   * @param apiServer Perso API server URL.
   * @param sessionId Session identifier created via `createSessionId`.
   * @param stream Local camera/mic stream shared with the agent.
   * @param width Desired avatar canvas width.
   * @param height Desired avatar canvas height.
   * @returns Ready-to-use `Perso` instance.
   * @throws Timeout When remote streams fail to arrive in time.
   */
  static async create(
    apiServer: string,
    sessionId: string,
    stream: MediaStream,
    width: number,
    height: number
  ) {
    const iceServersResponse = await fetch(
      `${apiServer}/api/v1/session/${sessionId}/ice-servers/`,
      { method: "GET" }
    );

    const json = await PersoUtil.parseJson(iceServersResponse);
    const iceServers = json.ice_servers;

    let pc = await Perso.createPeerConnection(iceServers);
    let dc = pc.createDataChannel("message", { protocol: "message" });

    let obj = new Perso(pc, dc);

    stream.getTracks().forEach(function (track) {
      pc.addTrack(track, stream);
    });
    const transceiver = pc.addTransceiver("video", { direction: "recvonly" });
    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (capabilities != null) {
      transceiver.setCodecPreferences(
        capabilities.codecs.filter((a) => {
          return a.mimeType === "video/VP8";
        })
      );
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const response = await fetch(
      `${apiServer}/api/v1/session/${sessionId}/exchange/`,
      {
        body: JSON.stringify({ client_sdp: offer }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    const answer = await PersoUtil.parseJson(response);
    await pc.setRemoteDescription(answer.server_sdp);

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
      sdpSemantics: "unified-plan",
      iceServers: iceServers,
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
  private static async waitFor(
    condition: Function,
    interval: number,
    times: number
  ) {
    let i = 0;
    await new Promise((resolve) => {
      const intervalId = setInterval(() => {
        i = i + 1;
        if (i >= times) {
          clearInterval(intervalId);
          resolve("bad");
        }
        if (condition()) {
          clearInterval(intervalId);
          resolve("good");
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
    return this.streams.length > 0 && this.dc.readyState === "open";
  }

  /**
   * Emits a `status` custom event so that UI-layer consumers can react to
   * connection lifecycle updates.
   * @param status Status payload describing the session health.
   */
  #changeStatus(status: Status) {
    this.dispatchEvent(
      new CustomEvent("status", {
        detail: status,
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
    this.addEventListener("status", callback as EventListener);
    return () => {
      this.removeEventListener("status", callback as EventListener);
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
    this.dc.send(
      JSON.stringify({
        type,
        data,
      })
    );
  }

  /**
   * Requests a TTS-to-face (TTSTF) playback with the provided text.
   * @param message Text to synthesize and animate.
   */
  ttstf(message: string) {
    this.sendMessage("ttstf", {
      message,
    });
  }

  /**
   * Signals the remote agent to start buffering microphone audio.
   */
  recordStart() {
    this.sendMessage("record-start", {});
  }

  /**
   * Stops recording and asks the server to run speech-to-text optionally using
   * a specific language.
   * @param language Optional language code for STT.
   */
  recordEndStt(language?: string) {
    this.sendMessage("record-end-stt", {
      language,
    });
  }

  /**
   * Stops recording and translates the captured speech from `src_lang` to
   * `dst_lang`.
   * @param src_lang Source language code.
   * @param dst_lang Destination language code.
   */
  recordEndTranslate(src_lang: string, dst_lang: string) {
    this.sendMessage("record-end-translate", {
      src_lang,
      dst_lang,
    });
  }

  /**
   * Resizes the render canvas of the avatar/video surface on the remote side.
   * @param width Target width in CSS pixels.
   * @param height Target height in CSS pixels.
   */
  changeSize(width: number, height: number) {
    this.sendMessage("change-size", {
      width,
      height,
    });
  }

  /**
   * Switches the avatar template (model + dress) at runtime.
   * @param model Optional avatar model ID.
   * @param dress Optional outfit ID.
   */
  setTemplate(model?: string, dress?: string) {
    this.sendMessage("set-template", {
      model,
      dress,
    });
  }

  /**
   * Drops any buffered speech or text that has not been processed yet.
   */
  clearBuffer() {
    this.sendMessage("clear-buffer", {});
  }

  /**
   * Sends a heartbeat over the data channel to keep the connection alive.
   */
  ping() {
    this.sendMessage("ping", {});
  }

  /**
   * Registers a data-channel handler for a specific message `type` and returns
   * a remover so callers can dispose of the listener cleanly.
   * @param type Message type to watch for.
   * @param callback Handler invoked with the parsed payload.
   * @returns Function that removes the listener.
   */
  setMessageCallback(type: string, callback: (data: any) => void) {
    const wrapper = (event: MessageEvent<any>) => {
      const message = JSON.parse(event.data);
      if (message.type === type) {
        callback(message.data);
      }
    };
    this.dc.addEventListener("message", wrapper);
    return () => {
      this.dc.removeEventListener("message", wrapper);
    };
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
      reason: "Request Timeout",
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
      reason: "OK",
    });
  }
}

export interface STFMessage {
  message: string;
  duration: number;
}

export interface STTMessage {
  text: string;
}

export interface STTError {
  code: number;
}
