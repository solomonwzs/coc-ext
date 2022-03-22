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
import { googleTranslate } from './translators/google';
import { bingTranslate } from './translators/bing';
import { logger } from './utils/logger';
import { popup, getText } from './utils/helper';
import { decode_mime_encode_str } from './utils/decoder';
import { callPython, ExternalExecResponse } from './utils/externalexec';
import { FormattingEditProvider } from './formatter/formatprovider';
import { LangFormatterSetting, FormatterSetting } from './utils/types';
import getcfg from './utils/config';
import { debug } from './utils/debug';

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
    let trans = await googleTranslate(text, 'auto', 'zh-CN');
    if (!trans) {
      trans = await bingTranslate(text, 'auto', 'zh-CN');
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
    const pythonDir = getcfg<string>('pythonDir', '');
    const text = await getText('v');
    const res = await callPython(pythonDir, 'coder', 'decode_str', [text, enc]);
    if (res.exitCode == 0 && res.data) {
      popup(`[${enc.toUpperCase()} decode]\n\n${res.data.toString('utf8')}`);
    } else {
      logger.error(res.error?.toString('utf8'));
    }
  };
}

function encodeStrFn(enc: string): () => ProviderResult<any> {
  return async () => {
    const pythonDir = getcfg<string>('pythonDir', '');
    const doc = await workspace.document;
    const range = await workspace.getSelectedRange('v', doc);
    if (!range) {
      return;
    }
    const text = doc.textDocument.getText(range);
    const res = await callPython(pythonDir, 'coder', 'encode_str', [text, enc]);
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

  // const timer = setInterval(async () => {
  //   logger.debug('...');
  // }, 500);

  context.subscriptions.push(
    // {
    //   dispose() {
    //     clearInterval(timer);
    //   },
    // },

    commands.registerCommand('ext-debug', debug, { sync: false }),

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
        const pythonDir = getcfg<string>('pythonDir', '');
        const doc = await workspace.document;
        const range = await workspace.getSelectedRange('v', doc);
        if (!range) {
          return;
        }
        const name = doc.textDocument.getText(range);
        const res = await callPython(pythonDir, 'common', 'change_name_rule', [
          name,
        ]);
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
