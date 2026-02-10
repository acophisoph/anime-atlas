import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILD_CONFIG, TMP_DIR } from './config.js';
import { queryAniList } from './anilistClient.js';
import { logger } from './utils/logger.js';

type MediaLite = { id: number; type: 'ANIME' | 'MANGA'; popularity: number };

const topQuery = `
query TopMedia($page:Int!,$perPage:Int!,$type:MediaType!){
  Page(page:$page, perPage:$perPage){
    media(type:$type, sort:POPULARITY_DESC){ id type popularity }
  }
}`;

async function fetchTop(type: 'ANIME' | 'MANGA', targetCount: number): Promise<MediaLite[]> {
  const pages = Math.ceil(targetCount / BUILD_CONFIG.pageSize);
  const out: MediaLite[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await queryAniList<{ Page: { media: MediaLite[] } }>(topQuery, {
      page,
      perPage: BUILD_CONFIG.pageSize,
      type
    });
    out.push(...data.Page.media);
  }
  return out.slice(0, targetCount);
}

async function main() {
  const anime = await fetchTop('ANIME', BUILD_CONFIG.topAnime);
  const manga = await fetchTop('MANGA', BUILD_CONFIG.topManga);
  const ids = [...anime, ...manga];
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TMP_DIR, 'topMedia.json'), JSON.stringify(ids, null, 2));
  logger.info('Saved top media ids', ids.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
