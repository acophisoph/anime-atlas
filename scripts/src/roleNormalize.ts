const rules: Array<{ group: string; patterns: RegExp[] }> = [
  { group: 'Direction', patterns: [/director/i, /監督/] },
  { group: 'Writing', patterns: [/writer/i, /script/i, /scenario/i, /脚本/, /series composition/i] },
  { group: 'Art', patterns: [/art/i, /design/i, /illustration/i, /character design/i, /美術/, /原画/] },
  { group: 'Animation', patterns: [/animation/i, /animator/i, /作画/, /cg/i] },
  { group: 'Music', patterns: [/composer/i, /music/i, /soundtrack/i, /song/i, /theme/i, /op\b/i, /ed\b/i, /バンド/, /音楽/] },
  { group: 'Sound', patterns: [/sound director/i, /audio director/i, /sound/i, /音響/] },
  { group: 'Voice', patterns: [/voice/i, /va\b/i, /cast/i, /声優/] },
  { group: 'Studio/Production', patterns: [/studio/i, /producer/i, /production/i, /製作/, /制作/] }
];

export function normalizeRole(roleRaw: string): string {
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(roleRaw))) {
      return rule.group;
    }
  }
  return 'Other';
}
