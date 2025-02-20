import { window, workspace, ProviderResult } from 'coc.nvim';
import { BaseChatChannel } from './base';
import { kimiChat } from './kimi';
import { deepseekChat } from './deepseek';
import { bailianChat } from './bailian';
import { echoMessage, getText, popup } from '../utils/helper';
import { logger } from '../utils/logger';

let aiChat: BaseChatChannel | null = null;

export async function aiChatSelect() {
  let choose = await window.showQuickPick(
    [
      { label: 'Kimi', chat: kimiChat },
      { label: 'Deepseek', chat: deepseekChat },
      { label: 'Bailian', chat: bailianChat },
    ],
    { title: 'Choose AI' },
  );
  if (choose) {
    aiChat = choose.chat;
    if (!aiChat) {
      return;
    }
  }
}

export async function aiChatOpen() {
  if (!aiChat) {
    await aiChatSelect();
    if (!aiChat) {
      return -1;
    }
  }

  if (!aiChat.getCurrentChatId()) {
    let items = await aiChat.getChatList();
    if (items instanceof Error) {
      logger.error(items);
      echoMessage('ErrorMsg', items.message);
      return -1;
    }
    items.push({ label: 'Create', chat_id: '', description: '' });
    let choose = await window.showQuickPick(items, { title: 'Choose Chat' });
    if (!choose || choose.chat_id.length == 0) {
      let new_name = await window.requestInput('Name', '', {
        position: 'center',
      });
      if (new_name.length == 0) {
        return -1;
      }

      const chat_id = await aiChat.createChatId(new_name);
      if (chat_id instanceof Error) {
        logger.error(chat_id);
        return -1;
      }
      aiChat.setCurrentChatId(chat_id);
    } else {
      aiChat.setCurrentChatId(choose.chat_id);
      const err = await aiChat.showHistoryMessages();
      if (err instanceof Error) {
        logger.error(err);
      }
    }
  }
  await aiChat.show();
  return 0;
}

export function aiChatChat(): () => ProviderResult<any> {
  return async () => {
    const text = await getText('v');
    if (text.length == 0) {
      return;
    }

    let ret = await aiChatOpen();
    if (ret != 0 || !aiChat) {
      return;
    }
    await aiChat.openAutoScroll();
    await aiChat.chat(text);
    aiChat.closeAutoScroll();
  };
}

export function aiChatQuickChat(): () => ProviderResult<any> {
  return async () => {
    let ret = await aiChatOpen();
    if (ret != 0 || !aiChat) {
      return;
    }

    let n = (await workspace.nvim.eval('&columns')) as number;
    let inputbox = await window.createInputBox(
      `AI Chat <${aiChat.getChatName()}>`,
      '',
      {
        position: 'center',
        minWidth: Math.floor(n / 2),
      },
    );

    let text = await new Promise<string>((resolve) => {
      inputbox.onDidFinish((text) => {
        resolve(text ? text : '');
      });
    });
    if (text.length == 0) {
      return;
    }

    await aiChat.openAutoScroll();
    await aiChat.chat(text);
    aiChat.closeAutoScroll();
  };
}

export function aiChatRef(): () => ProviderResult<any> {
  return async () => {
    let { nvim } = workspace;
    let bufnr = await nvim.call('bufnr');
    let ai_name = await nvim.call('getbufvar', [bufnr, 'ai_name']);

    if (ai_name == kimiChat.getChatName()) {
      const text = await kimiChat.getRef();
      if (text) {
        popup(text, '', 'markdown');
      }
    }
  };
}
