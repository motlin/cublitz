// @ts-nocheck: the page code not yet moved to typed modules in ui/.
import { $ } from './ui/dom.ts';
import { beaten, eraseProgress, loadProgress, loadReducedMotion, progress, reduced, S, saveProgress, setSession, unlocked } from './ui/session.ts';
import { clearTipsSeen, readBest, readColors, readDraft, readMine, readMuted, readRun, readTipsSeen, writeBest, writeColors, writeDraft, writeMine, writeMuted, writeRun, writeTipsSeen } from './ui/storage.ts';
import { cap, COLORS, esc, GLYPH, WGLYPH } from './ui/text.ts';
import { initSound, SFX } from './ui/sfx.ts';
import { initPalette } from './ui/palette.ts';
// The game's page code, still as the original script wrote it. The pure rules live in core/.
import { FACES, DIRS, roll, solidColor, workColor } from './core/cube.ts';
import { nextMilestone, hintTexts } from './core/hints.ts';
import { infSearch, infRating, infRank } from './core/infinite.ts';
import { parseLevel, initState } from './core/level.ts';
import { LEVELS } from './core/levels.ts';
import { CNAME, FNAME, dirWord } from './core/names.ts';
import { openColors, pressed, doorOpen, tryMove } from './core/rules.ts';
import { encodeLevel, decodeLevel } from './core/share.ts';
import { solve } from './core/solver.ts';

const PAINT_COLORS = 'roygcbp'; // white only exists as switches, buttons, boxes and doors
const ROT = { E:'rotateY(90deg)', W:'rotateY(-90deg)', N:'rotateX(90deg)', S:'rotateX(-90deg)' };
const ORIGIN = { E:'100% 50% 0', W:'0% 50% 0', N:'50% 0% 0', S:'50% 100% 0' };
const TILT = { E:'rotateY(14deg)', W:'rotateY(-14deg)', N:'rotateX(14deg)', S:'rotateX(-14deg)' };


loadProgress();

const board = $('board');
let tiles = {}, cubeEl, rollerEl, shadowEl, faceEls = {}, boxEls = [], doorEls = [], queued = null;
const C = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--c'));

function cellSize(L) {
  const vw = $('viewport').clientWidth || 600;
  const span = L.cols * 0.95 + L.rows * 0.31 + 1.2;
  return Math.max(24, Math.min(62, Math.floor(vw / span)));
}

function loadLevel(i, snap) { if (!unlocked(i)) return; startLevel(LEVELS[i], i, snap); }
function startLevel(L, i, snap, opts) {
  if (typeof clearSolution === 'function' && board) clearSolution();
  hintState = null; $('hintBox').hidden = true;
  if (!L.cells) parseLevel(L);
  setSession({ lvl:i, L, st:initState(L), hist:[], busy:false, won:false, rolls:(opts && opts.rolls) || 0 });
  if (i >= 0) { campaignLvl = i; infinite = false; }
  if (snap && snap.st) { S.st = snap.st; S.hist = snap.hist || []; }
  queued = null;
  $('win').hidden = true;
  $('lvName').textContent = L.name;
  $('lvNum').textContent = i >= 0 ? `Level ${i+1} of ${LEVELS.length}` : i === -2 ? 'Infinite mode' : 'Your level';
  $('lvTip').textContent = L.tip || (i < 0 ? 'Testing a level from the editor.' : '');
  $('par').textContent = L.par ?? '?';
  $('backEdit').hidden = i !== -1;
  $('winRetry').hidden = false;
  if (typeof renderInfCard === 'function') renderInfCard();
  tipQueue = []; $('tip').hidden = true;
  if (mode === 'play') queueTips(L);
  renderBoard();
  renderLevels();
  renderHud();
  setStatus('');
}

// A raised block: top plus four walls, built from flat faces
function makeBlock(cls, w, h, color) {
  const el = document.createElement('div'); el.className = 'block ' + cls;
  el.style.width = el.style.height = w + 'px';
  el.style.setProperty('--bc', color);
  const add = (k, css) => { const f = document.createElement('div'); f.className = 'bf bf-' + k; Object.assign(f.style, css); el.appendChild(f); return f; };
  add('n', { width:w+'px', height:h+'px', left:0, top:0, transformOrigin:'50% 0', transform:'rotateX(90deg)' });
  add('s', { width:w+'px', height:h+'px', left:0, top:w+'px', transformOrigin:'50% 0', transform:'rotateX(90deg)' });
  add('w', { width:h+'px', height:w+'px', left:0, top:0, transformOrigin:'0 50%', transform:'rotateY(-90deg)' });
  add('e', { width:h+'px', height:w+'px', left:w+'px', top:0, transformOrigin:'0 50%', transform:'rotateY(-90deg)' });
  const top = add('t', { width:w+'px', height:w+'px', left:0, top:0, transform:`translateZ(${h}px)` });
  return [el, top];
}

function renderBoard() {
  const L = S.L;
  const c = cellSize(L);
  document.documentElement.style.setProperty('--c', c + 'px');
  board.innerHTML = ''; tiles = {}; boxEls = []; doorEls = [];
  board.style.width = L.cols * c + 'px'; board.style.height = L.rows * c + 'px';
  const need = L.need || {};
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const cell = L.cells[y][x];
    if (!cell) continue;
    const t = document.createElement('div');
    t.className = 'tile';
    t.style.left = x * c + 'px'; t.style.top = y * c + 'px';
    if (cell.c) t.style.setProperty('--pc', COLORS[cell.c]);
    const inner = document.createElement('i'); t.appendChild(inner);
    const glyph = () => { const g = document.createElement('span'); g.className = 'glyph'; g.textContent = GLYPH[cell.c]; inner.appendChild(g); };
    if (cell.t === 'paint') { t.classList.add('paint'); glyph(); }
    if (cell.t === 'gate') { t.classList.add('gate'); glyph(); }
    if (cell.t === 'wash') { t.classList.add('wash'); const g = document.createElement('span'); g.className = 'glyph wsh'; g.textContent = '✦'; inner.appendChild(g); }
    if (cell.t === 'wgate') {
      t.classList.add('wgate', 'wg-' + cell.f);
      if (cell.f !== 'b') { const g = document.createElement('span'); g.className = 'glyph wg'; g.textContent = WGLYPH[cell.f]; inner.appendChild(g); }
      if ('nsew'.includes(cell.f)) { const e = document.createElement('span'); e.className = 'edge wedge ' + cell.f; inner.appendChild(e); }
    }
    if (cell.t === 'switch') {
      t.classList.add('switch');
      const lv = document.createElement('span'); lv.className = 'lever'; inner.appendChild(lv);
    }
    if (cell.t === 'button') {
      t.classList.add('button');
      const b = document.createElement('span'); b.className = 'knob'; inner.appendChild(b);
    }
    if (cell.t === 'door') {
      t.classList.add('door');
      const [blk, top] = makeBlock('door-block', c - 4, Math.round(c * 0.62), COLORS[cell.c]);
      top.textContent = GLYPH[cell.c];
      blk.style.left = x * c + 2 + 'px'; blk.style.top = y * c + 2 + 'px';
      doorEls.push({ el:blk, x, y, c:cell.c });
    }
    if (cell.t === 'goal') {
      t.classList.add('goal');
      if (need.t) { t.classList.add('tinted'); t.style.setProperty('--tc', COLORS[need.t]); }
      for (const k of ['n','s','e','w']) if (need[k]) {
        const e = document.createElement('span'); e.className = 'edge ' + k; e.style.setProperty('--ec', COLORS[need[k]]); inner.appendChild(e);
      }
    }
    board.appendChild(t); tiles[x+','+y] = t;
  }
  doorEls.forEach(d => board.appendChild(d.el));
  shadowEl = document.createElement('div'); shadowEl.className = 'shadow'; board.appendChild(shadowEl);
  S.st.boxes.forEach((b, i) => {
    const bw = Math.round(c * 0.8);
    const [blk, top] = makeBlock('crate', bw, bw, COLORS[b.c]);
    top.textContent = GLYPH[b.c];
    board.appendChild(blk); boxEls[i] = blk;
  });
  cubeEl = document.createElement('div'); cubeEl.className = 'cube';
  rollerEl = document.createElement('div'); rollerEl.className = 'roller';
  faceEls = {};
  for (const k of FACES) {
    const fe = document.createElement('div'); fe.className = 'face f-' + k;
    fe.appendChild(document.createElement('span'));
    rollerEl.appendChild(fe); faceEls[k] = fe;
  }
  cubeEl.appendChild(rollerEl); board.appendChild(cubeEl);
  buildProbes(L, c);
  placeCube(); renderPieces(true);
  if (hintState) renderHint();
  if (solState) renderSolution();
  scheduleOverlays();
}

