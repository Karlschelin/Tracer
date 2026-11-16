// Appens tillstånd. Alla punkter är normaliserade (0..1) relativt videobilden.
import type { Facit } from '../annotate/facit';
import type { HandleKey } from '../render/overlay';
import type { Point } from '../trajectory/model';
import { Store } from './store';

export const COLORS = ['#ff3b30', '#ffd60a', '#ffffff', '#30d158', '#0a84ff', '#ff2d92'];

export interface AppState {
  loaded: boolean;
  /** Sant medan videon förbereds (bildfrekvensen mäts). */
  busy: boolean;
  clipName: string;
  vw: number;
  vh: number;
  fps: number;
  /** Sant när bildfrekvensen läses av automatiskt, falskt när användaren valt den själv. */
  fpsAuto: boolean;
  /** Uppmätt bildfrekvens, eller null om den inte gick att mäta. */
  fpsMeasured: number | null;

  // Slaget (omfattas av ångra/gör om)
  impact: number | null;
  flight: number;
  start: Point | null;
  apex: Point | null;
  end: Point | null;
  apexFrac: number;

  // Utseende
  color: string;
  width: number;
  glow: boolean;

  /** Vilken punkt nästa tryck på videon placerar. */
  mode: HandleKey | null;
  exporting: boolean;

  // Annotering
  annotating: boolean;
  /** Sant när nästa tryck sätter landningspunkten i stället för bollen. */
  landingMode: boolean;
  autoAdvance: boolean;
  facit: Facit | null;
  facitDirty: boolean;
}

export const initialState: AppState = {
  loaded: false, busy: false, clipName: '', vw: 9, vh: 16,
  fps: 30, fpsAuto: true, fpsMeasured: null,
  impact: null, flight: 4, start: null, apex: null, end: null, apexFrac: 0.5,
  color: COLORS[0], width: 6, glow: true,
  mode: null, exporting: false,
  annotating: false, landingMode: false, autoAdvance: true, facit: null, facitDirty: false,
};

export const DOC_KEYS: ReadonlyArray<keyof AppState> = [
  'impact', 'flight', 'start', 'apex', 'end', 'apexFrac', 'facit', 'facitDirty',
];

export type AppStore = Store<AppState>;
export const createStore = (): AppStore => new Store<AppState>(initialState, DOC_KEYS);
