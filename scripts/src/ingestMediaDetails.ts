import fs from 'node:fs/promises';
import path from 'node:path';
import { TMP_DIR } from './config.js';
import { queryAniList } from './anilistClient.js';
import { normalizeRole } from './roleNormalize.js';
import { logger } from './utils/logger.js';

const mediaQuery = `
query MediaDetail($id:Int!){
  Media(id:$id){
    id type format popularity averageScore siteUrl
    title{romaji english native}
    startDate{year}
    genres
    tags{ name rank }
    relations{ edges{ relationType node{ id } } }
    staff(perPage:50){ edges{ role node{ id name{full native alternative} siteUrl } } }
    characters(perPage:25){
      edges{
        role
        node{ id name{full native} siteUrl }
        voiceActors(language:JAPANESE, sort:[RELEVANCE,ID]){ id name{full native} siteUrl }
        voiceActorRoles(language:ENGLISH, sort:[RELEVANCE,ID]){ voiceActor{ id name{full native} siteUrl } }
      }
    }
  }
}`;

async function main() {
  const topMedia = JSON.parse(await fs.readFile(path.join(TMP_DIR, 'topMedia.json'), 'utf-8')) as Array<{ id: number }>;
  const media = [] as any[];
  const peopleMap = new Map<number, any>();
  const charactersMap = new Map<number, any>();

  for (const item of topMedia) {
    const data = await queryAniList<{ Media: any }>(mediaQuery, { id: item.id });
    const m = data.Media;
    if (!m) continue;

    const staff = (m.staff?.edges ?? []).map((edge: any) => {
      const person = edge.node;
      if (person) {
        peopleMap.set(person.id, {
          id: person.id,
          name: person.name,
          siteUrl: person.siteUrl
        });
      }
      return {
        personId: person?.id,
        roleRaw: edge.role || 'Unknown',
        roleGroup: normalizeRole(edge.role || 'Unknown')
      };
    });

    const characters = (m.characters?.edges ?? []).map((edge: any) => {
      const character = edge.node;
      if (character) {
        charactersMap.set(character.id, { id: character.id, name: character.name, siteUrl: character.siteUrl });
      }
      const vaJp = (edge.voiceActors ?? []).map((va: any) => ({ id: va.id, name: va.name, lang: 'JP', siteUrl: va.siteUrl }));
      const vaEn = (edge.voiceActorRoles ?? []).map((r: any) => ({ id: r.voiceActor?.id, name: r.voiceActor?.name, lang: 'EN', siteUrl: r.voiceActor?.siteUrl }));
      for (const va of [...vaJp, ...vaEn]) {
        if (va.id) peopleMap.set(va.id, { id: va.id, name: va.name, siteUrl: va.siteUrl });
      }
      return { characterId: character?.id, role: edge.role, voiceActors: [...vaJp, ...vaEn].filter((x) => x.id) };
    });

    media.push({
      id: m.id,
      type: m.type,
      title: m.title,
      year: m.startDate?.year ?? 0,
      format: m.format,
      popularity: m.popularity,
      averageScore: m.averageScore,
      genres: m.genres ?? [],
      tags: (m.tags ?? []).map((t: any) => ({ name: t.name, rank: t.rank })),
      siteUrl: m.siteUrl,
      relations: (m.relations?.edges ?? []).map((e: any) => ({ id: e.node?.id, relationType: e.relationType })).filter((x: any) => x.id),
      staff,
      characters
    });

    logger.info('Fetched media', m.id);
  }

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TMP_DIR, 'mediaDetails.json'), JSON.stringify(media, null, 2));
  await fs.writeFile(path.join(TMP_DIR, 'people.json'), JSON.stringify([...peopleMap.values()], null, 2));
  await fs.writeFile(path.join(TMP_DIR, 'characters.json'), JSON.stringify([...charactersMap.values()], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
