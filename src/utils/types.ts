export declare type ActionMode = 'popup' | 'echo' | 'replace' | undefined;

export declare type KeymapMode = 'v' | 'n' | undefined;

export declare type Nullable<T> = T | null | undefined;

export interface Execution {
  exec: string;
  args: string[];
}

export interface FormatterSetting {
  provider: string;
  exec?: string;
  args?: string[] | Record<string, string>;
}

export interface LangFormatterSetting {
  languages: string[];
  setting: FormatterSetting;
}

export interface CryptoSetting {
  password: string;
  openssl?: string;
  autoEnc?: boolean;
  salt?: boolean;
  includes?: string[];
  excludes?: string[];
}

export interface SimpleSymbolInfo {
  name: string;
  short_name: string;
  detail?: string;
  kind: string;
  icon: string;
}

export interface DefxIcosInfo {
  term_color: number;
  icon: string;
  color: string;
  hlGroup?: string;
}

export interface DefxIcos {
  icons: {
    extensions: Map<string, DefxIcosInfo>;
    exact_matches: Map<string, DefxIcosInfo>;
    pattern_matches: Map<string, DefxIcosInfo>;
  };
  setting: Map<string, number>;
}

export interface HighlightInfo {
  group_name: string;
  desc: string;
  last_set_file: string;
  line: number;
}

export interface AutocmdInfo {
  group: string;
  event: string;
  pattern: string;
  setting: string;
  file: string;
  line: number;
}

export interface MapkeyInfo {
  mode: string;
  key: string;
  desc: string;
  last_set_file: string;
  line: number;
}

export interface OpenOptions {
  open?: string;
  key?: string;
  line?: number;
  column?: number;
}

export interface RgMatchData {
  type: string;
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
  };
}

export interface CallShellOptions {
  shell?: boolean;
}

export interface CocExtFloatConfig {
  border?: boolean;
  highlight?: string;
  borderhighlight?: string;
  maxHeight?: number;
  maxWidth?: number;
}
