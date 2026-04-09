// ─── UI string translations ───────────────────────────────────────────────────
export const UI_JP: Record<string, string> = {
  // Header
  'Anime Atlas':            'アニメアトラス',
  'Media':                  'メディア',
  'People':                 '人物',
  'Search anime / manga…':  'アニメ / マンガを検索…',
  'Search staff / VA…':     'スタッフ / 声優を検索…',

  // LeftPanel tabs
  'Filters':                'フィルター',
  'Talent Finder':          'タレント検索',

  // MediaFiltersPanel
  'Media Type':             'メディアタイプ',
  'Both':                   '両方',
  'Anime':                  'アニメ',
  'Manga':                  'マンガ',
  'Content':                'コンテンツ',
  'Show NSFW (18+)':        '成人向けを表示 (18+)',
  'Year Range':             '年代',
  'From':                   '開始年',
  'To':                     '終了年',
  'Genres':                 'ジャンル',
  'Add genre…':             'ジャンルを追加…',
  'Tags':                   'タグ',
  'Add tag…':               'タグを追加…',
  'Reset Filters':          'フィルターリセット',

  // PeopleFiltersPanel
  'Voice Actors':           '声優',
  'Include Voice Actors':   '声優を含める',
  'Roles':                  '役職',
  'e.g. Director…':         '例：監督…',

  // TalentFinder
  'Tags / Genres':          'タグ / ジャンル',
  'e.g. Isekai':            '例：異世界',
  'e.g. Director':          '例：監督',
  'Find Talent':            'タレントを探す',
  'Searching…':             '検索中…',
  'results':                '件',
  'Role':                   '役職',
  'Tag':                    'タグ',

  // DetailDrawer — tabs
  'Info':                   '情報',
  'Connections':            '関連',
  'Similar':                '類似',

  // DetailDrawer — info
  'Animation Studio':       'アニメスタジオ',
  'About':                  'プロフィール',
  'AniList Profile ↗':      'AniListプロフィール ↗',
  'fans':                   'ファン',
  'Loading…':               '読込中…',

  // DetailDrawer — connections
  'Edge Type':              '接続タイプ',
  'Relations':              'リレーション',
  'Staff overlap':          'スタッフ重複',
  'Collaborators':          '共同制作者',
  '(loading)':              '(読込中)',
  'Hops out':               'ホップ数',
  'Show connections':       '関連を表示',
  'Clear':                  'クリア',
  '1':                      '1',
  '2':                      '2',
  '3':                      '3',
  'hop':                    'ホップ',
  'nodes reachable':        'ノード到達可能',
  'Select an edge type and click "Show connections" to explore the network from this node.':
    'エッジタイプを選択し「関連を表示」をクリックして、このノードからネットワークを探索します。',

  // DetailDrawer — similar
  'Similar items are computed from staff overlap graphs — available after more ingest runs complete.':
    '類似作品はスタッフ重複グラフから算出されます（さらなるインジェスト実行後に利用可能）。',

  // AtlasCanvas hints
  'Scroll to zoom · Drag to pan · Click a node to explore · Zoom in to see individual titles':
    'スクロールでズーム · ドラッグで移動 · クリックで詳細 · ズームインでタイトルを表示',
  'People data not yet ingested':
    '人物データが未インジェストです',
  'No media matches these filters':
    'フィルターに一致するメディアがありません',
  'Staff and voice actor data is fetched in later ingest batches. Check back after the next scheduled run (every 6 hours).':
    'スタッフ・声優データは次のインジェストバッチで取得されます（6時間ごとに更新）。',
  'Try relaxing your filters or reset them to see all media.':
    'フィルターを緩めるか、リセットしてすべてのメディアを表示してください。',
};

/** Translate a UI key. Falls back to the key itself when no translation exists. */
export function t(key: string, lang: string): string {
  if (lang !== 'jp') return key;
  return UI_JP[key] ?? key;
}