function placeCube() {
  const c = C(), st = S.st;
  cubeEl.style.transform = `translate3d(${st.x*c}px, ${st.y*c}px, 1px)`;
  shadowEl.style.transform = `translate3d(${st.x*c + 4}px, ${st.y*c + 6}px, 0.5px)`;
  for (const k of FACES) {
    const col = st.f[k];
    faceEls[k].style.setProperty('--fc', col ? COLORS[col] : 'var(--clay)');
    faceEls[k].firstChild.textContent = col ? GLYPH[col] : '';
  }
  const solid = solidColor(st.f);
  cubeEl.classList.toggle('solid', !!solid);
  shadowEl.classList.toggle('solid', !!solid);
  if (solid) shadowEl.style.setProperty('--gc', COLORS[solid]);
}

// Switches, buttons, doors and boxes all follow the current state
function renderPieces(instant) {
  const L = S.L, st = S.st, c = C();
  const open = openColors(L, st), solid = workColor(st.f);
  L.switches.forEach((s, i) => tiles[s.x+','+s.y].classList.toggle('on', !!st.sw[i]));
  for (const key in tiles) {
    const t = tiles[key];
    if (!t.classList.contains('button')) continue;
    const [x, y] = key.split(',').map(Number);
    t.classList.toggle('down', pressed(L, st, x, y, solid));
  }
  doorEls.forEach(d => d.el.classList.toggle('open', doorOpen(L, st, d.x, d.y, open)));
  st.boxes.forEach((b, i) => {
    const el = boxEls[i], off = Math.round(c * 0.1);
    if (instant) el.style.transition = 'none';
    el.style.transform = `translate3d(${b.x*c + off}px, ${b.y*c + off}px, 1px)`;
    if (instant) { void el.offsetWidth; el.style.transition = ''; }
  });
}

