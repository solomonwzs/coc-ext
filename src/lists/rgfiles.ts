import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import path from 'path';
import { callShell } from '../utils/externalexec';
import { getDefxIcon } from '../utils/icons';
import { logger } from '../utils/logger';
import { openFile } from '../utils/helper';
import { showNotification } from '../utils/notify';

export default class RgfilesList extends BasicList {
  public readonly name = 'rgfiles';
  public readonly description = 'CocList for coc-ext-common (rg files)';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  private async actionOpenSplit(item: ListItem, context: ListContext) {
    await openFile(item.data['name'], {
      open: 'sp',
      key: context.args[0],
    });
  }

  constructor(_nvim: Neovim) {
    super();
    this.addAction('open', async (item: ListItem, context: ListContext) => {
      await openFile(item.data['name'], {
        key: context.args[0],
      });
    });

    this.addAction('preview', async (item: ListItem, context: ListContext) => {
      const resp = await callShell(
        'rg',
        [
          '-B',
          '3',
          '-C',
          '3',
          '--color',
          'never',
          '--context-separator',
          '\\\\n================\\\\n',
          context.args[0],
          item.data['name'],
        ],
        undefined,
        { shell: true }
      );
      if (resp.exitCode != 0 || !resp.data) {
        logger.error('rg fail');
        return;
      }
      const lines = resp.data.toString().split('\n');
      this.preview({ bufname: item.data['name'], lines }, context);

      const prew_wid = await this.nvim.call('coc#list#get_preview', 0);
      await this.nvim.call('matchadd', [
        'Search',
        `\\v${context.args[0]}`,
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

    const pattern = `"${context.args[0].replace(/"/g, '\\"')}"`;
    const args = [
      '--files-with-matches',
      '--color',
      'never',
      '--count-matches',
      pattern,
    ];
    const resp = await callShell('rg', args, undefined, { shell: true });
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
      const arr = i.split(':');

      const extname = path.extname(arr[0]).slice(1);
      const icon = await getDefxIcon(extname, arr[0]);
      const label = `${icon.icon}  ${arr[0]}  [${arr[1]}]`;

      const offset0 = Buffer.byteLength(icon.icon);
      const offset1 = offset0 + 2 + Buffer.byteLength(arr[0]) + 2;
      items.push({
        label,
        data: { name: arr[0] },
        ansiHighlights: [
          {
            span: [0, offset0],
            hlGroup: icon.hlGroup ? icon.hlGroup : 'Normal',
          },
          {
            span: [offset1, offset1 + arr[1].length + 2],
            hlGroup: 'Number',
          },
        ],
      });
    }
    return items;
  }
}
