import {
  commands,
  // CompleteResult,
  ExtensionContext,
  // listManager,
  // sources,
  // window,
  workspace,
  MapMode,
  ProviderResult,
} from 'coc.nvim';
// import DemoList from './utils/lists';
import GoogleTranslator from './utils/translators/google';
import BingTranslator from './utils/translators/bing';
import { BaseTranslator, ITranslation } from './utils/translators/base';
import { logger } from './utils/logger';
import { popup, getText } from './utils/helper';

function translateFn(mode: MapMode): () => ProviderResult<any> {
  return async () => {
    const text = await getText(mode);

    let translator: BaseTranslator = new GoogleTranslator();
    let trans: ITranslation | null = await translator.translate(
      text,
      'auto',
      'zh-CN',
    );
    if (!trans) {
      translator = new BingTranslator();
      trans = await translator.translate(text, 'auto', 'zh-CN');
    }

    if (trans) {
      await popup(`[${trans.engine}]\n\n${trans.paraphrase}`, 'ui_float');
    } else {
      await popup(`[Error]\n\ntranslate fail`);
    }
  };
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext works`);
  logger.info(`coc-ext works`);

  // const { nvim } = workspace;

  context.subscriptions.push(
    commands.registerCommand(
      'ext-text',
      async (_text: string) => {
        // window.showMessage(`test, ${text}`);
        // workspace.nvim.command(`echo "${text}"`);
        popup('hello');
      },
      { sync: false },
    ),

    workspace.registerKeymap(['n'], 'ext-translate', translateFn('n'), {
      sync: false,
    }),

    workspace.registerKeymap(['v'], 'ext-translate-v', translateFn('v'), {
      sync: false,
    }),

    // listManager.registerList(new DemoList(workspace.nvim))

    // sources.createSource({
    //   name: 'coc-ext completion source', // unique id
    //   doComplete: async () => {
    //     const items = await getCompletionItems();
    //     return items;
    //   },
    // })

    // workspace.registerKeymap(
    //   ['n'],
    //   'ext-keymap',
    //   async () => {
    //     window.showMessage(`registerKeymap`);
    //   },
    //   { sync: false }
    // )

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
//         menu: '[coc-ext]',
//       },
//       {
//         word: 'TestCompletionItem 2',
//         menu: '[coc-ext]',
//       },
//     ],
//   };
// }
