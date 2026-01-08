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

  public appendChatTurn(userInput: string, assistantInput: string) {
    this.fullHistory.push({
      user: userInput,
      assistant: assistantInput,
      timestamp: Math.floor(Date.now() / 1000),
    });
  }
}
