// Role weights for core creative roles
export const ROLE_WEIGHTS = {
  'Director': 3.0,
  'Series Director': 3.0,
  'Series Composition': 2.5,
  'Original Creator': 2.5,
  'Character Design': 2.0,
  'Chief Animation Director': 1.8,
  'Animation Director': 1.5,
  'Music': 2.0,
  'Art Director': 1.5,
  'Color Design': 1.2,
  'Director of Photography': 1.2,
  'Sound Director': 1.3,
  'Producer': 1.2,
  'Script': 1.5,
  'Storyboard': 1.3,
  'Episode Director': 1.0,
};

// Patterns that identify localization-only roles (exclude from staff overlap / collab graphs)
const LOCALIZATION_PATTERNS = [
  /\blocali[sz]ation\b/i,
  /\btranslat/i,
  /\bADR\b/i,
  /\bdub\b/i,
  /\bsubtitl/i,
  /\bsubtitling\b/i,
  /\bscript\s*\(dub\)/i,
  /\benglish\s+dub\b/i,
  /\bdubbing\b/i,
  /\badaptation\s*\(dub\)/i,
  /\brecord\s+mix\b/i,
  /\bvoice\s+direction\b/i,
  /\bcast\s+direction\b/i,
];

export function isLocalizationRole(roleText) {
  if (!roleText) return false;
  return LOCALIZATION_PATTERNS.some(p => p.test(roleText));
}

export function getRoleWeight(roleText) {
  if (!roleText) return 1.0;
  // Exact match first
  if (ROLE_WEIGHTS[roleText] !== undefined) return ROLE_WEIGHTS[roleText];
  // Partial match
  for (const [key, weight] of Object.entries(ROLE_WEIGHTS)) {
    if (roleText.toLowerCase().includes(key.toLowerCase())) return weight;
  }
  return 1.0;
}
