import { window, workspace, ProviderResult } from 'coc.nvim';
import { BaseChatChannel, ChatItem } from './base';
import { llmCommonChat } from './llmcommon';
import { deepseekChat } from './deepseek';
import { kimiChatV2 } from './kimi_v2';
import { zaiChat } from './zai';
import {
  echoMessage,
  getText,
  countTextWidth,
  ScratchWindow,
} from '../utils/helper';
import { logger } from '../utils/logger';
import { ListAction, ListContext, ListItem, BasicList } from 'coc.nvim';

export let name2AiChat = new Map<string, BaseChatChannel>([
  [kimiChatV2.getChatName(), kimiChatV2],
  [deepseekChat.getChatName(), deepseekChat],
  [llmCommonChat.getChatName(), llmCommonChat],
  [zaiChat.getChatName(), zaiChat],
]);

let globalAiChat: BaseChatChannel | null = null;
let globalScratchWindow = new ScratchWindow('Chat Input', 'text');

export async function aiChatSelect() {
  let quickItems: any[] = [];
  for (let [k, v] of name2AiChat) {
    quickItems.push({ label: k, chat: v });
  }

  let choose = await window.showQuickPick(quickItems, { title: 'Choose AI' });
  if (choose) {
    globalAiChat = choose.chat;
    if (!globalAiChat) {
      return;
    }
  }
}

export function aiChatInputOpen() {
  return async () => {
    globalScratchWindow.open(['']);
  };
}

export async function aiChatOpen() {
  if (!globalAiChat) {
    await aiChatSelect();
    if (!globalAiChat) {
      return -1;
    }
  }

  if (!globalAiChat.getCurrentChatId()) {
    let items = await globalAiChat.getChatList();
    if (items instanceof Error) {
      logger.error(items);
      echoMessage('ErrorMsg', items.message);
      return -1;
    }
    items.push({ label: 'Create', chatId: '', description: '' });
    let choose = await window.showQuickPick(items, { title: 'Choose Chat' });
    if (!choose || choose.chatId.length == 0) {
      let new_name = await window.requestInput('Name', '', {
        position: 'center',
      });
      if (new_name.length == 0) {
        return -1;
      }

      let chatId = await globalAiChat.createChatId(new_name);
      if (chatId instanceof Error) {
        logger.error(chatId);
        return -1;
      }
      globalAiChat.setCurrentChatId(chatId);
    } else {
      globalAiChat.setCurrentChatId(choose.chatId);
      let err = await globalAiChat.showHistoryMessages();
      if (err instanceof Error) {
        logger.error(err);
      }
    }
  }
  await globalAiChat.show();
  return 0;
}

export function aiChatChat(): () => ProviderResult<any> {
  return async () => {
    let text = await getText('v');
    if (text.length == 0) {
      return;
    }

    let ret = await aiChatOpen();
    if (ret != 0 || !globalAiChat) {
      return;
    }
    await globalAiChat.sendChat(text);
  };
}

export function aiChatQuickChat(): () => ProviderResult<any> {
  return async () => {
    let ret = await aiChatOpen();
    if (ret != 0 || !globalAiChat) {
      return;
    }

    let n = (await workspace.nvim.eval('&columns')) as number;
    let inputbox = await window.createInputBox(
      `AI Chat <${globalAiChat.getChatName()}>`,
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

    await globalAiChat.sendChat(text);
  };
}

export function aiChatShow(): () => ProviderResult<any> {
  return async () => {
    if (globalAiChat != null) {
      await globalAiChat.showItem();
    }
    // let { nvim } = workspace;
    // let bufnr = await nvim.call('bufnr');
    // let ai_name = (await nvim.call('getbufvar', [bufnr, 'ai_name'])) as string;

    // let ch = name2AiChat.get(ai_name);
    // if (ch) {
    //   await ch.showItem();
    // }
  };
}

export class AiChatList extends BasicList {
  // public readonly name: string;
  public readonly description = 'CocList for coc-ext-common';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  constructor(
    public readonly name: string,
    private readonly aiChat: BaseChatChannel,
  ) {
    super();

    let newAction = async (_item: ListItem, _context: ListContext) => {
      let new_name = await window.requestInput('Name', '', {
        position: 'center',
      });
      if (new_name.length == 0) {
        echoMessage('ErrorMsg', 'Input name first');
        return;
      }
      let chatId = await this.aiChat.createChatId(new_name);
      if (chatId instanceof Error) {
        logger.error(chatId);
        echoMessage('ErrorMsg', 'create session fail');
        return;
      }

      this.aiChat.reset();
      this.aiChat.setCurrentChatId(chatId);
      await this.aiChat.show();

      globalAiChat = this.aiChat;
    };

    this.addAction('open', async (item: ListItem, context: ListContext) => {
      if (globalAiChat != null) {
        if (globalAiChat == this.aiChat) {
          globalAiChat.clear();
        } else {
          globalAiChat.hide();
        }
      }

      if (item.data === '$new') {
        await newAction(item, context);
      } else {
        let data: ChatItem = item.data;

        this.aiChat.setCurrentChatId(data.chatId);
        let err = await this.aiChat.showHistoryMessages();
        if (err instanceof Error) {
          logger.error(err);
        }

        globalAiChat = this.aiChat;
        await globalAiChat.show();
      }
    });

    this.addAction(
      'delete',
      async (item: ListItem, _context: ListContext) => {
        let i = item.data as ChatItem;
        let del = await window.showPrompt(`Delete session [ ${i.label} ]`);
        if (del) {
          let err = await this.aiChat.delSession(i.chatId);
          if (err instanceof Error) {
            logger.error(err);
          }

          if (this.aiChat.getCurrentChatId() === i.chatId) {
            this.aiChat.clear();
          }
          if (globalAiChat == this.aiChat) {
            globalAiChat = null;
          }
        }
      },
      {
        reload: true,
        persist: true,
      },
    );

    this.addAction('new', newAction);
  }

  public async loadItems(_context: ListContext): Promise<ListItem[] | null> {
    let items = await this.aiChat.getChatList();
    if (items instanceof Error) {
      logger.error(items);
      echoMessage('ErrorMsg', items.message);
      return null;
    }

    let maxWidth = 0;
    for (let i of items) {
      let w = countTextWidth(i.label);
      if (w > maxWidth) {
        maxWidth = w;
      }
    }

    let res: ListItem[] = [];
    for (let i of items) {
      let lableWidth = countTextWidth(i.label);
      let labelByteLen = Buffer.byteLength(i.label);
      let spaces = ' '.repeat(maxWidth - lableWidth + 2);
      let label = `${i.label}${spaces}${i.description}`;
      res.push({
        label,
        data: i,
        ansiHighlights: [
          {
            span: [labelByteLen, Buffer.byteLength(label)],
            hlGroup: 'Comment',
          },
        ],
      });
    }

    let newLabel = '[  New Session ]';
    res.push({
      label: newLabel,
      data: '$new',
      ansiHighlights: [
        {
          span: [0, Buffer.byteLength(newLabel)],
          hlGroup: 'Cursor',
        },
      ],
    });
    return res;
  }
}
