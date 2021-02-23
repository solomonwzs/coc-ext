import {
  commands,
  // CompleteResult,
  ExtensionContext,
  listManager,
  // sources,
  // window,
  workspace,
  MapMode,
  ProviderResult,
} from 'coc.nvim';
import ExtList from './lists/lists';
import CommandsList from './lists/commands';
import { google_translate } from './translators/google';
import { bing_translate } from './translators/bing';
import { logger } from './utils/logger';
import { popup, getText } from './utils/helper';
import { decode_utf8_str, decode_mime_encode_str } from './utils/decoder';

function translateFn(mode: MapMode): () => ProviderResult<any> {
  return async () => {
    const text = await getText(mode);
    let trans = await google_translate(text, 'auto', 'zh-CN');
    if (!trans) {
      trans = await bing_translate(text, 'auto', 'zh-CN');
    }

    if (trans) {
      await popup(`[${trans.engine}]\n\n${trans.paraphrase}`, 'ui_float');
    } else {
      await popup(`[Error]\n\ntranslate fail`);
    }
  };
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-solomon-ext works`);
  logger.info(`coc-solomon-ext works`);
  logger.info(workspace.getConfiguration('coc-solomon-ext'));

  // const { nvim } = workspace;

  context.subscriptions.push(
    commands.registerCommand(
      'ext-debug',
      async () => {
        const doc = await workspace.document;
        logger.debug(doc.lineCount);
        // logger.debug(workspace.document.lineCount);
        // window.showMessage(`test, ${text}`);
        // // workspace.nvim.command(`echo "${text}"`);
        // const tt = (
        //   await workspace.nvim.call('lib#common#visual_selection', 1)
        // ).toString();
        // window.showMessage(`${tt}`);
      },
      { sync: false },
    ),

    workspace.registerKeymap(['n'], 'ext-translate', translateFn('n'), {
      sync: false,
    }),

    workspace.registerKeymap(['v'], 'ext-translate-v', translateFn('v'), {
      sync: false,
    }),

    workspace.registerKeymap(
      ['v'],
      'ext-decode-utf8-v',
      async () => {
        const text = await getText('v');
        const tt = decode_utf8_str(text);
        popup(`[UTF8 decode]\n\n${tt}`);
      },
      {
        sync: false,
      },
    ),

    workspace.registerKeymap(
      ['v'],
      'ext-decode-mime-v',
      async () => {
        const text = await getText('v');
        const tt = decode_mime_encode_str(text);
        popup(`[Mime decode]\n\n${tt}`);
      },
      {
        sync: false,
      },
    ),

    listManager.registerList(new ExtList(workspace.nvim)),
    listManager.registerList(new CommandsList(workspace.nvim)),

    // sources.createSource({
    //   name: 'coc-solomon-ext completion source', // unique id
    //   doComplete: async () => {
    //     const items = await getCompletionItems();
    //     return items;
    //   },
    // })

    // workspace.registerAutocmd({
    //   event: 'InsertLeave',
    //   request: true,
    //   callback: () => {
    //     window.showMessage(`registerAutocmd on InsertLeave`);
    //   },
    // })
  );
}

// async function getCompletionItems(): Promise<CompleteResult> {
//   return {
//     items: [
//       {
//         word: 'TestCompletionItem 1',
//         menu: '[coc-solomon-ext]',
//       },
//       {
//         word: 'TestCompletionItem 2',
//         menu: '[coc-solomon-ext]',
//       },
//     ],
//   };
// }
