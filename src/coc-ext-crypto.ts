import {
  Document,
  ExtensionContext,
  TextEdit,
  Uri,
  commands,
  events,
  window,
  workspace,
} from 'coc.nvim';
import path from 'path';
import { CryptoSetting } from './utils/types';
import { logger } from './utils/logger';
import { call_shell, ExternalExecResponse } from './utils/externalexec';
import { fs_ex } from './utils/file';

function get_enc_filename(filename: string): string {
  const dir = path.dirname(filename);
  const name = path.basename(filename);
  return path.join(dir, `.${name}.encrypted`);
}

// function get_dec_filename(filename: string): string | undefined {
//   const dir = path.dirname(filename);
//   const name = path.basename(filename);

//   if (
//     name.length >= 12 &&
//     name[0] == '.' &&
//     name.substr(name.length - 10) == '.encrypted'
//   ) {
//     const new_name = name.substr(1, name.length - 11);
//     return path.join(dir, new_name);
//   }
//   return undefined;
// }

async function encrypt(
  doc: Document,
  setting: CryptoSetting
): Promise<ExternalExecResponse> {
  const exec = setting.openssl ? setting.openssl : 'openssl';
  const enc_filename = get_enc_filename(Uri.parse(doc.uri).fsPath);
  const argv: string[] = [
    'enc',
    '-e',
    '-aes256',
    '-pbkdf2',
    '-pass',
    `pass:${setting.password}`,
    setting.salt ? '-salt' : '-nosalt',
    '-out',
    enc_filename,
  ];
  return call_shell(exec, argv, doc.textDocument.getText());
}

async function decrypt(
  doc: Document,
  setting: CryptoSetting
): Promise<boolean> {
  const exec = setting.openssl ? setting.openssl : 'openssl';
  const enc_filename = get_enc_filename(Uri.parse(doc.uri).fsPath);
  const argv: string[] = [
    'des',
    '-d',
    '-salt',
    '-aes256',
    '-pbkdf2',
    '-pass',
    `pass:${setting.password}`,
    setting.salt ? '-salt' : '-nosalt',
    '-in',
    enc_filename,
  ];
  const res = await call_shell(exec, argv);
  if (res.error != undefined || res.data == undefined) {
    return false;
  }
  const ed = TextEdit.replace(
    {
      start: { line: 0, character: 0 },
      end: { line: doc.lineCount, character: 0 },
    },
    res.data.toString()
  );
  await doc.applyEdits([ed]);
  return true;
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-crypto works`);
  logger.info(`coc-ext-crypto works`);

  const confpath = path.join(workspace.root, '.crypto.json');
  let setting: CryptoSetting;
  try {
    const content = await workspace.readFile(confpath);
    setting = <CryptoSetting>JSON.parse(content);
  } catch (e) {
    window.showMessage(`open config file ${confpath} fail`);
    return;
  }

  if (!setting.output_dir) {
    window.showMessage(`no output_dir`);
    return;
  }
  const stats = await fs_ex.stat(setting.output_dir);
  if (
    stats.error != undefined ||
    (stats.stats != undefined && !stats.stats.isDirectory())
  ) {
    window.showMessage(`${setting.output_dir} was invalid`);
    return;
  }

  context.subscriptions.push(
    commands.registerCommand('ext-decrypt', async () => {
      const doc = await workspace.document;
      await decrypt(doc, setting);
    }),

    events.on('BufWritePost', async () => {
      const doc = await workspace.document;
      logger.debug(workspace.root);
      // const res = await encrypt(doc, setting);
      // if (res.error) {
      //   logger.error(res.error);
      // }
    })
  );
}
