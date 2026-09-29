import { CocChatChannel } from './base';
import { ScratchWindow } from '../utils/helper';
import { cocLogger } from '../utils/logger';
import { KimiChat } from '../lib/ai/kimi';

const searchWindow = new ScratchWindow('Kimi Search', 'markdown');
const chan = new CocChatChannel('Kimi', searchWindow);

export const kimiChat = new KimiChat(
  process.env.MY_AI_KIMI_CHAT_KEY ? process.env.MY_AI_KIMI_CHAT_KEY : '',
  chan,
  cocLogger,
);
