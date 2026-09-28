import { CocChatChannel } from './base';
import { ScratchWindow } from '../utils/helper';
import { cocLogger } from '../utils/logger';
import { KimiChatV2 } from '../lib/ai/kimi_v2';

const searchWindow = new ScratchWindow('Kimi Search', 'markdown');
const chan = new CocChatChannel('Kimi', searchWindow);

export const kimiChatV2 = new KimiChatV2(
  process.env.MY_AI_KIMI_CHAT_KEY ? process.env.MY_AI_KIMI_CHAT_KEY : '',
  chan,
  cocLogger,
);