const NET_POS = { n:[2,1], w:[1,2], t:[2,2], e:[3,2], s:[2,3], b:[2,4] };
function renderHud(popFace) {
  const L = S.L, need = L.need || {}, f = S.st.f;
  const net = $('net'); net.innerHTML = '';
  for (const k of FACES) {
    const d = document.createElement('div'); d.className = 'nf';
    d.style.gridColumn = NET_POS[k][0]; d.style.gridRow = NET_POS[k][1];
    d.style.setProperty('--fc', f[k] ? COLORS[f[k]] : 'var(--clay)');
    d.textContent = k.toUpperCase();
    d.title = FNAME[k] + (f[k] ? ': ' + CNAME[f[k]] : ': bare');
    if (need[k]) { d.classList.add('need'); d.style.setProperty('--nc', COLORS[need[k]]); if (f[k] === need[k]) d.classList.add('met'); }
    if (k === popFace) d.classList.add('pop');
    net.appendChild(d);
  }
  const solid = solidColor(f);
  const counts = {}; FACES.forEach(k => { if (f[k]) counts[f[k]] = (counts[f[k]] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const solidLine = solid
    ? `<div class="solidline" style="--sc:${COLORS[solid]}"><b>Solid ${CNAME[solid]}</b>. Works ${CNAME[solid]} switches, buttons and boxes.</div>`
    : !top ? `<div class="solidline" style="--sc:var(--clay)"><b>All bare</b>. Counts as white for white switches, buttons and boxes.</div>`
    : `<div>Not solid: ${top[1]} of 6 faces ${CNAME[top[0]]}.</div>`;
  const entries = Object.entries(need);
  $('needBox').innerHTML = solidLine + (entries.length
    ? '<div>The target needs:</div>' + entries.map(([k,v]) => `<div class="needline">${f[k]===v?'✓':'○'} ${CNAME[v]} on ${FNAME[k]}</div>`).join('')
    : '<div>T is the top. B is the face touching the floor.</div>');
  $('moves').textContent = S.lvl === -2 ? (S.rolls || 0) : S.hist.length;
  $('moves').nextElementSibling.textContent = S.lvl === -2 ? 'rolls (all count)' : 'moves';
  $('undoBtn').disabled = !S.hist.length;
}

function renderLevels() {
  if (typeof renderStock === 'function') renderStock();
  const nav = $('levels'); nav.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    const open = unlocked(i);
    b.className = 'lvbtn' + (progress[L.name] ? ' done' : '') + (i === S.lvl ? ' cur' : '') + (open ? '' : ' locked');
    b.textContent = i + 1;
    b.title = open ? L.name + (progress[L.name] ? ` (best ${progress[L.name]})` : '') : `Locked. Beat level ${i} to unlock.`;
    b.disabled = !open;
    if (!open) b.setAttribute('aria-label', `Level ${i + 1}, locked`);
    b.onclick = () => loadLevel(i);
    nav.appendChild(b);
  });
}

function setStatus(html, warn) {
  const s = $('status'); s.innerHTML = html; s.classList.toggle('warn', !!warn);
}
function pulse(x, y, cls) { const t = tiles[x+','+y]; if (!t) return; t.classList.remove(cls); void t.offsetWidth; t.classList.add(cls); }

loadReducedMotion();
function move(d) {
  if (S.won || tipOpen()) return;
  if (S.busy) { queued = d; return; }
  const L = S.L;
  const r = tryMove(L, S.st, d);
  if (!r.ok) {
    const cn = CNAME[r.c];
    if (r.why === 'wgate') { pulse(r.nx, r.ny, 'deny'); setStatus(r.f === 'b'
      ? `<b>White gate.</b> It needs a bare face down, but rolling ${dirWord(d)} would put ${CNAME[r.has]} down.`
      : `<b>${cap(FNAME[r.f])} white gate.</b> Your ${FNAME[r.f]} face has to be bare when you land, but it would be ${CNAME[r.has]}.`, true); }
    else if (r.why === 'gate') { pulse(r.nx, r.ny, 'deny'); setStatus(`<b>${cap(cn)} gate.</b> Rolling ${dirWord(d)} would put ${r.down ? CNAME[r.down] : 'a bare'} face down.`, true); }
    else if (r.why === 'door') { setStatus(`<b>${cap(cn)} door is shut.</b> Flip a ${cn} switch or hold down a ${cn} button.`, true); }
    else if (r.why === 'box') { setStatus(r.c === 'w' ? '<b>White box.</b> Only a completely bare cube can push it.' : `<b>${cap(cn)} box.</b> Only a cube painted solid ${cn} can push it.`, true); }
    else if (r.why === 'stuck') { setStatus(`<b>The box won't budge.</b> Something is in the way on the other side.`, true); }
    else setStatus('<b>Edge.</b> Nothing to roll onto that way.', true);
    SFX.play('blocked');
    if (!reduced) {
      S.busy = true;
      rollerEl.style.transformOrigin = ORIGIN[d];
      rollerEl.animate([{transform:'none'},{transform:TILT[d]},{transform:'none'}], {duration:220, easing:'ease-out'}).finished.then(() => { S.busy = false; flushQueue(); });
    }
    return;
  }
  const wasSolid = solidColor(S.st.f);
  const prevOpen = openColors(L, S.st);
  S.hist.push(S.st);
  S.rolls = (S.rolls || 0) + 1;
  let anim = null;
  const finish = () => {
    S.st = r.st;
    placeCube();
    if (anim) anim.cancel();
    renderPieces();
    S.busy = false;
    renderHud(r.painted ? 'b' : null);
    if (r.washed) document.querySelectorAll('#net .nf').forEach(n => n.classList.add('pop'));
    const solid = solidColor(S.st.f), nowOpen = openColors(L, S.st);
    const opened = Object.keys(nowOpen).filter(k => !prevOpen[k]), closed = Object.keys(prevOpen).filter(k => !nowOpen[k]);
    let msg = '', warn = false;
    if (r.painted) { pulse(r.nx, r.ny, 'flash'); msg = `Painted the bottom face <b>${CNAME[r.painted]}</b>.`; }
    if (r.washed) { pulse(r.nx, r.ny, 'flash'); msg = '<b>Paint removed.</b> Every face is bare again.'; }
    if (solid && solid !== wasSolid) msg = `<b>Solid ${CNAME[solid]}!</b> You can now work ${CNAME[solid]} switches, buttons and boxes.`;
    else if (!solid && wasSolid) msg += ` No longer solid ${CNAME[wasSolid]}.`;
    if (r.flipped >= 0) { pulse(r.nx, r.ny, 'flash'); msg = `Flipped the ${CNAME[r.cell.c]} switch.`; }
    if (opened.length) msg += ` ${opened.map(k => cap(CNAME[k])).join(' and ')} door${opened.length > 1 ? 's' : ''} opened.`;
    if (closed.length) msg += ` ${closed.map(k => cap(CNAME[k])).join(' and ')} door${closed.length > 1 ? 's' : ''} closed.`;
    if (r.won) SFX.play('win');
    else if (r.flipped >= 0) SFX.play('switch');
    else if (solid && solid !== wasSolid) SFX.play('solid');
    else if (r.washed) SFX.play('wash');
    else if (r.painted) SFX.play('paint');
    else if (r.cell.t === 'gate') SFX.play('gate');
    else if (r.cell.t === 'wgate') SFX.play('wgate');
    if (!r.won) {
      if (opened.length) setTimeout(() => SFX.play('doorOpen'), 60);
      else if (closed.length) setTimeout(() => SFX.play('doorShut'), 60);
      if (!solid && wasSolid) SFX.play('unsolid');
      if (r.goal) SFX.play('blocked');
    }
    if (r.goal && !r.won) {
      const miss = Object.entries(L.need).filter(([k,v]) => S.st.f[k] !== v).map(([k,v]) => `${CNAME[v]} on ${FNAME[k]}`).join(' and ');
      msg = `<b>Not yet.</b> The target needs ${miss}.`; warn = true;
    }
    solutionAfterMove(d);
    const hm = hintAfterMove(r);
    if (hm && !warn) msg = (msg + ' ' + hm).trim();
    setStatus(msg.trim(), warn);
    if (r.won) { clearHint(); clearSolution(); return win(); }
    flushQueue();
  };
  S.busy = true;
  SFX.play('roll');
  if (r.pushed >= 0) SFX.play('push');
  if (reduced) { finish(); return; }
  const c = C();
  shadowEl.style.transform = `translate3d(${r.nx*c + 4}px, ${r.ny*c + 6}px, 0.5px)`;
  if (r.pushed >= 0) {
    const b = r.st.boxes[r.pushed], off = Math.round(c * 0.1);
    boxEls[r.pushed].style.transform = `translate3d(${b.x*c + off}px, ${b.y*c + off}px, 1px)`;
  }
  rollerEl.style.transformOrigin = ORIGIN[d];
  anim = rollerEl.animate([{transform:'none'},{transform:ROT[d]}], {duration:170, easing:'cubic-bezier(.45,.05,.55,.95)', fill:'forwards'});
  anim.finished.then(finish);
}
function flushQueue() { if (queued) { const q = queued; queued = null; move(q); } }

function win() {
  S.won = true;
  const L = S.L, m = S.hist.length;
  if (S.lvl === -2) {
    infWin();
    $('win').hidden = false; setStatus('<b>Cleared.</b>');
    $('winNext').focus({ preventScroll:true });
    return;
  }
  const custom = S.lvl < 0;
  if (!custom) { const prev = progress[L.name]; if (!prev || m < prev) { progress[L.name] = m; saveProgress(); } }
  renderLevels();
  const par = L.par;
  $('winTitle').textContent = S.usedSolution ? 'Solved' : par && m <= par ? 'Perfect roll' : 'Dry and done';
  $('winScore').textContent = par ? `${m} moves · par ${par}` : `${m} moves`;
  const last = S.lvl === LEVELS.length - 1;
  $('winNote').textContent = custom ? 'Your level works. Head back to the editor to tweak or save it.'
    : last ? 'That was the last canvas. Replay any level to chase par, or build your own in the editor.'
    : S.usedSolution ? 'You followed the solution this time. Replay it from memory when you are ready.'
    : (m <= par ? 'You matched the shortest solution.' : `Par is ${par}. Replay to tighten it up.`);
  $('winNext').hidden = last && !custom;
  $('winNext').firstChild.textContent = custom ? 'Back to editor ' : 'Next level ';
  $('win').hidden = false;
  setStatus('<b>Cleared.</b>');
  (last && !custom ? $('winRetry') : $('winNext')).focus({ preventScroll:true });
}

function undo() {
  if (S.busy || S.won || !S.hist.length) return;
  if (hintState) { clearTrail(); hintState.at = null; }
  const keep = solState ? solState.revealed + 1 : 0;
  S.st = S.hist.pop();
  SFX.play('undo');
  placeCube(); renderPieces(true); renderHud(); setStatus('Undid one roll.');
  if (keep) { stopAutoReveal(); planSolution(keep); }
}
// ---------- Tutorial pop-ups: shown the first time a level contains something new ----------
const TIPS = {
  roll: { title:'Rolling', art:() => [['start'], ['arrow'], ['floor'], ['arrow'], ['goal']],
    body:'Use the arrow keys, WASD, or swipe on a phone to roll your cube one tile at a time. Each roll tips it over an edge, so a different side ends up on the floor. It can only roll onto tiles, never off the edge. Reach the glowing target to finish the level.' },
  paint: { title:'Wet paint', art:c => [['start'], ['arrow'], ['paint', c]],
    body:'When your cube rolls onto a puddle, the face touching the floor gets painted that color. The paint stays on that face until another puddle covers it. The face map on the right shows every side.' },
  gate: { title:'Color gates', art:c => [['gate', c], ['gate', c], ['gate', c]],
    body:'You can’t pass a colored tile until you paint your cube the same color. The face that lands on the gate has to match it, and every roll turns a different face down, so count your rolls.' },
  need: { title:'Picky targets', art:c => [['goal', c]],
    body:'A colored target only accepts your cube with that color on top. A colored bar on one edge of the target means that side of the cube needs that color too. The face map on the right shows every side of your cube.' },
  switch: { title:'Solid cubes and switches', art:c => [['solid', c], ['arrow'], ['switch', c], ['arrow'], ['door', c]],
    body:'Switches only work for a cube painted completely in their color, all six faces. Once your cube is solid it glows. Roll it onto a switch of the same color to flip it, and every door of that color opens.' },
  wgate: { title:'White gates', art:() => [['wgate', 'b'], ['wgate', 'n'], ['wgate', 't']],
    body:'White gates want a bare, unpainted side. A plain one needs a bare face down. One with an arrow needs the side it points to still bare when you land, and one with a ring needs a bare top. Paint never comes off, so every puddle you cross uses up a white face. A solid cube can never get through.' },
  wash: { title:'Paint remover', art:c => [['solid', c || 'r'], ['arrow'], ['wash'], ['arrow'], ['start']],
    body:'Roll onto a paint remover and every face of your cube is wiped back to bare, all at once. Use it when puddles or a solid coat have used up the bare sides a white gate needs. It also ends a solid coat, so finish with switches and boxes first.' },
  white: { title:'White pieces', art:() => [['start'], ['arrow'], ['switch', 'w'], ['box', 'w'], ['door', 'w']],
    body:'A cube with no paint on any face counts as white. It doesn’t glow or act like a solid cube, but it can flip white switches, hold down white buttons and push white boxes. If you pick up paint, a paint remover makes you white again.' },
  button: { title:'Buttons and boxes', art:c => [['solid', c], ['box', c], ['arrow'], ['button', c]],
    body:'A button holds its doors open only while something of its color sits on it. If you step off, the door shuts. A solid cube can push a box of its own color, and a box left on the button keeps the door open for good.' },
};
const TIP_ORDER = ['roll', 'paint', 'gate', 'need', 'switch', 'button', 'wgate', 'wash', 'white'];
let tipsSeen = readTipsSeen();
let tipQueue = [], tipTotal = 0;
function levelTips(L) {
  const found = {};
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const c = L.cells[y][x]; if (!c) continue;
    if (c.t === 'paint') found.paint = found.paint || c.c;
    if (c.t === 'gate') found.gate = found.gate || c.c;
    if (c.t === 'wgate') found.wgate = true;
    if (c.t === 'wash') found.wash = found.paint || 'r';
    if (['switch', 'button', 'door'].includes(c.t) && c.c === 'w') { found.white = true; continue; }
    if (c.t === 'switch') found.switch = found.switch || c.c;
    if (c.t === 'button') found.button = found.button || c.c;
  }
  L.boxes0.forEach(b => { if (b.c === 'w') found.white = true; else found.button = found.button || b.c; });
  if (L.need) found.need = Object.values(L.need)[0];
  found.roll = true;
  return TIP_ORDER.filter(k => found[k]).map(k => ({ key:k, c:found[k] }));
}
function queueTips(L, all) {
  tipQueue = levelTips(L).filter(t => all || !tipsSeen[t.key]);
  tipTotal = tipQueue.length;
  showNextTip();
}
function tipArt(parts) {
  return parts.map(([kind, c]) => {
    if (kind === 'arrow') return '<span class="tip-arrow">→</span>';
    if (kind === 'solid') return `<span class="tip-cube" style="--pc:${COLORS[c]}"></span>`;
    if (kind === 'start') return '<span class="tip-cube bare"></span>';
    if (kind === 'wash') return '<span class="ec wash" style="--ec:44px"><b>✦</b></span>';
    if (kind === 'wgate') return `<span class="ec wgate wg-${c}" style="--ec:44px">${WGLYPH[c] ? `<b>${WGLYPH[c]}</b>` : ''}</span>`;
    return `<span class="ec ${kind}" style="--ec:44px${c ? `;--pc:${COLORS[c]}` : ''}"></span>`;
  }).join('');
}
function showNextTip() {
  const t = tipQueue[0];
  if (!t) { $('tip').hidden = true; return; }
  SFX.play('tip');
  const T = TIPS[t.key];
  $('tipTitle').textContent = T.title;
  $('tipBody').textContent = T.body;
  $('tipArt').innerHTML = tipArt(T.art(t.c));
  $('tipCount').textContent = tipTotal > 1 ? `New · ${tipTotal - tipQueue.length + 1} of ${tipTotal}` : 'New';
  $('tipOk').textContent = tipQueue.length > 1 ? 'Next' : 'Got it';
  $('tip').hidden = false;
  $('tipOk').focus({ preventScroll:true });
}
function dismissTip() {
  const t = tipQueue.shift();
  if (t) { tipsSeen[t.key] = true; writeTipsSeen(tipsSeen); }
  showNextTip();
  if ($('tip').hidden) $('viewport').focus?.({ preventScroll:true });
}
$('tipOk').onclick = dismissTip;
let resetTimer = null;
$('resetProgress').onclick = () => {
  const b = $('resetProgress');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = 'Click again to erase all progress';
    $('resetNote').hidden = false;
    $('resetNote').textContent = 'This locks every level after the first, clears your best scores and brings back the tutorial pop-ups. Your colors and saved editor levels stay.';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Reset all progress'; $('resetNote').hidden = true; }, 5000);
    return;
  }
  clearTimeout(resetTimer);
  eraseProgress();
  tipsSeen = {}; clearTipsSeen();
  b.classList.remove('armed'); b.textContent = 'Reset all progress';
  $('resetNote').hidden = false; $('resetNote').textContent = 'Progress erased. Every level after the first is locked again.';
  setTimeout(() => { $('resetNote').hidden = true; }, 3000);
  loadLevel(0);
  renderTitle();
};
$('tipsReplay').onclick = () => {
  tipsSeen = {}; clearTipsSeen();
  $('resetNote').hidden = false; $('resetNote').textContent = 'The tutorial pop-ups will show again as you reach each new thing.';
  setTimeout(() => { $('resetNote').hidden = true; }, 3000);
};
const tipOpen = () => !$('tip').hidden;

