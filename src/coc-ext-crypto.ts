import {
  Document,
  ExtensionContext,
  TextEdit,
  Uri,
  commands,
  events,
  workspace,
} from 'coc.nvim';
import minimatch from 'minimatch';
import path from 'path';
import { CryptoSetting, Execution } from './utils/types';
import { callShell, ExternalExecResponse } from './utils/externalexec';
import { fsStat, getFilesList } from './utils/file';
import { logger } from './utils/logger';
import {
  encodeAes256Str,
  decodeAes256Str,
  AES256Options,
} from './utils/decoder';
import { showNotification } from './utils/notify';

const g_conf_filename = 'coc-ext-crypto.json';

class CryptoHandler {
  private setting: CryptoSetting;
  private aes256key: AES256Options;
  private include_pattern: minimatch.IMinimatch[];
  private exclude_pattern: minimatch.IMinimatch[];
  private conf_path: string;

  private constructor(readonly conf: string, readonly cont: string) {
    this.conf_path = conf;
    this.setting = <CryptoSetting>JSON.parse(cont);
    this.aes256key = {
      password: this.setting.password,
      openssl: this.setting.openssl,
      prefix: 'enc_',
    };

    this.include_pattern = [];
    if (this.setting.includes) {
      this.setting.includes.forEach((str: string) => {
        this.include_pattern.push(this.newMinimatch(str));
      });
    }

    this.exclude_pattern = [
      this.newMinimatch(this.conf_path),
      this.newMinimatch(`**/${this.aes256key.prefix}*`),
    ];
    if (this.setting.excludes) {
      this.setting.excludes.forEach((str: string) => {
        this.exclude_pattern.push(this.newMinimatch(str));
      });
    }
  }

  public static async createAsync(
    conf_path: string
  ): Promise<CryptoHandler | null> {
    try {
      const content = await workspace.readFile(conf_path);
      return new CryptoHandler(conf_path, content);
    } catch (e) {
      showNotification(`parse config file ${conf_path} fail`);
      return null;
    }
  }

  private getEncryptCmd(output_file: string, input_file?: string): Execution {
    const args: string[] = [
      'enc',
      '-e',
      '-aes256',
      '-pbkdf2',
      '-pass',
      `pass:${this.setting.password}`,
      this.setting.salt ? '-salt' : '-nosalt',
      '-out',
      output_file,
    ];
    if (input_file && input_file.length != 0) {
      args.push('-in', input_file);
    }
    return {
      exec: this.setting.openssl ? this.setting.openssl : 'openssl',
      args,
    };
  }

  private getDecryptCmd(input_file: string, output_file?: string): Execution {
    const args: string[] = [
      'des',
      '-d',
      '-aes256',
      '-pbkdf2',
      '-pass',
      `pass:${this.setting.password}`,
      this.setting.salt ? '-salt' : '-nosalt',
      '-in',
      input_file,
    ];
    if (output_file && output_file.length != 0) {
      args.push('-out', output_file);
    }
    return {
      exec: this.setting.openssl ? this.setting.openssl : 'openssl',
      args,
    };
  }

  public shouldEncrypt(filepath: string): boolean {
    const fp = path.resolve(filepath);
    for (const p of this.exclude_pattern) {
      if (p.match(fp)) {
        return false;
      }
    }
    for (const p of this.include_pattern) {
      if (p.match(fp)) {
        return true;
      }
    }
    return false;
  }

  private newMinimatch(pattern: string): minimatch.IMinimatch {
    return new minimatch.Minimatch(path.resolve(pattern), {
      matchBase: true,
    });
  }

  public async getEncFilename(filename: string): Promise<string | null> {
    const dir = path.dirname(filename);
    const name = path.basename(filename);
    const new_name = await encodeAes256Str(name, this.aes256key);
    return new_name ? path.join(dir, new_name) : null;
  }

  public async getDesFilename(filename: string): Promise<string | null> {
    const dir = path.dirname(filename);
    const name = path.basename(filename);
    const new_name = await decodeAes256Str(name, this.aes256key);
    return new_name ? path.join(dir, new_name) : null;
  }

  public async encryptToFile(
    doc: Document
  ): Promise<ExternalExecResponse | null> {
    const filename = await this.getEncFilename(Uri.parse(doc.uri).fsPath);
    if (filename == null) {
      return null;
    }
    const cmd = this.getEncryptCmd(filename);
    return callShell(cmd.exec, cmd.args, doc.textDocument.getText());
  }

  public async encryptAllFiles() {
    const includes: string[] = [];
    if (this.setting.includes) {
      for (const i of this.setting.includes) {
        includes.push(path.resolve(i));
      }
    }
    const fl = await getFilesList(workspace.root, 'find');
    if (!fl) {
      showNotification('get file list fail');
      return;
    }
    for (const f of fl) {
      if (this.shouldEncrypt(f)) {
        const new_name = await this.getEncFilename(Uri.parse(f).fsPath);
        if (new_name == null) {
          continue;
        }
        const cmd = this.getEncryptCmd(new_name, f);
        const res = await callShell(cmd.exec, cmd.args);
        if (res.exitCode != 0) {
          logger.error(`encrypt ${f} fail`);
        }
      }
    }
  }

  public async decryptFromFile(doc: Document): Promise<boolean> {
    const filename = await this.getEncFilename(Uri.parse(doc.uri).fsPath);
    if (filename == null) {
      return false;
    }
    const cmd = this.getDecryptCmd(filename);
    const res = await callShell(cmd.exec, cmd.args);
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

  public isAutoEncrypt(): boolean {
    return this.setting.autoEnc != undefined && this.setting.autoEnc;
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-crypto works`);
  logger.info(`coc-ext-crypto works`);

  const conf_path = path.join(workspace.root, g_conf_filename);
  const stat = await fsStat(conf_path);
  if (!(!stat.error && stat.stats && stat.stats.isFile())) {
    return;
  }

  const handler = await CryptoHandler.createAsync(conf_path);
  if (!handler) {
    return;
  }

  context.subscriptions.push(
    commands.registerCommand('ext-decrypt', async () => {
      const doc = await workspace.document;
      await handler.decryptFromFile(doc);
    }),

    commands.registerCommand('ext-encrypt-all', async () => {
      handler.encryptAllFiles();
    })
  );

  if (handler.isAutoEncrypt()) {
    context.subscriptions.push(
      events.on('BufWritePost', async () => {
        logger.debug('?');
        const doc = await workspace.document;
        if (handler.shouldEncrypt(Uri.parse(doc.uri).fsPath)) {
          const res = await handler.encryptToFile(doc);
          if (!res) {
            logger.error('encrypt fail');
          }
          if (res && res.error) {
            logger.error(res.error);
          }
        }
      })
    );
  }
}
