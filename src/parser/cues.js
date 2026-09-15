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

// The full text-level cue gate on a NORMALIZED cue (the kernel failGate
// shares): furniture, ruled trailing glyphs, charset with the admitted
// shapes, stop words, single glyph. Geometry (band, wide) stays with the
// line-level callers.
function cueTextOk(cue) {
  if (!cue || !/[A-Z]/.test(cue)) return false;
  if (isFurniture(cue)) return false;
  if (REJECT_TRAILING.some((g) => cue.endsWith(g))) return false;
  const base = qualifiedBase(cue);
  if (!cueCharsetOk(base)) return false;
  if (base.split(/\s+/).some((t) => CUE_STOP_WORDS.has(t))) return false;
  if (base.replace(/[\s.]/g, '').length === 1) return false;
  return true;
}

// split_dual_header (hub corpus contract, vectors/dual.json; #69 ruling,
// split-don't-rail): words = [text, x0, x1][] in x order. Returns
// [left, right, boundary_x] when the row parts at exactly ONE gap wider
// than dual_dialogue.min_gap_pt into two groups that EACH pass the full
// cue gate; else null (a sets-list row stays a wide reject). Boundary is
// the midpoint of the two groups' x starts, per the filed geometry. Our
// segments are the natural word groups: SEG_GAP (14) sits far below
// min_gap_pt (40), so intra-segment gaps can never count as the split.
export function splitDualHeader(words) {
  const minGap = POLICY.dual_dialogue?.min_gap_pt ?? 40;
  if (words.length < 2) return null;
  const wide = [];
  for (let k = 0; k < words.length - 1; k++) {
    if (words[k + 1][1] - words[k][2] > minGap) wide.push(k);
  }
  if (wide.length !== 1) return null;
  const k = wide[0];
  const left = words.slice(0, k + 1).map((w) => w[0]).join(' ').trim();
  const right = words.slice(k + 1).map((w) => w[0]).join(' ').trim();
  for (const half of [left, right]) {
    // A raw colon-terminated half is a list label (INTERIORS: /
    // EXTERIORS:, the cuper sets-list shape), not a cue name: normalize
    // strips the colon, so this fence tests the half AS PRINTED.
    if (half.endsWith(':')) return null;
    const cue = normCue(half);
    if (!cueTextOk(cue)) return null;
  }
  return [left, right, (words[0][1] + words[k + 1][1]) / 2];
}

export function evaluateCue(line, nextLine, ctx) {
  // Dual-dialogue headers run BEFORE the candidacy fork (#69 ruling,
  // reference finding: the row's x0 floats with column width, so narrow
  // pairs die at position and wide ones at the wide gate if this runs
  // later). Both halves must gate and dialogue must follow.
  if (line.segments.length === 2 && line.text === line.text.toUpperCase()) {
    const split = splitDualHeader(
      line.segments.map((s) => [s.text, s.x0, s.x1]),
    );
    if (split) {
      const followed =
        nextLine && ['dialogue', 'paren'].includes(bandOf(nextLine.minX));
      if (followed) {
        const [l, r, boundary] = split;
        return {
          dual: {
            left: normCueDetail(l),
            right: normCueDetail(r),
            boundary,
          },
        };
      }
    }
  }
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

// cue_charset_ok (hub corpus contract, vectors/charset.json; #52/#63
// rulings as policy data): the strict class [A-Z0-9 .'-] judges the cue
// with the two RULED trailing shapes removed first: <marker><digits>
// (MERC #1) and comma + name_suffixes token, dot-insensitive
// (SALLY, JR). The remainder must be non-empty, so a bare numbered
// group, a mid-name marker, or a non-suffix comma stays railed.
const SUFFIX_TAIL_RE = /,\s*([A-Z][A-Z.]*)$/;
const NAME_SUFFIXES = new Set(POLICY.name_suffixes ?? []);
const MARKER_TAIL_RE = new RegExp(
  `${(POLICY.numbered_part_marker ?? '#').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`,
);

function stripAdmittedShapes(cue) {
  let t = cue;
  const m = t.match(SUFFIX_TAIL_RE);
  if (m && NAME_SUFFIXES.has(m[1].replace(/\./g, ''))) {
    t = t.slice(0, m.index).trimEnd();
  }
  return t.replace(MARKER_TAIL_RE, '').trimEnd();
}

export function cueCharsetOk(cue) {
  const rest = stripAdmittedShapes(cue);
  return rest.length > 0 && ![...rest].some((c) => !/[A-Z0-9 .'\-]/.test(c));
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
  if (!cueCharsetOk(base)) {
    const rest = stripAdmittedShapes(base);
    const bad = [...(rest || base)].find((c) => !/[A-Z0-9 .'\-]/.test(c)) ?? base[0];
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
