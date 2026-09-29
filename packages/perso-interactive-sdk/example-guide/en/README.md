# Example Guide (English)

Annotated code snippets for each SDK feature. Each file is a standalone, runnable example.

| Example | Description |
| ------- | ----------- |
| [00-session-creation.ts](./00-session-creation.ts) | Session Creation — manual config vs. session template |
| [01-llm.ts](./01-llm.ts) | LLM usage — `processLLM()` (recommended, streaming) and legacy `processChat()` (deprecated) |
| [02-tts.ts](./02-tts.ts) | Text-to-Speech — generate audio from text and play in browser, plus streaming PCM playback and the `streamable` requirement it carries |
| [03-stt.ts](./03-stt.ts) | Speech-to-Text — record and transcribe with `startProcessSTT()` / `stopProcessSTT()` (NON_STREAMING), and `startRealtimeSTT()` cycles for streaming partials and hands-free conversation (STREAMING) |
| [04-stf.ts](./04-stf.ts) | Speech-to-Face — lip-sync a finished clip, a live PCM source, or an always-on microphone. Audio is always streamed |
| [05-pipeline.ts](./05-pipeline.ts) | Full pipelines — STT→LLM→TTS→STF, tool calling, session lifecycle |
