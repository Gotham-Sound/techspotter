// DOM rendering: state in, DOM out. Script text is untrusted input, so
// everything renders via textContent — no innerHTML anywhere.

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function sp(cls, text) {
  const n = el('span', cls);
  n.textContent = text;
  return n;
}

import { textChannelNames } from '../parser/characters.js';

export function render(state, act) {
  const p = state.parsed;
  document.getElementById('intro').hidden = !!p;
  document.getElementById('tools').hidden = !p;
  document.getElementById('mxWrap').hidden = !p;
  if (!p) return;
  renderRejRail(state, act, document.getElementById('rejRail'));
  renderMarginRail(state, act, document.getElementById('marginRail'));
  renderTextRail(state, act, document.getElementById('textRail'));
  renderMergeRail(state, act, document.getElementById('mergeRail'));
  renderMatrix(state, act, document.getElementById('mx'));
  renderFoot(state, document.getElementById('foot'));
}

// (Burn-in strips are silent in the UI by Peter's call — housekeeping,
// not an operator decision. The strip record still rides the export in
// the x-techspotter block.)

// Text-channel conversion rail (Peter's ruling, TechSpotter presentation):
// X'S TEXT columns are probably video cues, not performers. Convert is a
// column deletion, so it is two-tap; keep is one.
function renderTextRail(state, act, rail) {
  const kept = state.parsed.text_channel_kept ?? [];
  const candidates = textChannelNames(state.parsed.characters).filter(
    (n) => !kept.includes(n),
  );
  rail.hidden = !candidates.length;
  rail.textContent = '';
  if (!candidates.length) return;
  rail.append(
    sp('cw-i', '🎬'),
    sp('cw-t', 'texts on screen are video cues, not performers — convert is two-tap; × keeps the column'),
  );
  for (const name of candidates) {
    const pair = el('span', 'rj-pair');
    const chip = el('button', 'cw-chip');
    const armed = state.armed?.kind === 'convtext' && state.armed.key === name;
    chip.textContent = armed ? `confirm: ${name} → video cue` : `${name} → video cue`;
    if (armed) chip.classList.add('armed');
    chip.title = 'Remove this column; its phone-screen moments stay in the Video layer';
    chip.onclick = () => act.convertTextChannel(name);
    const x = el('button', 'cw-x');
    x.textContent = '×';
    x.title = 'Keep as a character column';
    x.onclick = () => act.keepTextChannel(name);
    pair.append(chip, x);
    rail.append(pair);
  }
}

// Unclassified margin rows (#87 part 3, absorbed per #98): genuine
// uncertainty is its own LOUD state. Informational chips: the row is
// inventoried and surfaced, never seated as a guess; source peek shows
// the page region.
function renderMarginRail(state, act, rail) {
  const rows = state.parsed.unclassified_rows ?? [];
  rail.hidden = !rows.length;
  rail.textContent = '';
  if (!rows.length) return;
  rail.append(
    sp('cw-i', '?'),
    sp(
      'cw-t',
      `${rows.length} margin-numbered row${rows.length === 1 ? '' : 's'} the parser could not classify — check these against the printed draft`,
    ),
  );
  for (const r of rows) {
    const chip = sp('cw-chip', `#${r.id} · ${r.text} · pg ${r.page}`);
    chip.title = 'Unclassified margin row: not seated, not dropped. If this is a real scene form, it becomes a hub conformance vector.';
    if (r.anchor) {
      chip.onmouseenter = (e) => act.peekShow(e, r.anchor, `unclassified row · pg ${r.page}`);
      chip.onmouseleave = () => act.peekHide();
    }
    rail.append(chip);
  }
}

