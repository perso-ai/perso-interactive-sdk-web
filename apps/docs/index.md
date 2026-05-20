---
layout: home

hero:
  name: 'Perso Interactive SDK'
  text: 'Real-time AI avatar sessions for the web'
  tagline: 'WebRTC-based SDK with LLM chat, TTS/STT, and client-side tool calling.'
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: View on GitHub
      link: https://github.com/perso-ai/perso-interactive-sdk-web

features:
  - title: WebRTC real-time
    details: Sub-second latency video/audio sessions with an AI avatar, powered by RTCPeerConnection and a typed DataChannel protocol.
  - title: LLM chat with streaming
    details: First-class streaming responses, message history, and conversational state machine (RECORDING / LLM / ANALYZING / SPEAKING / TTS).
  - title: Voice in & out
    details: Built-in STT and TTS pipelines with locale-aware results and normalized text.
  - title: Client-side tool calling
    details: Expose local functions as ChatTool so the LLM can invoke them inside the session.
  - title: Server-safe session creation
    details: Dedicated server subpath keeps your API key off the browser — works with SvelteKit, Next.js, and any Node.js server.
  - title: Typed and tested
    details: Strict TypeScript types, structured error hierarchy, and Jest test coverage for the session lifecycle.
---
