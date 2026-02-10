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
    studios{ nodes{ id name siteUrl isAnimationStudio } }
    title{romaji english native}
    startDate{year}
    genres
    tags{ name rank }
    relations{ edges{ relationType node{ id } } }
    staff(perPage:50){ edges{ role node{ id name{full native alternative} siteUrl description(asHtml:false) } } }
    characters(perPage:25){
      edges{
        role
        node{ id name{full native} siteUrl }
        jpVoice: voiceActors(language:JAPANESE, sort:[RELEVANCE,ID]){ id name{full native} siteUrl languageV2 }
        enVoice: voiceActors(language:ENGLISH, sort:[RELEVANCE,ID]){ id name{full native} siteUrl languageV2 }
        allVoice: voiceActors(sort:[RELEVANCE,ID]){ id name{full native} siteUrl languageV2 }
      }
    }
  }
}`;

const relationLookupQuery = `
query RelationLite($id:Int!){
  Media(id:$id){
    id type format siteUrl
    startDate{year}
    title{romaji english native}
  }
}`;

function dedupeById<T extends { id?: number }>(arr: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of arr) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}


function extractUrls(text?: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  return [...new Set(matches)];
}


function isLocalizationRole(role?: string): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  return /(translat|locali[sz]ation|letter|typeset|proofread|subtit|dub script|editor\s*\(|\(english|\(spanish|\(portuguese|\(french|\(german|\(italian|\(polish)/i.test(normalized);
}

function splitVoiceActorsByLanguage(actors: any[]): { voiceActorsJP: any[]; voiceActorsEN: any[] } {
  const voiceActorsJP = dedupeById(
    actors
      .filter((va: any) => {
        const lang = String(va?.languageV2 ?? '').toLowerCase();
        return lang.includes('japanese') || lang === 'jp';
      })
      .map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl }))
  );

  const voiceActorsEN = dedupeById(
    actors
      .filter((va: any) => {
        const lang = String(va?.languageV2 ?? '').toLowerCase();
        return lang.includes('english') || lang === 'en';
      })
      .map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl }))
  );

  return { voiceActorsJP, voiceActorsEN };
}
function toSocialLinks(person: any) {
  const links = extractUrls(person?.description);
  return links
    .slice(0, 8)
    .map((url) => ({
      label: url.includes('twitter.com') || url.includes('x.com') ? 'Twitter/X' : url.includes('instagram.com') ? 'Instagram' : url.includes('youtube.com') ? 'YouTube' : 'External',
      url
    }));
}
async function main() {
  const topMedia = JSON.parse(await fs.readFile(path.join(TMP_DIR, 'topMedia.json'), 'utf-8')) as Array<{ id: number }>;
  const topIds = new Set(topMedia.map((m) => m.id));
  const relationIds = new Set<number>();

  const media = [] as any[];
  const peopleMap = new Map<number, any>();
  const charactersMap = new Map<number, any>();

  for (const item of topMedia) {
    const data = await queryAniList<{ Media: any }>(mediaQuery, { id: item.id });
    const m = data.Media;
    if (!m) continue;

    const staff = (m.staff?.edges ?? [])
      .filter((edge: any) => !isLocalizationRole(edge.role || ''))
      .map((edge: any) => {
        const person = edge.node;
        if (person) {
          peopleMap.set(person.id, {
            id: person.id,
            name: person.name,
            siteUrl: person.siteUrl,
            socialLinks: toSocialLinks(person)
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

      let voiceActorsJP = dedupeById((edge.jpVoice ?? []).map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl })));
      let voiceActorsEN = dedupeById((edge.enVoice ?? []).map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl })));

      if (!voiceActorsJP.length || !voiceActorsEN.length) {
        const split = splitVoiceActorsByLanguage(edge.allVoice ?? []);
        voiceActorsJP = voiceActorsJP.length ? voiceActorsJP : split.voiceActorsJP;
        voiceActorsEN = voiceActorsEN.length ? voiceActorsEN : split.voiceActorsEN;
      }

      for (const va of [...voiceActorsJP, ...voiceActorsEN]) {
        if (va.id) peopleMap.set(va.id, { id: va.id, name: va.name, siteUrl: va.siteUrl, socialLinks: peopleMap.get(va.id)?.socialLinks ?? [] });
      }

      return { characterId: character?.id, role: edge.role, voiceActorsJP, voiceActorsEN };
    });

    const relations = (m.relations?.edges ?? [])
      .map((e: any) => ({ id: e.node?.id, relationType: e.relationType }))
      .filter((x: any) => x.id);

    for (const rel of relations) relationIds.add(rel.id);

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
      studios: (m.studios?.nodes ?? []).map((st: any) => ({ id: st.id, name: st.name, siteUrl: st.siteUrl, isAnimationStudio: !!st.isAnimationStudio })),
      relations,
      staff,
      characters
    });

    logger.info('Fetched media', m.id);
  }

  const relationLookup: Record<number, any> = {};
  const missingRelationIds = [...relationIds].filter((id) => !topIds.has(id));
  for (const id of missingRelationIds) {
    const relData = await queryAniList<{ Media: any }>(relationLookupQuery, { id });
    if (!relData.Media) continue;
    relationLookup[id] = {
      id: relData.Media.id,
      type: relData.Media.type,
      title: relData.Media.title,
      year: relData.Media.startDate?.year ?? 0,
      format: relData.Media.format,
      siteUrl: relData.Media.siteUrl
    };
  }

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TMP_DIR, 'mediaDetails.json'), JSON.stringify(media, null, 2));
  await fs.writeFile(path.join(TMP_DIR, 'people.json'), JSON.stringify([...peopleMap.values()], null, 2));
  await fs.writeFile(path.join(TMP_DIR, 'characters.json'), JSON.stringify([...charactersMap.values()], null, 2));
  await fs.writeFile(path.join(TMP_DIR, 'relationLookup.json'), JSON.stringify(relationLookup, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