// ─── Genre translations ───────────────────────────────────────────────────────
export const GENRE_JP: Record<string, string> = {
  'Action':        'アクション',
  'Adventure':     'アドベンチャー',
  'Comedy':        'コメディ',
  'Drama':         'ドラマ',
  'Ecchi':         'エッチ',
  'Fantasy':       'ファンタジー',
  'Hentai':        'ヘンタイ',
  'Horror':        'ホラー',
  'Mahou Shoujo':  '魔法少女',
  'Mecha':         'メカ',
  'Music':         '音楽',
  'Mystery':       'ミステリー',
  'Psychological': '心理',
  'Romance':       'ロマンス',
  'Sci-Fi':        'SF',
  'Slice of Life': '日常',
  'Sports':        'スポーツ',
  'Supernatural':  '超自然',
  'Thriller':      'スリラー',
};

// ─── Role translations (AniList staff roles) ──────────────────────────────────
export const ROLE_JP: Record<string, string> = {
  'ADR Director':                    'ADR監督',
  'Animation Check':                 '動画検査',
  'Animation Director':              '作画監督',
  'Art Director':                    '美術監督',
  'Assistant Director':              '副監督',
  'Background Art':                  '背景美術',
  'Background Design':               '背景デザイン',
  'Book Design':                     '書籍デザイン',
  'Camera Work':                     '撮影',
  'CG Director':                     'CGディレクター',
  'Character Animation Director':    'キャラクターアニメーション監督',
  'Character Design':                'キャラクターデザイン',
  'Character Design Draft':          'キャラクター設定草案',
  'Chief Animation Director':        '総作画監督',
  'Color Design':                    '色彩設計',
  'Coloring':                        '仕上げ',
  'Comic':                           'コミック',
  'Concept Art':                     'コンセプトアート',
  'Cooperation':                     '協力',
  'Digital Effects':                 'デジタルエフェクト',
  'Director':                        '監督',
  'Editing':                         '編集',
  'Episode Director':                '演出',
  'Executive Producer':              'エグゼクティブプロデューサー',
  'In-Between Animation':            '動画',
  'Insert Song Performance':         '挿入歌歌唱',
  'Key Animation':                   '原画',
  'Layout':                          'レイアウト',
  'Mechanical Design':               'メカニックデザイン',
  'Mixing':                          'ミックス',
  'Monster Design':                  'モンスターデザイン',
  'Music':                           '音楽',
  'Music Producer':                  '音楽プロデューサー',
  'Original Character Design':       '原案キャラクターデザイン',
  'Original Creator':                '原作',
  'Photography':                     '撮影',
  'Planning':                        '企画',
  'Producer':                        'プロデューサー',
  'Production Assistance':           '制作協力',
  'Production Manager':              '制作管理',
  'Prop Design':                     '小道具デザイン',
  'Recording':                       '録音',
  'Script':                          '台本',
  'Screenplay':                      '脚本',
  'Series Composition':              'シリーズ構成',
  'Set Design':                      'セットデザイン',
  'Setting':                         '設定',
  'Sound Director':                  '音響監督',
  'Sound Effects':                   '効果音',
  'Special Effects':                 '特殊効果',
  'Story':                           'ストーリー',
  'Storyboard':                      '絵コンテ',
  'Supervising Animation Director':  '作画監督統括',
  'Supervision':                     '監修',
  'Theme Song Composition':          '主題歌作曲',
  'Theme Song Lyrics':               '主題歌作詞',
  'Theme Song Performance':          '主題歌歌唱',
  '2nd Key Animation':               '第二原画',
  '3D Director':                     '3D監督',
  '3D CGI Director':                 '3D CGディレクター',
  'Voice Actor':                     '声優',
  'Voice Director':                  '音響演出',
  'Art':                             'アート',
};

