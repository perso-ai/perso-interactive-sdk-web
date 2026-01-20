export class Timeout extends Error {
  constructor() {
    super("WebRTC connection timeout");
  }
}

export class ApiError extends Error {
  constructor(
    public errorCode: number,
    public code: string,
    public detail: string,
    public attr?: string
  ) {
    let message;
    if (attr != null) {
      message = `${errorCode}:${attr}_${detail}`;
    } else {
      message = `${errorCode}:${detail}`;
    }
    super(message);
  }
}

export class LLMError extends Error {
  constructor(public underlyingError: ApiError | LLMStreamingResponseError) {
    super();
  }
}

export class LLMStreamingResponseError extends Error {
  constructor(public description: string) {
    super();
  }
}
