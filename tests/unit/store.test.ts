import { describe, expect, it } from 'vitest';
import { Store } from '../../src/app/store';

interface S { a: number; b: string; ui: boolean }
const make = () => new Store<S>({ a: 1, b: 'x', ui: false }, ['a', 'b']);

describe('store', () => {
  it('meddelar prenumeranter', () => {
    const s = make();
    const seen: number[] = [];
    const off = s.subscribe((st) => seen.push(st.a));
    s.set({ a: 2 });
    off();
    s.set({ a: 3 });
    expect(seen).toEqual([2]);
  });

  it('ångrar och gör om dokumentfälten men rör inte övrigt tillstånd', () => {
    const s = make();
    s.set({ a: 2 }, { undo: true });
    s.set({ b: 'y', ui: true }, { undo: true });
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.state).toEqual({ a: 2, b: 'x', ui: true });
    s.undo();
    expect(s.state.a).toBe(1);
    expect(s.undo()).toBe(false);
    s.redo(); s.redo();
    expect(s.state).toEqual({ a: 2, b: 'y', ui: true });
    expect(s.canRedo).toBe(false);
  });

  it('en ny ändring tömmer gör om-listan', () => {
    const s = make();
    s.set({ a: 2 }, { undo: true });
    s.undo();
    s.set({ a: 5 }, { undo: true });
    expect(s.canRedo).toBe(false);
    s.clearHistory();
    expect(s.canUndo).toBe(false);
  });
});
