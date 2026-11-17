// Laddning av video, transportkontroller, stegen för linjen och exporten.
import { emptyFacit } from '../annotate/facit';
import { fetchSampleFacit, listSampleClips } from '../annotate/io';
import type { App } from '../app/context';
import { COLORS, type AppState } from '../app/state';
import { decodeAudio } from '../detect/decodeAudio';
import { detectImpact } from '../detect/impact';
import { createAnalysis } from '../detect/workerClient';
import { canRecord, recordVideo } from '../export/recorder';
import { saveViaArtifact, usesArtifactDownloads } from '../export/save';
import { drawTrace } from '../render/tracer';
import { frameAtTime } from '../video/fps';
import { measureFps } from '../video/frameClock';
import { videoFrameSource } from '../video/frameSource';
import { $, fmtFps, fmtTime } from './dom';

export function setupControls(app: App): void {
  const { store, video, clock } = app;
  const fileInfo = $('#fileInfo');
  app.setInfo = (text) => { fileInfo.textContent = text; };

  // ---------- Laddning ----------
  let fileLabel = '';
  let loadToken = 0;
  let objectUrl: string | null = null;
  function load(src: string, name: string, label: string, isObjectUrl: boolean): void {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = isObjectUrl ? src : null;
    fileLabel = label;
    store.set({ clipName: name });
    video.src = src;
    app.setInfo(label);
  }
  $<HTMLInputElement>('#file').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    load(URL.createObjectURL(f), f.name, f.name + ' · ' + (f.size / 1e6).toFixed(1) + ' MB', true);
  });

  // Testklipp från samples/ (finns bara mot dev-servern).
  const samplePick = $<HTMLSelectElement>('#samplePick');
  void listSampleClips().then((clips) => {
    if (!clips.length) return;
    samplePick.innerHTML = '<option value="">Testklipp från samples/…</option>' +
      clips.map((c) => `<option value="${c}">${c}</option>`).join('');
    samplePick.hidden = false;
  });
  samplePick.addEventListener('change', () => {
    if (samplePick.value) load('/samples/' + encodeURIComponent(samplePick.value), samplePick.value, samplePick.value, false);
  });

  video.addEventListener('loadedmetadata', async () => {
    const token = ++loadToken;
    clock.reset();
    store.clearHistory();
    store.set({
      loaded: true, busy: true, busyText: 'Läser av bildfrekvensen…', vw: video.videoWidth || 9, vh: video.videoHeight || 16,
      impact: null, impactSource: null, start: null, apex: null, end: null, mode: null,
      facit: null, facitDirty: false, landingMode: false, fpsMeasured: null,
    });
    $('#result').hidden = true;
    app.layout();

    // Läs av bildfrekvensen från videons egna tidsstämplar.
    const measured = await measureFps(video);
    if (token !== loadToken) return;
    const s = store.state;
    store.set({ fpsMeasured: measured, fps: s.fpsAuto ? measured ?? s.fps : s.fps });
    await clock.seekToFrame(0);
    if (token !== loadToken) return;

    const st = store.state;
    const facit = await fetchSampleFacit(st.clipName);
    if (token !== loadToken) return;
    store.set({
      busy: false,
      facit: facit ?? (st.annotating
        ? emptyFacit({ clip: st.clipName, width: st.vw, height: st.vh, fps: st.fps, frameCount: clock.frameCount })
        : null),
    });
    app.setInfo(
      fileLabel + ` · ${st.vw}×${st.vh} · ${fmtFps(st.fps)} fps · ${clock.frameCount} bilder` +
      (measured == null ? ' · bildfrekvensen gick inte att läsa av, välj den själv' : ''));
  });
  video.addEventListener('error', () => {
    app.setInfo('Videon gick inte att spela upp i den här webbläsaren. Prova Safari eller exportera den som H.264 (Mest kompatibel).');
  });

  const fpsSel = $<HTMLSelectElement>('#fps');
  fpsSel.addEventListener('change', () => {
    const s = store.state;
    if (fpsSel.value === 'auto') store.set({ fpsAuto: true, fps: s.fpsMeasured ?? s.fps });
    else store.set({ fpsAuto: false, fps: +fpsSel.value });
    if (s.loaded && !s.busy) void clock.seekToFrame(frameAtTime(video.currentTime, store.state.fps));
  });

  // ---------- Transport ----------
  let scrubbing = false;
  const scrub = $<HTMLInputElement>('#scrub');
  const btnPlay = $('#btnPlay');
  const toggle = () => { if (video.paused) void video.play(); else video.pause(); };
  btnPlay.addEventListener('click', toggle);
  // När uppspelningen pausas: lägg spelhuvudet mitt i den visade rutan, så att stegningen är bildexakt.
  video.addEventListener('pause', () => {
    const s = store.state;
    if (s.loaded && !s.busy && !s.exporting && !video.ended) void clock.seekToFrame(frameAtTime(video.currentTime, s.fps));
  });
  $('#btnBack').addEventListener('click', () => void clock.step(-1));
  $('#btnFwd').addEventListener('click', () => void clock.step(1));
  scrub.addEventListener('input', () => {
    scrubbing = true;
    video.pause();
    void clock.seekToFrame(Math.floor(+scrub.value * (clock.frameCount - 1) + 0.5));
  });
  scrub.addEventListener('change', () => { scrubbing = false; });
  $('#btnUndo').addEventListener('click', () => store.undo());
  $('#btnRedo').addEventListener('click', () => store.redo());
  document.addEventListener('keydown', (e) => {
    const s = store.state;
    const t = e.target as HTMLElement;
    if (!s.loaded || s.busy || s.exporting || t.matches('input[type=number], select')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) store.redo(); else store.undo();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') { void clock.step(e.shiftKey ? -10 : -1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { void clock.step(e.shiftKey ? 10 : 1); e.preventDefault(); }
    if (e.key === ' ' && t === document.body) { toggle(); e.preventDefault(); }
  });

  const timeEl = $('#time'), frameEl = $('#frameNo');
  function updateTime(): void {
    const d = video.duration || 0;
    timeEl.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(d);
    if (!scrubbing && d) scrub.value = String(clock.frame / Math.max(1, clock.frameCount - 1));
    btnPlay.textContent = video.paused ? '▶' : '❚❚';
  }
  (function tick() {
    if (store.state.loaded) updateTime();
    requestAnimationFrame(tick);
  })();
  app.onFrame((f) => { frameEl.textContent = `bild ${f}/${clock.frameCount - 1}`; });

  // ---------- Stegen ----------
  const flight = $<HTMLInputElement>('#flight');
  $('#btnImpact').addEventListener('click', () => {
    video.pause();
    // Träffen sätts till början av den visade bildrutan.
    store.set({ impact: clock.frameTime, impactSource: 'manuell', mode: 'start' }, { undo: true });
  });

  // ---------- Automatisk träff ----------
  // ?ljud=av i adressen stänger av ljudanalysen, för att kunna prova sökningen i enbart bilden.
  const useAudio = new URLSearchParams(location.search).get('ljud') !== 'av';
  const detectVal = $('#impactVal');
  $('#btnAuto').addEventListener('click', async () => {
    const before = clock.frame;
    const token = loadToken;
    video.pause();
    store.set({ busy: true, busyText: 'Letar efter träffen…', mode: null });
    const analysis = createAnalysis();
    const t0 = performance.now();
    let result = null;
    try {
      const audio = useAudio ? await decodeAudio(video) : null;
      result = await detectImpact(videoFrameSource(video, clock), audio, {
        analysis,
        onProgress: (_f, text) => { if (store.state.busyText !== text) store.set({ busyText: text }); },
      });
    } catch (err) {
      console.error(err);
    } finally {
      detectVal.dataset.worker = analysis.usesWorker ? 'ja' : 'nej';
      analysis.dispose();
    }
    if (token !== loadToken) return; // en ny video har laddats under tiden
    detectVal.dataset.ms = String(Math.round(performance.now() - t0));
    if (!result) {
      await clock.seekToFrame(before);
      store.set({ busy: false });
      detectVal.dataset.method = 'ingen';
      app.setInfo('Hittade ingen träff automatiskt. Stega fram till träffen och markera den själv.');
      return;
    }
    await clock.seekToFrame(result.impactFrame);
    detectVal.dataset.frame = String(result.impactFrame);
    detectVal.dataset.ballX = result.ballPx.x.toFixed(2);
    detectVal.dataset.ballY = result.ballPx.y.toFixed(2);
    detectVal.dataset.method = result.method;
    store.set({ busy: false, impact: result.impactTime, impactSource: result.method, start: result.ball }, { undo: true });
  });
  $('#btnLand').addEventListener('click', () => {
    video.pause();
    const s = store.state;
    const d = clock.frameTime - (s.impact ?? 0);
    store.set({ flight: d > 0.2 ? d : s.flight, mode: 'end' }, { undo: true });
  });
  flight.addEventListener('change', () => {
    const v = parseFloat(flight.value);
    if (isFinite(v) && v > 0.2) store.set({ flight: Math.min(30, v) }, { undo: true });
    else flight.value = store.state.flight.toFixed(1);
  });
  $('#btnApex').addEventListener('click', () => { video.pause(); store.set({ mode: 'apex' }); });
  $('#btnApexAuto').addEventListener('click', () => store.set({ apex: null }, { undo: true }));
  const apexFrac = $<HTMLInputElement>('#apexFrac');
  let sliding = false;
  apexFrac.addEventListener('input', () => {
    store.set({ apexFrac: +apexFrac.value / 100 }, { undo: !sliding });
    sliding = true;
  });
  apexFrac.addEventListener('change', () => { sliding = false; });
  const width = $<HTMLInputElement>('#width');
  width.addEventListener('input', () => { store.set({ width: +width.value }); $('#widthVal').textContent = width.value; });
  $<HTMLInputElement>('#glow').addEventListener('change', (e) => store.set({ glow: (e.target as HTMLInputElement).checked }));
  const sw = $('#swatches');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.setAttribute('aria-label', 'Färg ' + c);
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.addEventListener('click', () => {
      store.set({ color: c });
      sw.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    });
    sw.appendChild(b);
  });
  $('#btnPreview').addEventListener('click', () => {
    video.currentTime = Math.max(0, (store.state.impact ?? 0) - 0.6);
    void video.play();
  });

  // ---------- Export ----------
  let lastUrl: string | null = null, lastBlob: Blob | null = null, lastName = 'golf-tracer.mp4';
  const dl = $<HTMLAnchorElement>('#dl');
  dl.addEventListener('click', async (e) => {
    if (!usesArtifactDownloads() || !lastBlob) return; // vanlig webbläsare: länken laddar ner som vanligt
    e.preventDefault();
    try { await saveViaArtifact(lastName, lastBlob); }
    catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'declined') app.setInfo('Videon kunde inte sparas här (' + (code || 'fel') + ').');
    }
  });
  $('#btnExport').addEventListener('click', async () => {
    if (!canRecord()) {
      app.setInfo('Den här webbläsaren kan inte spela in video. Prova senaste Safari eller Chrome.');
      return;
    }
    const s = store.state;
    const prog = $<HTMLProgressElement>('#prog');
    store.set({ exporting: true, mode: null });
    prog.hidden = false; prog.value = 0;
    $('#result').hidden = true;
    try {
      const out = await recordVideo({
        video, vw: s.vw, vh: s.vh, fps: s.fps,
        withAudio: $<HTMLInputElement>('#withAudio').checked,
        holdEnd: $<HTMLInputElement>('#holdEnd').checked,
        traceEnd: (s.impact ?? 0) + s.flight + 0.8,
        drawOverlay: (ctx, W, H, t) => { const st = store.state; drawTrace(ctx, W, H, t, st, st); },
        onProgress: (v) => { prog.value = Math.min(1, v); },
      });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(out.blob);
      $<HTMLVideoElement>('#outVideo').src = lastUrl;
      lastBlob = out.blob; lastName = 'golf-tracer.' + out.ext;
      dl.href = lastUrl; dl.download = lastName;
      const res = $('#result');
      res.dataset.width = String(out.width); res.dataset.height = String(out.height); res.dataset.type = out.type;
      res.hidden = false;
    } finally {
      prog.hidden = true;
      store.set({ exporting: false });
    }
  });

  // ---------- Knapparnas tillstånd ----------
  const fmtImpact = (s: AppState) => s.impact == null
    ? 'Inte satt'
    : 'Träff vid ' + fmtTime(s.impact) + ' (bild ' + frameAtTime(s.impact, s.fps) + ')' +
      (s.impactSource === 'ljud+bild' ? ' · hittad med ljud och bild' : s.impactSource === 'bild' ? ' · hittad i bilden' : '') +
      (s.start ? '' : ' · peka på bollen');
  function updateUI(s: AppState): void {
    const L = s.loaded && !s.busy, off = !L || s.exporting;
    const ready = L && s.impact != null && !!s.start && !!s.end;
    for (const id of ['btnPlay', 'btnBack', 'btnFwd', 'scrub', 'btnImpact', 'btnAuto']) ($('#' + id) as HTMLButtonElement).disabled = off;
    $<HTMLButtonElement>('#btnLand').disabled = off || s.impact == null;
    $<HTMLButtonElement>('#btnApex').disabled = off || !s.start || !s.end;
    $<HTMLButtonElement>('#btnApexAuto').disabled = !s.apex || s.exporting;
    $<HTMLButtonElement>('#btnPreview').disabled = !ready || s.exporting;
    $<HTMLButtonElement>('#btnExport').disabled = !ready || s.exporting;
    $<HTMLButtonElement>('#btnUndo').disabled = off || !store.canUndo;
    $<HTMLButtonElement>('#btnRedo').disabled = off || !store.canRedo;
    $('#impactVal').textContent = fmtImpact(s);
    if (document.activeElement !== flight) flight.value = s.flight.toFixed(1);
    apexFrac.value = String(Math.round(s.apexFrac * 100));
    $('#apexFracVal').textContent = Math.round(s.apexFrac * 100) + ' %';
    fpsSel.options[0].textContent = s.fpsMeasured != null ? `Auto (${fmtFps(s.fpsMeasured)} fps)` : 'Auto';
    $('#step1').classList.toggle('done', s.loaded);
    $('#step2').classList.toggle('done', s.impact != null && !!s.start);
    $('#step3').classList.toggle('done', !!s.end);
    $('#step4').classList.toggle('done', !!(s.start && s.end));
    $('#step5').classList.toggle('done', !!ready);
  }
  store.subscribe(updateUI);
  updateUI(store.state);
}
