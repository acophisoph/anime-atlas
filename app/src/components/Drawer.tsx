import { localizeTitle } from '../i18n/i18n';

function isLocalizationRole(roleRaw?: string): boolean {
  if (!roleRaw) return false;
  const text = roleRaw.toLowerCase();
  return /(translat|locali[sz]ation|letter|typeset|proofread|subtit|dub|dubb|adr|adaptation|portuguese|spanish|french|german|italian|polish|arabic|thai|turkish|russian|english)/i.test(text);
}

function dedupeById(items: Array<{ id: number; name?: { full?: string } }>) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function Drawer({
  media,
  mediaById,
  peopleById,
  charactersById,
  relationLookup,
  lang,
  onExplore,
  onOpenPerson,
  onOpenMedia
}: any) {
  if (!media) return <aside style={{ padding: 10 }}>Select a media point</aside>;

  const coreStaff = (media.staff ?? []).filter((s: any) => !isLocalizationRole(s.roleRaw));
  const localizationStaff = (media.staff ?? []).filter((s: any) => isLocalizationRole(s.roleRaw));

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
          const rel = mediaById[r.id] || relationLookup?.[String(r.id)];
          const label = rel ? localizeTitle(rel.title, lang) : `#${r.id}`;
          return (
            <li key={idx}>
              {rel ? (
                <button onClick={() => onOpenMedia(r.id)}>{label}</button>
              ) : (
                <a href={`https://anilist.co/${media.type === 'MANGA' ? 'manga' : 'anime'}/${r.id}`} target="_blank" rel="noreferrer">
                  {label}
                </a>
              )}{' '}
              ({r.relationType})
            </li>
          );
        })}
      </ul>
      <h4>Credits</h4>
      <ul>
        {coreStaff.slice(0, 20).map((s: any, idx: number) => {
          const person = peopleById[s.personId];
          const personName = person?.name?.full ?? person?.name?.native ?? `#${s.personId}`;
          return (
            <li key={idx}>
              {s.roleGroup}:{' '}
              <button onClick={() => onOpenPerson(s.personId)}>{personName}</button> — {s.roleRaw}
              {person?.siteUrl ? (
                <>
                  {' '}
                  <a href={person.siteUrl} target="_blank" rel="noreferrer">
                    profile
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      {localizationStaff.length ? (
        <>
          <h4>Localization / Translation</h4>
          <ul>
            {localizationStaff.slice(0, 20).map((s: any, idx: number) => {
              const person = peopleById[s.personId];
              const personName = person?.name?.full ?? person?.name?.native ?? `#${s.personId}`;
              return (
                <li key={`loc-${idx}`}>
                  {s.roleGroup}:{' '}
                  <button onClick={() => onOpenPerson(s.personId)}>{personName}</button> — {s.roleRaw}
                  {person?.siteUrl ? (
                    <>
                      {' '}
                      <a href={person.siteUrl} target="_blank" rel="noreferrer">
                        profile
                      </a>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <h4>Character VA</h4>
      <ul>
        {media.characters?.slice(0, 10).map((c: any, idx: number) => {
          const characterName =
            charactersById[c.characterId]?.name?.full ?? charactersById[c.characterId]?.name?.native ?? `#${c.characterId}`;
          const jp = dedupeById(c.voiceActorsJP ?? (c.voiceActors ?? []).filter((v: any) => ['JP', 'JAPANESE'].includes(String(v.lang ?? v.language ?? '').toUpperCase())));
          const en = dedupeById(c.voiceActorsEN ?? (c.voiceActors ?? []).filter((v: any) => ['EN', 'ENGLISH'].includes(String(v.lang ?? v.language ?? '').toUpperCase())));
          const allVa = dedupeById([...jp, ...en]);
          return (
            <li key={idx}>
              <strong>{characterName}</strong>
              <div>
                {allVa.length
                  ? allVa.map((v: any) => (
                      <span key={`va-${v.id}`}>
                        <button onClick={() => onOpenPerson(v.id)}>{v.name?.full ?? peopleById[v.id]?.name?.full ?? `#${v.id}`}</button>{' '}
                      </span>
                    ))
                  : '—'}
              </div>
            </li>
          );
        })}
      </ul>
      <button onClick={() => onExplore(media.id)}>Explore Network</button>
    </aside>
  );
}
