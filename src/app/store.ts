// En enda store för appens tillstånd, med ångra/gör om för den del som är "dokumentet".

export interface SetOptions {
  /** Spara läget före ändringen så att den kan ångras. */
  undo?: boolean;
}

export class Store<T extends object> {
  private current: T;
  private readonly docKeys: ReadonlyArray<keyof T>;
  private past: Partial<T>[] = [];
  private future: Partial<T>[] = [];
  private listeners = new Set<(s: T) => void>();
  private readonly limit: number;

  /** docKeys är de fält som ångra/gör om omfattar. Värdena i dem ska behandlas som oföränderliga. */
  constructor(initial: T, docKeys: ReadonlyArray<keyof T>, limit = 200) {
    this.current = { ...initial };
    this.docKeys = docKeys;
    this.limit = limit;
  }

  get state(): Readonly<T> {
    return this.current;
  }

  subscribe(fn: (s: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<T>, opts: SetOptions = {}): void {
    if (opts.undo) {
      this.past.push(this.snapshot());
      if (this.past.length > this.limit) this.past.shift();
      this.future = [];
    }
    this.current = { ...this.current, ...patch };
    this.emit();
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  undo(): boolean {
    const prev = this.past.pop();
    if (!prev) return false;
    this.future.push(this.snapshot());
    this.current = { ...this.current, ...prev };
    this.emit();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.snapshot());
    this.current = { ...this.current, ...next };
    this.emit();
    return true;
  }

  /** Töm historiken, t.ex. när en ny video laddas. */
  clearHistory(): void {
    this.past = [];
    this.future = [];
  }

  private snapshot(): Partial<T> {
    const s: Partial<T> = {};
    for (const k of this.docKeys) s[k] = this.current[k];
    return s;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.current);
  }
}
