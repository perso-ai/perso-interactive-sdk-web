export interface Chat {
	text: string;
	isUser: boolean;
	timestamp: Date;
}

export enum ChatState {
	RECORDING = 'RECORDING',
	LLM = 'LLM',
	ANALYZING = 'ANALYZING',
	SPEAKING = 'SPEAKING',
	TTS = 'TTS'
}

export class ChatTool<TArg = any, TResult extends object = object> {
	constructor(
		public name: string,
		public description: string,
		public parameters: object,
		public call: (arg: TArg) => TResult | Promise<TResult>,
		public executeOnly: boolean = false
	) {}
}

export type LLMStreamChunk =
	| {
			type: 'message';
			chunks: string[];
			message: string;
			finish: boolean;
	  }
	| ({
			type: 'tool_call';
			tool_calls: Array<object>;
	  } & Record<string, unknown>)
	| ({
			type: 'tool_result';
			tool_call_id: string;
			result: object;
	  } & Record<string, unknown>)
	| {
			type: 'error';
			error: Error;
	  };

export interface ProcessLLMOptions {
	message: string;
	tools?: Array<ChatTool>;
	signal?: AbortSignal;
}
