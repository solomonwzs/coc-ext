import {
  Document,
  ExtensionContext,
  MapMode,
  ProviderResult,
  Range,
  TextEdit,
  commands,
  languages,
  listManager,
  window,
  workspace,
} from 'coc.nvim';
import AutocmdList from './lists/autocmd';
import CommandsList from './lists/commands';
import ExtList from './lists/lists';
import HighlightList from './lists/highlight';
import MapkeyList from './lists/mapkey';
import RgfilesList from './lists/rgfiles';
import RgwordsList from './lists/rgwords';
import getcfg from './utils/config';
import { FormattingEditProvider } from './formatter/formatprovider';
import { LangFormatterSetting, FormatterSetting } from './utils/types';
import { bingTranslate } from './translators/bing';
import {
  callPython,
  callShell,
  ExternalExecResponse,
} from './utils/externalexec';
import { debug } from './utils/debug';
import { decode_mime_encode_str } from './utils/decoder';
import { getCursorSymbolList } from './utils/symbol';
import { googleTranslate } from './translators/google';
import { logger } from './utils/logger';
import { popup, getText } from './utils/helper';
import { leader_recv } from './leaderf/leaderf';

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
  zsh: shFmtSetting,
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

async function getCursorSymbolInfo(): Promise<any> {
  const infoList = await getCursorSymbolList();
  if (!infoList) {
    return;
  }
  let msg = '';
  let space = ' ';
  for (const i of infoList) {
    const line = `[${i.short_name}] ${i.name}`;
    if (msg.length == 0) {
      msg = ` ${line}`;
    } else {
      msg += `\n${space} ${line}`;
      space += ' ';
    }
  }
  await popup(msg);
}

function translateFn(mode: MapMode): () => ProviderResult<any> {
  return async () => {
    const text = await getText(mode);
    let trans = await bingTranslate(text, 'auto', 'zh-CN');
    if (!trans) {
      trans = await googleTranslate(text, 'auto', 'zh-CN');
    }

    if (trans) {
      await popup(trans.paraphrase, `[${trans.engine}]`);
    } else {
      await popup('translate fail', '[Error]');
    }
  };
}

function decodeStrFn(enc: string): () => ProviderResult<any> {
  return async () => {
    const pythonDir = getcfg<string>('pythonDir', '');
    const text = await getText('v');
    const res = await callPython(pythonDir, 'coder', 'decode_str', [text, enc]);
    if (res.exitCode == 0 && res.data) {
      popup(res.data.toString('utf8'), `[${enc.toUpperCase()} decode]`);
    } else {
      logger.error(res.error?.toString('utf8'));
    }
  };
}

function encodeStrFn(enc: string): () => ProviderResult<any> {
  return async () => {
    const range = await window.getSelectedRange('v');
    if (!range) {
      return;
    }

    const pythonDir = getcfg<string>('pythonDir', '');
    const doc = await workspace.document;
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

    commands.registerCommand('ext-debug', debug, { sync: true }),
    commands.registerCommand('ext-leaderf', leader_recv, { sync: true }),

    workspace.registerKeymap(['n'], 'ext-cursor-symbol', getCursorSymbolInfo, {
      sync: false,
    }),

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
      'ext-copy-xclip',
      async () => {
        logger.debug('===');
        const text = await getText('v', 0);
        await callShell('xclip', ['-selection', 'clipboard', '-i'], text);
      },
      { sync: false }
    ),

    workspace.registerKeymap(
      ['v'],
      'ext-change-name-rule',
      async () => {
        const range = await window.getSelectedRange('v');
        if (!range) {
          return;
        }

        const pythonDir = getcfg<string>('pythonDir', '');
        const doc = await workspace.document;
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
        popup(tt, '[Mime decode]');
      },
      {
        sync: false,
      }
    ),

    listManager.registerList(new ExtList(workspace.nvim)),
    listManager.registerList(new CommandsList(workspace.nvim)),
    listManager.registerList(new MapkeyList(workspace.nvim)),
    listManager.registerList(new RgfilesList(workspace.nvim)),
    listManager.registerList(new RgwordsList(workspace.nvim)),
    listManager.registerList(new AutocmdList(workspace.nvim)),
    listManager.registerList(new HighlightList(workspace.nvim))

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
