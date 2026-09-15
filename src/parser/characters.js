// Character identity (brief §3.3): variants are distinct performers by
// default; same-person guesses are offer-only merge suggestions.

import { POLICY, foldName } from './policy.js';

// Suffixed names never fold OR offer (#63 ruling): JR/SR are the
// generational analog of the YOUNG VALERIE leading-qualifier doctrine,
// so extras made entirely of name_suffixes tokens (dot-insensitive)
// never produce a surname-prefix offer against the bare base.
const NAME_SUFFIXES = new Set(POLICY.name_suffixes ?? []);

export function deriveCharacters(scenes) {
  const map = new Map();
  for (const sc of scenes) {
    for (const name of sc.characters_speaking) {
      if (!map.has(name)) map.set(name, { name, scenes: [] });
      map.get(name).scenes.push(sc.id);
    }
  }
  return [...map.values()]
    .map((c) => ({ ...c, scene_count: c.scenes.length }))
    .sort((a, b) => b.scene_count - a.scene_count);
}

// Offer-only merge suggestions, two families, neither ever automatic:
// - surname form: the shorter name's tokens are a PREFIX of the longer
//   name's (extra tokens sit in surname position). A leading qualifier
//   (YOUNG VALERIE) is not a prefix match, so it never offers.
//   Canonical = the name used in more scenes.
// - channel form (policy channel tier, offer-only): a recognized channel
//   variant (parenthetical tag or possessive noun) whose base exists as a
//   plain character offers a fold into the base, carrying the policy
//   channel kind. TEXT-family (kind 'text') is NOT offered here: those
//   columns are conversion candidates (video cues), Peter's Layer 2
//   ruling for this bench.
export function findMergeOffers(characters) {
  const offers = [];
  const names = new Set(characters.map((c) => c.name));
  const plain = characters.filter((c) => !c.name.includes('('));
  for (const longer of plain) {
    const lt = longer.name.split(' ');
    if (lt.length < 2) continue;
    for (const shorter of plain) {
      const st = shorter.name.split(' ');
      if (st.length >= lt.length) continue;
      if (!st.every((t, i) => lt[i] === t)) continue;
      const extras = lt.slice(st.length);
      if (!extras.every((t) => /^[A-Z][A-Z'.\-]*$/.test(t))) continue;
      if (extras.every((t) => NAME_SUFFIXES.has(t.replace(/\./g, '')))) continue;
      const [canonical, variant] =
        shorter.scene_count >= longer.scene_count
          ? [shorter, longer]
          : [longer, shorter];
      offers.push({ variant: variant.name, canonical: canonical.name });
    }
  }
  for (const c of characters) {
    const f = foldName(c.name);
    if (f.tier !== 'channel' || f.kind === 'text') continue;
    if (f.base && f.base !== c.name && names.has(f.base)) {
      offers.push({ variant: c.name, canonical: f.base, channel: true, kind: f.kind });
    }
  }
  return offers;
}

// Columns that Peter's text-channel ruling marks as conversion candidates:
// a text on a screen is a video cue, not a performer (policy kind 'text':
// TEXT/TEXTS/POST/POSTS/DM/DMS possessives). Offer-only; the operator's
// two-tap convert deletes the column, the video moment stands.
export function textChannelNames(characters) {
  return characters
    .map((c) => c.name)
    .filter((n) => foldName(n).kind === 'text');
}
