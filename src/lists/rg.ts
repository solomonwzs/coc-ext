import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import path from 'path';
import { callShell } from '../utils/externalexec';
import { getDefxIcon } from '../utils/icons';
import { logger } from '../utils/logger';
import { openFile } from '../utils/helper';
import { showNotification } from '../utils/notify';

export default class RgList extends BasicList {
  public readonly name = 'rg';
  public readonly description = 'CocList for coc-ext-common (rg)';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  private async actionOpenSplit(item: ListItem, context: ListContext) {
    await openFile(item.data['name'], {
      open: 'sp',
      key: context.args[0],
    });
  }

  constructor(nvim: Neovim) {
    super(nvim);
    this.addAction('open', async (item: ListItem, context: ListContext) => {
      await openFile(item.data['name'], {
        key: context.args[0],
      });
    });

    this.addAction('preview', async (item: ListItem, context: ListContext) => {
      const resp = await callShell('rg', [
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
      const lines = resp.data.toString().split('\n');
      this.preview({ filetype: item.data['filetype'], lines }, context);

      const prew_wid = await this.nvim.call('coc#list#get_preview', 0);
      await this.nvim.call('matchadd', [
        'Search',
        context.args[0],
        9,
        -1,
        { window: prew_wid },
      ]);
      // const wids = await this.nvim.call('getmatches', prew_wid);
      // logger.debug(wids);
    });

    this.addAction('ctrl-x', this.actionOpenSplit);
  }

  public async loadItems(context: ListContext): Promise<ListItem[] | null> {
    if (context.args.length == 0) {
      return null;
    }

    const args = [context.args[0], '--files-with-matches', '--color', 'never'];
    const resp = await callShell('rg', args);
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