// ---------- Show solution: arrows laid down a few at a time ----------
let solState = null; // { path, revealed, at, used }
let solTimer = null;
const ARROW = { N:'↑', S:'↓', E:'→', W:'←' };
function stopAutoReveal() { clearInterval(solTimer); solTimer = null; $('solAll').textContent = 'Reveal the rest'; }
function clearSolution() {
  stopAutoReveal();
  $('solBox').hidden = true;
  solState = null;
  scheduleOverlays();
}
function planSolution(keepRevealed) {
  const at = S.st;
  $('solText').textContent = 'Working out the solution…';
  $('solBox').hidden = false;
  setTimeout(() => {
    if (S.st !== at || S.won) return;
    const path = solve(S.L, S.st, 2500000);
    if (!path) {
      $('solText').innerHTML = solve.hitLimit ? '<b>Too many possibilities.</b> The solver gave up from this position. Try restarting the level.'
        : '<b>No way out from here.</b> Undo a few rolls or restart, then ask again.';
      ['solNext', 'solGoal', 'solAll'].forEach(id => $(id).hidden = true);
      if (solState) solState.path = '';
      return;
    }
    const revealed = Math.min(path.length, keepRevealed ?? 1);
    solState = { path, revealed, at, used:true };
    S.usedSolution = true;
    ['solNext', 'solGoal', 'solAll'].forEach(id => $(id).hidden = false);
    renderSolution();
  }, 30);
}
function renderSolution() {
  scheduleOverlays();
  if (!solState || !solState.path) return;
  const { path, revealed } = solState;
  const done = revealed >= path.length;
  $('solText').innerHTML = done
    ? `Full solution shown: <b>${path.length} rolls</b> from where you are. Follow the arrows in number order; each one disappears as you roll it.`
    : `Showing <b>${revealed} of ${path.length}</b> rolls. Follow the arrows in number order, or reveal more.`;
  $('solNext').disabled = $('solGoal').disabled = $('solAll').disabled = done;
  if (done) stopAutoReveal();
}
function revealMore(n) {
  if (!solState || !solState.path) return;
  solState.revealed = Math.min(solState.path.length, solState.revealed + n);
  renderSolution();
}
function revealToNextGoal() {
  if (!solState || !solState.path) return;
  let st = S.st;
  for (let i = 0; i < solState.revealed; i++) st = tryMove(S.L, st, solState.path[i]).st;
  const m = nextMilestone(S.L, st, solState.path.slice(solState.revealed));
  revealMore(m ? m.i + 1 : solState.path.length);
}
function showSolution() {
  if (S.busy || S.won || S.lvl === -2) return;
  clearHint();
  if (solState && solState.at === S.st) { revealMore(1); return; }
  planSolution(1);
}
// Called after each successful roll
function solutionAfterMove(d) {
  if (!solState) return;
  if (solState.path && solState.path[0] === d) {
    solState.path = solState.path.slice(1);
    solState.revealed = Math.max(0, solState.revealed - 1);
    solState.at = S.st;
    if (!solState.path) { clearSolution(); return; }
    if (solState.revealed === 0) solState.revealed = 1;
    renderSolution();
  } else {
    stopAutoReveal();
    planSolution(solState.revealed);
  }
}
$('solBtn').onclick = showSolution;
$('solNext').onclick = () => revealMore(1);
$('solGoal').onclick = revealToNextGoal;
$('solAll').onclick = () => {
  if (solTimer) { stopAutoReveal(); return; }
  $('solAll').textContent = 'Pause';
  solTimer = setInterval(() => { if (!solState || !solState.path || solState.revealed >= solState.path.length) stopAutoReveal(); else revealMore(1); }, reduced ? 60 : 320);
};
$('solHide').onclick = clearSolution;

