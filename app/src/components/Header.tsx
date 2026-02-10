import type { Lang, Scope } from '../lib/types';

export function Header({ t, lang, setLang, scope, setScope }: any & { lang: Lang; setLang: (l: Lang) => void; scope: Scope; setScope: (s: Scope) => void }) {
  return (
    <header style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderBottom: '1px solid #333' }}>
      <h1 style={{ margin: 0 }}>{t.title}</h1>
      <small>{t.subtitle}</small>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button onClick={() => setLang('en')} disabled={lang === 'en'}>EN</button>
        <button onClick={() => setLang('ja')} disabled={lang === 'ja'}>日本語</button>
        {(['ANIME', 'MANGA', 'BOTH'] as Scope[]).map((s) => (
          <button key={s} onClick={() => setScope(s)} disabled={scope === s}>{t.scope[s]}</button>
        ))}
      </div>
    </header>
  );
}
