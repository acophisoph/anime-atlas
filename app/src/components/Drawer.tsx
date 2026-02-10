import { localizeTitle } from '../i18n/i18n';

function dedupeVoiceActors(voiceActors: Array<{ id: number; lang: 'JP' | 'EN'; name?: { full?: string } }>) {
  const seen = new Set<string>();
  return voiceActors.filter((va) => {
    const key = `${va.id}:${va.lang}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function Drawer({ media, mediaById, peopleById, charactersById, lang, onExplore }: any) {
  if (!media) return <aside style={{ padding: 10 }}>Select a media point</aside>;
  return (
    <aside style={{ padding: 10, borderLeft: '1px solid #333', overflow: 'auto' }}>
      <h3>{localizeTitle(media.title, lang)}</h3>
      <p>
        {media.year} · {media.format}
      </p>
      <p>{media.tags?.slice(0, 8).map((t: any) => t.name).join(', ')}</p>
      <a href={media.siteUrl} target="_blank" rel="noreferrer">
        AniList
      </a>
      <h4>Related</h4>
      <ul>
        {media.relations?.slice(0, 10).map((r: any, idx: number) => {
          const rel = mediaById[r.id];
          return (
            <li key={idx}>
              {rel ? localizeTitle(rel.title, lang) : `#${r.id}`} ({r.relationType})
            </li>
          );
        })}
      </ul>
      <h4>Credits</h4>
      <ul>
        {media.staff?.slice(0, 16).map((s: any, idx: number) => {
          const personName = peopleById[s.personId]?.name?.full ?? peopleById[s.personId]?.name?.native ?? `#${s.personId}`;
          return (
            <li key={idx}>
              {s.roleGroup}: {personName} — {s.roleRaw}
            </li>
          );
        })}
      </ul>
      <h4>Character VA</h4>
      <ul>
        {media.characters?.slice(0, 10).map((c: any, idx: number) => {
          const characterName =
            charactersById[c.characterId]?.name?.full ?? charactersById[c.characterId]?.name?.native ?? `#${c.characterId}`;
          const voiceActors = dedupeVoiceActors(c.voiceActors ?? []);
          return (
            <li key={idx}>
              {characterName}{' '}
              {voiceActors.map((v: any) => (
                <span key={`${v.id}-${v.lang}`}>
                  [{v.lang}] {v.name?.full ?? peopleById[v.id]?.name?.full ?? `#${v.id}`}{' '}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
      <button onClick={() => onExplore(media.id)}>Explore Network</button>
    </aside>
  );
}
