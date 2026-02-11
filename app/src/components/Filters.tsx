import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

export function Filters({ tags, selectedTags, setSelectedTags }: any) {
  const [query, setQuery] = useState('');

  const visibleTags = useMemo(
    () => tags.filter((tag: string) => tag.toLowerCase().includes(query.toLowerCase())),
    [tags, query]
  );

  return (
    <div>
      <strong>Tags (AND)</strong>
      <input
        style={{ width: '100%', margin: '6px 0', padding: 6 }}
        placeholder="Filter tags"
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
      />
      {selectedTags.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <small>Selected:</small>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedTags.map((tag: string) => (
              <button key={tag} onClick={() => setSelectedTags((prev: string[]) => prev.filter((x) => x !== tag))}>
                {tag} ✕
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflow: 'auto' }}>
        {visibleTags.map((tag: string) => (
          <label key={tag}>
            <input
              type="checkbox"
              checked={selectedTags.includes(tag)}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setSelectedTags((prev: string[]) =>
                  e.target.checked ? [...prev, tag] : prev.filter((x) => x !== tag)
                )
              }
            />
            {tag}
          </label>
        ))}
      </div>
    </div>
  );
}
