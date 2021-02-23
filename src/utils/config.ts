import { workspace } from 'coc.nvim';

export default function getcfg<T>(
  key: string,
  defaultValue?: T,
): T | undefined {
  const config = workspace.getConfiguration('coc-solomon-ext');
  return defaultValue === undefined
    ? config.get<T>(key)
    : config.get<T>(key, defaultValue);
}
