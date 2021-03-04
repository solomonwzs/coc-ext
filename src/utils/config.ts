import { workspace } from 'coc.nvim';

export default function getcfg<T>(key: string, defaultValue: T): T {
  const config = workspace.getConfiguration('coc-ext');
  return config.get<T>(key, defaultValue);
}
