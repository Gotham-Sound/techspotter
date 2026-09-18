import { POLICY } from './policy.js';

// Scene-heading recognition. Slug test per brief §3.1: INT./EXT./I/E.
// prefix with the dot required (INTO is not INT.), all-caps, <= ~90 chars.
// Scene ids are STRINGS everywhere; drafts have 22A.

// E/I. added 2026-09-15 (hub defect #70 parity: numbered E/I. scenes
// folded into their predecessor on drafts that spell the combo that way).
const SLUG_START = /^(INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.|E\/I\.|INT\.|EXT\.)(\s|$)/;
const SCENE_NUM = /^\d{1,4}[A-Z]{0,2}$/;

export function isSlugText(text) {
  const t = text.trim();
  return (
    SLUG_START.test(t) &&
    /[A-Z]/.test(t) &&
    t === t.toUpperCase() &&
    t.length <= 90
  );
}

// Returns { num: string|null, heading: string } or null. Handles margin
// scene numbers as separate segments (left, right, or both) and the
// merged-run "14  INT. LAB - NIGHT" form. A trailing number is only
// treated as a scene id when it sits in the right margin as its own
// segment; "EXT. HIGHWAY 101 - DAY" keeps its 101.
export function parseHeading(line) {
  let segs = line.segments
    .map((s) => ({ x0: s.x0, text: s.text.trim().replace(/\s*\*+$/, '') }))
    .filter((s) => s.text);
  if (!segs.length) return null;

  let num = null;
  let margins = 0;
  if (segs.length > 1 && SCENE_NUM.test(segs[0].text)) {
    num = segs[0].text;
    segs = segs.slice(1);
    margins += 1;
  }
  const last = segs.at(-1);
  if (
    segs.length > 1 &&
    SCENE_NUM.test(last.text) &&
    last.x0 > 400 &&
    (num === null || last.text === num)
  ) {
    num ??= last.text;
    segs = segs.slice(0, -1);
    margins += 1;
  }

  let heading = segs.map((s) => s.text).join(' ').trim();
  if (num === null) {
    const m = heading.match(/^(\d{1,4}[A-Z]{0,2})[\s.]+(.+)$/);
    if (m && isSlugText(m[2].trim())) {
      num = m[1];
      heading = m[2].trim();
    }
  }
  if (!isSlugText(heading)) return null;
  return { num, heading };
}

// classify_margin_row (hub corpus contract, vectors/margin_rows.json;
// the #87 three-part ruling, absorbed per #98): classify one TEXT line
// as a margin-number row, pure, so both engines part these rows
// identically and the NEXT furniture form lands LOUD as "unclassified"
// instead of dropping silent. Subsumes the #71 numbered-prose path and
// closes the OMITTED parity gap this bench flagged on #68 (dotted and
// annotated OMITTED forms, the v0.2.6 correctness class).
const OMITTED_ROW_RE =
  /^\s*([A-Z]*\d+[A-Z]?)\s+OMITTED(?:[.:]|\s*\[[^\]]*\]|\s*\([^)]*\))*(?:\s+\1)?\s*\*?\s*$/i;
const NUMBERED_PROSE_RE = /^\s*([A-Z]*\d+[A-Z]?)\s+(.+?)\s+\1\s*\*?\s*$/;
const CONTINUED_BODY_RE = /^CONTINUED:?(?:\s*\(\d+\))?\.?$/;
const LEADING_SID_RE = /^\s*([A-Z]*\d+[A-Z]?)\s+\S/;

// Mirror of the reference's _clean_action: smart quotes and dashes to
// ASCII, whitespace collapsed; parentheticals KEPT.
function cleanActionText(s) {
  return (s ?? '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Text-level scene heading: [sid] SLUG [sid] with optional star.
function textHeading(t) {
  const m = t.match(/^\s*(?:([A-Z]*\d+[A-Z]?)[\s.]+)?(.+?)(?:\s+\1)?\s*\*?\s*$/);
  if (!m) return null;
  const heading = m[2].trim();
  if (!isSlugText(heading)) return null;
  return { num: m[1] ? m[1].toUpperCase() : null, heading };
}

export function classifyMarginRow(text, inMargin, numberedMode, openSceneId = null) {
  const t = (text ?? '').trim();
  if (!t) return null;
  const sh = textHeading(t);
  if (sh && sh.num !== null) {
    return { kind: 'heading', id: sh.num, heading: sh.heading };
  }
  const om = t.match(OMITTED_ROW_RE);
  if (om) return { kind: 'omitted', id: om[1].toUpperCase(), heading: 'OMITTED' };
  if (!(numberedMode && inMargin)) return null;
  const pm = t.match(NUMBERED_PROSE_RE);
  if (pm) {
    const sid = pm[1].toUpperCase();
    const body = pm[2].trim();
    if (/^OMITTED\b/.test(body)) return { kind: 'omitted', id: sid, heading: 'OMITTED' };
    if (CONTINUED_BODY_RE.test(body)) return { kind: 'continued', id: sid, heading: null };
    if (openSceneId !== null && sid === openSceneId) {
      return { kind: 'duplicate', id: sid, heading: null };
    }
    const cleaned = cleanActionText(body);
    const fallback = POLICY.numbered_prose_scenes?.scene_heading_fallback ?? 'SCENE';
    const heading = !/[a-z]/.test(cleaned) ? cleaned : `${fallback} ${sid}`;
    return { kind: 'prose', id: sid, heading };
  }
  const lm = t.match(LEADING_SID_RE);
  if (lm && !/[a-z]/.test(t)) {
    return { kind: 'unclassified', id: lm[1].toUpperCase(), heading: null };
  }
  return null;
}
