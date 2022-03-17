import {
  LanguageClient,
  workspace,
  ExtensionContext,
  LanguageClientOptions,
  TransportKind,
  ServerOptions,
  window,
} from 'coc.nvim';
import { logger } from './utils/logger';
import getcfg from './utils/config';

let client: LanguageClient;

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-erlang works`);
  logger.info(`coc-ext-erlang works`);
  logger.info(workspace.getConfiguration('coc-ext.erlang'));

  const server_path: string = getcfg<string>(
    'erlang.erlangLsPath',
    '/bin/erlang_ls',
  );

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'erlang' }],
    initializationOptions: '',
  };

  const serverArgs = ['--transport', 'stdio'];

  const serverOptions: ServerOptions = {
    command: server_path,
    args: serverArgs,
    transport: TransportKind.stdio,
  };

  client = new LanguageClient('erlang_ls', serverOptions, clientOptions);
  client.start();

  client.onReady().then(() => {
    // client.registerProposedFeatures();
    // workspace.showMessage('coc-erlang_ls is ready');
    window.showMessage(`coc-erlangls is ready`);
  });
}

// export function deactivate(): Thenable<void> | undefined {
//   if (!client) {
//     return undefined;
//   }
//   return client.stop();
// }
