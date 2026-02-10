import MiniSearch from 'minisearch';

export function buildIndices(media: any[], people: any[], characters: any[]) {
  const tagToMedia: Record<string, number[]> = {};
  const roleToPeople: Record<string, number[]> = {};
  const tagRoleToPeople: Record<string, number[]> = {};
  const yearBucketToPeople: Record<string, number[]> = { all_time: [] };

  const personTagMap = new Map<number, Set<string>>();

  for (const m of media) {
    const tags = (m.tags ?? []).map((t: any) => t.name);
    for (const tag of tags) {
      tagToMedia[tag] = tagToMedia[tag] ?? [];
      tagToMedia[tag].push(m.id);
    }
    for (const staff of m.staff ?? []) {
      if (!staff.personId) continue;
      roleToPeople[staff.roleGroup] = roleToPeople[staff.roleGroup] ?? [];
      roleToPeople[staff.roleGroup].push(staff.personId);
      const set = personTagMap.get(staff.personId) ?? new Set<string>();
      tags.forEach((t: string) => set.add(t));
      personTagMap.set(staff.personId, set);
      yearBucketToPeople.all_time.push(staff.personId);
    }
  }

  for (const [pid, tags] of personTagMap.entries()) {
    for (const [role, personIds] of Object.entries(roleToPeople)) {
      if (!personIds.includes(pid)) continue;
      for (const tag of tags) {
        const key = `${role}|${tag}`;
        tagRoleToPeople[key] = tagRoleToPeople[key] ?? [];
        tagRoleToPeople[key].push(pid);
      }
    }
  }

  for (const collection of [tagToMedia, roleToPeople, tagRoleToPeople, yearBucketToPeople]) {
    for (const key of Object.keys(collection)) {
      collection[key] = [...new Set(collection[key])].sort((a, b) => a - b);
    }
  }

  const miniSearch = new MiniSearch({
    fields: ['name', 'secondary'],
    storeFields: ['id', 'kind', 'name']
  });

  const docs = [
    ...media.map((m) => ({
      id: `m-${m.id}`,
      kind: 'media',
      refId: m.id,
      name: [m.title.english, m.title.romaji, m.title.native].filter(Boolean).join(' '),
      secondary: [...(m.genres ?? []), ...(m.tags ?? []).map((t: any) => t.name)].join(' ')
    })),
    ...people.map((p) => ({
      id: `p-${p.id}`,
      kind: 'person',
      refId: p.id,
      name: [p.name?.full, p.name?.native, ...(p.name?.alternative ?? [])].filter(Boolean).join(' '),
      secondary: ''
    })),
    ...characters.map((c) => ({
      id: `c-${c.id}`,
      kind: 'character',
      refId: c.id,
      name: [c.name?.full, c.name?.native].filter(Boolean).join(' '),
      secondary: ''
    }))
  ];

  miniSearch.addAll(docs);

  return {
    tagToMedia,
    roleToPeople,
    tagRoleToPeople,
    yearBucketToPeople,
    searchIndex: miniSearch.toJSON(),
    searchDocs: docs.map((d) => ({ id: d.id, kind: d.kind, refId: d.refId, name: d.name }))
  };
}
