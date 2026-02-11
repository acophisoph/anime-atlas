import en from './en';
import ja from './ja';
import type { Lang } from '../lib/types';

export const dict = { en, ja };

export function localizeTitle(title: { romaji?: string; english?: string; native?: string }, lang: Lang) {
  if (lang === 'ja') return title.native || title.romaji || title.english || 'Unknown';
  return title.english || title.romaji || title.native || 'Unknown';
}

export function localizeSecondary(title: { romaji?: string; english?: string; native?: string }, lang: Lang) {
  if (lang === 'ja') return title.english || title.romaji || '';
  return title.native || '';
}
