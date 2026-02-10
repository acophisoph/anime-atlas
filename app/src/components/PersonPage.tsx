import { localizeTitle } from '../i18n/i18n';

export function PersonPage({ person, media, lang, onOpenMedia }: any) {
  if (!person) return <div>Select a person</div>;

  const works = media.filter((m: any) => (m.staff ?? []).some((s: any) => s.personId === person.id)).slice(0, 20);

  return (
    <div>
      <h3>{person.name?.full || person.name?.native}</h3>
      <p>
        <a href={person.siteUrl} target="_blank" rel="noreferrer">
          AniList Profile
        </a>
      </p>
      <h4>Works</h4>
      <ul>
        {works.map((w: any) => (
          <li key={w.id}>
            <button onClick={() => onOpenMedia(w.id)}>{localizeTitle(w.title, lang)} ({w.year})</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
