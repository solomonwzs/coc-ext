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
  TextEdit,
  languages,
  DocumentSelector,
} from 'coc.nvim';
import ExtList from './lists/lists';
import CommandsList from './lists/commands';
import { google_translate } from './translators/google';
import { bing_translate } from './translators/bing';
import { logger } from './utils/logger';
import { popup, getText } from './utils/helper';
import { decode_mime_encode_str } from './utils/decoder';
import { call_python } from './utils/python';
import { FormattingEditProvider } from './formatter/formatprovider';

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

function decodeStrFn(enc: string): () => ProviderResult<any> {
  return async () => {
    const text = await getText('v');
    const res = await call_python('coder', 'decode_str', [text, enc]);
    if (res.exitCode == 0 && res.data) {
      popup(`[${enc.toUpperCase()} decode]\n\n${res.data.toString('utf8')}`);
    } else {
      logger.error(res.error?.toString('utf8'));
    }
  };
}

function encodeStrFn(enc: string): () => ProviderResult<any> {
  return async () => {
    const doc = await workspace.document;
    const range = await workspace.getSelectedRange('v', doc);
    if (!range) {
      return;
    }
    const text = doc.textDocument.getText(range);
    const res = await call_python('coder', 'encode_str', [text, enc]);
    if (res.exitCode == 0 && res.data) {
      const ed = TextEdit.replace(range, res.data.toString('utf8'));
      await doc.applyEdits([ed]);
    } else {
      logger.error(res.error?.toString('utf8'));
    }
  };
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-common works`);
  logger.info(`coc-ext-common works`);
  logger.info(workspace.getConfiguration('coc-ext.common'));
  logger.info(process.env.COC_VIMCONFIG);

  // const { nvim } = workspace;
  const formatProvider = new FormattingEditProvider();

  context.subscriptions.push(
    commands.registerCommand(
      'ext-debug',
      async () => {
        // const doc = await workspace.document;
        // logger.debug(doc.lineCount);
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

    workspace.registerKeymap(['v'], 'ext-encode-utf8', encodeStrFn('utf8'), {
      sync: false,
    }),

    workspace.registerKeymap(['v'], 'ext-encode-gbk', encodeStrFn('gbk'), {
      sync: false,
    }),

    workspace.registerKeymap(['v'], 'ext-decode-utf8', decodeStrFn('utf8'), {
      sync: false,
    }),

    workspace.registerKeymap(['v'], 'ext-decode-gbk', decodeStrFn('gbk'), {
      sync: false,
    }),

    workspace.registerKeymap(
      ['v'],
      'ext-decode-mime',
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

    languages.registerDocumentFormatProvider(
      [{ scheme: 'file', language: 'cpp' }],
      formatProvider,
      1,
    ),

    // sources.createSource({
    //   name: 'coc-ext-common completion source', // unique id
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
//         menu: '[coc-ext-common]',
//       },
//       {
//         word: 'TestCompletionItem 2',
//         menu: '[coc-ext-common]',
//       },
//     ],
//   };
// }
