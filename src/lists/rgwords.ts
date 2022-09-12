import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import path from 'path';
import { callShell } from '../utils/externalexec';
import { getDefxIcon } from '../utils/icons';
import { logger } from '../utils/logger';
import { openFile } from '../utils/helper';
// import { fsRead } from '../utils/file';
import { showNotification } from '../utils/notify';

interface RgMatchData {
  type: string;
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
  };
}

export default class RgwordsList extends BasicList {
  public readonly name = 'rgwords';
  public readonly description = 'CocList for coc-ext-common (rg words)';
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
      const resp = await callShell('cat', [item.data['name']]);
      if (resp.exitCode != 0 || !resp.data) {
        return;
      }
      const lines = resp.data.toString().split('\n');
      this.preview(
        { filetype: item.data['filetype'], lines, lnum: item.data['line'] },
        context
      );

      const prew_wid = await this.nvim.call('coc#list#get_preview', 0);
      await this.nvim.call('matchadd', [
        'Search',
        `\\v${context.args[0]}`,
        9,
        -1,
        { window: prew_wid },
      ]);
      await this.nvim.call('win_execute', [
        prew_wid,
        `call matchadd('TermCursor', '\\%${item.data['line']}l', 8, -1, {'window': ${prew_wid}})`,
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
    // const wid = await this.nvim.call('winnr');
    // logger.debug(wid);

    const args = [context.args[0], '--color', 'never', '--json'];
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
      const match = JSON.parse(i) as RgMatchData;
      if (match.type != 'match') {
        continue;
      }

      const filename = match.data.path.text;
      const line = match.data.line_number;
      const extname = path.extname(filename).slice(1);
      const icon = await getDefxIcon(extname, filename);
      const label = `${icon.icon}  ${filename}:${line}:${match.data.lines.text}`;

      const offset0 = Buffer.byteLength(icon.icon);
      const offset1 = offset0 + 2 + Buffer.byteLength(filename) + 2;
      items.push({
        label,
        data: { name: filename, filetype: extname, line },
        // ansiHighlights: [
        //   {
        //     span: [0, offset0],
        //     hlGroup: icon.hlGroup ? icon.hlGroup : 'Normal',
        //   },
        //   {
        //     span: [offset1, offset1 + line.length + 2],
        //     hlGroup: 'Number',
        //   },
        // ],
      });
    }
    return items;
  }
}
