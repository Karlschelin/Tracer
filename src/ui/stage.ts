// Scenen: videon med ritytan ovanpå, ritloopen och pekhanteringen.
import { ballAt, emptyFacit, setBall, setLanding } from '../annotate/facit';
import type { App } from '../app/context';
import type { AppState } from '../app/state';
import { drawAnnotations, drawLoupe } from '../render/annotations';
import { DEMO_SHOT, drawDemoBg } from '../render/demo';
import { drawGhost, drawHandles, handlePoint, HANDLES, type HandleKey } from '../render/overlay';
import { drawTrace } from '../render/tracer';
import { autoApex, type Point } from '../trajectory/model';
import { $ } from './dom';

const HINTS: Record<HandleKey, string> = {
  start: 'Peka på bollen vid träffen',
  end: 'Peka där bollen landar',
  apex: 'Peka ut banans högsta punkt',
};

/** Hur mycket punkten följer fingret när man finjusterar med pekskärm. */
const TOUCH_DAMPING = 0.3;
/** Pekpunkten ligger så här långt ovanför fingret (CSS-pixlar), så att fingret inte täcker bollen. */
const TOUCH_OFFSET = 44;

export function setupStage(app: App, frameListeners: Array<(frame: number) => void>): void {
  const { store, video, clock } = app;
  const overlay = $<HTMLCanvasElement>('#overlay'), stage = $('#stage'), stageWrap = $('#stageWrap'), hint = $('#hint');
  const octx = overlay.getContext('2d')!;
  let dpr = 1;

  app.layout = () => {
    const s = store.state;
    const availW = stageWrap.clientWidth - 16;
    const isNarrow = window.innerWidth <= 820;
    const availH = Math.max(240, window.innerHeight * (isNarrow ? 0.62 : 0.78));
    const ar = s.vw / s.vh;
    let w = availW, h = w / ar;
    if (h > availH) { h = availH; w = h * ar; }
    stage.style.width = Math.floor(w) + 'px';
    stage.style.height = Math.floor(h) + 'px';
    dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
  };
  window.addEventListener('resize', app.layout);

  let accent = '#ff4a3d';
  const readAccent = () => {
    accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
  };
  readAccent();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readAccent);

  // ---------- Hint över videon ----------
  function setHint(s: AppState): void {
    const show = (text: string, attn = false) => { hint.hidden = false; hint.textContent = text; hint.classList.toggle('attn', attn); };
    if (s.exporting) { show('Exporterar…'); return; }
    if (!s.loaded) { show('Exempel · ladda upp din video för att börja'); return; }
    if (s.busy) { show(s.busyText || 'Arbetar…'); return; }
    if (s.annotating) {
      // Ingen stående hint här: den skulle täcka himlen, där bollen oftast är.
      if (s.landingMode) show('Peka där bollen landar', true);
      else hint.hidden = true;
      return;
    }
    if (s.mode) { show(HINTS[s.mode], true); return; }
    if (s.impact == null) { show('Stega fram till träffen (steg 2)'); return; }
    if (!s.end) { show('Markera landningen (steg 3)'); return; }
    hint.hidden = true;
  }
  store.subscribe(setHint);

  // När appen väntar på att användaren ska peka i videon ska videon synas. På mobilen ligger stegen
  // under videon, så efter ett tryck på t.ex. "Markera träff här" är videon annars utanför skärmen.
  let lastMode: AppState['mode'] = null;
  store.subscribe((s) => {
    if (s.mode && s.mode !== lastMode) {
      const r = stage.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    lastMode = s.mode;
  });

  // ---------- Pekare ----------
  const norm = (clientX: number, clientY: number): Point => {
    const r = overlay.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };

  /** Pågående utpekning i annoteringsläget. */
  let aim: { point: Point; lastX: number; lastY: number; touch: boolean; id: number } | null = null;
  let drag: HandleKey | null = null;

  function commitAim(): void {
    if (!aim) return;
    const s = store.state;
    const p = aim.point;
    aim = null;
    const facit = s.facit ?? emptyFacit({ clip: s.clipName, width: s.vw, height: s.vh, fps: s.fps, frameCount: clock.frameCount });
    const frame = clock.frame;
    if (s.landingMode) {
      store.set({ facit: setLanding(facit, { frame, x: p.x, y: p.y }), facitDirty: true, landingMode: false }, { undo: true });
      return;
    }
    store.set({ facit: setBall(facit, frame, p, 'manuell'), facitDirty: true }, { undo: true });
    if (s.autoAdvance && frame < clock.frameCount - 1) void clock.step(1);
  }

  overlay.addEventListener('pointerdown', (e) => {
    const s = store.state;
    if (!s.loaded || s.exporting || s.busy) return;
    if (s.annotating) {
      video.pause();
      const touch = e.pointerType === 'touch';
      aim = { point: norm(e.clientX, e.clientY - (touch ? TOUCH_OFFSET : 0)), lastX: e.clientX, lastY: e.clientY, touch, id: e.pointerId };
      overlay.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const p = norm(e.clientX, e.clientY);
    if (s.mode) {
      store.set({ [s.mode]: p, mode: null } as Partial<AppState>, { undo: true });
      e.preventDefault();
      return;
    }
    if (!video.paused) return;
    const r = overlay.getBoundingClientRect();
    let best: HandleKey | null = null, bd = 30;
    for (const [key] of HANDLES) {
      const q = handlePoint(s, key);
      if (!q) continue;
      const d = Math.hypot((q.x - p.x) * r.width, (q.y - p.y) * r.height);
      if (d < bd) { bd = d; best = key; }
    }
    if (best) {
      // Spara läget före draget så att hela draget kan ångras i ett steg.
      const patch: Partial<AppState> = best === 'apex' && !s.apex && s.start && s.end
        ? { apex: autoApex({ start: s.start, end: s.end }) } : {};
      store.set(patch, { undo: true });
      drag = best; overlay.setPointerCapture(e.pointerId); e.preventDefault();
    }
  });
  overlay.addEventListener('pointermove', (e) => {
    if (aim && e.pointerId === aim.id) {
      if (aim.touch) {
        const r = overlay.getBoundingClientRect();
        aim.point = {
          x: Math.min(1, Math.max(0, aim.point.x + ((e.clientX - aim.lastX) * TOUCH_DAMPING) / r.width)),
          y: Math.min(1, Math.max(0, aim.point.y + ((e.clientY - aim.lastY) * TOUCH_DAMPING) / r.height)),
        };
      } else {
        aim.point = norm(e.clientX, e.clientY);
      }
      aim.lastX = e.clientX; aim.lastY = e.clientY;
      return;
    }
    if (drag) store.set({ [drag]: norm(e.clientX, e.clientY) } as Partial<AppState>);
  });
  overlay.addEventListener('pointerup', (e) => {
    if (aim && e.pointerId === aim.id) { commitAim(); return; }
    drag = null;
  });
  overlay.addEventListener('pointercancel', () => { aim = null; drag = null; });

  // ---------- Ritloop ----------
  /** Luppen visar så här många videopixlar på bredden. */
  const loupeSpan = (s: AppState) => Math.max(40, Math.round(s.vw * 0.04));

  function drawAnnotating(s: AppState, W: number, H: number, frame: number): void {
    if (s.facit) drawAnnotations(octx, W, H, dpr, { facit: s.facit, frame, accent });
    // Luppen får inte ta för stor del av en liten scen (mobil i stående format).
    const r = Math.min(62 * dpr, W * 0.2);
    const gap = 40 * dpr;
    if (aim) {
      const px = aim.point.x * W, py = aim.point.y * H;
      // Luppen ligger ovanför punkten. Nära överkanten läggs den i stället i det övre hörn som är längst bort.
      let cx = Math.min(W - r - 4, Math.max(r + 4, px)), cy = py - r - gap;
      if (cy - r < 4) { cy = r + 4; cx = px < W / 2 ? W - r - 4 : r + 4; }
      // Liten markering där punkten hamnar.
      octx.save();
      octx.strokeStyle = accent; octx.lineWidth = 1.5 * dpr;
      octx.beginPath(); octx.arc(px, py, 9 * dpr, 0, Math.PI * 2); octx.stroke();
      octx.restore();
      drawLoupe(octx, { source: video, sw: s.vw, sh: s.vh, at: aim.point, cx, cy, radius: r, span: loupeSpan(s), color: accent, dpr });
      return;
    }
    // I vila: visa en förstoring av punkten i den här bilden, så att den går att granska utan att peka.
    // Den ligger i ett nedre hörn, där bollen sällan är, och byter sida om punkten råkar ligga där.
    const cur = s.facit && ballAt(s.facit, frame);
    if (cur && video.paused) {
      const left = !(cur.x < 0.5 && cur.y > 0.6);
      drawLoupe(octx, {
        source: video, sw: s.vw, sh: s.vh, at: cur, cx: left ? r + 8 * dpr : W - r - 8 * dpr, cy: H - r - 8 * dpr,
        radius: r, span: loupeSpan(s), color: cur.source === 'manuell' ? accent : '#ffffff',
        label: cur.source === 'manuell' ? 'satt för hand' : 'automatisk', dpr,
      });
    }
  }

  const demoStart = performance.now();
  let lastFrame = -1;
  function frame(): void {
    const s = store.state;
    const W = overlay.width, H = overlay.height;
    octx.clearRect(0, 0, W, H);
    if (!s.loaded) {
      drawDemoBg(octx, W, H);
      const t = ((performance.now() - demoStart) / 1000) % 5.5;
      drawTrace(octx, W, H, t, DEMO_SHOT, s);
    } else {
      const f = clock.frame;
      if (s.annotating) {
        drawAnnotating(s, W, H, f);
      } else {
        drawTrace(octx, W, H, video.currentTime, s, s);
        if (video.paused && !s.exporting) { drawGhost(octx, W, H, dpr, s); drawHandles(octx, W, H, dpr, s); }
      }
      if (f !== lastFrame) {
        lastFrame = f;
        stage.dataset.frame = String(f);
        for (const fn of frameListeners) fn(f);
      }
    }
    requestAnimationFrame(frame);
  }

  store.subscribe((s) => {
    stage.dataset.fps = String(s.fps);
    stage.dataset.frames = s.loaded ? String(clock.frameCount) : '';
    stage.dataset.ready = s.loaded && !s.busy ? '1' : '0';
  });

  app.layout();
  setHint(store.state);
  requestAnimationFrame(frame);
}
