# Perso Interactive SDK details (js)

## PersoInteractive

### Get LLM list

```typescript
function getLLMs(apiServer: string, apiKey: string): Promise<any>;
```

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

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

apiServer : API Server url  
apiKey : API Key  
return : JSON

```JSON
{
  "llms": JSON, // result of getLLMs
  "ttsTypes": JSON, // result of getTTSs
  "sttTypes": JSON, // result of getSTTs
  "modelStyles": JSON, // result of getModelStyles
  "prompts": JSON, // result of getPrompts
  "documents": JSON, // result of getDocuments
  "backgroundImages": JSON // result of getBackgroundImages
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
  }
): Promise<string>;
```

apiServer : API Server url  
apiKey : API Key  
params.using_stf_webrtc : Whether to enable the STF WebRTC pipeline (set to `true` for the SDK demos)  
params.llm_type (optional) : LLM `name`  
params.tts_type (optional) : TTS `name`  
params.stt_type (optional) : STT `name`  
params.model_style : ModelStyle `name`  
params.prompt : Prompt `prompt_id`  
params.document (optional) : Document `document_id`  
params.background_image (optional) : BackgroundImage `backgroundimage_id`  
params.mcp_servers (optional) : MCPServer `mcpserver_id` array  
params.padding_left (optional) : AI human horizontal position (A number between -1.0 and 1.0, default 0.0)  
params.padding_top (optional) : AI human vertical position (A number between 0.0 and 1.0, default 0.0)  
params.padding_height (optional) : The scale of AI human height; the width of the AI human cannot exceed the width of the background (A number between 0.0 and 5.0, default 1.0)  
return : Session ID

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

apiServer : API Server url  
sessionId : Session ID  
width : AI human video width  
height : AI human video height  
enableVoiceChat : Whether 'Voice chat' is used  
clientTools : Client tools to be registered with the LLM  
return : Session

### Get session info

```typescript
function getSessionInfo(apiServer: string, sessionId: string): Promise<any>;
```

apiServer : API Server url  
sessionId : Session ID  
return : JSON

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

return : MediaStream

It can be used for various purposes such as recording.  
Do not use this if the voice chat feature is not enabled.

### Get AI human's media(video + audio) stream

```typescript
function getRemoteStream(): MediaStream;
```

return : MediaStream

It can be used for various purposes such as recording.

### Get 'SessionID'

```typescript
function getSessionId(): string;
```

return : Session ID

### Specifies the HTMLVideoElement to display the AI human video

```typescript
function setSrc(element: HTMLVideoElement);
```

element : HTMLVideoElement (\<video\>)

Specifies the HTMLVideoElement where the AI human's video will be rendered.

### Adjusts the size of the AI Human video during execution.

```typescript
function changeSize(width: number, height: number);
```

width : AI Human video width
height : AI Human video height

You can change the size of the AI human even after the session has been created.

### Callback for when the session is closed.

```typescript
function onClose(callback: (manualClosed: boolean) => void): () => void;
```

callback : Callback for when the session is closed  
&emsp;manualClosed - Whether the user closed the session themselves  
&emsp;If false, the quota has been exceeded or a network error has occurred.  
return : removeOnClose, function to remove callback

### Subscribe to conversation log changes from the session

```typescript
function subscribeChatLog(callback: (chatLog: Array<Chat>) => void): () => void;
```

callback : Callback for conversation log

```typescript
interface Chat {
  isUser: boolean; // true - user, false - AI human
  text: string; // conversation
  timestamp: Date; // conversation timestamp
}
```

return : unsubscribeChatLog, function to unsubscribe

Receive the entire conversation log whenever it's updated

### Subscribe to 'Chat states' changes from the session

```typescript
function subscribeChatStates(
  callback: (chatStates: Set<ChatState>) => void
): () => void;
```

callback : Callback for 'Chat states'  
&emsp;chatStates : A set that contains the processes currently in progress.  
&emsp;Multiple states can be included at the same time.  
&emsp;If no ChatState is present, it indicates an available state.  
return : unsubscribeChatStates, function to unsubscribe

Receive 'Chat states' changes during conversation

### Set STT result callback (Voice chat)

```typescript
function setSttResultCallback(callback: (text: string) => void): () => void;
```

When using voice chat, STT results are delivered here.

### Set error handler

```typescript
function setErrorHandler(callback: (error: Error) => void): () => void;
```

Errors that occur during the processChat process are delivered to the 'callback'.

### Stop session

```typescript
function stopSession();
```

close session, AI human conversation ends immediately. If successfully closed, 'true' will be sent to onClose.

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
RECORDING : The user is inputting voice for a voice chat.  
LLM : The LLM is generating a response to the user's message.  
ANALYZING : The response generated by the LLM is being processed for the AI human to speak.  
SPEAKING : The AI human is speaking.

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

name : The name of the ChatTool. It must be a unique value that distinguishes it from other tools (such as Remote MCP tools or Client tools).  
description : A description of the ChatTool's purpose and functionality. Since the LLM refers to this information to understand how and when to use the Client tool, it should be written clearly.  
parameters : The parameters required to call this ChatTool, defined in JSON Schema format.  
call : Defines the actual operation. You can implement the necessary logic—such as connecting to external APIs—and return the result as an Object.  
executeOnly : Set to true if the LLM does not need to provide a response after the ChatTool is executed. In some special cases (e.g., when multiple tools are requested simultaneously), this setting may be ignored.

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

An error that occurs while using the Perso Interactive API.  
They include details such as the error type and description.

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

## LLMError

```typescript
class LLMError extends Error {
  public underlyingError: ApiError | LLMStreamingResponseError;
}
```

An error that occurs during the use of the LLM API,  
which includes ApiError and LLMStreamingResponseError.  
This error is passed to the error handler.

## LLMStreamingResponseError

```typescript
class LLMStreamingResponseError extends Error {
  public description: string;
}
```

An error that occurs during the streaming of an LLM response.
