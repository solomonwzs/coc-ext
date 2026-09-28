import { CocChatChannel } from './base';
import { ScratchWindow } from '../utils/helper';
import { cocLogger } from '../utils/logger';
import { DeepseekChat } from '../lib/ai/deepseek';

const searchWindow = new ScratchWindow('Deepseek Search', 'markdown');
const chan = new CocChatChannel('Deepseek', searchWindow);

export const deepseekChat = new DeepseekChat(
  process.env.MY_AI_DEEPSEEK_CHAT_KEY
    ? process.env.MY_AI_DEEPSEEK_CHAT_KEY
    : '',
  chan,
  cocLogger,
);
