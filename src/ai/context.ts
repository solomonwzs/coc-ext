interface LlmChatTurn {
  user: string;
  assistant: string;
  timestamp: number;
}

export class LlmContextManager {
  private fullHistory: LlmChatTurn[];

  constructor(readonly tokenLimit: number) {
    this.fullHistory = [];
  }
}
