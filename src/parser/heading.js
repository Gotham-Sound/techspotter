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
  if (!isSlugText(heading)) {
    return numberedProse(line, segs, num, heading, margins);
  }
  return { num, heading };
}

// Numbered-prose boundaries (policy numbered_prose_scenes; hub #71
// ruling): a row whose SAME scene number sits on BOTH margins is a scene
// boundary even when the middle is prose (launch intercuts, mini-slugs);
// 31 numbered scenes folded across two real drafts without this. Both
// margins are the fence (require_both_margins): a lone grazing number
// never opens a scene. The row must start in the number column
// (x0 < 72). All-caps middles ARE the heading (a mini-slug); prose
// middles take the policy fallback. Only meaningful in numbered mode:
// the caller ignores prose entries for mode detection and outside
// numbered mode. OMITTED rows are out of scope here (unruled; parity
// question flagged on the hub).
function numberedProse(line, segs, num, heading, margins) {
  const nps = POLICY.numbered_prose_scenes;
  const x0 = line.minX ?? line.segments[0]?.x0 ?? 0;
  if (!nps || x0 >= 72) return null;
  let sid = null;
  let body = null;
  if (num !== null && margins >= 2 && segs.length >= 1) {
    // parseHeading peeled the SAME number off both margins.
    sid = num;
    body = heading;
  } else {
    const full = (line.text ?? line.segments.map((g) => g.text).join(' ')).trim();
    const m = full.match(/^([A-Z]*\d+[A-Z]?)\s+(.+?)\s+\1\s*\*?\s*$/);
    if (!m) return null;
    sid = m[1];
    body = m[2].trim();
  }
  if (!body || /^OMITTED\.?$/i.test(body)) return null;
  const caps = !/[a-z]/.test(body);
  return {
    num: sid,
    heading: caps ? body : `${nps.scene_heading_fallback ?? 'SCENE'} ${sid}`,
    prose: true,
  };
}