function renderRejRail(state, act, rail) {
  const rejects = state.parsed.rejects;
  rail.hidden = !rejects.length;
  rail.textContent = '';
  if (!rejects.length) return;
  rail.append(
    sp('cw-i', '⚑'),
    sp(
      'cw-t',
      `${rejects.length} cue-shaped line${rejects.length === 1 ? '' : 's'} the gate refused — tap to add as a character, × to dismiss`,
    ),
  );
  for (const r of rejects) {
    const pair = el('span', 'rj-pair');
    const chip = el('button', 'cw-chip');
    chip.textContent = `+ ${r.name}`;
    const note = el('i');
    note.textContent =
      r.reason + (r.occurrences.length > 1 ? ` ·×${r.occurrences.length}` : '');
    chip.append(note);
    chip.title = `Add ${r.name} to the matrix (scenes mark from its occurrences plus text search)`;
    chip.onclick = () => act.promote(r.name);
    const first = r.occurrences[0];
    if (first?.anchor) {
      chip.onmouseenter = (e) =>
        act.peekShow(e, first.anchor, `${r.name} · scene ${first.scene} · pg ${first.page}`);
      chip.onmouseleave = () => act.peekHide();
    }
    const x = el('button', 'cw-x');
    x.textContent = '×';
    x.title = 'Dismiss — this line is junk';
    x.onclick = () => act.dismissReject(r.name, r.reason);
    pair.append(chip, x);
    rail.append(pair);
  }
}

function renderMergeRail(state, act, rail) {
  const offers = state.parsed.merge_offers;
  rail.hidden = !offers.length;
  rail.textContent = '';
  if (!offers.length) return;
  rail.append(
    sp('cw-i', '⇄'),
    sp('cw-t', 'same person? merge is two-tap (a wrong merge drops a performer) — × keeps them separate'),
  );
  for (const o of offers) {
    const chip = el('span', 'cw-chip mrg-chip');
    const v = el('b');
    v.textContent = o.variant;
    const c = el('b');
    c.textContent = o.canonical;
    chip.append(v, document.createTextNode(' → '), c);
    if (o.channel) chip.append(document.createTextNode(' · channel'));
    chip.title = o.channel
      ? `${o.variant} is a channel annotation of ${o.canonical} (same performer, different pipe)`
      : `${o.canonical} is used in more scenes and stays as the column name`;
    const ok = el('button', 'cw-x mrgok');
    const armed =
      state.armed?.kind === 'merge' &&
      state.armed.key === `${o.variant}→${o.canonical}`;
    ok.textContent = armed ? 'confirm merge' : '⇄ merge';
    if (armed) ok.classList.add('armed');
    ok.onclick = () => act.merge(o.variant, o.canonical);
    const x = el('button', 'cw-x');
    x.textContent = '× separate';
    x.title = 'Different people — dismiss this suggestion';
    x.onclick = () => act.dismissOffer(o.variant, o.canonical);
    rail.append(chip, ok, x);
  }
}

