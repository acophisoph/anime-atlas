import React, { useEffect } from 'react';
import { useStore } from '../lib/store';
import { useIsMobile } from '../lib/use-is-mobile';
import { loadManifest, loadPoints, loadClusters, loadSearch, loadGraph } from '../lib/data-loader';
import { Header } from './Header';
import { LeftPanel } from './LeftPanel';
import { AtlasCanvas } from './AtlasCanvas';
import { SeasonView } from './SeasonView';
import { DetailDrawer } from './DetailDrawer';
import { Tooltip } from './Tooltip';

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
  const mode        = useStore(s => s.mode);
  const leftPanelOpen    = useStore(s => s.leftPanelOpen);
  const setLeftPanelOpen = useStore(s => s.setLeftPanelOpen);
  const isMobile = useIsMobile();

  useEffect(() => {
    (async () => {
      try {
        const m = await loadManifest();
        setManifest(m);
        const [pts, clusters, search] = await Promise.all([
          loadPoints(),
          loadClusters(),
          loadSearch(),
        ]);
        setPoints(pts);
        setClusters(clusters);
        setSearch(search);
        setLoading(false);
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
      <Header />
      <div style={styles.body}>
        {isMobile ? (
          <>
            {/* Mobile: LeftPanel as overlay drawer */}
            {leftPanelOpen && (
              <div
                style={mobileStyles.overlay}
                onClick={() => setLeftPanelOpen(false)}
              />
            )}
            <div style={{
              ...mobileStyles.drawer,
              transform: leftPanelOpen ? 'translateX(0)' : 'translateX(-100%)',
            }}>
              <LeftPanel />
            </div>

            {/* Canvas / season view fills full width */}
            <div style={styles.canvasWrap}>
              {isLoading
                ? <div style={styles.loading}>Loading atlas…</div>
                : mode === 'season'
                  ? <ErrorBoundary><SeasonView /></ErrorBoundary>
                  : <ErrorBoundary><AtlasCanvas /></ErrorBoundary>}
              {mode !== 'season' && <ErrorBoundary><Tooltip /></ErrorBoundary>}
            </div>

            {/* Mobile: DetailDrawer as bottom sheet */}
            {mode !== 'season' && (
              <ErrorBoundary><DetailDrawer /></ErrorBoundary>
            )}
          </>
        ) : (
          <>
            <LeftPanel />
            <div style={styles.canvasWrap}>
              {isLoading
                ? <div style={styles.loading}>Loading atlas…</div>
                : mode === 'season'
                  ? <ErrorBoundary><SeasonView /></ErrorBoundary>
                  : <ErrorBoundary><AtlasCanvas /></ErrorBoundary>}
              {mode !== 'season' && <ErrorBoundary><Tooltip /></ErrorBoundary>}
            </div>
            {mode !== 'season' && <ErrorBoundary><DetailDrawer /></ErrorBoundary>}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'hidden', position: 'relative',
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

const mobileStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30,
  },
  drawer: {
    position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 40,
    width: 280,
    transition: 'transform 0.25s ease',
    overflowY: 'auto',
  },
};
