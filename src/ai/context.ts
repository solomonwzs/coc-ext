export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
}

export interface LlmChatTool {
  type: 'function';
  function: {
    description: string;
    name: string;
    parameters: {
      type: string;
      properties: {
        [index: string]: {
          type: string;
          description?: string;
          format?: 'email' | 'hostname' | 'ipv4' | 'ipv6' | 'uuid';
          pattern?: string;
          minimum?: number;
          maximum?: number;
          exclusiveMinimum?: number;
          exclusiveMaximum?: number;
          default?: number;
          multipleOf?: number;
          enum?: string[];
          anyOf?: any;
        };
      };
      required: string[];
    };
  };
}

export interface LlmChatRequest {
  model: string;
  messages: LlmChatMessage[];
  frequency_penalty?: number; // [-2, 2]
  max_tokens?: number;
  presence_penalty?: number;
  response_format?: {
    type: 'text' | 'json_object';
  };
  stop?: string | string[];
  stream?: boolean;
  stream_options?: {
    include_usage: boolean;
  };
  temperature?: number; // (, 2]
  top_p?: number; // (, 1]
  tools?: LlmChatTool[];
  logprobs?: boolean;
  top_logprobs?: number; // (, 20]
  thinking?: {
    type: 'enabled' | 'disabled';
  };
}

interface LlmChatResponseDataMessage {
  role: 'assistant';
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string | null;
      arguments: string | null;
    };
    index?: number;
  }[];
}

export interface LlmChatResponseData {
  id: string;
  choices: {
    delta?: LlmChatResponseDataMessage;
    message?: LlmChatResponseDataMessage;
    logprobs?: {};
    finish_reason?:
      | 'stop'
      | 'length'
      | 'content_filter'
      | 'tool_calls'
      | 'insufficient_system_resource'
      | null;
    index: number;
    matched_stop?: number | null;
  }[];
  created: number;
  model: string;
  object: string;
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    prompt_tokens_details: {
      cached_tokens: number;
    };
  } | null;
}

interface LlmChatMessageInfo {
  oriMessage: LlmChatMessage;
}

interface LlmContext {
  fullHistory: LlmChatMessageInfo[];
  tokens: number;
}

export class LlmContextManager {
  private ctx: LlmContext;

  constructor() {
    this.ctx = {
      fullHistory: [],
      tokens: 0,
    };
  }

  public appendMessage(msg: LlmChatMessageInfo) {
    this.ctx.fullHistory.push(msg);
  }

  public getMessages(): LlmChatMessage[] {
    let msgs: LlmChatMessage[] = [];
    for (let i of this.ctx.fullHistory) {
      msgs.push(i.oriMessage);
    }
    return msgs;
  }
}
