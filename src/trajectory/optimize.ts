// Nelder–Mead: minimerar en funktion av några få variabler utan derivator. Ren funktion.

export interface MinimizeResult {
  x: number[];
  value: number;
}

export function nelderMead(f: (x: number[]) => number, x0: number[], step: number[], maxIter = 600, tol = 1e-9): MinimizeResult {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; simplex.push(p); }
  let values = simplex.map(f);
  const order = () => {
    const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = idx.map((i) => simplex[i]); values = idx.map((i) => values[i]);
  };
  const along = (c: number[], p: number[], t: number) => c.map((v, i) => v + t * (p[i] - v));
  for (let iter = 0; iter < maxIter; iter++) {
    order();
    if (Math.abs(values[n] - values[0]) <= tol * (Math.abs(values[0]) + tol)) break;
    const c = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const xr = along(c, worst, -1), fr = f(xr);
    if (fr < values[0]) {
      const xe = along(c, worst, -2), fe = f(xe);
      if (fe < fr) { simplex[n] = xe; values[n] = fe; } else { simplex[n] = xr; values[n] = fr; }
    } else if (fr < values[n - 1]) {
      simplex[n] = xr; values[n] = fr;
    } else {
      const xc = fr < values[n] ? along(c, worst, -0.5) : along(c, worst, 0.5), fc = f(xc);
      if (fc < Math.min(fr, values[n])) { simplex[n] = xc; values[n] = fc; } else {
        for (let i = 1; i <= n; i++) { simplex[i] = along(simplex[0], simplex[i], 0.5); values[i] = f(simplex[i]); }
      }
    }
  }
  order();
  return { x: simplex[0], value: values[0] };
}
