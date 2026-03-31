import crypto from 'crypto';

const LEASE_DURATION_MS = 10 * 60 * 1000; // 10 min
const RENEW_INTERVAL_MS = 5 * 60 * 1000;  // renew every 5 min

const OWNER = crypto.randomUUID();

export function acquireLease(db, name) {
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO leases (name, owner, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      owner = CASE WHEN expires_at < ? THEN excluded.owner ELSE owner END,
      expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END
  `).run(name, OWNER, now + LEASE_DURATION_MS, now, now);

  const row = db.prepare('SELECT owner FROM leases WHERE name = ?').get(name);
  return row?.owner === OWNER;
}

export function renewLease(db, name) {
  const now = Date.now();
  const result = db.prepare(`
    UPDATE leases SET expires_at = ?
    WHERE name = ? AND owner = ?
  `).run(now + LEASE_DURATION_MS, name, OWNER);
  return result.changes > 0;
}

export function releaseLease(db, name) {
  db.prepare('DELETE FROM leases WHERE name = ? AND owner = ?').run(name, OWNER);
}

export function startLeaseRenewal(db, name) {
  const timer = setInterval(() => {
    if (!renewLease(db, name)) {
      console.warn('[lease] Failed to renew lease — another process may have taken over');
    }
  }, RENEW_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
