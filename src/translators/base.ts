export interface ITranslation {
  engine: string;
  sl: string;
  tl: string;
  text: string;
  phonetic: string;
  paraphrase: string;
  explains: string[];
}

export function createTranslation(
  name: string,
  sl: string,
  tl: string,
  text: string,
): ITranslation {
  return {
    engine: name,
    sl: sl,
    tl: tl,
    text: text,
    explains: [],
    paraphrase: '',
    phonetic: '',
  };
}

export function urlencode(data: Record<string, string>): string {
  return Object.keys(data)
    .map(key => [key, data[key]].map(encodeURIComponent).join('='))
    .join('&');
}
