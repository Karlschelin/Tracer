// Det som appens delar delar på: store, video, bildklocka och ritytan över videon.
import type { FrameClock } from '../video/frameClock';
import type { AppStore } from './state';

export interface App {
  store: AppStore;
  video: HTMLVideoElement;
  clock: FrameClock;
  /** Visar ett meddelande under filväljaren (steg 1). */
  setInfo(text: string): void;
  /** Räknar om scenens storlek efter videons format. */
  layout(): void;
  /** Anropas när den visade bildrutan ändras. */
  onFrame(fn: (frame: number) => void): void;
}
