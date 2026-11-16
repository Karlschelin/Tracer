// Annoteringsläget: panelen där man stegar, sätter träff och landning och sparar facit.
import {
  ballAt, emptyFacit, nextGap, removeBall, setImpactFrame, setLanding, setStatus, summarize,
  type Facit, type FacitStatus,
} from '../annotate/facit';
import { readFacitFile, saveFacit } from '../annotate/io';
import type { App } from '../app/context';
import type { AppState } from '../app/state';
import { $ } from './dom';

export function setupAnnotatePanel(app: App): void {
  const { store, video, clock } = app;
  const btnAnnot = $<HTMLButtonElement>('#btnAnnot');
  const msg = $('#annMsg');
  const say = (text: string, kind: '' | 'ok' | 'err' = '') => {
    msg.textContent = text;
    msg.className = 'muted' + (kind ? ' msg-' + kind : '');
  };

  const blank = (s: AppState): Facit =>
    emptyFacit({ clip: s.clipName, width: s.vw, height: s.vh, fps: s.fps, frameCount: clock.frameCount });
  /** Ändra facit med en ren funktion. Ändringen går att ångra. */
  const edit = (fn: (f: Facit) => Facit, extra: Partial<AppState> = {}) => {
    const s = store.state;
    store.set({ facit: fn(s.facit ?? blank(s)), facitDirty: true, ...extra }, { undo: true });
  };

  btnAnnot.addEventListener('click', () => {
    const s = store.state;
    const on = !s.annotating;
    video.pause();
    store.set({
      annotating: on, mode: null, landingMode: false,
      facit: on && s.loaded && !s.busy && !s.facit ? blank(s) : s.facit,
    });
  });

  $('#annImpact').addEventListener('click', () => edit((f) => setImpactFrame(f, clock.frame)));
  $('#annGoImpact').addEventListener('click', () => {
    const f = store.state.facit;
    if (f?.impactFrame != null) { video.pause(); void clock.seekToFrame(f.impactFrame); }
  });
  $('#annLanding').addEventListener('click', () => { video.pause(); store.set({ landingMode: !store.state.landingMode }); });
  $('#annLandingClear').addEventListener('click', () => edit((f) => setLanding(f, null), { landingMode: false }));
  $('#annRemove').addEventListener('click', () => edit((f) => removeBall(f, clock.frame)));
  $<HTMLInputElement>('#annAuto').addEventListener('change', (e) => store.set({ autoAdvance: (e.target as HTMLInputElement).checked }));
  const gap = (dir: 1 | -1) => {
    const f = store.state.facit;
    const n = f && nextGap(f, clock.frame, dir);
    if (n != null) { video.pause(); void clock.seekToFrame(n); }
    else say(dir > 0 ? 'Ingen lucka längre fram i banan.' : 'Ingen lucka längre bak i banan.');
  };
  $('#annPrevGap').addEventListener('click', () => gap(-1));
  $('#annNextGap').addEventListener('click', () => gap(1));
  const status = $<HTMLSelectElement>('#annStatus');
  status.addEventListener('change', () => edit((f) => setStatus(f, status.value as FacitStatus)));

  $('#annSave').addEventListener('click', async () => {
    const f = store.state.facit;
    if (!f) return;
    try {
      const r = await saveFacit(f);
      store.set({ facitDirty: false });
      say(r.where === 'samples' ? `Sparat i samples/${r.name}.` : `${r.name} har laddats ner. Lägg filen i samples/.`, 'ok');
    } catch (err) {
      say('Facit kunde inte sparas: ' + (err as Error).message, 'err');
    }
  });
  const file = $<HTMLInputElement>('#annFile');
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const facit = await readFacitFile(f);
      const s = store.state;
      store.set({ facit, facitDirty: false }, { undo: true });
      const differs = s.loaded && (facit.frameCount !== clock.frameCount || facit.width !== s.vw || facit.height !== s.vh);
      say(differs
        ? `Läste in ${f.name}, men den verkar höra till ett annat klipp (${facit.clip}, ${facit.frameCount} bilder).`
        : `Läste in ${f.name}.`, differs ? 'err' : 'ok');
    } catch (err) {
      say((err as Error).message, 'err');
    }
  });

  document.addEventListener('keydown', (e) => {
    const s = store.state;
    if (!s.annotating || !s.loaded || s.busy) return;
    if ((e.target as HTMLElement).matches('input, select')) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (s.facit && ballAt(s.facit, clock.frame)) edit((f) => removeBall(f, clock.frame));
      e.preventDefault();
    }
  });
  window.addEventListener('beforeunload', (e) => { if (store.state.facitDirty) e.preventDefault(); });

  function update(): void {
    const s = store.state;
    const f = s.facit, frame = clock.frame;
    const on = s.loaded && !s.busy && s.annotating;
    document.body.classList.toggle('annot', s.annotating);
    btnAnnot.setAttribute('aria-pressed', String(s.annotating));
    btnAnnot.textContent = s.annotating ? 'Tillbaka till linjen' : 'Annotera';
    const cur = f && ballAt(f, frame);
    $('#annFrame').textContent = !s.loaded
      ? 'Välj en video för att börja'
      : `Bild ${frame} av ${clock.frameCount - 1} · ` + (cur ? (cur.source === 'manuell' ? 'punkt satt för hand' : 'automatisk punkt') : 'ingen punkt');
    $<HTMLButtonElement>('#annRemove').disabled = !on || !cur;
    $<HTMLButtonElement>('#annPrevGap').disabled = !on || !f?.ball.length;
    $<HTMLButtonElement>('#annNextGap').disabled = !on || !f?.ball.length;
    $<HTMLButtonElement>('#annImpact').disabled = !on;
    $<HTMLButtonElement>('#annGoImpact').disabled = !on || f?.impactFrame == null;
    const land = $<HTMLButtonElement>('#annLanding');
    land.disabled = !on;
    land.setAttribute('aria-pressed', String(s.landingMode));
    $<HTMLButtonElement>('#annLandingClear').disabled = !on || !f?.landing;
    $('#annImpactVal').textContent = f?.impactFrame != null ? `Träffbild: ${f.impactFrame}` : 'Träffbild: inte satt';
    $('#annLandingVal').textContent = f?.landing ? `Landning: bild ${f.landing.frame}` : 'Landning: inte satt';
    status.disabled = !on;
    if (f) status.value = f.status;
    if (f) {
      const m = summarize(f);
      $('#annCount').textContent = m.total
        ? `${m.total} punkter · ${m.inFlight} efter träffen` +
          (m.firstFlight != null ? ` (bild ${m.firstFlight}–${m.lastFlight})` : '') +
          ` · ${m.manual} satta för hand` + (s.facitDirty ? ' · ej sparat' : '')
        : 'Inga punkter' + (s.facitDirty ? ' · ej sparat' : '');
    } else {
      $('#annCount').textContent = 'Inga punkter';
    }
    $<HTMLButtonElement>('#annSave').disabled = !on || !f;
  }
  store.subscribe(update);
  app.onFrame(update);
  update();
}
