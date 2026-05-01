import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { t } from '../lib/i18n';
import { MediaFiltersPanel } from './MediaFiltersPanel';
import { PeopleFiltersPanel } from './PeopleFiltersPanel';
import { TalentFinder } from './TalentFinder';

type Tab = 'filters' | 'talent';

export function LeftPanel() {
  const mode = useStore(s => s.mode);
  const lang = useStore(s => s.lang);
  const [tab, setTab] = useState<Tab>('filters');

  return (
    <aside style={styles.panel}>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'filters' ? styles.tabActive : {}) }}
          onClick={() => setTab('filters')}>{t('Filters', lang)}</button>
        {mode === 'people' && (
          <button style={{ ...styles.tab, ...(tab === 'talent' ? styles.tabActive : {}) }}
            onClick={() => setTab('talent')}>{t('Talent Finder', lang)}</button>
        )}
        {mode === 'season' && (
          <div style={{ ...styles.tab, color: '#c8b860', pointerEvents: 'none', fontSize: 11 }}>
            {t('Now Airing', lang)}
          </div>
        )}
      </div>
      <div style={styles.content}>
        {tab === 'filters'
          ? (mode === 'media' ? <MediaFiltersPanel /> : <PeopleFiltersPanel />)
          : <TalentFinder />}
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 260, flexShrink: 0, background: '#111118',
    borderRight: '1px solid #1e1e2e', display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  tabs: {
    display: 'flex', borderBottom: '1px solid #1e1e2e',
  },
  tab: {
    flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
    color: '#9090b0', cursor: 'pointer', fontSize: 13,
    borderBottom: '2px solid transparent', transition: 'all 0.15s',
  },
  tabActive: { color: '#c8c8f8', borderBottomColor: '#5050a0' },
  content: { flex: 1, overflowY: 'auto', padding: 12 },
};
