import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import { callShell } from '../utils/externalexec';
import { showNotification } from '../utils/notify';
import { logger } from '../utils/logger';
import { getDefxIcon } from '../utils/icons';
import path from 'path';
// import { URI } from 'vscode-uri';

export default class RgList extends BasicList {
  public readonly name = 'rg';
  public readonly description = 'CocList for coc-ext-common (rg)';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);
    this.addAction('open', async (item: ListItem, _context: ListContext) => {
      await this.jumpTo(path.resolve(item.data['name']));
    });
    this.addAction('preview', async (item: ListItem, context: ListContext) => {
      let resp = await callShell('rg', [
        '-B',
        '3',
        '-C',
        '3',
        context.args[0],
        item.data['name'],
      ]);
      if (resp.exitCode != 0 || !resp.data) {
        return;
      }
      let lines = resp.data.toString().split('\n');
      this.preview({ filetype: item.data['filetype'], lines }, context);
    });
  }

  public async loadItems(context: ListContext): Promise<ListItem[] | null> {
    if (context.args.length == 0) {
      return null;
    }

    const args = [context.args[0], '--files-with-matches', '--color', 'never'];
    let resp = await callShell('rg', args);
    if (resp.exitCode != 0) {
      logger.error('rg fail');
      if (resp.error) {
        showNotification(resp.error.toString());
      }
      return null;
    }

    if (!resp.data) {
      logger.error('no data');
      return null;
    }

    let list = resp.data.toString().split('\n');
    list.pop();

    const items: ListItem[] = [];
    for (const i of list) {
      let extname = path.extname(i).slice(1);
      let icon = await getDefxIcon(extname, i);
      let label = `${icon.icon}  ${i}`;
      items.push({
        label,
        data: { name: i, filetype: extname },
        ansiHighlights: icon.hlGroup
          ? [
              {
                span: [0, Buffer.byteLength(icon.icon)],
                hlGroup: icon.hlGroup,
              },
            ]
          : undefined,
      });
    }
    return items;
  }
}
