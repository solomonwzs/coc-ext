import { commands, workspace, ExtensionContext, Uri } from 'coc.nvim';
import path from 'path';
import { logger } from './utils/logger';

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext-crypto works`);
  logger.info(`coc-ext-crypto works`);

  context.subscriptions.push(
    commands.registerCommand('ext-crypto', async () => {
      const doc = await workspace.document;
      logger.debug(doc.uri);
      logger.debug(Uri.parse(doc.uri).fsPath);
      logger.debug(path.join(workspace.root, '../*'));
    })
  );
}
