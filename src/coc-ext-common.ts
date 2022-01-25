import {
  // CompleteResult,
  // DocumentSelector,
  ExtensionContext,
  // FloatFactory,
  MapMode,
  ProviderResult,
  TextEdit,
  commands,
  languages,
  listManager,
  // sources,
  // window,
  workspace,
  Document,
  Range,
} from 'coc.nvim';
import ExtList from './lists/lists';
import CommandsList from './lists/commands';
import MapkeyList from './lists/mapkey';
import { google_translate } from './translators/google';
import { bing_translate } from './translators/bing';
import { logger } from './utils/logger';
import { popup, getText } from './utils/helper';
import { decode_mime_encode_str } from './utils/decoder';
import { call_python, ExternalExecResponse } from './utils/externalexec';
import { FormattingEditProvider } from './formatter/formatprovider';
import { LangFormatterSetting, FormatterSetting } from './utils/types';
import getcfg from './utils/config';

const cppFmtSetting: FormatterSetting = {
  provider: 'clang-format',
  args: {
    AlignConsecutiveMacros: 'true',
    AlignEscapedNewlines: 'Left',
    AllowShortFunctionsOnASingleLine: 'Inline',
    BasedOnStyle: 'Google',
    Standard: 'C++11',
  },
};

const jsFmtSetting: FormatterSetting = {
  provider: 'prettier',
  args: ['--config-precedence', 'cli-override', '--print-width', '80'],
};

const bzlFmtSteeing: FormatterSetting = {
  provider: 'bazel-buildifier',
};

const luaFmtSteeing: FormatterSetting = {
  provider: 'lua-format',
  args: ['--column-table-limit=80'],
};

const shFmtSetting: FormatterSetting = {
  provider: 'shfmt',
  args: ['-i', '4'],
};

const defaultFmtSetting: Record<string, FormatterSetting> = {
  c: cppFmtSetting,
  cpp: cppFmtSetting,
  typescript: jsFmtSetting,
  json: jsFmtSetting,
  javascript: jsFmtSetting,
  html: jsFmtSetting,
  bzl: bzlFmtSteeing,
  lua: luaFmtSteeing,
  sh: shFmtSetting,
};

async function replaceExecText(
  doc: Document,
  range: Range,
  res: ExternalExecResponse
) {
  if (res.exitCode == 0 && res.data) {
    const ed = TextEdit.replace(range, res.data.toString('utf8'));
    await doc.applyEdits([ed]);
  } else {
    logger.error(res.error?.toString('utf8'));
  }
}

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
    const python_dir = getcfg<string>('python_dir', '');
    const text = await getText('v');
    const res = await call_python(python_dir, 'coder', 'decode_str', [
      text,
      enc,
    ]);
    if (res.exitCode == 0 && res.data) {
      popup(`[${enc.toUpperCase()} decode]\n\n${res.data.toString('utf8')}`);
    } else {
      logger.error(res.error?.toString('utf8'));
    }
  };
}

function encodeStrFn(enc: string): () => ProviderResult<any> {
  return async () => {
    const python_dir = getcfg<string>('python_dir', '');
    const doc = await workspace.document;
    const range = await workspace.getSelectedRange('v', doc);
    if (!range) {
      return;
    }
    const text = doc.textDocument.getText(range);
    const res = await call_python(python_dir, 'coder', 'encode_str', [
      text,
      enc,
    ]);
    replaceExecText(doc, range, res);
  };
}

function addFormatter(
  context: ExtensionContext,
  lang: string,
  setting: FormatterSetting
) {
  const selector = [{ scheme: 'file', language: lang }];
  const provider = new FormattingEditProvider(setting);
  context.subscriptions.push(
    languages.registerDocumentFormatProvider(selector, provider, 1)
  );
  if (provider.supportRangeFormat()) {
    context.subscriptions.push(
      languages.registerDocumentRangeFormatProvider(selector, provider, 1)
    );
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-common works`);
  logger.info(`coc-ext-common works`);
  logger.info(workspace.getConfiguration('coc-ext.common'));
  logger.info(process.env.COC_VIMCONFIG);

  // const { nvim } = workspace;
  const langFmtSet = new Set<string>();
  const formatterSettings = getcfg<LangFormatterSetting[]>('formatting', []);
  formatterSettings.forEach((s) => {
    s.languages.forEach((lang) => {
      langFmtSet.add(lang);
      addFormatter(context, lang, s.setting);
    });
  });
  for (const k in defaultFmtSetting) {
    if (!langFmtSet.has(k)) {
      addFormatter(context, k, defaultFmtSetting[k]);
    }
  }

  context.subscriptions.push(
    commands.registerCommand(
      'ext-debug',
      async () => {
        const id: number = await workspace.nvim.call('ui#window#new', {
          position: 'top',
        });
        const w = workspace.nvim.createWindow(id);
        logger.info(w.id);

        const doc = await workspace.document;
        const ed = TextEdit.replace(
          {
            start: { line: 0, character: 0 },
            end: { line: doc.lineCount, character: 0 },
          },
          'hello world'
        );
        await doc.applyEdits([ed]);
        await workspace.nvim.command('setlocal nomodifiable');

        // const doc = [{
        //   content: '[title]\n\nabc@edf.com',
        //   filetype: 'markdown',
        // }]
        // const win = new FloatFactory(workspace.nvim);
        // await win.show(doc);

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
      { sync: false }
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
      'ext-change-name-rule',
      async () => {
        const python_dir = getcfg<string>('python_dir', '');
        const doc = await workspace.document;
        const range = await workspace.getSelectedRange('v', doc);
        if (!range) {
          return;
        }
        const name = doc.textDocument.getText(range);
        const res = await call_python(
          python_dir,
          'common',
          'change_name_rule',
          [name]
        );
        replaceExecText(doc, range, res);
      },
      {
        sync: false,
      }
    ),

    workspace.registerKeymap(
      ['v'],
      'ext-decode-mime',
      async () => {
        const text = await getText('v');
        const tt = decode_mime_encode_str(text);
        popup(`[Mime decode]\n\n${tt}`, 'ui_float');
      },
      {
        sync: false,
      }
    ),

    listManager.registerList(new ExtList(workspace.nvim)),
    listManager.registerList(new CommandsList(workspace.nvim)),
    listManager.registerList(new MapkeyList(workspace.nvim))

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
