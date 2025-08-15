import { window, workspace, ProviderResult } from 'coc.nvim';
import { BaseChatChannel } from './base';
import { kimiChat } from './kimi';
import { deepseekChat } from './deepseek';
import { bailianChat } from './bailian';
import { echoMessage, getText } from '../utils/helper';
import { logger } from '../utils/logger';
import { countTextWidth } from '../utils/helper';
import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';

let globalAiChat: BaseChatChannel | null = null;

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
    globalAiChat = choose.chat;
    if (!globalAiChat) {
      return;
    }
  }
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
    items.push({ label: 'Create', chat_id: '', description: '' });
    let choose = await window.showQuickPick(items, { title: 'Choose Chat' });
    if (!choose || choose.chat_id.length == 0) {
      let new_name = await window.requestInput('Name', '', {
        position: 'center',
      });
      if (new_name.length == 0) {
        return -1;
      }

      const chat_id = await globalAiChat.createChatId(new_name);
      if (chat_id instanceof Error) {
        logger.error(chat_id);
        return -1;
      }
      globalAiChat.setCurrentChatId(chat_id);
    } else {
      globalAiChat.setCurrentChatId(choose.chat_id);
      const err = await globalAiChat.showHistoryMessages();
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
    const text = await getText('v');
    if (text.length == 0) {
      return;
    }

    let ret = await aiChatOpen();
    if (ret != 0 || !globalAiChat) {
      return;
    }
    await globalAiChat.openAutoScroll();
    await globalAiChat.chat(text);
    globalAiChat.closeAutoScroll();
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

    await globalAiChat.openAutoScroll();
    await globalAiChat.chat(text);
    globalAiChat.closeAutoScroll();
  };
}

export function aiChatShow(): () => ProviderResult<any> {
  return async () => {
    let { nvim } = workspace;
    let bufnr = await nvim.call('bufnr');
    let ai_name = await nvim.call('getbufvar', [bufnr, 'ai_name']);

    if (ai_name == kimiChat.getChatName()) {
      await kimiChat.showItem();
    } else if (ai_name == deepseekChat.getChatName()) {
      await deepseekChat.showItem();
    }
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
    this.addAction('open', AiChatList.open);
  }

  private static async open(
    item: ListItem,
    _context: ListContext,
  ): Promise<void> {
    logger.debug(item);
  }

  public async loadItems(_context: ListContext): Promise<ListItem[] | null> {
    let items = await this.aiChat.getChatList();
    if (items instanceof Error) {
      return null;
    }

    let max_width = 0;
    for (const i of items) {
      let w = countTextWidth(i.label);
      if (w > max_width) {
        max_width = w;
      }
    }

    let res: ListItem[] = [];
    for (const i of items) {
      let lable_width = countTextWidth(i.label);
      let label_bytelen = Buffer.byteLength(i.label);
      let spaces = ' '.repeat(max_width - lable_width + 2);
      let label = `${i.label}${spaces}${i.chat_id}  ${i.description}`;
      res.push({
        label,
        data: i,
        ansiHighlights: [
          {
            span: [label_bytelen, Buffer.byteLength(label)],
            hlGroup: 'Comment',
          },
        ],
      });
    }
    return res;
  }
}
