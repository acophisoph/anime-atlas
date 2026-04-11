import React, { useEffect } from 'react';
import { useStore } from '../lib/store';
import { loadManifest, loadPoints, loadClusters, loadSearch, loadGraph } from '../lib/data-loader';
import { Header } from './Header';
import { LeftPanel } from './LeftPanel';
import { AtlasCanvas } from './AtlasCanvas';
import { DetailDrawer } from './DetailDrawer';
import { Tooltip } from './Tooltip';
import { IngestBanner } from './IngestBanner';

// Catches render errors so a bad tooltip or meta payload never blacks out the whole app
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.error) return this.props.fallback ?? null;
    return this.props.children;
  }
}

export function App() {
  const setManifest = useStore(s => s.setManifest);
  const setPoints   = useStore(s => s.setPoints);
  const setClusters = useStore(s => s.setClusters);
  const setSearch   = useStore(s => s.setSearchEntries);
  const setGraph    = useStore(s => s.setGraph);
  const setLoading  = useStore(s => s.setLoading);
  const setError    = useStore(s => s.setLoadError);
  const loadError   = useStore(s => s.loadError);
  const isLoading   = useStore(s => s.isLoading);
  const manifest    = useStore(s => s.manifest);

  useEffect(() => {
    (async () => {
      try {
        // 1. Manifest first
        const m = await loadManifest();
        setManifest(m);

        // 2. Points + search in parallel (needed for initial render)
        const [pts, clusters, search] = await Promise.all([
          loadPoints(),
          loadClusters(),
          loadSearch(),
        ]);
        setPoints(pts);
        setClusters(clusters);
        setSearch(search);
        setLoading(false);

        // 3. Load graphs lazily after initial render
        Promise.all([
          loadGraph('graph_media_relations.bin').then(g => setGraph('relations', g)),
          loadGraph('graph_media_staff.bin').then(g => setGraph('staff', g)),
          loadGraph('graph_people_collab.bin').then(g => setGraph('collab', g)),
        ]).catch(e => console.warn('[graphs] failed to load:', e));

      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    })();
  }, []);

  if (loadError) {
    return (
      <div style={styles.error}>
        <h2>Failed to load atlas data</h2>
        <pre>{loadError}</pre>
        <p>Make sure you have run <code>npm run build:artifacts && npm run sync:data</code></p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {manifest?.completeness.is_partial && <IngestBanner manifest={manifest} />}
      <Header />
      <div style={styles.body}>
        <LeftPanel />
        <div style={styles.canvasWrap}>
          {isLoading
            ? <div style={styles.loading}>Loading atlas…</div>
            : <ErrorBoundary><AtlasCanvas /></ErrorBoundary>}
          <ErrorBoundary><Tooltip /></ErrorBoundary>
        </div>
        <ErrorBoundary><DetailDrawer /></ErrorBoundary>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },
  canvasWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
  },
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', height: '100%', color: '#888', fontSize: 18,
  },
  error: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: '100%', height: '100%', padding: 32, gap: 16, color: '#f87171',
  },
};
