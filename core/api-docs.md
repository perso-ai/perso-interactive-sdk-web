# Perso Interactive SDK details (js)

## PersoInteractive

### Get LLM list

```typescript
function getLLMs(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of LLM objects

```JSON
[
  {
    "name": string
  }
]
```

### Get TTS list

```typescript
function getTTSs(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of TTS objects

```JSON
[
  {
    "name": string,
    "service": string,
    "speaker": string
  }
]
```

### Get STT list

```typescript
function getSTTs(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of STT objects

```JSON
[
  {
    "name": string,
    "service": string,
    "options": string
  }
]
```

### Get ModelStyle list

```typescript
function getModelStyles(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of ModelStyle objects

```JSON
[
  {
    "name": string,
    "model": string,
    "style": string
  }
]
```

### Get prompt list

```typescript
function getPrompts(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of Prompt objects

```JSON
[
  {
    "name": string,
    "description": string,
    "prompt_id": string,
    "system_prompt": string,
    "require_document": boolean,
    "intro_message": string
  }
]
```

### Get document list

```typescript
function getDocuments(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of Document objects

```JSON
[
  {
    "document_id": string,
    "title": string,
    "description": string,
    "search_count": number,
    "processed": boolean,
    "created_at": string, // ex) "2024-05-02T09:05:55.395Z",
    "updated_at": string // ex) "2024-05-02T09:05:55.395Z"
  }
]
```

### Get background image list

```typescript
function getBackgroundImages(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of BackgroundImage objects

```JSON
[
  {
    "backgroundimage_id": string,
    "title": string,
    "image": string,
    "created_at": string // ex) "2024-05-02T09:05:55.395Z"
  }
]
```

### Get Remote MCP Server list

```typescript
function getMcpServers(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of MCPServer objects

```JSON
[
  {
    "mcpserver_id": string,
    "name": string,
    "url": string,
    "description": string
  }
]
```

### Get all settings

```typescript
function getAllSettings(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Object containing all settings

```JSON
{
  "llms": JSON, // result of getLLMs
  "ttsTypes": JSON, // result of getTTSs
  "sttTypes": JSON, // result of getSTTs
  "modelStyles": JSON, // result of getModelStyles
  "prompts": JSON, // result of getPrompts
  "documents": JSON, // result of getDocuments
  "backgroundImages": JSON, // result of getBackgroundImages
  "mcpServers": JSON // result of getMcpServers
}
```

### Create session id

```typescript
function createSessionId(
  apiServer: string,
  apiKey: string,
  params: {
    using_stf_webrtc: boolean;
    model_style: string;
    prompt: string;
    document?: string;
    background_image?: string;
    mcp_servers?: Array<string>;
    padding_left?: number;
    padding_top?: number;
    padding_height?: number;
    llm_type?: string;
    tts_type?: string;
    stt_type?: string;
    text_normalization_config?: string | null;
    text_normalization_locale?: string | null;
  }
): Promise<string>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `apiServer` | Yes | API Server URL |
| `apiKey` | Yes | API Key |
| `params.using_stf_webrtc` | Yes | Whether to enable the STF WebRTC pipeline (set to `true` for the SDK demos) |
| `params.model_style` | Yes | ModelStyle `name` |
| `params.prompt` | Yes | Prompt `prompt_id` |
| `params.llm_type` | No | LLM `name` |
| `params.tts_type` | No | TTS `name` |
| `params.stt_type` | No | STT `name` |
| `params.document` | No | Document `document_id` |
| `params.background_image` | No | BackgroundImage `backgroundimage_id` |
| `params.mcp_servers` | No | MCPServer `mcpserver_id` array |
| `params.padding_left` | No | AI human horizontal position (A number between -1.0 and 1.0, default 0.0) |
| `params.padding_top` | No | AI human vertical position (A number between 0.0 and 1.0, default 0.0) |
| `params.padding_height` | No | The scale of AI human height; the width of the AI human cannot exceed the width of the background (A number between 0.0 and 5.0, default 1.0) |
| `params.text_normalization_config` | No | Configuration for TTS text normalization |
| `params.text_normalization_locale` | No | Locale setting for TTS text normalization |

**Returns:** Session ID (string)

### Create session

```typescript
function createSession(
  apiServer: string,
  sessionId: string,
  width: number,
  height: number,
  enableVoiceChat: boolean,
  clientTools: Array<ChatTool>
): Promise<Session>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `sessionId` | Session ID |
| `width` | AI human video width |
| `height` | AI human video height |
| `enableVoiceChat` | Whether 'Voice chat' is used |
| `clientTools` | Client tools to be registered with the LLM |

**Returns:** Session object

### Get session info

```typescript
function getSessionInfo(apiServer: string, sessionId: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `sessionId` | Session ID |

**Returns:** Session info object

```JSON
{
  "session_id": string,
  "client_sdp": string,
  "server_sdp": string,
  "prompt": {
    "name": string,
    "description": string,
    "prompt_id": string,
    "system_prompt": string,
    "require_document": boolean,
    "intro_message": string
  },
  "document": string,
  "llm_type": {
    "name": string
  },
  "model_style": {
    "name": string,
    "model": string,
    "model_file": string,
    "style": string,
    "file": string
  },
  "tts_type": {
    "name": string,
    "service": string,
    "model": string,
    "voice": string,
    "style": string,
    "voice_extra_data": string
  },
  "ice_servers": Array<RTCIceServer>,
  "status": string, // "CREATED", "EXCHANGED", "IN_PROGRESS", "TERMINATED"
  "termination_reason": string, // "GRACEFUL_TERMINATION", "SESSION_EXPIRED_BEFORE_CONNECTION", "SESSION_LOST_AFTER_CONNECTION", "SESSION_MISC_ERROR", "MAX_ACTIVE_SESSION_QUOTA_EXCEEDED", "MAX_MIN_PER_SESSION_QUOTA_EXCEEDED", "TOTAL_MIN_PER_MONTH_QUOTA_EXCEEDED"
  "duration_sec": number,
  "created_at": string, // ex) "2024-05-02T09:05:55.395Z"
  "padding_left": number,
  "padding_top": number,
  "padding_height": number,
  "background_image": {
    "backgroundimage_id": string,
    "title": string,
    "image": string,
    "created_at": string // ex) "2024-05-02T09:05:55.395Z"
  },
  "extra_data": string
}
```

## Session

### Send a message to the AI human

```typescript
function processChat(message: string): Promise<void>;
```

'message' must not be empty

ChatState.LLM is set in the 'Chat states'.  
While the AI human is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

```typescript
function processCustomChat(message: string): void;
```

'message' must not be empty

This function makes the AI human speak the response message generated by a custom LLM. This function does not invoke the internal LLM.

While the AI human is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

**Important Notes:**

- Does not manage messageHistory automatically
- `subscribeChatLog` is not available when using this function
- `subscribeChatStates` cannot handle ChatState.LLM (only ANALYZING and SPEAKING states are triggered)
- Use this function when you want to integrate your own custom LLM instead of using the internal LLM

### AI human speaks the 'message'

```typescript
function processTTSTF(message);
```

'message' must not be empty

While the AI human is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

### Start voice chat

```typescript
function startVoiceChat();
```

ChatState.RECORDING is set in the 'Chat states'.

### Complete voice chat

```typescript
function stopVoiceChat();
```

ChatState.ANALYZING is set in the 'Chat states', and ChatState.RECORDING is cleared from the 'Chat states'.

After calling stopVoiceChat, the STT results are received internally.  
The STT(Speech To Text) results are received, and ChatState.ANALYZING is cleared from the 'Chat states'.

If Session-setSttResultCallback is not set (default behavior):  
&emsp;If the STT results are valid, processChat is executed.  
If Session.setSttResultCallback is set:  
&emsp;The STT results are passed to the callback you defined.

### Stop AI human speaking

```typescript
function clearBuffer(): Promise<void>;
```

You can stop the AI human’s response.

### Get user's audio stream

```typescript
function getLocalStream(): MediaStream;
```

**Returns:** `MediaStream`

It can be used for various purposes such as recording.

> **Note:** Do not use this if the voice chat feature is not enabled.

### Get AI human's media(video + audio) stream

```typescript
function getRemoteStream(): MediaStream;
```

**Returns:** `MediaStream`

It can be used for various purposes such as recording.

### Get 'SessionID'

```typescript
function getSessionId(): string;
```

**Returns:** Session ID (string)

### Specifies the HTMLVideoElement to display the AI human video

```typescript
function setSrc(element: HTMLVideoElement);
```

| Parameter | Description |
|-----------|-------------|
| `element` | HTMLVideoElement (`<video>`) where the AI human's video will be rendered |

### Adjusts the size of the AI Human video during execution

```typescript
function changeSize(width: number, height: number);
```

| Parameter | Description |
|-----------|-------------|
| `width` | AI Human video width |
| `height` | AI Human video height |

You can change the size of the AI human even after the session has been created.

### Callback for when the session is closed

```typescript
function onClose(callback: (manualClosed: boolean) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function invoked when the session is closed |

**Callback parameter:**

| Parameter | Description |
|-----------|-------------|
| `manualClosed` | `true` if the user closed the session themselves, `false` if quota exceeded or network error occurred |

**Returns:** `removeOnClose` - function to remove the callback

### Subscribe to conversation log changes from the session

```typescript
function subscribeChatLog(callback: (chatLog: Array<Chat>) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function for receiving conversation log updates |

**Chat interface:**

```typescript
interface Chat {
  isUser: boolean; // true - user, false - AI human
  text: string; // conversation
  timestamp: Date; // conversation timestamp
}
```

**Returns:** `unsubscribeChatLog` - function to unsubscribe

Receive the entire conversation log whenever it's updated.

### Subscribe to 'Chat states' changes from the session

```typescript
function subscribeChatStates(
  callback: (chatStates: Set<ChatState>) => void
): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function for receiving chat state changes |

**Callback parameter:**

| Parameter | Description |
|-----------|-------------|
| `chatStates` | A set containing the processes currently in progress. Multiple states can be included at the same time. If empty, it indicates an available state. |

**Returns:** `unsubscribeChatStates` - function to unsubscribe

Receive 'Chat states' changes during conversation.

### Set STT result callback (Voice chat)

```typescript
function setSttResultCallback(callback: (text: string) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function that receives STT (Speech-To-Text) results during voice chat |

**Returns:** Function to remove the callback

### Set error handler

```typescript
function setErrorHandler(callback: (error: Error) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function that receives errors occurring during the processChat process |

**Returns:** Function to remove the error handler

### Stop session

```typescript
function stopSession();
```

Closes the session and ends the AI human conversation immediately. If successfully closed, `true` will be sent to the `onClose` callback.

## ChatState

```typescript
enum ChatState {
  RECORDING = "RECORDING",
  LLM = "LLM",
  ANALYZING = "ANALYZING",
  SPEAKING = "SPEAKING",
}
```

These values represent the conversation state.

| State | Description |
|-------|-------------|
| `RECORDING` | The user is inputting voice for a voice chat. |
| `LLM` | The LLM is generating a response to the user's message. |
| `ANALYZING` | The response generated by the LLM is being processed for the AI human to speak. |
| `SPEAKING` | The AI human is speaking. |

## ChatTool

Perso Interactive supports 'Tool calling'.  
There are two types of tool calling: Remote MCP tool and Client tool.  
Remote MCP tools can be registered and managed through the Perso Interactive back office.  
This section explains Client tools only.

### What is 'Client tool'?

A Client tool is an external module or function that performs tasks that the LLM (Large Language Model) cannot execute directly.  
In other words, it's a tool that enables the LLM to carry out real-world actions—such as data retrieval, calculations, or file processing—that it can't handle by "just talking."

LLM → calls Client tool → performs actual operation → returns result  
The LLM only knows how and when to use the Client tool.  
The Client tool handles the actual logic.

'ChatTool' is a Perso Interactive class used to define a Client tool and register it with the LLM.

```typescript
class ChatTool {
  constructor(
    public name: string,
    public description: string,
    public parameters: object,
    public call: (arg: any) => object | Promise<object>,
    public executeOnly: boolean = false
  );
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | The name of the ChatTool. It must be a unique value that distinguishes it from other tools (such as Remote MCP tools or Client tools). |
| `description` | Yes | A description of the ChatTool's purpose and functionality. Since the LLM refers to this information to understand how and when to use the Client tool, it should be written clearly. |
| `parameters` | Yes | The parameters required to call this ChatTool, defined in JSON Schema format. |
| `call` | Yes | Defines the actual operation. You can implement the necessary logic—such as connecting to external APIs—and return the result as an Object. |
| `executeOnly` | No | Set to true if the LLM does not need to provide a response after the ChatTool is executed. In some special cases (e.g., when multiple tools are requested simultaneously), this setting may be ignored. Default: `false` |

### Example: Using a Client tool

Suppose you want the LLM to provide real-time weather information.  
(However, by default, an LLM cannot provide real-time weather data.)  
But, you already have a function that retrieves weather information.

```typescript
/**
 * Retrieves the current weather for a given location
 * @param location - City and country, e.g. 'San Francisco, CA' / examples: 'New York, US', 'Seoul, KR'
 * @param units - The temperature unit to use, enum Units
 * @returns Weather
 */
function getCurrentWeather(
    location: string,
    units: Units = Units.CELSIUS
): Promise<Weather> {
    ...
}

enum Units {
    CELSIUS = 'celsius',
    FAHRENHEIT = 'fahrenheit'
}

interface Weather {
    temperature: number,
    condition: string,
    humidity: number,
    wind: number
}
```

You can define a ChatTool to expose getCurrentWeather as a Client tool and register it with the LLM.  
Below is an example ChatTool definition based on getCurrentWeather.

```typescript
const chatTool = new PersoInteractiveSDK.ChatTool(
  "get_current_weather",
  "Retrieves the current weather for a given location",
  {
    type: "object",
    properties: {
      location: {
        examples: ["New York, US", "Seoul, KR"],
        type: "string",
        description: "City and country, e.g. 'San Francisco, CA'",
      },
      units: {
        type: "string",
        description: "The temperature unit to use",
        enum: ["celsius", "fahrenheit"],
        default: "celsius",
      },
    },
    required: ["location", "units"],
  },
  async (arg) => {
    const location: string = arg.location;
    // convert string to Units, 'celsius' -> Units.CELSIUS
    const units = Object.values(Units).find((v) => v === arg.units);
    if (units === undefined) {
      return { result: "failed" };
    }

    try {
      const weather = await getCurrentWeather(location, units);
      return {
        temperature: `${weather.temperature}${
          units === Units.CELSIUS ? "℃" : "℉"
        }`, // 30℃, 86℉
        condition: weather.condition, // e.g. 'Mostly clear'
        humidity: `${weather.humidity}%`, // e.g. 68%
        wind: `${weather.wind}km/h`, // e.g. 10.3km/h
      };
    } catch (error) {
      return { result: "failed" };
    }
  },
  false
);
```

### Example Interaction

When a user asks:  
&emsp;"Tell me the current weather in Seoul."

The LLM analyzes the request and asks the client to execute the 'get_current_weather' tool.  
It sends the tool name and the arguments needed for execution:  
&emsp;name : 'get_current_weather'  
&emsp;arg.location : 'Seoul' (or 'Seoul, KR')  
&emsp;arg.units : 'celsius' (since no specific unit was mentioned, the default 'celsius' is used)

The client receives the 'get_current_weather' request, finds the ChatTool with that name, and calls call(arg).  
The result is returned to the LLM, which then generates a suitable response.

Example:  
&emsp;Q. Tell me the current weather in Seoul.  
&emsp;A. It's currently 30°C in Seoul with 68% humidity and clear skies.

&emsp;Q. Tell me the current weather in Seoul, in Fahrenheit.  
&emsp;A. It's currently 86°F in Seoul with 68% humidity and clear skies.

## ApiError

An error that occurs while using the Perso Interactive API. They include details such as the error type and description.

```typescript
class ApiError extends Error {
  constructor(
    public errorCode: number,
    public code: string,
    public detail: string,
    public attr?: string
  );
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `errorCode` | Yes | HTTP error code |
| `code` | Yes | Error code string |
| `detail` | Yes | Detailed error description |
| `attr` | No | Additional attribute information |

## LLMError

An error that occurs during the use of the LLM API, which includes `ApiError` and `LLMStreamingResponseError`. This error is passed to the error handler.

```typescript
class LLMError extends Error {
  public underlyingError: ApiError | LLMStreamingResponseError;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying error (`ApiError` or `LLMStreamingResponseError`) |

## LLMStreamingResponseError

An error that occurs during the streaming of an LLM response.

```typescript
class LLMStreamingResponseError extends Error {
  public description: string;
}
```

| Property | Description |
|----------|-------------|
| `description` | Detailed error description |
