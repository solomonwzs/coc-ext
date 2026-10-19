import { CocChatChannel } from './base';
import { ScratchWindow } from '../utils/helper';
import { cocLogger } from '../utils/logger';
import { MimoChat } from '../lib/ai/mimo';

const searchWindow = new ScratchWindow('Mimo Search', 'markdown');
const chan = new CocChatChannel('Mimo', searchWindow);

// auth cookies exported from a logged-in browser (aistudio.xiaomimimo.com)
// - MY_AI_MIMO_SERVICE_TOKEN: cookie `xiaomichatbot_serviceToken`
// - MY_AI_MIMO_USER_ID:       cookie `userId`
// - MY_AI_MIMO_PH:            cookie `xiaomichatbot_ph`
export const mimoChat = new MimoChat(
  {
    serviceToken: process.env.MY_AI_MIMO_SERVICE_TOKEN ? process.env.MY_AI_MIMO_SERVICE_TOKEN : '',
    userId: process.env.MY_AI_MIMO_USER_ID ? process.env.MY_AI_MIMO_USER_ID : '',
    ph: process.env.MY_AI_MIMO_PH ? process.env.MY_AI_MIMO_PH : '',
  },
  chan,
  cocLogger
);