// ---------- Hint and solution markers drawn on a flat layer above the 3D board ----------
// Markers used to live on the tiles themselves, so the cube, boxes and doors could hide them.
// Now each tile center is projected to the screen and markers are drawn over everything.
let probes = [];
function buildProbes(L, c) {
  probes = [];
  for (let y = 0; y < L.rows; y++) {
    probes[y] = [];
    for (let x = 0; x < L.cols; x++) {
      const p = document.createElement('i'); p.className = 'probe';
      p.style.left = (x * c + c / 2) + 'px'; p.style.top = (y * c + c / 2) + 'px';
      board.appendChild(p); probes[y][x] = p;
    }
  }
}
function projector() {
  const vr = $('viewport').getBoundingClientRect();
  const cache = new Map();
  const at = (x, y) => {
    const k = x + ',' + y; if (cache.has(k)) return cache.get(k);
    const p = probes[y] && probes[y][x]; if (!p) return null;
    const r = p.getBoundingClientRect(); const v = { x:r.left - vr.left, y:r.top - vr.top }; cache.set(k, v); return v;
  };
  // on-screen size of one tile near (x, y)
  const size = (x, y) => {
    const a = at(x, y), b = at(x + 1, y) || at(x - 1, y), d = at(x, y + 1) || at(x, y - 1);
    const s = [b, d].filter(Boolean).map(q => Math.hypot(q.x - a.x, q.y - a.y));
    return s.length ? Math.max(...s) : C();
  };
  return { at, size };
}
function ovEl(cls, p, s, html) {
  const el = document.createElement('div'); el.className = 'ov ' + cls;
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.setProperty('--s', s + 'px');
  if (html) el.innerHTML = html;
  $('ovl').appendChild(el); return el;
}
function drawOverlays() {
  const layer = $('ovl'); if (!layer) return;
  layer.innerHTML = '';
  if (!S || mode !== 'play' || !probes.length) return;
  const P = projector(), L = S.L;
  // Hint: highlight rings, plus the numbered route on tier 3
  if (hintState) {
    const { m, tier } = hintState, rings = [];
    if (m.type === 'solid') { for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) { const c = L.cells[y][x]; if (c && c.t === 'paint' && c.c === m.c) rings.push([x, y]); } }
    else rings.push([m.x, m.y]);
    if (m.type === 'button') { const b = S.st.boxes[m.box]; rings.push([b.x, b.y]); }
    rings.forEach(([x, y]) => { const p = P.at(x, y); if (p) ovEl('ov-ring', p, P.size(x, y)); });
    if (tier >= 3 && hintState.at === S.st) {
      let x = S.st.x, y = S.st.y; const steps = new Map();
      [...m.path].forEach((d, i) => { x += DIRS[d][0]; y += DIRS[d][1]; const k = x + ',' + y; if (!steps.has(k)) steps.set(k, { x, y, n:[] }); steps.get(k).n.push(i + 1); });
      steps.forEach(({ x, y, n }) => { const p = P.at(x, y); if (p) ovEl('ov-trail' + (n.length > 1 ? ' multi' : ''), p, P.size(x, y), `<span>${n.join(' ')}</span>`); });
    }
  }
  // Solution: arrows on the tile each roll lands on, pointing the way you roll
  if (solState && solState.path) {
    const { path, revealed } = solState, cells = new Map();
    let x = S.st.x, y = S.st.y;
    for (let i = 0; i < revealed; i++) {
      const d = path[i], px = x, py = y; x += DIRS[d][0]; y += DIRS[d][1];
      const a = P.at(px, py), b = P.at(x, y);
      const ang = a && b ? Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI : 0;
      const k = x + ',' + y; if (!cells.has(k)) cells.set(k, { x, y, steps:[] });
      cells.get(k).steps.push({ n:i + 1, ang });
    }
    cells.forEach(({ x, y, steps }) => {
      const p = P.at(x, y); if (!p) return;
      ovEl('ov-sol' + (steps.length > 1 ? ' multi' : ''), p, P.size(x, y), steps.map(s =>
        `<span class="sa${s.n === 1 ? ' now' : ''}${s.n === revealed ? ' newest' : ''}"><i style="transform:rotate(${s.ang.toFixed(1)}deg)">→</i><b>${s.n}</b></span>`).join(''));
    });
  }
}
let ovRaf = 0;
function scheduleOverlays() { cancelAnimationFrame(ovRaf); ovRaf = requestAnimationFrame(drawOverlays); }
try { new ResizeObserver(scheduleOverlays).observe($('viewport')); } catch (e) {}

// ---------- Infinite mode: endless generated levels, scored against par ----------
let infinite = false, campaignLvl = 0, infNext = null, infGenToken = 0;
let run = readRun(), best = readBest();
function newRun() { run = { seed:Math.floor(Math.random() * 1e9), n:0, score:0, effs:[], cleared:0, streak:0, bestStreak:0 }; writeRun(run); infNext = null; }
// Generate level n of the current run without freezing the page: a few tries per tick
function genInf(n, cb, background) {
  const token = background ? 0 : ++infGenToken, nextBatch = infSearch(run.seed, n);
  const step = () => {
    if (!background && token !== infGenToken) return;
    const lv = nextBatch();
    if (lv) { cb(lv); return; }
    setTimeout(step, 0);
  };
  step();
}
function pregenerate() {
  const n = run.n + 1;
  if (infNext && infNext.inf === n) return;
  genInf(n, lv => { if (run.n + 1 === n) infNext = lv; }, true);
}
function startInfinite() {
  if (!run) newRun();
  infinite = true;
  setMode('play');
  loadInfLevel();
}
function loadInfLevel() {
  const n = run.n;
  const go = lv => {
    if (!infinite || run.n !== n) return;
    lv.tip = `Every canvas is freshly generated. Par is ${lv.par}. Undo is allowed, but every roll you make counts toward your score.`;
    startLevel(lv, -2);
    pregenerate();
  };
  if (infNext && infNext.inf === n) { const lv = infNext; infNext = null; go(lv); return; }
  setStatus('Mixing a new canvas…');
  genInf(n, go);
}
function leaveInfinite() { infinite = false; renderInfCard(); }
function renderInfCard() {
  const on = infinite && S && S.lvl === -2;
  $('infCard').hidden = !on;
  $('hintBtn').hidden = $('solBtn').hidden = on;
  if (!on || !run) return;
  const rating = infRating(run);
  $('infRank').textContent = infRank(run);
  $('infRating').textContent = run.effs.length < 3 ? `${3 - run.effs.length} more to get ranked` : `rating ${rating}`;
  $('infCleared').textContent = run.cleared;
  $('infScore').textContent = run.score;
  $('infStreak').textContent = run.streak;
  $('infBest').textContent = best.cleared ? `Best run: ${best.cleared} cleared, ${best.score} points${best.rating ? `, peak rating ${best.rating}` : ''}.` : 'Your best run will show here.';
}
function infWin() {
  const L = S.L, m = Math.max(1, S.rolls || 0), par = L.par;
  const eff = Math.min(1, par / m), pts = Math.round(100 * eff);
  run.effs.push(eff); run.score += pts; run.cleared++;
  run.streak = m <= par ? run.streak + 1 : 0; run.bestStreak = Math.max(run.bestStreak, run.streak);
  run.n++; writeRun(run);
  const rating = infRating(run);
  if (run.cleared > best.cleared || run.score > best.score || (run.effs.length >= 3 && rating > best.rating)) {
    best = { cleared:Math.max(best.cleared, run.cleared), score:Math.max(best.score, run.score), rating:run.effs.length >= 3 ? Math.max(best.rating, rating) : best.rating };
    writeBest(best);
  }
  $('winTitle').textContent = m <= par ? 'Perfect roll' : 'Cleared';
  $('winScore').textContent = `${m} rolls · par ${par} · +${pts} points`;
  $('winNote').textContent = run.effs.length < 3 ? `Clear ${3 - run.effs.length} more to get your first rank.`
    : `Rank: ${infRank(run)} (rating ${rating}, from your last ${Math.min(10, run.effs.length)} canvases).`;
  $('winRetry').hidden = true;
  $('winNext').hidden = false;
  $('winNext').firstChild.textContent = 'Next canvas ';
  renderInfCard();
}
let skipArmed = null, newArmed = null;
$('infSkip').onclick = () => {
  if (S.busy) return;
  run.effs.push(0); run.streak = 0; run.n++; writeRun(run);
  $('infNote').textContent = 'Skipped. That canvas counts as 0 toward your rating.';
  setTimeout(() => { $('infNote').textContent = ''; }, 3500);
  loadInfLevel();
};
$('infNew').onclick = () => {
  const b = $('infNew');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = 'Click again to start over';
    clearTimeout(newArmed); newArmed = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'New run'; }, 4000);
    return;
  }
  clearTimeout(newArmed); b.classList.remove('armed'); b.textContent = 'New run';
  newRun(); loadInfLevel();
};
$('titleInf').onclick = () => { SFX.play('start'); startInfinite(); };