function renderMatrix(state, act, table) {
  const p = state.parsed;
  table.textContent = '';
  const q = state.search.trim().toUpperCase();
  const chars = state.view.chars ? p.characters : [];
  const adding = state.bar?.mode === 'add' ? state.bar : null;
  const layers = [];
  if (state.spot && state.view.sound) layers.push(['sound', '🔊', 'snd']);
  if (state.spot && state.view.video) layers.push(['video', '🎬', 'vid']);
  const totalCols = 3 + layers.length + (adding ? 1 : 0) + chars.length;

  const thead = el('thead');
  const trh = el('tr');
  const scnh = el('th', 'scnh');
  scnh.textContent = `SCENES (${p.scenes.length})`;
  trh.append(scnh);
  const spkh = el('th', 'bdgh');
  spkh.textContent = '🗣';
  spkh.title = 'Speaking characters in the scene';
  trh.append(spkh);
  const prsh = el('th', 'bdgh');
  prsh.textContent = '👥';
  prsh.title = 'Present without lines (named in action, suggested or confirmed)';
  trh.append(prsh);
  for (const [, icon] of layers) {
    const th = el('th', 'bdgh');
    th.textContent = icon;
    trh.append(th);
  }
  if (adding) {
    const th = el('th', 'pend-h');
    const rot = el('span', 'rot');
    rot.textContent = adding.name || 'NEW CHARACTER…';
    th.append(rot);
    trh.append(th);
  }
  for (const c of chars) {
    // the rotated label has a width-0 box (that is the column-width trick),
    // so the whole header cell is the click target, not the label
    const th = el('th', 'chh');
    th.title = `${c.name} — ${c.scene_count} scene${c.scene_count === 1 ? '' : 's'}. Click to rename; × to delete.`;
    th.onclick = () => act.startRename(c.name);
    const rot = el('span', 'rot');
    rot.textContent = c.name;
    const dx = el('button', 'delx');
    dx.textContent = '×';
    const armed = state.armed?.kind === 'delchar' && state.armed.key === c.name;
    if (armed) dx.classList.add('armed');
    dx.title = armed ? `Click again to delete ${c.name}` : `Delete ${c.name} (two-step)`;
    dx.onclick = (e) => {
      e.stopPropagation();
      act.deleteChar(c.name);
    };
    th.append(rot, dx);
    trh.append(th);
  }
  thead.append(trh);
  table.append(thead);

  const tbody = el('tbody');
  for (const scene of p.scenes) {
    const tr = el('tr');
    if (q && !sceneMatches(scene, q)) tr.classList.add('dim');
    const scn = el('td', 'scn');
    const s = el('div', 's');
    s.textContent = `#${scene.id} · pg ${scene.page}`;
    const sl = el('div', 'sl');
    sl.textContent = scene.heading;
    sl.title = scene.heading;
    scn.append(s, sl);
    tr.append(scn);
    const spk = el('td', 'bdg spk');
    const n = scene.characters_speaking.length;
    const spill = el('span', 'bpill');
    spill.textContent = n || '·';
    if (n) spk.classList.add('has');
    spk.title = n
      ? `${n} speaking: ${scene.characters_speaking.join(', ')}`
      : 'no speaking characters detected';
    spk.append(spill);
    tr.append(spk);
    const present = [
      ...(scene.present_confirmed ?? []),
      ...(scene.present_suggest ?? []),
    ];
    const prs = el('td', 'bdg prs');
    const ppill = el('span', 'bpill');
    ppill.textContent = present.length || '·';
    if (present.length) prs.classList.add('has');
    prs.title = present.length
      ? `present, no lines: ${present.join(', ')}`
      : 'nobody suggested present without lines';
    prs.append(ppill);
    tr.append(prs);
    for (const [layer, , cls] of layers) {
      const moments = state.spot[layer].moments.filter((m) => m.scene === scene.id);
      const live = moments.filter((m) => !m.dismissed).length;
      const td = el('td', `bdg ${cls}`);
      if (live) td.classList.add('has');
      if (state.openMoments?.sceneId === scene.id && state.openMoments?.layer === layer) {
        td.classList.add('open');
      }
      const pill = el('span', 'bpill');
      pill.textContent = live || '·';
      td.title = moments.length
        ? `${live} live / ${moments.length} total ${layer} moment${moments.length === 1 ? '' : 's'} — click to review`
        : `no ${layer} moments detected`;
      td.append(pill);
      td.onclick = () => act.toggleMoments(scene.id, layer);
      tr.append(td);
    }
    if (adding) {
      const td = el('td', 'cell pend');
      if (adding.ids.has(scene.id)) td.classList.add('on');
      td.append(el('div', 'd'));
      td.onclick = () => act.togglePending(scene.id);
      tr.append(td);
    }
    for (const c of chars) {
      const td = el('td', 'cell');
      let stateWord = 'not in scene · click: speaks';
      let anchor = null;
      if (scene.characters_speaking.includes(c.name)) {
        td.classList.add('on');
        stateWord = 'speaks · click: present, no lines';
        anchor = cueAnchorFor(scene, c.name);
      } else if (scene.present_confirmed?.includes(c.name)) {
        td.classList.add('pres');
        stateWord = 'present, no lines · click: clear';
        anchor = mentionAnchorFor(scene, c.name);
      } else if (scene.present_suggest?.includes(c.name)) {
        td.classList.add('sug');
        stateWord = 'named in action, no cue — click to confirm present';
        anchor = mentionAnchorFor(scene, c.name);
      }
      td.append(el('div', 'd'));
      td.title = `${c.name} · scene ${scene.id} · ${stateWord}`;
      td.onclick = () => act.toggleCell(scene.id, c.name);
      if (anchor) {
        const cap = `${c.name} · scene ${scene.id} · pg ${scene.page} · ${stateWord}`;
        td.onmouseenter = (e) => act.peekShow(e, anchor, cap);
        td.onmouseleave = () => act.peekHide();
      }
      tr.append(td);
    }
    tbody.append(tr);
    if (state.openMoments?.sceneId === scene.id) {
      const open = layers.find(([layer]) => layer === state.openMoments.layer);
      if (open) tbody.append(momentRow(state, act, scene, open, totalCols));
    }
  }
  table.append(tbody);
}

