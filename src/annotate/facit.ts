// Facit-formatet för samples/*.json och rena funktioner för att ändra det.
//
// Bildindex är 0-baserat: bild n visas under tiden [n/fps, (n+1)/fps).
// Koordinater är normaliserade (0..1) i den visade (roterade) bilden, x åt höger och y nedåt.
import type { Point } from '../trajectory/model';

export const FACIT_VERSION = 1;

export type FacitStatus = 'utkast' | 'granskad';
/** auto = framtagen med bildanalys, manuell = satt eller rättad för hand. */
export type BallSource = 'auto' | 'manuell';

export interface BallPoint {
  frame: number;
  x: number;
  y: number;
  source: BallSource;
}

export interface Landing {
  frame: number;
  x: number;
  y: number;
}

export interface Facit {
  version: number;
  /** Klippets filnamn, t.ex. "IMG_0178.mov". */
  clip: string;
  /** Bildens storlek i pixlar efter rotation. */
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  status: FacitStatus;
  /** Sista bilden där bollen ligger still. Träffen sker mellan den här bilden och nästa. */
  impactFrame: number | null;
  /** Bollens mittpunkt i de bilder där den syns, sorterat på bild. Högst en punkt per bild. */
  ball: BallPoint[];
  /** Bilden och punkten där bollen landar, eller null om landningen inte syns i klippet. */
  landing: Landing | null;
  notes: string;
}

export function emptyFacit(meta: Pick<Facit, 'clip' | 'width' | 'height' | 'fps' | 'frameCount'>): Facit {
  return { version: FACIT_VERSION, ...meta, status: 'utkast', impactFrame: null, ball: [], landing: null, notes: '' };
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function ballAt(f: Facit, frame: number): BallPoint | null {
  return f.ball.find((b) => b.frame === frame) ?? null;
}

/** Sätter (eller ersätter) bollens position i en bild. */
export function setBall(f: Facit, frame: number, p: Point, source: BallSource = 'manuell'): Facit {
  const point: BallPoint = { frame, x: round5(clamp01(p.x)), y: round5(clamp01(p.y)), source };
  const ball = f.ball.filter((b) => b.frame !== frame);
  ball.push(point);
  ball.sort((a, b) => a.frame - b.frame);
  return { ...f, ball };
}

export function removeBall(f: Facit, frame: number): Facit {
  return { ...f, ball: f.ball.filter((b) => b.frame !== frame) };
}

export function setImpactFrame(f: Facit, frame: number | null): Facit {
  return { ...f, impactFrame: frame };
}

export function setLanding(f: Facit, landing: Landing | null): Facit {
  return {
    ...f,
    landing: landing && { frame: landing.frame, x: round5(clamp01(landing.x)), y: round5(clamp01(landing.y)) },
  };
}

export function setStatus(f: Facit, status: FacitStatus): Facit {
  return { ...f, status };
}

/**
 * Nästa bild efter (dir = 1) eller före (dir = -1) `from` som saknar bollpunkt.
 * Letar bara i flygningen: efter träffbilden och fram till sista punkten (eller landningen).
 */
export function nextGap(f: Facit, from: number, dir: 1 | -1): number | null {
  if (!f.ball.length) return null;
  const first = (f.impactFrame ?? f.ball[0].frame - 1) + 1;
  const last = Math.max(f.ball[f.ball.length - 1].frame, f.landing?.frame ?? 0);
  const have = new Set(f.ball.map((b) => b.frame));
  for (let i = from + dir; i >= first && i <= last; i += dir) if (!have.has(i)) return i;
  return null;
}

export function facitFileName(clip: string): string {
  return clip.replace(/\.[^.]+$/, '') + '.json';
}

export interface FacitSummary {
  total: number;
  beforeImpact: number;
  inFlight: number;
  manual: number;
  firstFlight: number | null;
  lastFlight: number | null;
}

export function summarize(f: Facit): FacitSummary {
  const imp = f.impactFrame ?? -1;
  const flight = f.ball.filter((b) => b.frame > imp);
  return {
    total: f.ball.length,
    beforeImpact: f.ball.length - flight.length,
    inFlight: flight.length,
    manual: f.ball.filter((b) => b.source === 'manuell').length,
    firstFlight: flight.length ? flight[0].frame : null,
    lastFlight: flight.length ? flight[flight.length - 1].frame : null,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const in01 = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1;

/** Kontrollerar ett inläst facit. Kastar ett fel med förklaring på svenska om något är fel. */
export function parseFacit(data: unknown): Facit {
  const fail = (msg: string): never => { throw new Error('Ogiltigt facit: ' + msg); };
  if (!data || typeof data !== 'object') fail('filen innehåller inget objekt');
  const d = data as Record<string, unknown>;
  if (d.version !== FACIT_VERSION) fail(`okänd version (${String(d.version)})`);
  if (typeof d.clip !== 'string' || !d.clip) fail('clip saknas');
  for (const k of ['width', 'height', 'frameCount'] as const) {
    if (!isInt(d[k]) || (d[k] as number) <= 0) fail(`${k} ska vara ett positivt heltal`);
  }
  if (!isNum(d.fps) || d.fps <= 0) fail('fps ska vara ett positivt tal');
  if (d.status !== 'utkast' && d.status !== 'granskad') fail('status ska vara "utkast" eller "granskad"');
  const frameCount = d.frameCount as number;
  const frameOk = (v: unknown): v is number => isInt(v) && v >= 0 && v < frameCount;
  if (d.impactFrame !== null && !frameOk(d.impactFrame)) fail('impactFrame ligger utanför klippet');
  if (!Array.isArray(d.ball)) fail('ball ska vara en lista');
  let prev = -1;
  const ball: BallPoint[] = (d.ball as unknown[]).map((raw, i) => {
    const b = (raw ?? {}) as Record<string, unknown>;
    if (!frameOk(b.frame)) fail(`ball[${i}].frame ligger utanför klippet`);
    if ((b.frame as number) <= prev) fail(`ball[${i}] är inte sorterad eller är en dubblett`);
    prev = b.frame as number;
    if (!in01(b.x) || !in01(b.y)) fail(`ball[${i}] har koordinater utanför 0..1`);
    if (b.source !== 'auto' && b.source !== 'manuell') fail(`ball[${i}].source ska vara "auto" eller "manuell"`);
    return { frame: b.frame as number, x: b.x as number, y: b.y as number, source: b.source as BallSource };
  });
  let landing: Landing | null = null;
  if (d.landing != null) {
    const l = d.landing as Record<string, unknown>;
    if (!frameOk(l.frame) || !in01(l.x) || !in01(l.y)) fail('landing är ogiltig');
    landing = { frame: l.frame as number, x: l.x as number, y: l.y as number };
  }
  return {
    version: FACIT_VERSION, clip: d.clip as string,
    width: d.width as number, height: d.height as number, fps: d.fps as number, frameCount,
    status: d.status as FacitStatus, impactFrame: d.impactFrame as number | null,
    ball, landing, notes: typeof d.notes === 'string' ? d.notes : '',
  };
}

export function serializeFacit(f: Facit): string {
  return JSON.stringify(f, null, 1) + '\n';
}
