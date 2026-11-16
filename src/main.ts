// Golf Tracer – startpunkt. Kopplar ihop store, video och gränssnittets delar.
import type { App } from './app/context';
import { createStore } from './app/state';
import { setupAnnotatePanel } from './ui/annotatePanel';
import { setupControls } from './ui/controls';
import { $ } from './ui/dom';
import { setupStage } from './ui/stage';
import { FrameClock } from './video/frameClock';

const store = createStore();
const video = $<HTMLVideoElement>('#video');
const clock = new FrameClock(video);
// Bildklockan ska alltid ha samma bildfrekvens som tillståndet. Måste ligga först bland prenumeranterna.
store.subscribe((s) => { clock.fps = s.fps; });

const frameListeners: Array<(frame: number) => void> = [];
const app: App = {
  store, video, clock,
  setInfo: () => {},
  layout: () => {},
  onFrame: (fn) => { frameListeners.push(fn); },
};

setupControls(app);
setupAnnotatePanel(app);
setupStage(app, frameListeners);
// Skicka ut starttillståndet så att alla delar ritar upp sig.
store.set({});
