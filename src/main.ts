// @ts-nocheck: the page code not yet moved to typed modules in ui/.
import { $ } from './ui/dom.ts';
import { beaten, eraseProgress, loadProgress, loadReducedMotion, progress, reduced, S, saveProgress, setSession, unlocked } from './ui/session.ts';
import { clearTipsSeen, readBest, readColors, readDraft, readMine, readMuted, readRun, readTipsSeen, writeBest, writeColors, writeDraft, writeMine, writeMuted, writeRun, writeTipsSeen } from './ui/storage.ts';
import { cap, COLORS, esc, GLYPH, WGLYPH } from './ui/text.ts';
import { initSound, SFX } from './ui/sfx.ts';
import { initPalette } from './ui/palette.ts';
import { blankGrid, draftFromLevel, edCellHTML, edToLevel as gridToLevel, newEditor } from './ui/editor-grid.ts';
import { clearTipQueue, dismissTip, initTips, queueTips, tipOpen } from './ui/tips.ts';
import { clearSolution, initSolution, planSolution, renderSolution, solState, solutionAfterMove, stopAutoReveal } from './ui/solution.ts';
import { buildProbes, initOverlays, scheduleOverlays } from './ui/overlays.ts';
import { clearHint, clearHintState, forgetHintPosition, hint, hintAfterMove, hintState, initHints, renderHint } from './ui/hint.ts';
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
export const C = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--c'));

function cellSize(L) {
  const vw = $('viewport').clientWidth || 600;
  const span = L.cols * 0.95 + L.rows * 0.31 + 1.2;
  return Math.max(24, Math.min(62, Math.floor(vw / span)));
}

export function loadLevel(i, snap?) { if (!unlocked(i)) return; startLevel(LEVELS[i], i, snap); }
function startLevel(L, i, snap, opts) {
  clearSolution();
  clearHintState(); $('hintBox').hidden = true;
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
  clearTipQueue(); $('tip').hidden = true;
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

export function setStatus(html, warn?) {
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
  forgetHintPosition();
  const keep = solState ? solState.revealed + 1 : 0;
  S.st = S.hist.pop();
  SFX.play('undo');
  placeCube(); renderPieces(true); renderHud(); setStatus('Undid one roll.');
  if (keep) { stopAutoReveal(); planSolution(keep); }
}
initTips();

initSolution();

initOverlays();

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

initHints();

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
export let mode = 'title';
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

function loadIntoEditor(L, name, id) {
  ED = draftFromLevel(L, name, id);
  lastCheck = null;
  saveDraft();
}
const edToLevel = () => gridToLevel(ED);
const saveDraft = () => writeDraft(ED), loadDraft = readDraft, mine = readMine, setMine = writeMine;

function renderEditor() {
  if (!ED) return;
  const wrap = $('edGridWrap');
  const size = Math.max(22, Math.min(42, Math.floor(((wrap.clientWidth || 560) - 8) / ED.cols) - 2));
  const g = $('edGrid');
  g.style.setProperty('--ec', size + 'px'); g.style.setProperty('--cols', ED.cols);
  g.innerHTML = ED.grid.map((row, y) => row.map((c, x) => edCellHTML(c, ED.need).replace('<div class="ec', `<div data-x="${x}" data-y="${y}" class="ec`)).join('')).join('');
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
export function renderTitle() {
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