function momentRow(state, act, scene, [layer, icon, cls], colspan) {
  const moments = state.spot[layer].moments.filter((m) => m.scene === scene.id);
  const tr = el('tr', 'mrow');
  const td = el('td');
  td.colSpan = colspan;
  const head = el('div', 'm-head');
  head.textContent = `${icon} ${layer} · scene ${scene.id} · ${scene.heading}`;
  td.append(head);
  if (!moments.length) {
    const none = el('div', 'm-none');
    none.textContent = `No ${layer} moments detected in this scene.`;
    td.append(none);
  }
  for (const m of moments) {
    const card = el('div', 'moment');
    if (m.dismissed) card.classList.add('dismissed');
    const cat = el('span', `m-cat ${cls}`);
    cat.textContent = m.category;
    const snip = el('div', 'm-snip');
    snip.textContent = m.snippet;
    const meta = el('div', 'm-meta');
    const metaLines = [
      `pg ${m.page} · ${m.trigger}`,
      m.characters.length ? m.characters.join(', ') : null,
    ].filter(Boolean);
    metaLines.forEach((t, i) => {
      if (i) meta.append(document.createElement('br'));
      meta.append(document.createTextNode(t));
    });
    meta.append(document.createElement('br'));
    const conf = el('span', `conf-${m.confidence}`);
    conf.textContent = m.confidence;
    meta.append(conf);
    const x = el('button', 'm-x');
    x.textContent = m.dismissed ? 'restore' : 'dismiss';
    x.title = m.dismissed
      ? 'Bring this moment back'
      : 'Dismiss: stays in the file as dismissed, drops from counts';
    x.onclick = () => act.dismissMoment(m);
    card.append(cat, snip, meta, x);
    if (m.anchor) {
      card.onmouseenter = (e) =>
        act.peekShow(e, m.anchor, `${m.category} · scene ${m.scene} · pg ${m.page}`);
      card.onmouseleave = () => act.peekHide();
    }
    td.append(card);
  }
  tr.append(td);
  return tr;
}

// Anchors for matrix-cell peeks, from the scene's own line records: the
// character's cue line when they speak, the action line naming them when
// they are present without lines. Imported shows have no line records
// (and no PDF), so cells simply don't peek there.
function cueAnchorFor(scene, name) {
  const rec = scene.lines?.find((l) => l.band === 'cue' && l.cue === name);
  return rec ? { page: rec.sheet, bbox: [rec.x0, rec.y - 3, rec.x1, rec.y + 9] } : null;
}

function mentionAnchorFor(scene, name) {
  const base = name.replace(/\s*\(.*$/, '').trim();
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'i');
  const rec = scene.lines?.find((l) => l.band === 'action' && re.test(l.text));
  return rec ? { page: rec.sheet, bbox: [rec.x0, rec.y - 3, rec.x1, rec.y + 9] } : null;
}

function sceneMatches(scene, q) {
  return (
    scene.id.toUpperCase().includes(q) ||
    scene.heading.toUpperCase().includes(q) ||
    scene.characters_speaking.some((n) => n.includes(q))
  );
}

function renderFoot(state, foot) {
  const p = state.parsed;
  foot.textContent = '';
  const stat = (label, value) => {
    const s = el('span');
    const b = el('b');
    b.textContent = String(value);
    s.append(b, document.createTextNode(` ${label}`));
    return s;
  };
  foot.append(
    stat('scenes', p.scenes.length),
    stat('characters', p.characters.length),
    stat('mode', ''),
  );
  foot.lastChild.querySelector('b').textContent = p.mode;
  if (p.rejects.length) foot.append(stat('reject chips to review', p.rejects.length));
  if (p.merge_offers.length) foot.append(stat('merge offers open', p.merge_offers.length));
}
