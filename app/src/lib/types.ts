export type Scope = 'ANIME' | 'MANGA' | 'BOTH';
export type Lang = 'en' | 'ja';

export type Media = {
  id: number;
  type: 'ANIME' | 'MANGA';
  title: { romaji?: string; english?: string; native?: string };
  year: number;
  format?: string;
  popularity?: number;
  averageScore?: number;
  genres: string[];
  tags: { name: string; rank: number }[];
  siteUrl?: string;
  relations: { id: number; relationType: string }[];
  staff?: { personId: number; roleRaw: string; roleGroup: string }[];
  characters?: {
    characterId: number;
    role: string;
    voiceActorsJP: { id: number; name: any; siteUrl?: string }[];
    voiceActorsEN: { id: number; name: any; siteUrl?: string }[];
  }[];
};

export type SocialLink = {
  label: string;
  url: string;
};

export type Person = {
  id: number;
  name: { full?: string; native?: string; alternative?: string[] };
  siteUrl?: string;
  socialLinks?: SocialLink[];
};

export type PointRecord = { id: number; type: 0 | 1; x: number; y: number; cluster: number; year: number };
