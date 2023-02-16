import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import { AutocmdInfo } from '../utils/types';
// import { logger } from '../utils/logger';
import { strFindFirstOf, strFindFirstNotOf } from '../utils/common';

export interface AutocmdGroupInfo {
  group: string;
  event: string;
  infos: AutocmdInfo[];
}

export function parseAutocmdInfo(str: string): AutocmdGroupInfo[] {
  let lines = str.split('\n');
  let group = '';
  let event = '';
  let pattern = '';
  let setting = '';
  let infos: AutocmdInfo[] = [];
  let res: AutocmdGroupInfo[] = [];

  const f_push_info = (file: string, line: number) => {
    infos.push({
      group,
      event,
      pattern,
      setting,
      file,
      line,
    });
    pattern = '';
    setting = '';
  };

  const spaces = new Set<string>([' ', '\t']);
  for (const l of lines) {
    const sn = strFindFirstNotOf(l, spaces);
    if (sn == 0) {
      // group name
      let arr = l.split(/\s+/);
      if (arr.length == 2 && arr[0] != '') {
        if (pattern != '') {
          f_push_info('', 0);
        }
        if (group != '') {
          res.push({
            group,
            event,
            infos,
          });
          infos = [];
        }

        group = arr[0];
        event = arr[1];
      }
    } else if (sn == 4) {
      // pattern & setting
      if (pattern != '') {
        f_push_info('', 0);
      }
      setting = '';

      const ltmp = l.slice(sn);
      const offset0 = strFindFirstOf(ltmp, spaces);
      if (offset0 == -1) {
        pattern = ltmp;
      } else {
        pattern = ltmp.slice(0, offset0);

        const offset1 = strFindFirstNotOf(ltmp.slice(offset0), spaces);
        if (offset1 != -1) {
          setting = ltmp.slice(offset0 + offset1);
        }
      }
    } else if (sn == 14) {
      // setting
      const ltmp = l.slice(sn);
      if (setting != '') {
        setting = ltmp;
      } else {
        setting += ` ${ltmp}`;
      }
    } else if (sn == 1 && l[0] == '\t') {
      // file
      let arr = l.split(/\s+/);
      if (arr.length == 7) {
        f_push_info(arr[4], parseInt(arr[6]));
      }
    }
  }
  // logger.debug(res);
  return res;
}

export default class AutocmdList extends BasicList {
  public readonly name = 'autocmd';
  public readonly description = 'CocList for coc-ext-common (autocmd)';
  public readonly defaultAction = 'preview';
  public actions: ListAction[] = [];

  constructor(_nvim: Neovim) {
    super();

    this.addAction('preview', async (item: ListItem, context: ListContext) => {
      if (!item.data) {
        return;
      }
      let lines: string[] = [];
      for (const i of item.data.infos as AutocmdInfo[]) {
        lines.push(i.pattern);
        lines.push(`    ${i.setting}`);
        if (i.file != '') {
          lines.push(`    => ${i.file}:${i.line}`);
        }
        lines.push('');
      }
      this.preview({ filetype: 'vim', lines }, context);
    });
  }

  public async loadItems(_context: ListContext): Promise<ListItem[] | null> {
    const { nvim } = this;
    let str = await nvim.exec('verbose autocmd', true);
    const infos = parseAutocmdInfo(str);

    let max_gn_len = 0;
    let max_en_len = 0;
    for (const i of infos) {
      if (i.group.length > max_gn_len) {
        max_gn_len = i.group.length;
      }
      if (i.event.length > max_en_len) {
        max_en_len = i.event.length;
      }
    }

    const res: ListItem[] = [];
    for (const i of infos) {
      const spaces0 = ' '.repeat(max_gn_len - i.group.length + 2);
      const spaces1 = ' '.repeat(max_en_len - i.event.length + 2);
      const label = `${i.group}${spaces0}${i.event}${spaces1}(${i.infos.length})`;
      res.push({
        label,
        data: i,
        ansiHighlights: [
          { span: [0, i.group.length], hlGroup: 'Define' },
          {
            span: [max_gn_len + 2, max_gn_len + 2 + i.event.length],
            hlGroup: 'Special',
          },
        ],
      });
    }
    return res;
  }
}
