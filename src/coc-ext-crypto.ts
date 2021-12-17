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
import minimatch from 'minimatch';
import path from 'path';
import { CryptoSetting } from './utils/types';
import { call_shell, ExternalExecResponse } from './utils/externalexec';
import { fs_ex } from './utils/file';
import { logger } from './utils/logger';
import {
  encode_aes256_str,
  decode_aes256_str,
  AES256Options,
} from './utils/decoder';
import fs from 'fs';

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
      window.showMessage(`parse config file ${conf_path} fail`);
      return null;
    }
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
    const new_name = await encode_aes256_str(name, this.aes256key);
    return new_name ? path.join(dir, new_name) : null;
  }

  public async getDesFilename(filename: string): Promise<string | null> {
    const dir = path.dirname(filename);
    const name = path.basename(filename);
    const new_name = await decode_aes256_str(name, this.aes256key);
    return new_name ? path.join(dir, new_name) : null;
  }

  public async encryptToFile(
    doc: Document
  ): Promise<ExternalExecResponse | null> {
    const exec = this.setting.openssl ? this.setting.openssl : 'openssl';
    const filename = await this.getEncFilename(Uri.parse(doc.uri).fsPath);
    if (filename == null) {
      return null;
    }
    const argv: string[] = [
      'enc',
      '-e',
      '-aes256',
      '-pbkdf2',
      '-pass',
      `pass:${this.setting.password}`,
      this.setting.salt ? '-salt' : '-nosalt',
      '-out',
      filename,
    ];
    return call_shell(exec, argv, doc.textDocument.getText());
  }

  public async decryptFromFile(doc: Document): Promise<boolean> {
    const exec = this.setting.openssl ? this.setting.openssl : 'openssl';
    const filename = await this.getEncFilename(Uri.parse(doc.uri).fsPath);
    if (filename == null) {
      return false;
    }
    const argv: string[] = [
      'des',
      '-d',
      '-aes256',
      '-pbkdf2',
      '-pass',
      `pass:${this.setting.password}`,
      this.setting.salt ? '-salt' : '-nosalt',
      '-in',
      filename,
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

  public isAutoEncrypt(): boolean {
    return this.setting.auto_enc != undefined && this.setting.auto_enc;
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-crypto works`);
  logger.info(`coc-ext-crypto works`);

  fs.readdir('.', (err, files) => {
    files.forEach((file) => {
      logger.info(file);
    });
  });

  const conf_path = path.join(workspace.root, g_conf_filename);
  const stat = await fs_ex.stat(conf_path);
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