// ─── Tag translations (AniList content tags) ─────────────────────────────────
export const TAG_JP: Record<string, string> = {
  // Demographics
  'Shounen':                    '少年',
  'Shoujo':                     '少女',
  'Seinen':                     '青年',
  'Josei':                      '女性向け',
  'Kodomomuke':                 '子供向け',

  // Themes — Romance / Relationships
  'Age Gap':                    '年の差',
  'Arranged Marriage':          '政略結婚',
  'Boys Love':                  'ボーイズラブ',
  'Childhood Friends':          '幼なじみ',
  'Confession':                 '告白',
  'Forbidden Love':             '禁断の愛',
  'Girls Love':                 '百合',
  'Harem':                      'ハーレム',
  'Incest':                     '近親相姦',
  'Love Triangle':              '三角関係',
  'Marriage':                   '結婚',
  'Pregnancy':                  '妊娠',
  'Reverse Harem':              '逆ハーレム',
  'Romance':                    '恋愛',
  'Teacher-Student Romance':    '師弟恋愛',
  'Twins':                      '双子',
  'Unrequited Love':            '片思い',
  'Yaoi':                       'ヤオイ',
  'Yuri':                       '百合',

  // Themes — Action / Combat
  'Archery':                    '弓術',
  'Battle Royale':              'バトルロワイアル',
  'Death Game':                 'デスゲーメ',
  'Fighting':                   '格闘',
  'Gore':                       'ゴア',
  'Guns':                       '銃',
  'Martial Arts':               '武道',
  'Military':                   '軍事',
  'Ninja':                      '忍者',
  'Samurai':                    '侍',
  'Survival':                   'サバイバル',
  'Survival Game':              'サバイバルゲーム',
  'Swordplay':                  '剣術',
  'Terrorism':                  'テロリズム',
  'Tournament':                 'トーナメント',
  'Violence':                   '暴力',
  'War':                        '戦争',

  // Settings
  'Alternate History':          '架空の歴史',
  'Alternate Universe':         '並行世界',
  'College':                    '大学',
  'Cyberpunk':                  'サイバーパンク',
  'Dystopia':                   'ディストピア',
  'Fantasy World':              'ファンタジー世界',
  'Feudal Japan':               '封建日本',
  'High School':                '高校',
  'Historical':                 '歴史',
  'Hospital':                   '病院',
  'Isekai':                     '異世界',
  'Medieval':                   '中世',
  'Modern':                     '現代',
  'Near Future':                '近未来',
  'Post-Apocalyptic':           'ポスト黙示録',
  'School':                     '学校',
  'Space':                      '宇宙',
  'Steampunk':                  'スチームパンク',
  'Virtual Reality':            '仮想現実',
  'Workplace':                  '職場',

  // Character Types
  'Android':                    'アンドロイド',
  'Anti-Hero':                  'アンチヒーロー',
  'Bishounen':                  '美少年',
  'Butler':                     '執事',
  'Cat Girl':                   '猫耳少女',
  'Dandere':                    'ダンデレ',
  'Ensemble Cast':              '群像劇',
  'Female Protagonist':         '女性主人公',
  'Fox Girl':                   '狐耳少女',
  'Gyaru':                      'ギャル',
  'Kemonomimi':                 '獣耳',
  'Kuudere':                    'クーデレ',
  'Loli':                       'ロリ',
  'Maid':                       'メイド',
  'Male Protagonist':           '男性主人公',
  'Monster Boy':                'モンスター少年',
  'Monster Girl':               'モンスター娘',
  'Non-Human Protagonist':      '非人間主人公',
  'Trap':                       '男の娘',
  'Tsundere':                   'ツンデレ',
  'Villain Protagonist':        '悪役主人公',
  'Wolf Girl':                  '狼耳少女',
  'Yandere':                    'ヤンデレ',

  // Magic / Fantasy Creatures
  'Angels':                     '天使',
  'Demons':                     '悪魔',
  'Dragons':                    'ドラゴン',
  'Dwarves':                    'ドワーフ',
  'Elves':                      'エルフ',
  'Fairies':                    '妖精',
  'Gods':                       '神',
  'Kaiju':                      '怪獣',
  'Mahou Shoujo':               '魔法少女',
  'Magic':                      '魔法',
  'Monster Taming':             'モンスター使い',
  'Mythology':                  '神話',
  'Reincarnation':              '転生',
  'Super Power':                '超能力',
  'Superhero':                  'スーパーヒーロー',
  'Vampire':                    'ヴァンパイア',
  'Vampires':                   'ヴァンパイア',
  'Werewolves':                 '人狼',
  'Witches':                    '魔女',
  'Zombie':                     'ゾンビ',
  'Zombies':                    'ゾンビ',

  // Technology / Sci-Fi
  'Aliens':                     '宇宙人',
  'Artificial Intelligence':    '人工知能',
  'Clones':                     'クローン',
  'Mecha':                      'メカ',
  'Real Robot':                 'リアルロボット',
  'Robots':                     'ロボット',
  'Space Travel':               '宇宙旅行',
  'Super Robot':                'スーパーロボット',
  'Time Travel':                'タイムトラベル',

  // Psychological / Dark
  'Amnesia':                    '記憶喪失',
  'Body Horror':                'ボディホラー',
  'Body Swapping':              '体交換',
  'Cannibalism':                '食人',
  'Dark':                       'ダーク',
  'Gender Bending':             '性別転換',
  'Horror':                     'ホラー',
  'Human Experimentation':      '人体実験',
  'Insanity':                   '狂気',
  'Mind Games':                 '頭脳戦',
  'Mystery':                    'ミステリー',
  'Psychological':              '心理',
  'Strategy':                   '戦略',
  'Torture':                    '拷問',
  'Tragedy':                    '悲劇',

  // Slice of Life / Daily
  'Camping':                    'キャンプ',
  'Club Activities':            '部活動',
  'Coming of Age':              '成長',
  'Cooking':                    '料理',
  'Daily Life':                 '日常生活',
  'Family Life':                '家族',
  'Found Family':               '出会った家族',
  'Hot Springs':                '温泉',
  'School Life':                '学園生活',
  'Slice of Life':              '日常',

  // Arts / Entertainment
  'Art':                        'アート',
  'Film':                       '映画',
  'Idol':                       'アイドル',
  'Music':                      '音楽',
  'Otaku Culture':              'オタク文化',
  'Theatre':                    '演劇',

  // Sports
  'American Football':          'アメリカンフットボール',
  'Archery (Sport)':            '弓道',
  'Badminton':                  'バドミントン',
  'Baseball':                   '野球',
  'Basketball':                 'バスケットボール',
  'Bowling':                    'ボウリング',
  'Boxing':                     'ボクシング',
  'Cycling':                    '自転車競技',
  'Fencing':                    'フェンシング',
  'Figure Skating':             'フィギュアスケート',
  'Football':                   'フットボール',
  'Golf':                       'ゴルフ',
  'Gymnastics':                 '体操',
  'Horse Racing':               '競馬',
  'Ice Hockey':                 'アイスホッケー',
  'Judo':                       '柔道',
  'Kendo':                      '剣道',
  'Rugby':                      'ラグビー',
  'Skateboarding':              'スケートボード',
  'Skiing':                     'スキー',
  'Soccer':                     'サッカー',
  'Snowboarding':               'スノーボード',
  'Sports':                     'スポーツ',
  'Sumo':                       '相撲',
  'Swimming':                   '水泳',
  'Table Tennis':               '卓球',
  'Tennis':                     'テニス',
  'Track and Field':            '陸上競技',
  'Volleyball':                 'バレーボール',
  'Wrestling':                  'レスリング',

  // Gaming
  'Board Game':                 'ボードゲーム',
  'Card Game':                  'カードゲーム',
  'Dungeon':                    'ダンジョン',
  'Dungeon Crawling':           'ダンジョン探索',
  'Fighting Game':              '格闘ゲーム',
  'Gambling':                   'ギャンブル',
  'Game Elements':              'ゲーム要素',
  'Level System':               'レベルシステム',
  'Otome Game':                 '乙女ゲーム',
  'RPG':                        'RPG',
  'Status Screen':              'ステータス画面',
  'Video Games':                'ビデオゲーム',

  // Social / Occupation
  'Adoption':                   '養子',
  'Crime':                      '犯罪',
  'Crossdressing':              '女装・男装',
  'Delinquents':                '不良',
  'Detective':                  '探偵',
  'Farming':                    '農業',
  'Fugitive':                   '逃亡者',
  'Genius':                     '天才',
  'Guild':                      'ギルド',
  'Hikikomori':                 '引きこもり',
  'Kingdom':                    '王国',
  'Mafia':                      'マフィア',
  'NEET':                       'ニート',
  'Noble':                      '貴族',
  'Office Lady':                'OL',
  'Otaku':                      'オタク',
  'Police':                     '警察',
  'Revenge':                    '復讐',
  'Rivalry':                    'ライバル',
  'Royalty':                    '王族',
  'Salary Man':                 'サラリーマン',
  'Siblings':                   '兄弟',
  'Slavery':                    '奴隷',
  'Yakuza':                     'ヤクザ',

  // Narrative / Structure
  'Anthology':                  'アンソロジー',
  'Anthropomorphism':           '擬人化',
  'CGI':                        'CGI',
  'Chibi':                      'ちびキャラ',
  'Comedy':                     'コメディ',
  'Ecchi':                      'エッチ',
  'Gag Humor':                  'ギャグ',
  'Nakama':                     '仲間',
  'Nudity':                     'ヌード',
  'Parody':                     'パロディ',
  'Sequel':                     '続編',
  'Short Episodes':             '短編',
  'Time Skip':                  '時間軸移動',
  'Visual Novel':               'ビジュアルノベル',

  // Power / Fantasy tropes
  'Cheat Ability':              'チート能力',
  'Demon Lord':                 '魔王',
  'Hero':                       '英雄',
  'Overpowered Main Character': '最強主人公',
  'Quest':                      'クエスト',
  'Villainess':                 '悪役令嬢',
};

