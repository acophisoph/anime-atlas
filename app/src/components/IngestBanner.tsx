import React from 'react';
import type { Manifest } from '../types';

export function IngestBanner({ manifest }: { manifest: Manifest }) {
  const pending = manifest.pending_batches_count;
  const done    = manifest.completed_batches_count;
  const total   = done + pending;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={styles.banner}>
      <span style={styles.icon}>⚡</span>
      <span>
        Data is still ingesting — {manifest.total_media_in_db.toLocaleString()} media,{' '}
        {manifest.total_people_in_db.toLocaleString()} people so far.{' '}
        Batches: {done}/{total} ({pct}%) complete.
        Search and exploration work on available data.
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: '#1e3a5f',
    borderBottom: '1px solid #2d5a9f',
    padding: '6px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#93c5fd',
    zIndex: 10,
  },
  icon: { fontSize: 16 },
};
