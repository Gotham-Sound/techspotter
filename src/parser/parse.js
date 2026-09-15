// The core parser: normalized text runs (per page) in, structured show
// out. Pure module, no DOM, no pdf.js. Failure is loud: zero scenes or a
// missing text layer throws a ParseError the UI must surface plainly.

import { BANDS, bandOf } from './constants.js';
import { groupLines } from './lines.js';
import { parseHeading } from './heading.js';
import { evaluateCue } from './cues.js';
import { deriveCharacters, findMergeOffers } from './characters.js';
import { derivePresence } from './presence.js';
import { stripBurnIns } from './burnin.js';
import { POLICY } from './policy.js';

export class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

export function parseShow(rawPages) {
  if (!rawPages.length || rawPages.every((p) => !p.length)) {
    throw new ParseError(
      'no-text',
      'No text layer found in this PDF. It may be a scan (image-only); TechSpotter needs a text PDF.',
    );
  }

  const { pages, burnIns } = stripBurnIns(rawPages);

  // Printed page numbers read from PRE-strip lines (policy burn_in note):
  // the printed-page contract never depends on any strip rule. Rotated
  // debris is excluded — it is never part of a header line.
  const printedPages = rawPages.map((runs) =>
    printedPageFrom(
      groupLines(runs.filter((r) => !r.rot)).filter((l) => l.y > BANDS.headerY),
    ),
  );

  const sheets = pages.map((runs, i) => {
    const lines = groupLines(runs);
    const headerLines = lines.filter((l) => l.y > BANDS.headerY);
    const bodyLines = lines.filter((l) => l.y <= BANDS.headerY);
    return {
      sheet: i + 1,
      headerLines,
      bodyLines,
      printedPage: printedPages[i],
    };
  });

  const furniture = new Set();
  for (const s of sheets) {
    for (const l of s.headerLines) furniture.add(l.text.trim().toUpperCase());
  }

  const flat = [];
  for (const s of sheets) {
    for (const l of s.bodyLines) {
      flat.push({ ...l, sheet: s.sheet, page: s.printedPage ?? s.sheet });
    }
  }

  // Heading candidates live at the left margin (slugs) or carry margin
  // scene numbers; dialogue-band text that quotes a slug is never one.
  const headings = flat.map((l) =>
    l.minX < BANDS.dialogue[0] ? parseHeading(l) : null,
  );

  // Pre-scan (brief §3.1): any numbered heading anywhere puts the whole
  // document in numbered mode, where bare slugs are context, not
  // boundaries. No numbered headings at all = bare-slug mode.
  // Numbered-prose entries never vote on mode and never bound outside
  // numbered mode (#71 ruling: the shape only exists in numbered drafts).
  const mode = headings.some((h) => h?.num && !h.prose) ? 'numbered' : 'bare-slug';

  const bounds = [];
  flat.forEach((line, idx) => {
    const h = headings[idx];
    if (!h) return;
    if (mode === 'numbered' && !h.num) return;
    if (h.prose && mode !== 'numbered') return;
    bounds.push({ idx, h, line });
  });

  if (!bounds.length) {
    throw new ParseError(
      'zero-scenes',
      `No scenes found. TechSpotter looked for scene headings (INT. / EXT. slugs) across ${pages.length} page(s) and found none. Is this a screenplay PDF?`,
    );
  }

  // Cold open (policy cold_open; hub #66 ruling, Peter 2026-09-15): a
  // SEATABLE cue before the first heading opens an implicit leading
  // scene instead of vanishing into front matter (the silent-loss class:
  // no seat, no chip, no text). Seatable = the same tests the in-scene
  // path applies (cue band + gates + dialogue-band follow) plus the
  // policy proximity: the next line must sit within follow_max_gap_pt
  // of one line-advance below the cue, on the same sheet, which is what
  // keeps a centered title page's floating blocks from faking one.
  // Numbered drafts take the synthetic id (nothing renumbers); bare-slug
  // drafts take the next ordinal and every later ordinal shifts, the
  // consequence blessed by name in the ruling (the mb101 pattern).
  const co = POLICY.cold_open;
  if (co) {
    const gap = 12 + (co.follow_max_gap_pt ?? 14);
    for (let i = 0; i < bounds[0].idx; i++) {
      const line = flat[i];
      if (bandOf(line.minX) !== 'cue') continue;
      const next = flat[i + 1];
      if (!next || next.sheet !== line.sheet || line.y - next.y > gap) continue;
      // The follow must read as dialogue PROSE (contains a lowercase
      // letter): all-caps list rows (a sets list, a cast page) never
      // qualify (#68 delta, the cml sets-list phantom).
      if (!/[a-z]/.test(next.text)) continue;
      const v = evaluateCue(line, next, { furniture: new Set() });
      if (!v?.accept) continue;
      bounds.unshift({
        idx: i - 1,
        h: {
          num: mode === 'numbered' ? String(co.scene_id_numbered) : null,
          heading: co.scene_heading,
        },
        line: { ...line, text: co.scene_heading },
      });
      break;
    }
  }

  // Front matter (title page etc.) is furniture: any of its lines seen
  // again in the cue band is never a character (brief §3.2).
  for (let i = 0; i < bounds[0].idx; i++) {
    furniture.add(flat[i].text.trim().toUpperCase());
  }

  // Dominant body font: lines set in any other face are "alt font", the
  // italic-run signal the playback detector's lyrics ruling uses.
  const fontCount = new Map();
  for (const l of flat) {
    if (l.font) fontCount.set(l.font, (fontCount.get(l.font) ?? 0) + 1);
  }
  let dominantFont = null;
  for (const [f, n] of fontCount) {
    if (dominantFont === null || n > fontCount.get(dominantFont)) dominantFont = f;
  }

  const scenes = [];
  const rejectMap = new Map();

  bounds.forEach((bound, b) => {
    const end = b + 1 < bounds.length ? bounds[b + 1].idx : flat.length;
    const id = mode === 'numbered' ? bound.h.num : String(b + 1);
    const scene = {
      id,
      heading: bound.h.heading,
      page: bound.line.page,
      characters_speaking: [],
      action_text: '',
      dialogue_by_character: {},
      text: '',
      lines: [],
    };
    const textLines = [bound.h.heading];
    const actionLines = [];
    let openSpeaker = null;
    let openDual = null; // {left, right, boundary} while a dual block runs
    const record = (line, band, extra = {}) => {
      scene.lines.push({
        text: line.text,
        band,
        page: line.page,
        sheet: line.sheet,
        y: line.y,
        x0: line.minX,
        x1: line.maxX,
        altFont: Boolean(line.font && dominantFont && line.font !== dominantFont),
        speaker: null,
        cue: null,
        ...extra,
      });
    };
    record(bound.line, 'heading');

    for (let i = bound.idx + 1; i < end; i++) {
      const line = flat[i];
      textLines.push(line.text);
      const verdict = evaluateCue(line, flat[i + 1], { furniture });

      // Dual-dialogue block (#69 ruling, split-don't-rail): both halves
      // seat; the rows beneath attribute by the column boundary, each
      // row's SEGMENTS parted at it (same-baseline columns cluster into
      // one line here, the reference's own finding); a spanning segment
      // or any non-dialogue line ends the block.
      if (verdict?.dual) {
        const d = verdict.dual;
        openSpeaker = null;
        openDual = { ...d };
        for (const half of [d.left, d.right]) {
          if (!scene.characters_speaking.includes(half.name)) {
            scene.characters_speaking.push(half.name);
          }
          scene.dialogue_by_character[half.name] ??= '';
        }
        record(line, 'cue', { cue: `${d.left.name} || ${d.right.name}` });
        continue;
      }
      if (openDual && !verdict) {
        const band = bandOf(line.minX);
        const spanning = line.segments.some(
          (s) => s.x0 < openDual.boundary && s.x1 > openDual.boundary,
        );
        if ((band === 'dialogue' || band === 'paren') && !spanning) {
          for (const s of line.segments) {
            const half = s.x0 >= openDual.boundary ? openDual.right : openDual.left;
            scene.dialogue_by_character[half.name] +=
              (scene.dialogue_by_character[half.name] ? '\n' : '') + s.text;
          }
          record(line, band, { speaker: `${openDual.left.name} || ${openDual.right.name}` });
          continue;
        }
        openDual = null;
      } else if (verdict) {
        openDual = null;
      }

      if (verdict?.accept) {
        openSpeaker = verdict.accept.name;
        if (!scene.characters_speaking.includes(openSpeaker)) {
          scene.characters_speaking.push(openSpeaker);
        }
        scene.dialogue_by_character[openSpeaker] ??= '';
        record(line, 'cue', { cue: openSpeaker });
        continue;
      }
      if (verdict?.reject) {
        // A rejected cue-shaped line (watermark debris etc.) must not
        // steal the open dialogue block.
        const r = verdict.reject;
        const key = `${r.name}|${r.reason}`;
        if (!rejectMap.has(key)) {
          rejectMap.set(key, {
            name: r.name,
            code: r.code,
            reason: r.reason,
            occurrences: [],
          });
        }
        rejectMap.get(key).occurrences.push({
          scene: id,
          page: line.page,
          anchor: {
            page: line.sheet,
            bbox: [line.minX, line.y - 3, line.maxX, line.y + 9],
          },
        });
        record(line, 'rejected-cue');
        continue;
      }

      const band = bandOf(line.minX);
      if (band === 'dialogue' || band === 'paren') {
        if (openSpeaker) {
          scene.dialogue_by_character[openSpeaker] +=
            (scene.dialogue_by_character[openSpeaker] ? '\n' : '') + line.text;
        }
        record(line, band, { speaker: openSpeaker });
        continue;
      }
      openSpeaker = null;
      if (band === 'action') actionLines.push(line.text);
      record(line, band);
    }

    scene.action_text = actionLines.join('\n');
    scene.text = textLines.join('\n');
    scenes.push(scene);
  });

  // #66 disposition 2: the reject scanner runs over front matter too, so
  // a cue-shaped near-miss in a cold open CHIPS instead of vanishing (a
  // performer must never be discoverable only by a human noticing an
  // absence). Empty furniture ctx on purpose: these lines seeded the
  // furniture set themselves. Chips attribute to the first scene.
  for (let i = 0; i < bounds[0].idx; i++) {
    const line = flat[i];
    const v = evaluateCue(line, flat[i + 1], { furniture: new Set() });
    if (!v?.reject) continue;
    const r = v.reject;
    const key = `${r.name}|${r.reason}`;
    if (!rejectMap.has(key)) {
      rejectMap.set(key, { name: r.name, code: r.code, reason: r.reason, occurrences: [] });
    }
    rejectMap.get(key).occurrences.push({
      scene: scenes[0].id,
      page: line.page,
      anchor: { page: line.sheet, bbox: [line.minX, line.y - 3, line.maxX, line.y + 9] },
    });
  }

  const characters = deriveCharacters(scenes);
  return derivePresence({
    mode,
    scenes,
    characters,
    rejects: [...rejectMap.values()],
    merge_offers: findMergeOffers(characters),
    burn_ins: burnIns,
  });
}

// Printed page number (brief §3.5): the running-header zone wins over
// anything in the body; a sentence ending in a number is not a page.
function printedPageFrom(headerLines) {
  let best = null;
  for (const line of headerLines) {
    for (const seg of line.segments) {
      const t = seg.text.trim();
      if (/^\d{1,4}[A-Z]?\.?$/.test(t) && (!best || seg.x0 > best.x0)) {
        best = { x0: seg.x0, text: t.replace(/\.$/, '') };
      }
    }
  }
  if (!best) return null;
  return /^\d+$/.test(best.text) ? Number(best.text) : best.text;
}
