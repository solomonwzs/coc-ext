export declare type ActionMode = 'popup' | 'echo' | 'replace' | undefined;

export declare type KeymapMode = 'v' | 'n' | undefined;

export declare type Nullable<T> = T | null | undefined;

export interface ExecutionInfo {
  execPath: string;
  moduleName?: string;
  args: string[];
}

export interface FormatterSetting {
  lang: string;
  provider: string;
  exec?: string;
  args?: string[];
  clangFormStyle?: Record<string, string>;
}