// ---------- Hints: next goal, then how, then a route to that goal ----------
let hintState = null; // { m, tier, at }
const mKey = m => m ? [m.type, m.c, m.x, m.y].join(':') : '';

function clearHint(keepState) {
  $('hintBox').hidden = true;
  if (!keepState) hintState = null;
  scheduleOverlays();
}
function clearTrail() { scheduleOverlays(); }
function renderHint() {
  const { m, tier } = hintState, L = S.L;
  scheduleOverlays();
  const [what, how] = hintTexts(L, S.st, m);
  $('hintStep').textContent = `Hint ${tier} of 3`;
  $('hintText').innerHTML = esc(what) + (tier >= 2 ? `<br><span class="how">${esc(how)}</span>` : '') +
    (tier >= 3 ? `<br><span class="how">The numbers on the board show a ${m.path.length}-roll route to it.</span>` : '');
  $('hintMore').hidden = tier >= 3;
  $('hintMore').textContent = tier === 1 ? 'How do I do that?' : 'Show me a route';
  $('hintBox').hidden = false;
}
function hint(more) {
  if (S.busy || S.won || S.lvl === -2) return;
  if (solState) clearSolution();
  if (hintState && hintState.at === S.st) { hintState.tier = Math.min(3, hintState.tier + 1); renderHint(); return; }
  setStatus('Thinking…');
  const at = S.st;
  setTimeout(() => {
    if (S.st !== at || S.won) return;
    const sol = solve(S.L, S.st, 1500000);
    if (!sol) { clearHint(); setStatus(solve.hitLimit ? '<b>Too many possibilities.</b> The hint gave up on this one.' : '<b>Stuck.</b> No way to finish from here. Undo or restart.', true); return; }
    const m = nextMilestone(S.L, S.st, sol);
    const same = hintState && mKey(hintState.m) === mKey(m);
    SFX.play('hint');
    hintState = { m, tier: same ? Math.min(3, hintState.tier + (more ? 1 : 0)) : 1, at };
    setStatus('');
    renderHint();
  }, 30);
}
// Called after each successful roll
function hintAfterMove(r) {
  if (!hintState) return;
  clearTrail();
  const m = hintState.m, st = S.st;
  let done = false;
  if (m.type === 'gate' || m.type === 'door' || m.type === 'wgate' || m.type === 'wash') done = st.x === m.x && st.y === m.y;
  else if (m.type === 'switch') done = r.flipped >= 0 && r.nx === m.x && r.ny === m.y;
  else if (m.type === 'solid') done = solidColor(st.f) === m.c;
  else if (m.type === 'button') done = st.boxes[m.box].x === m.x && st.boxes[m.box].y === m.y;
  if (done) { clearHint(); return 'That was the hinted step.'; }
  hintState.at = null; // the next press re-plans from here
  if (hintState.tier >= 3) { $('hintText').querySelectorAll('.how').forEach((e, i) => { if (i === 1) e.remove(); }); }
  return '';
}
$('hintMore').onclick = () => hint(true);
$('hintClose').onclick = () => clearHint();

$('undoBtn').onclick = undo;
const restart = () => startLevel(S.L, S.lvl, null, { rolls:S.lvl === -2 ? S.rolls : 0 });
$('resetBtn').onclick = restart;
$('hintBtn').onclick = () => hint();
$('winRetry').onclick = restart;
$('winNext').onclick = () => S.lvl === -2 ? loadInfLevel() : S.lvl < 0 ? setMode('edit') : loadLevel(Math.min(S.lvl + 1, LEVELS.length - 1));
document.querySelectorAll('.dpad button').forEach(b => b.addEventListener('click', () => move(b.dataset.d)));

const KEYMAP = { ArrowUp:'N', ArrowDown:'S', ArrowLeft:'W', ArrowRight:'E', w:'N', s:'S', a:'W', d:'E', W:'N', S:'S', A:'W', D:'E' };
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (mode !== 'play' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  if (tipOpen()) { if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); dismissTip(); } else if (KEYMAP[e.key]) e.preventDefault(); return; }
  if (KEYMAP[e.key]) { e.preventDefault(); move(KEYMAP[e.key]); return; }
  const k = e.key.toLowerCase();
  if (k === 'z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  else if (k === 'r') restart();
  else if (k === 'h') hint();
  else if (e.key === 'Enter' && S.won && !$('winNext').hidden) { e.preventDefault(); $('winNext').click(); }
});

// Swipe
let touch0 = null;
$('viewport').addEventListener('pointerdown', e => { touch0 = [e.clientX, e.clientY]; });
$('viewport').addEventListener('pointerup', e => {
  if (!touch0) return;
  const dx = e.clientX - touch0[0], dy = e.clientY - touch0[1]; touch0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N'));
});

let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (mode === 'play') { if (S && !S.busy) renderBoard(); } else renderEditor(); }, 120); });

// ---------- Modes ----------
let mode = 'title';
function setMode(m) {
  mode = m;
  $('titleView').hidden = m !== 'title';
  $('topbar').hidden = m === 'title';
  if (m === 'title') { renderTitle(); $('palette').hidden = true; }
  $('playView').hidden = m !== 'play';
  $('levels').hidden = m !== 'play' || infinite;
  $('editView').hidden = m !== 'edit';
  $('modePlay').setAttribute('aria-pressed', m === 'play');
  $('modeEdit').setAttribute('aria-pressed', m === 'edit');
  const h = m === 'edit' ? '#editor' : '';
  if (location.hash !== h) { try { history.replaceState(null, '', h || location.pathname + location.search); } catch (e) { location.hash = h; } }
  if (m === 'play' && S) { renderBoard(); if ($('tip').hidden) queueTips(S.L); }
  if (m === 'edit') renderEditor();
}
$('modePlay').onclick = () => { if (infinite || !S || S.lvl < 0) { leaveInfinite(); loadLevel(campaignLvl); } setMode('play'); };
$('modeEdit').onclick = () => setMode('edit');
$('backEdit').onclick = () => setMode('edit');
$('editCopy').onclick = () => { loadIntoEditor(S.L, S.lvl === -1 ? S.L.name : S.L.name + ' remix', S.lvl === -1 ? ED.id : null); leaveInfinite(); setMode('edit'); };
addEventListener('hashchange', () => setMode(location.hash === '#editor' ? 'edit' : mode === 'title' ? 'title' : 'play'));

// ---------- Editor ----------
const TOOLS = [
  ['floor', 'Floor'], ['erase', 'Erase'], ['start', 'Start'], ['goal', 'Target'],
  ['paint', 'Puddle'], ['wash', 'Paint remover'], ['gate', 'Gate'], ['wgate', 'White gate'], ['switch', 'Switch'], ['button', 'Button'], ['box', 'Box'], ['door', 'Door'],
];
const COLORED = ['paint', 'gate', 'switch', 'button', 'box', 'door'];
let ED = null, tool = 'floor', ecolor = 'r', wface = 'b', painting = false, lastCheck = null;

