export type Mode = 'media' | 'people';
export type Lang = 'en' | 'jp';

export interface Manifest {
  version: number;
  generated_at: number;
  last_ingest_run_timestamp: number | null;
  total_media_in_db: number;
  total_people_in_db: number;
  completed_batches_count: number;
  pending_batches_count: number;
  failed_batches_count: number;
  completeness: {
    has_staff_for_all_media: boolean;
    has_characters_for_all_media: boolean;
    is_partial: boolean;
  };
  artifacts: {
    points_count: number;
    media_chunk_count: number;
    people_chunk_count: number;
  };
}

export interface Point {
  id: number;
  kind: 'media' | 'person';
  x: number;
  y: number;
  popularity: number;
  averageScore: number;
  colorRGB: number; // packed 0xRRGGBB
}

export interface Cluster {
  id: number;
  x: number;
  y: number;
  size: number;
  label: string;
}

export interface MediaMeta {
  id: number;
  type: string;
  format: string | null;
  seasonYear: number | null;
  popularity: number;
  averageScore: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null; color: string | null };
  genres: string[];
  tags: Array<{ id: number; name: string; category: string; rank: number; isAdult: boolean }>;
  studios: Array<{ id: number; name: string; isAnimationStudio: boolean }>;
}

export interface PersonMeta {
  id: number;
  nameFull: string | null;
  nameNative: string | null;
  language: string | null;
  imageLarge: string | null;
  siteUrl: string | null;
  description: string | null;
  topCredits?: Array<{ mediaId: number; role: string; title: string; year: number | null }>;
}

export interface SearchEntry {
  id: number;
  kind: 'media' | 'person';
  en: string;
  jp: string;
  ro: string;
  year?: number;
  type?: string;
  isAdult?: boolean;   // populated after next ingest rebuild
  genres?: string;     // comma-separated genre list (for client-side filter)
}

export interface GraphNode {
  edgeOffset: number;
}

export interface GraphEdge {
  targetId: number;
  weight: number;
  edgeType: number;
}

export interface Graph {
  nodeCount: number;
  edgeCount: number;
  nodes: Map<number, { edgeOffset: number }>;
  edges: GraphEdge[];
}

export interface MediaFilters {
  mediaType: 'ANIME' | 'MANGA' | 'BOTH';
  yearMin: number | null;
  yearMax: number | null;
  genres: string[];
  tags: string[];
  studio: string | null;
  showNSFW: boolean;
}

export interface PeopleFilters {
  includeVA: boolean;
  roles: string[];
  studio: string | null;
}

export type ConnectionMethod = 'relations' | 'staff' | 'tags';
export type SimilarMethod = 'tags' | 'staff' | 'relations';

export interface TalentFinderQuery {
  roles: string[];
  tags: string[];
  genres: string[];
  seedId: number | null;
  seedKind: 'media' | 'person' | null;
}

export interface TalentResult {
  personId: number;
  roleFit: number;
  tagFit: number;
  quality: number;
  closeness: number;
  total: number;
}
