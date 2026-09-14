// Character-cue gates (brief §3.2). Strict, precision-biased, and loud:
// a cue-shaped line that fails a gate is surfaced as a reject with the
// gate named, provided it passes the noise filter (cue-positioned AND
// followed by dialogue-band text). Furniture is structural, never a chip.

import { bandOf, isFurniture } from './constants.js';
import { POLICY, isStandardTag, CUE_STOP_WORDS } from './policy.js';

// norm_cue (hub corpus contract, vectors/normalize.json; issue #60): raw
// cue line -> canonical name, '' = not a cue. Mirrors the reference's
// normalize_text + norm_cue semantics at this bench's tag-aware unit:
// quotes and bracketed asides drop, trailing [.:]+ drops, whitespace
// collapses, adjacent doubled words collapse, a parenthetical-ONLY line
// (the (MORE) class that once seated as a character here, issue #56) is
// not a cue at all. Silent-tier tags strip via stripCueTags; channel and
// unknown parentheticals stay in the name (variants are distinct
// columns, this bench's ruled presentation) — the corpus pins only the
// silent-tag and paren-only shapes, so both engines agree everywhere
// the contract speaks.
function normCueDetail(text) {
  let t = text
    .replace(/[“”"]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/[.:]+$/, '')
    .trim();
  if (!t || /^\([^()]*\)$/.test(t)) return { name: '', qualified: false };
  const { name, qualified } = stripCueTags(t);
  const words = name.replace(/[.:]+$/, '').trim().split(' ');
  const deduped = [];
  for (const w of words) {
    if (!deduped.length || deduped[deduped.length - 1] !== w) deduped.push(w);
  }
  return { name: deduped.join(' '), qualified };
}

export const normCue = (raw) => normCueDetail(raw).name;

const REJECT_TRAILING = POLICY.cue_reject_trailing ?? [];

export function evaluateCue(line, nextLine, ctx) {
  if (bandOf(line.minX) !== 'cue') return null;
  // Merged-run revision stars ("TONY *") strip before any gate.
  const raw = line.text.trim().replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
  if (!/[A-Z]/.test(raw) || raw !== raw.toUpperCase()) return null;

  const { name, qualified } = normCueDetail(raw);
  if (!name || !/[A-Z]/.test(name)) return null;
  if (isFurniture(name) || ctx.furniture.has(name) || ctx.furniture.has(raw)) {
    return null;
  }
  // Trailing-glyph refusal is SILENT by ruling (#42, policy data): the
  // rule exists to suppress transition artifacts ("CUT TO -"), a true
  // negative grouped with transitions, never a chip.
  if (REJECT_TRAILING.some((g) => name.endsWith(g))) return null;

  const followed =
    nextLine && ['dialogue', 'paren'].includes(bandOf(nextLine.minX));
  const gate = failGate(line, name);
  if (gate) {
    return followed ? { reject: gate } : null;
  }
  if (!followed) return null;
  return { accept: { name, qualified } };
}

function failGate(line, name) {
  if (line.segments.length >= 2) {
    return {
      name: line.text.trim(),
      code: 'wide',
      reason: 'wide (dual dialogue?)',
    };
  }
  const base = qualifiedBase(name);
  const bad = [...base].find((c) => !/[A-Z0-9 .'\-]/.test(c));
  if (bad) {
    return { name, code: 'charset', reason: `charset '${bad}'` };
  }
  const stop = base.split(/\s+/).find((t) => CUE_STOP_WORDS.has(t));
  if (stop) {
    return { name, code: 'stopword', reason: `word '${stop}'` };
  }
  if (base.replace(/[\s.]/g, '').length === 1) {
    return { name, code: 'single-glyph', reason: 'single letter (watermark?)' };
  }
  return null;
}

// Strips trailing parentheticals. Silent-tier standard tags (policy
// standard_tags: V.O./O.S./O.C./CONT'D plus the ruled phone/intercut/
// prelap kin; dot- and space-insensitive) collapse to the same character;
// anything else is a distinct-performer qualifier kept in the name
// (brief §3.3) — channel variants stay distinct columns, offer-only.
function stripCueTags(text) {
  let name = text.trim();
  const quals = [];
  for (;;) {
    const m = name.match(/^(.*?)[ \t]*\(([^()]*)\)$/);
    if (!m || !m[1].trim()) break;
    const tag = m[2].trim();
    name = m[1].trim();
    if (!isStandardTag(tag)) quals.unshift(tag);
  }
  if (!quals.length) return { name, qualified: false };
  return { name: `${name} (${quals.join(') (')})`, qualified: true };
}

function qualifiedBase(name) {
  return name.replace(/\s*\(.*$/, '').trim();
}