function blankGrid(cols, rows) { return Array.from({ length:rows }, () => Array.from({ length:cols }, () => ({ t:'floor' }))); }
function newEditor() {
  const g = blankGrid(8, 5);
  g[2][0] = { t:'start' }; g[2][7] = { t:'goal' };
  return { id:null, name:'Untitled', cols:8, rows:5, grid:g, need:{} };
}
function loadIntoEditor(L, name, id) {
  const P = parseLevel(JSON.parse(JSON.stringify({ map:L.map, k:L.k, need:L.need })));
  const grid = [];
  for (let y = 0; y < P.rows; y++) {
    grid[y] = [];
    for (let x = 0; x < P.cols; x++) {
      const c = P.cells[y][x];
      grid[y][x] = !c ? null : c.t === 'floor' ? { t:'floor' } : c.t === 'wash' ? { t:'wash' } : c.t === 'wgate' ? { t:'wgate', f:c.f } : { t:c.t, c:c.c };
    }
  }
  grid[P.sy][P.sx] = { t:'start' };
  P.boxes0.forEach(b => { grid[b.y][b.x] = { t:'box', c:b.c }; });
  ED = { id, name, cols:P.cols, rows:P.rows, grid, need:{ ...(L.need || {}) } };
  lastCheck = null;
  saveDraft();
}
const saveDraft = () => writeDraft(ED), loadDraft = readDraft, mine = readMine, setMine = writeMine;

// Editor grid -> level data the game understands
function edToLevel() {
  const POOL = '1234567890@#$%&*+=~^!?<>[](){}|;:,_/';
  const k = {}, rev = {}; let starts = 0, goals = 0;
  const map = ED.grid.map(row => row.map(c => {
    if (!c) return ' ';
    if (c.t === 'floor') return '.';
    if (c.t === 'start') { starts++; return 'S'; }
    if (c.t === 'goal') { goals++; return 'X'; }
    if (c.t === 'paint') return c.c;
    if (c.t === 'gate') return c.c.toUpperCase();
    if (c.t === 'wgate' && c.f === 'b') return 'W';
    if (c.t === 'wash') return 'Z';
    const param = c.t === 'wgate' ? c.f : c.c;
    const key = c.t + param;
    if (!rev[key]) { const ch = POOL[Object.keys(rev).length]; rev[key] = ch; k[ch] = [c.t, param]; }
    return rev[key];
  }).join('').replace(/\s+$/, ''));
  const need = {}; for (const f of FACES) if (ED.need[f]) need[f] = ED.need[f];
  const L = { name:ED.name.trim() || 'Untitled', map, k };
  if (Object.keys(need).length) L.need = need;
  if (starts !== 1) return { error:starts ? 'Place only one start.' : 'Place a start tile.' };
  if (!goals) return { error:'Place at least one target.' };
  return { level:L };
}


function edCellHTML(c) {
  if (!c) return '<div class="ec void"></div>';
  if (c.t === 'wash') return '<div class="ec wash"><b>✦</b></div>';
  if (c.t === 'wgate') return `<div class="ec wgate wg-${c.f}">${WGLYPH[c.f] ? `<b>${WGLYPH[c.f]}</b>` : ''}</div>`;
  const style = c.c ? ` style="--pc:${COLORS[c.c]}"` : (c.t === 'goal' && ED.need.t ? ` style="--pc:${COLORS[ED.need.t]}"` : '');
  return `<div class="ec ${c.t}"${style}></div>`;
}
function renderEditor() {
  if (!ED) return;
  const wrap = $('edGridWrap');
  const size = Math.max(22, Math.min(42, Math.floor(((wrap.clientWidth || 560) - 8) / ED.cols) - 2));
  const g = $('edGrid');
  g.style.setProperty('--ec', size + 'px'); g.style.setProperty('--cols', ED.cols);
  g.innerHTML = ED.grid.map((row, y) => row.map((c, x) => edCellHTML(c).replace('<div class="ec', `<div data-x="${x}" data-y="${y}" class="ec`)).join('')).join('');
  $('edName').value = ED.name;
  $('edCols').textContent = ED.cols; $('edRows').textContent = ED.rows;
  for (const f of FACES) $('need-' + f).value = ED.need[f] || '';
  document.querySelectorAll('#edTools button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === tool));
  if (ecolor === 'w' && (tool === 'paint' || tool === 'gate')) ecolor = 'r';
  document.querySelectorAll('#edColors button').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.color === ecolor);
    b.disabled = b.dataset.color === 'w' && (tool === 'paint' || tool === 'gate');
  });
  $('edColors').classList.toggle('dim', !COLORED.includes(tool));
  $('edColors').hidden = tool === 'wgate'; $('edFaces').hidden = tool !== 'wgate';
  document.querySelectorAll('#edFaces button').forEach(b => b.setAttribute('aria-pressed', b.dataset.face === wface));
  const r = edToLevel();
  $('edCode').value = r.level ? encodeLevel(r.level) : '';
  $('edCodeNote').textContent = r.level ? 'Anyone with this code can import your level.' : r.error;
  $('edSave').textContent = ED.id ? 'Save changes' : 'Save to my levels';
  renderCheck();
  renderMine();
}
function renderCheck() {
  const el = $('edResult');
  if (!lastCheck) { el.className = 'ed-result'; el.innerHTML = 'Not checked yet.'; return; }
  el.className = 'ed-result ' + (lastCheck.ok ? 'good' : 'bad');
  el.innerHTML = lastCheck.html;
}
function changed() { lastCheck = null; saveDraft(); renderEditor(); }

function applyTool(x, y) {
  const cur = ED.grid[y][x];
  let next;
  if (tool === 'erase') next = null;
  else if (tool === 'floor') next = { t:'floor' };
  else if (tool === 'start' || tool === 'goal' || tool === 'wash') next = { t:tool };
  else if (tool === 'wgate') next = { t:'wgate', f:wface };
  else next = { t:tool, c:ecolor };
  if (JSON.stringify(cur) === JSON.stringify(next)) return;
  if (tool === 'start') ED.grid.forEach(row => row.forEach((c, i) => { if (c && c.t === 'start') row[i] = { t:'floor' }; }));
  ED.grid[y][x] = next;
  changed();
}
function cellFromEvent(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest('#edGrid .ec');
  return c ? [Number(c.dataset.x), Number(c.dataset.y)] : null;
}
$('edGrid').addEventListener('pointerdown', e => {
  const p = cellFromEvent(e); if (!p) return;
  e.preventDefault(); painting = true;
  try { $('edGrid').setPointerCapture(e.pointerId); } catch (err) {}
  applyTool(...p);
});
$('edGrid').addEventListener('pointermove', e => {
  if (!painting) return;
  const p = cellFromEvent(e); if (p) applyTool(...p);
});
addEventListener('pointerup', () => { painting = false; });
addEventListener('pointercancel', () => { painting = false; });

$('edTools').innerHTML = TOOLS.map(([k, label]) => {
  const sample = k === 'erase' ? 'void' : k;
  return `<button type="button" data-tool="${k}" aria-pressed="false"><span class="ec ${sample}" style="--ec:20px;--pc:var(--blue)">${k === 'wash' ? '<b>✦</b>' : ''}</span>${label}</button>`;
}).join('');
$('edTools').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tool = b.dataset.tool; renderEditor(); } });
$('edColors').innerHTML = Object.keys(COLORS).map(c =>
  `<button type="button" data-color="${c}" aria-pressed="false" aria-label="${CNAME[c]}" style="--pc:${COLORS[c]}"><span>${GLYPH[c]}</span></button>`).join('');
$('edFaces').innerHTML = '<span class="ed-faces-label">Bare side needed:</span>' + ['b','t','n','s','e','w'].map(f =>
  `<button type="button" data-face="${f}" aria-pressed="false"><span class="ec wgate wg-${f}" style="--ec:20px">${WGLYPH[f] ? `<b>${WGLYPH[f]}</b>` : ''}</span>${cap(FNAME[f])}</button>`).join('');
$('edFaces').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { wface = b.dataset.face; renderEditor(); } });
$('edColors').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ecolor = b.dataset.color; if (!COLORED.includes(tool)) tool = 'paint'; renderEditor(); } });

