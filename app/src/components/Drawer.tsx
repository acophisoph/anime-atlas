import { localizeTitle } from '../i18n/i18n';

export function Drawer({ media, lang, onExplore }: any) {
  if (!media) return <aside style={{ padding: 10 }}>Select a media point</aside>;
  return (
    <aside style={{ padding: 10, borderLeft: '1px solid #333', overflow: 'auto' }}>
      <h3>{localizeTitle(media.title, lang)}</h3>
      <p>{media.year} · {media.format}</p>
      <p>{media.tags?.slice(0, 8).map((t: any) => t.name).join(', ')}</p>
      <a href={media.siteUrl} target="_blank" rel="noreferrer">AniList</a>
      <h4>Related</h4>
      <ul>{media.relations?.slice(0, 10).map((r: any, idx: number) => <li key={idx}>{r.id} ({r.relationType})</li>)}</ul>
      <h4>Credits</h4>
      <ul>{media.staff?.slice(0, 16).map((s: any, idx: number) => <li key={idx}>{s.roleGroup}: {s.roleRaw}</li>)}</ul>
      <h4>Character VA</h4>
      <ul>{media.characters?.slice(0, 10).map((c: any, idx: number) => <li key={idx}>{c.characterId} {c.voiceActors?.map((v: any) => <span key={v.id}>[{v.lang}] {v.name?.full} </span>)}</li>)}</ul>
      <button onClick={() => onExplore(media.id)}>Explore Network</button>
    </aside>
  );
}
