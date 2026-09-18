// .sceneline interchange v2 (docs/sceneline-interchange-v2.md, rev g).
// TechSpotter owns extensions.sound, extensions.video, and its
// x-techspotter review-state block. THE LAW: every foreign extension
// block and unknown top-level field is preserved value-identically
// across import -> edit -> export. Failure to read is loud, never a
// guess. Burn-in strip records ride show.burn_ins (§2 rule 7, rev g);
// files we wrote before rev g carried them in x-techspotter.

import { recompute } from '../parser/edits.js';

const OWN_TOP = new Set(['format', 'interchange', 'source', 'show', 'extensions']);
const OWN_EXT = new Set(['sound', 'video', 'x-techspotter']);

export class IngestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IngestError';
    this.code = code;
  }
}

export function buildSceneline(parsed, spot, opts = {}) {
  const profile = opts.profile ?? 'lean';
  const lean = profile === 'lean';

  const scenes = parsed.scenes.map((sc) => {
    const s = {
      scene: sc.id,
      scene_heading: sc.heading,
      page_start: sc.page,
      speakers: [...sc.characters_speaking],
      present_suggest: [...(sc.present_suggest ?? [])],
    };
    if (sc.present_confirmed?.length) s.present_confirmed = [...sc.present_confirmed];
    if (!lean) {
      s.action_text = sc.action_text ?? '';
      s.dialogue_text = Object.entries(sc.dialogue_by_character ?? {})
        .map(([name, text]) => `${name}:\n${text}`)
        .join('\n\n');
    }
    return s;
  });

  const trimMoment = (m) => {
    const c = structuredClone(m);
    if (lean && typeof c.snippet === 'string') c.snippet = c.snippet.slice(0, 120);
    return c;
  };

  return {
    ...structuredClone(opts.foreign?.top ?? {}),
    format: 'sceneline',
    interchange: 2,
    source: {
      title: opts.title ?? (opts.sourceFile ?? '').replace(/\.(pdf|sceneline)$/i, ''),
      file: opts.sourceFile ?? '',
      generator: 'techspotter/1.0',
      created: opts.created ?? new Date().toISOString(),
      profile,
    },
    show: {
      characters: parsed.characters.map((c) => c.name),
      cast_list: [],
      cast_nonspeaking: [],
      cast_aliases: structuredClone(parsed.cast_aliases ?? {}),
      scenes,
      review_dismissed: structuredClone(parsed.review_dismissed ?? []),
      ...(parsed.unclassified_rows?.length
        ? { unclassified_rows: structuredClone(parsed.unclassified_rows) }
        : {}),
      burn_ins: (parsed.burn_ins ?? []).map((b) => ({
        text: b.text,
        signal: b.signal,
        pages: b.pages,
        count: b.count,
        anchor: b.anchor
          ? { source_doc: opts.sourceFile ?? '', ...structuredClone(b.anchor) }
          : null,
      })),
    },
    extensions: {
      ...structuredClone(opts.foreign?.extensions ?? {}),
      sound: { moments: (spot?.sound.moments ?? []).map(trimMoment) },
      video: { moments: (spot?.video.moments ?? []).map(trimMoment) },
      'x-techspotter': {
        rejects: structuredClone(parsed.rejects ?? []),
        dismissed_offers: structuredClone(parsed.dismissed_offers ?? []),
        text_channel_kept: structuredClone(parsed.text_channel_kept ?? []),
      },
    },
  };
}

export function parseSceneline(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new IngestError('bad-json', 'This .sceneline file is not readable JSON.');
  }
  const interchange = doc.interchange ?? 1; // no field = v1, which v2 readers accept
  if (interchange > 2) {
    throw new IngestError(
      'newer',
      `This file is from a newer tool (interchange ${interchange}); TechSpotter speaks 2. Update TechSpotter instead of guessing.`,
    );
  }
  const show = doc.show;
  if (!show || !Array.isArray(show.scenes) || !show.scenes.length) {
    throw new IngestError('empty', 'No scenes found in this .sceneline file.');
  }

  const scenes = show.scenes.map((s, i) => ({
    id: String(s.scene ?? i + 1),
    heading: s.scene_heading ?? '',
    page: s.page_start ?? null,
    characters_speaking: [...(s.speakers ?? [])],
    present_suggest: [...(s.present_suggest ?? [])],
    present_confirmed: [...(s.present_confirmed ?? [])],
    present_dismissed: [],
    dialogue_by_character: {},
    action_text: s.action_text ?? '',
    text: [s.scene_heading, s.action_text, s.dialogue_text].filter(Boolean).join('\n'),
    lines: [],
  }));

  const xt = doc.extensions?.['x-techspotter'] ?? {};
  const parsed = {
    mode: 'imported',
    scenes,
    characters: (show.characters ?? []).map((n) => ({ name: n, scenes: [], scene_count: 0 })),
    unclassified_rows: structuredClone(show.unclassified_rows ?? []),
    rejects: structuredClone(xt.rejects ?? []),
    merge_offers: [],
    dismissed_offers: structuredClone(xt.dismissed_offers ?? []),
    text_channel_kept: structuredClone(xt.text_channel_kept ?? []),
    // rev g home first; x-techspotter is where our pre-rev-g files put them
    burn_ins: structuredClone(show.burn_ins ?? xt.burn_ins ?? []),
    cast_aliases: structuredClone(show.cast_aliases ?? {}),
    review_dismissed: structuredClone(show.review_dismissed ?? []),
  };
  recompute(parsed);

  const spot = {
    sound: { moments: structuredClone(doc.extensions?.sound?.moments ?? []) },
    video: { moments: structuredClone(doc.extensions?.video?.moments ?? []) },
  };

  const foreign = { top: {}, extensions: {} };
  for (const k of Object.keys(doc)) {
    if (!OWN_TOP.has(k)) foreign.top[k] = structuredClone(doc[k]);
  }
  for (const k of Object.keys(doc.extensions ?? {})) {
    if (!OWN_EXT.has(k)) foreign.extensions[k] = structuredClone(doc.extensions[k]);
  }

  return { parsed, spot, foreign, source: doc.source ?? {}, interchange };
}
