import { create } from 'zustand';
import type {
  Mode, Lang, Manifest, Point, Cluster, SearchEntry,
  Graph, MediaFilters, PeopleFilters, TalentFinderQuery, TalentResult,
} from '../types';

interface AtlasState {
  // App-level
  mode: Mode;
  lang: Lang;
  manifest: Manifest | null;
  isLoading: boolean;
  loadError: string | null;

  // Data
  points: Point[];
  clusters: Cluster[];
  searchEntries: SearchEntry[];
  graphRelations: Graph | null;
  graphStaff: Graph | null;
  graphCollab: Graph | null;

  // Selection
  selectedId: number | null;
  selectedKind: 'media' | 'person' | null;
  hoveredId: number | null;
  neighborhoodMap: Map<number, number>; // nodeId -> hopDistance

  // Filters
  mediaFilters: MediaFilters;
  peopleFilters: PeopleFilters;

  // Search
  searchQuery: string;
  searchResults: SearchEntry[];

  // Talent Finder
  talentQuery: TalentFinderQuery;
  talentResults: TalentResult[];

  // Camera
  cameraX: number;
  cameraY: number;
  cameraZoom: number;

  // Actions
  setMode: (mode: Mode) => void;
  setLang: (lang: Lang) => void;
  setManifest: (m: Manifest) => void;
  setPoints: (pts: Point[]) => void;
  setClusters: (c: Cluster[]) => void;
  setSearchEntries: (e: SearchEntry[]) => void;
  setGraph: (name: 'relations' | 'staff' | 'collab', g: Graph) => void;
  setSelected: (id: number | null, kind: 'media' | 'person' | null) => void;
  setHovered: (id: number | null) => void;
  setNeighborhood: (map: Map<number, number>) => void;
  clearNeighborhood: () => void;
  setMediaFilters: (f: Partial<MediaFilters>) => void;
  setPeopleFilters: (f: Partial<PeopleFilters>) => void;
  setSearchQuery: (q: string) => void;
  setSearchResults: (r: SearchEntry[]) => void;
  setTalentQuery: (q: Partial<TalentFinderQuery>) => void;
  setTalentResults: (r: TalentResult[]) => void;
  setCamera: (x: number, y: number, zoom: number) => void;
  setLoading: (b: boolean) => void;
  setLoadError: (e: string | null) => void;
}

export const useStore = create<AtlasState>((set) => ({
  mode: 'media',
  lang: 'en',
  manifest: null,
  isLoading: true,
  loadError: null,

  points: [],
  clusters: [],
  searchEntries: [],
  graphRelations: null,
  graphStaff: null,
  graphCollab: null,

  selectedId: null,
  selectedKind: null,
  hoveredId: null,
  neighborhoodMap: new Map(),

  mediaFilters: {
    mediaType: 'BOTH',
    yearMin: null,
    yearMax: null,
    genres: [],
    tags: [],
    studio: null,
    showNSFW: false,
  },
  peopleFilters: {
    includeVA: true,
    roles: [],
    studio: null,
  },

  searchQuery: '',
  searchResults: [],

  talentQuery: { roles: [], tags: [], genres: [], seedId: null, seedKind: null },
  talentResults: [],

  cameraX: 0,
  cameraY: 0,
  cameraZoom: 1,

  setMode: (mode) => set({ mode, selectedId: null, selectedKind: null, neighborhoodMap: new Map() }),
  setLang: (lang) => set({ lang }),
  setManifest: (manifest) => set({ manifest }),
  setPoints: (points) => set({ points }),
  setClusters: (clusters) => set({ clusters }),
  setSearchEntries: (searchEntries) => set({ searchEntries }),
  setGraph: (name, g) =>
    set(name === 'relations' ? { graphRelations: g }
      : name === 'staff' ? { graphStaff: g }
      : { graphCollab: g }),
  setSelected: (selectedId, selectedKind) => set(s => ({
    selectedId,
    selectedKind,
    // Clear neighborhood when switching to a different node so stale dimming does not persist
    neighborhoodMap: (selectedId !== null && selectedId !== s.selectedId) ? new Map() : s.neighborhoodMap,
  })),
  setHovered: (hoveredId) => set({ hoveredId }),
  setNeighborhood: (neighborhoodMap) => set({ neighborhoodMap }),
  clearNeighborhood: () => set({ neighborhoodMap: new Map() }),
  setMediaFilters: (f) => set((s) => ({ mediaFilters: { ...s.mediaFilters, ...f } })),
  setPeopleFilters: (f) => set((s) => ({ peopleFilters: { ...s.peopleFilters, ...f } })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setTalentQuery: (q) => set((s) => ({ talentQuery: { ...s.talentQuery, ...q } })),
  setTalentResults: (talentResults) => set({ talentResults }),
  setCamera: (cameraX, cameraY, cameraZoom) => set({ cameraX, cameraY, cameraZoom }),
  setLoading: (isLoading) => set({ isLoading }),
  setLoadError: (loadError) => set({ loadError }),
}));