$('edName').addEventListener('input', e => { ED.name = e.target.value; saveDraft(); const r = edToLevel(); if (r.level) $('edCode').value = encodeLevel(r.level); });
function resize(dc, dr) {
  const cols = Math.max(3, Math.min(18, ED.cols + dc)), rows = Math.max(3, Math.min(12, ED.rows + dr));
  const g = blankGrid(cols, rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (y < ED.rows && x < ED.cols) g[y][x] = ED.grid[y][x];
  Object.assign(ED, { cols, rows, grid:g });
  changed();
}
document.querySelectorAll('[data-resize]').forEach(b => b.addEventListener('click', () => {
  const [dc, dr] = b.dataset.resize.split(',').map(Number); resize(dc, dr);
}));
const needSel = $('edNeed');
needSel.innerHTML = FACES.map(f => `<label for="need-${f}">${cap(FNAME[f])}<select id="need-${f}"><option value="">Any</option>${
  [...PAINT_COLORS].map(c => `<option value="${c}">${cap(CNAME[c])}</option>`).join('')}</select></label>`).join('');
FACES.forEach(f => $('need-' + f).addEventListener('change', e => { if (e.target.value) ED.need[f] = e.target.value; else delete ED.need[f]; changed(); }));

function checkLevel() {
  const r = edToLevel();
  if (r.error) return { ok:false, html:`<b>Can't check yet.</b> ${r.error}` };
  const L = parseLevel(r.level);
  const sol = solve(L, initState(L), 1200000);
  if (sol) return { ok:true, par:sol.length, level:L, html:`<b>Solvable in ${sol.length} moves.</b> That becomes the par.` };
  return { ok:false, level:L, html:solve.hitLimit
    ? '<b>Too big to check.</b> The solver gave up before finding a solution. You can still test it.'
    : '<b>No solution.</b> No sequence of rolls reaches a target that satisfies its needs.' };
}
$('edCheck').onclick = () => {
  $('edResult').innerHTML = 'Checking…';
  setTimeout(() => { lastCheck = checkLevel(); renderCheck(); }, 20);
};
$('edTest').onclick = () => {
  const r = edToLevel();
  if (r.error) { lastCheck = { ok:false, html:`<b>Can't test yet.</b> ${r.error}` }; renderCheck(); return; }
  $('edResult').innerHTML = 'Checking…';
  setTimeout(() => {
    lastCheck = checkLevel(); renderCheck();
    const L = lastCheck.level; L.par = lastCheck.par || null;
    startLevel(L, -1); setMode('play');
  }, 20);
};
$('edSave').onclick = () => {
  const r = edToLevel();
  if (r.error) { lastCheck = { ok:false, html:`<b>Can't save yet.</b> ${r.error}` }; renderCheck(); return; }
  const list = mine();
  const id = ED.id || 'L' + Date.now().toString(36);
  const entry = { id, level:r.level, saved:Date.now() };
  const i = list.findIndex(x => x.id === id);
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  const ok = setMine(list);
  if (ok) ED.id = id;
  saveDraft();
  lastCheck = { ok, html: ok ? `<b>Saved.</b> “${r.level.name}” is in your levels on this browser.` : '<b>Couldn’t save.</b> This browser is blocking storage. Copy the share code instead.' };
  renderEditor();
};
$('edNew').onclick = () => { ED = newEditor(); changed(); };
$('edClear').onclick = () => { ED.grid = ED.grid.map(r => r.map(() => null)); changed(); };
$('edCopy').onclick = () => {
  const v = $('edCode').value; if (!v) return;
  const sel = () => { $('edCode').focus(); $('edCode').select(); $('edCodeNote').textContent = 'Selected. Press Ctrl+C or Cmd+C to copy.'; };
  try { navigator.clipboard.writeText(v).then(() => { $('edCodeNote').textContent = 'Copied.'; }, sel); } catch (e) { sel(); }
};
$('edImport').onclick = () => {
  try {
    const L = decodeLevel($('edImportText').value);
    loadIntoEditor(L, L.name || 'Imported', null);
    $('edImportText').value = '';
    $('edImportNote').textContent = `Loaded “${ED.name}”.`;
    renderEditor();
  } catch (e) { $('edImportNote').textContent = 'That code didn’t work. Paste the whole thing, starting with CUBLITZ:'; }
};
function renderStock() {
  $('edStock').innerHTML = '<option value="">Open a built-in level…</option>' +
    LEVELS.map((L, i) => unlocked(i) ? `<option value="${i}">${i+1}. ${L.name}</option>` : `<option value="${i}" disabled>${i+1}. Locked</option>`).join('');
}
renderStock();
$('edStock').onchange = e => { if (e.target.value === '') return; const L = LEVELS[+e.target.value]; loadIntoEditor(L, L.name + ' remix', null); e.target.value = ''; renderEditor(); };

let armedDelete = null;
function renderMine() {
  const list = mine(), el = $('edList');
  if (!list.length) { el.innerHTML = '<p class="muted">Levels you save appear here. They live in this browser only, so use share codes to move them around.</p>'; return; }
  el.innerHTML = list.map(x => `<li${x.id === ED.id ? ' class="cur"' : ''}><span class="nm">${esc(x.level.name)}</span>
    <button type="button" data-act="play" data-id="${x.id}">Play</button>
    <button type="button" data-act="edit" data-id="${x.id}">Edit</button>
    <button type="button" data-act="del" data-id="${x.id}" class="${armedDelete === x.id ? 'armed' : ''}">${armedDelete === x.id ? 'Confirm' : 'Delete'}</button></li>`).join('');
}
$('edList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const list = mine(), x = list.find(i => i.id === b.dataset.id); if (!x) return;
  if (b.dataset.act === 'edit') { armedDelete = null; loadIntoEditor(x.level, x.level.name, x.id); renderEditor(); }
  if (b.dataset.act === 'play') {
    armedDelete = null;
    loadIntoEditor(x.level, x.level.name, x.id);
    const L = parseLevel(JSON.parse(JSON.stringify(x.level)));
    const sol = solve(L, initState(L), 600000); L.par = sol ? sol.length : null;
    startLevel(L, -1); setMode('play');
  }
  if (b.dataset.act === 'del') {
    if (armedDelete !== x.id) { armedDelete = x.id; renderMine(); return; }
    setMine(list.filter(i => i.id !== x.id)); armedDelete = null;
    if (ED.id === x.id) ED.id = null;
    renderEditor();
  }
});

initPalette();

// ---------- Title screen ----------
function renderTitle() {
  const beaten = LEVELS.filter(L => progress[L.name]).length;
  const next = LEVELS.findIndex((L, i) => unlocked(i) && !progress[L.name]);
  if (!beaten) { $('titlePlay').textContent = 'Play'; $('titleProgress').textContent = `${LEVELS.length} levels`; }
  else if (next < 0) { $('titlePlay').textContent = 'Play again'; $('titleProgress').textContent = `All ${LEVELS.length} levels cleared`; }
  else { $('titlePlay').textContent = `Continue · Level ${next + 1}`; $('titleProgress').textContent = `${beaten} of ${LEVELS.length} levels cleared`; }
  if (best.cleared) $('titleProgress').textContent += ` · Infinite best ${best.cleared}`;
  $('titleInf').textContent = run && run.n ? `Infinite · Canvas ${run.n + 1}` : 'Infinite mode';
}
$('titlePlay').onclick = () => {
  SFX.play('start');
  const next = LEVELS.findIndex((L, i) => unlocked(i) && !progress[L.name]);
  leaveInfinite();
  if (!S || S.lvl !== (next < 0 ? 0 : next)) loadLevel(next < 0 ? 0 : next);
  setMode('play');
};
$('titleEdit').onclick = () => setMode('edit');
document.querySelector('header .brand').addEventListener('click', () => setMode('title'));
document.addEventListener('keydown', e => {
  if (mode === 'title' && (e.key === 'Enter' || e.key === ' ') && !/BUTTON|INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); $('titlePlay').click(); }
});

initSound();

// ---------- Boot ----------
ED = loadDraft() || newEditor();
window.claude?.hot?.snapshot?.(() => (S && S.lvl >= 0 ? { lvl:S.lvl, st:S.st, hist:S.hist, mode } : { mode }));
function start(data) {
  if (data && typeof data.lvl === 'number' && LEVELS[data.lvl] && unlocked(data.lvl) && data.st && data.st.boxes) loadLevel(data.lvl, data);
  else {
    const firstOpen = LEVELS.findIndex(L => !progress[L.name]);
    loadLevel(firstOpen < 0 ? 0 : firstOpen);
  }
  setMode('title');
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
