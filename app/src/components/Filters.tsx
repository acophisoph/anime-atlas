export function Filters({ tags, selectedTags, setSelectedTags }: any) {
  return (
    <div>
      <strong>Tags (AND)</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.slice(0, 40).map((tag: string) => (
          <label key={tag}><input type="checkbox" checked={selectedTags.includes(tag)} onChange={(e) => setSelectedTags((prev: string[]) => e.target.checked ? [...prev, tag] : prev.filter((x) => x !== tag))} />{tag}</label>
        ))}
      </div>
    </div>
  );
}