// Reverse lookup maps (JP → EN) for use in onSelect callbacks
export const GENRE_JP_TO_EN: Record<string, string> =
  Object.fromEntries(Object.entries(GENRE_JP).map(([en, jp]) => [jp, en]));

export const ROLE_JP_TO_EN: Record<string, string> =
  Object.fromEntries(Object.entries(ROLE_JP).map(([en, jp]) => [jp, en]));

export const TAG_JP_TO_EN: Record<string, string> =
  Object.fromEntries(Object.entries(TAG_JP).map(([en, jp]) => [jp, en]));

// ─── Translation helpers ──────────────────────────────────────────────────────

export function translateGenre(en: string, lang: string): string {
  if (lang !== 'jp') return en;
  return GENRE_JP[en] ?? en;
}

export function translateRole(en: string, lang: string): string {
  if (lang !== 'jp') return en;
  return ROLE_JP[en] ?? en;
}

export function translateTag(en: string, lang: string): string {
  if (lang !== 'jp') return en;
  return TAG_JP[en] ?? en;
}

/** Convert a displayed value (possibly JP) back to the canonical EN key. */
export function roleToEN(display: string, lang: string): string {
  if (lang !== 'jp') return display;
  return ROLE_JP_TO_EN[display] ?? display;
}

export function tagToEN(display: string, lang: string): string {
  if (lang !== 'jp') return display;
  return TAG_JP_TO_EN[display] ?? display;
}

export function genreToEN(display: string, lang: string): string {
  if (lang !== 'jp') return display;
  return GENRE_JP_TO_EN[display] ?? display;
}
