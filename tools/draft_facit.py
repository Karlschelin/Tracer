#!/usr/bin/env python3
"""Tar fram ett första utkast till facit för ett klipp i samples/.

Kräver ffmpeg/ffprobe och numpy. Används så här:

    python3 tools/draft_facit.py samples/IMG_0178.mov --ball 1004,2848

--ball är en ungefärlig pixelposition (i den roterade bilden) för bollen före
träffen. Skriptet
  1. mäter den vita fläcken vid den positionen bild för bild; träffbilden är den
     sista bilden där bollen ligger kvar,
  2. följer sedan bollen med trebildsdifferens (det som bara finns i aktuell
     bild) och en enkel prediktion från de två senaste punkterna.

Resultatet är ett UTKAST (status "utkast", source "auto") som ska granskas i
appens annoteringsläge. Bildindex är 0-baserat och koordinater är 0..1.
"""
import argparse, json, subprocess, sys
from pathlib import Path
import numpy as np


def probe(path):
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=width,height,r_frame_rate,nb_frames:stream_side_data=rotation', '-of', 'json', path])
    s = json.loads(out)['streams'][0]
    w, h = s['width'], s['height']
    rot = 0
    for sd in s.get('side_data_list', []):
        rot = int(sd.get('rotation', rot))
    if abs(rot) % 180 == 90:
        w, h = h, w
    num, den = map(int, s['r_frame_rate'].split('/'))
    return w, h, num / den, int(s['nb_frames'])


def frames(path, w, h):
    """Gråskalebilder i visningsordning (ffmpeg roterar automatiskt)."""
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = w * h
    try:
        while True:
            buf = p.stdout.read(n)
            if len(buf) < n:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, w)
    finally:
        p.kill()
        p.wait()


def blobs(mask, score, ox, oy):
    """Sammanhängande områden i en liten mask, med viktad tyngdpunkt."""
    out = []
    m = mask.copy()
    H, W = m.shape
    for y, x in zip(*np.nonzero(m)):
        if not m[y, x]:
            continue
        stack = [(y, x)]
        m[y, x] = False
        pts = []
        while stack:
            a, b = stack.pop()
            pts.append((a, b))
            for p in (a - 1, a, a + 1):
                for q in (b - 1, b, b + 1):
                    if 0 <= p < H and 0 <= q < W and m[p, q]:
                        m[p, q] = False
                        stack.append((p, q))
        P = np.array(pts)
        wgt = score[P[:, 0], P[:, 1]]
        out.append(dict(
            n=len(pts), s=float(wgt.sum()), pk=float(wgt.max()),
            x=float((P[:, 1] * wgt).sum() / wgt.sum()) + ox,
            y=float((P[:, 0] * wgt).sum() / wgt.sum()) + oy,
            w=int(np.ptp(P[:, 1]) + 1), h=int(np.ptp(P[:, 0]) + 1)))
    return out


def merge(cands, dist=25):
    """Slå ihop fläckar som ligger tätt (en suddig boll delas ibland i två)."""
    cands = sorted(cands, key=lambda c: -c['s'])
    out = []
    for c in cands:
        for o in out:
            if np.hypot(c['x'] - o['x'], c['y'] - o['y']) < dist:
                t = o['s'] + c['s']
                o['x'] = (o['x'] * o['s'] + c['x'] * c['s']) / t
                o['y'] = (o['y'] * o['s'] + c['y'] * c['s']) / t
                o['s'] = t; o['n'] += c['n']; o['pk'] = max(o['pk'], c['pk'])
                break
        else:
            out.append(dict(c))
    return out


def candidates(prev, cur, nxt, x0, y0, x1, y1, thr):
    H, W = cur.shape
    x0, y0, x1, y1 = max(0, int(x0)), max(0, int(y0)), min(W, int(x1)), min(H, int(y1))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return []
    c = cur[y0:y1, x0:x1].astype(np.float32)
    d = np.minimum(np.abs(c - prev[y0:y1, x0:x1]), np.abs(c - nxt[y0:y1, x0:x1]))
    return merge([b for b in blobs(d > thr, d, x0, y0) if b['n'] >= 3])


def calm(img, x, y, r=28):
    """Sant om omgivningen är jämn (himmel). När bollen är långsam och liten litar vi inte på fläckar mot spelaren eller bagen."""
    x, y = int(round(x)), int(round(y))
    win = img[max(0, y - r):y + r, max(0, x - r):x + r].astype(np.float32)
    if win.size == 0:
        return False
    # Skillnaden mellan 10:e och 90:e percentilen påverkas inte av själva bollen.
    return float(np.percentile(win, 90) - np.percentile(win, 10)) < 14


def local_blob(img, x, y, r=7):
    """Sök en svag fläck (mörkare eller ljusare än omgivningen) nära (x, y). Ger (cx, cy) eller None."""
    xi, yi = int(round(x)), int(round(y))
    R = r + 8
    if yi - R < 0 or xi - R < 0 or yi + R >= img.shape[0] or xi + R >= img.shape[1]:
        return None
    win = img[yi - R:yi + R + 1, xi - R:xi + R + 1].astype(np.float32)
    dev = np.abs(win - np.median(win))
    inner = dev[8:-8, 8:-8]
    pk = float(inner.max())
    noise = float(np.percentile(dev, 80))
    if pk < 6 or pk < 3.5 * max(noise, 1.0):
        return None
    ys, xs = np.nonzero(inner >= 0.5 * pk)
    wgt = inner[ys, xs]
    return (float((xs * wgt).sum() / wgt.sum()) + xi - r, float((ys * wgt).sum() / wgt.sum()) + yi - r)


def rest_blob(img, bx, by, r=45):
    """Den vita bollen på mattan: (antal pixlar, cx, cy) inom en ruta kring gissningen."""
    H, W = img.shape
    y0, x0 = max(0, by - r), max(0, bx - r)
    win = img[y0:min(H, by + r), x0:min(W, bx + r)].astype(np.float32)
    thr = np.median(win) + 45
    ys, xs = np.nonzero(win > thr)
    if len(xs) < 20:
        return 0, None, None
    return len(xs), float(xs.mean()) + x0, float(ys.mean()) + y0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clip')
    ap.add_argument('--ball', required=True, help='ungefärlig bollposition före träff, "x,y" i pixlar')
    ap.add_argument('--thr', type=float, default=12, help='tröskel för bildskillnad (0-255)')
    ap.add_argument('--out', help='utfil (standard: klippnamn.json bredvid klippet)')
    a = ap.parse_args()
    bx, by = map(int, a.ball.split(','))
    w, h, fps, nb = probe(a.clip)

    # Pass 1: bollen i vila, bild för bild. Spara också en liten ruta kring gissningen.
    rest, tiles = [], []
    for img in frames(a.clip, w, h):
        rest.append(rest_blob(img, bx, by))
        tiles.append(img[by - 60:by + 60, bx - 60:bx + 60].copy())
    n_frames = len(rest)
    # Bollen försvinner vid träffen: första bilden där fläcken är borta i minst fem bilder i rad.
    cnt = np.array([r[0] for r in rest], float)
    base = float(np.median(cnt[cnt > 0]))
    gone = cnt < 0.3 * base
    drop = next((i for i in range(1, n_frames - 5) if gone[i:i + 5].all() and not gone[:i].all()), n_frames)
    # Referensen tas från bilderna strax före, då klubban inte ligger bredvid bollen som vid uppställningen.
    ref = [r for r in rest[max(0, drop - 12):max(1, drop - 2)] if r[0]]
    n0 = float(np.median([r[0] for r in ref]))
    cx0 = float(np.median([r[1] for r in ref]))
    cy0 = float(np.median([r[2] for r in ref]))
    # Bollen "ligger kvar" om en liten ruta mitt på bollen fortfarande är ljus. Det tål att
    # klubban ligger intill bollen (uppställning och bilden precis vid träffen).
    q = max(4, int(0.25 * np.sqrt(n0)))
    tx, ty = int(round(cx0)) - bx + 60, int(round(cy0)) - by + 60
    core = np.array([t[ty - q:ty + q + 1, tx - q:tx + q + 1].mean() for t in tiles])
    bright = float(np.median(core[max(0, drop - 12):max(1, drop - 2)]))
    dark = float(np.median(core[drop:drop + 5])) if drop < n_frames else bright - 60
    still = core > dark + 0.7 * (bright - dark)
    impact = max(i for i in range(drop + 1) if still[i])
    for i in range(impact + 1):
        if still[i]:
            rest[i] = (rest[i][0], cx0, cy0)
    print(f'{Path(a.clip).name}: {w}x{h}, {fps:g} fps, {n_frames} bilder. Boll i vila ({cx0:.1f}, {cy0:.1f}), '
          f'{int(n0)} px. Träffbild {impact}.', file=sys.stderr)

    ball = [dict(frame=i, x=rest[i][1], y=rest[i][2]) for i in range(impact + 1) if still[i]]

    # Pass 2: följ bollen efter träffen.
    track = [(impact, cx0, cy0)]
    lost = 0
    buf = []
    for i, img in enumerate(frames(a.clip, w, h)):
        buf.append(img)
        if len(buf) > 3:
            buf.pop(0)
        k = i - 1  # bilden i mitten av fönstret
        if len(buf) < 3 or k <= impact:
            continue
        prev, cur, nxt = buf
        pf, px, py = track[-1]
        pick = None
        if len(track) < 3:
            # Ingen hastighet än: leta rakt uppåt från förra punkten.
            cs = candidates(prev, cur, nxt, px - 500, 0, px + 500, py - 40, a.thr)
            dy1 = (track[-2][2] - py) if len(track) == 2 else None
            ok = []
            for c in cs:
                dy = py - c['y']
                if c['pk'] < 35 or c['w'] > 70 or c['h'] > 70 or dy < 40:
                    continue
                if abs(c['x'] - px) > 0.2 * dy + 15:
                    continue
                if dy1 and not (0.4 * dy1 <= dy <= 3.5 * dy1):
                    continue
                ok.append(c)
            if ok:
                pick = max(ok, key=lambda c: c['s'])
        else:
            qf, qx, qy = track[-2]
            vx, vy = (px - qx) / (pf - qf), (py - qy) / (pf - qf)
            dt = k - pf
            # Stegen krymper med avståndet (perspektiv), ungefär 20 % per bild i början.
            g = 0.8 if np.hypot(vx, vy) > 12 else 1.0
            ex, ey = px + vx * g * dt, py + vy * g * dt
            gate = max(9.0, 0.35 * np.hypot(vx, vy)) * (1 + 0.5 * (dt - 1))
            cs = candidates(prev, cur, nxt, ex - gate - 20, ey - gate - 20, ex + gate + 20, ey + gate + 20, a.thr)
            ok = [c for c in cs if np.hypot(c['x'] - ex, c['y'] - ey) <= gate and c['pk'] >= 30 and c['n'] <= 1500
                  and (np.hypot(vx, vy) > 40 or calm(cur, c['x'], c['y']))]
            if ok:
                pick = min(ok, key=lambda c: np.hypot(c['x'] - ex, c['y'] - ey))
        if pick:
            track.append((k, pick['x'], pick['y']))
            ball.append(dict(frame=k, x=pick['x'], y=pick['y']))
            lost = 0
        else:
            lost += 1
            if lost > 6:
                break

    # Pass 3: fyll luckor i banan. Bollen syns ofta svagt även där bildskillnaden inte räckte.
    have = {b['frame']: b for b in ball}
    flight = sorted(f for f in have if f > impact)
    want = {}
    for f0, f1 in zip(flight, flight[1:]):
        for f in range(f0 + 1, f1):
            t = (f - f0) / (f1 - f0)
            want[f] = (have[f0]['x'] * (1 - t) + have[f1]['x'] * t, have[f0]['y'] * (1 - t) + have[f1]['y'] * t)
    if want:
        last = max(want)
        for i, img in enumerate(frames(a.clip, w, h)):
            if i in want and calm(img, *want[i]):
                hit = local_blob(img, *want[i])
                if hit:
                    ball.append(dict(frame=i, x=hit[0], y=hit[1]))
            if i >= last:
                break
        ball.sort(key=lambda b: b['frame'])

    out = dict(
        version=1, clip=Path(a.clip).name, width=w, height=h, fps=round(fps, 3), frameCount=n_frames,
        status='utkast', impactFrame=impact,
        ball=[dict(frame=b['frame'], x=round(b['x'] / w, 5), y=round(b['y'] / h, 5), source='auto') for b in ball],
        landing=None,
        notes='Automatiskt utkast från tools/draft_facit.py. Granska i annoteringsläget.')
    dst = a.out or str(Path(a.clip).with_suffix('.json'))
    Path(dst).write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    fl = [b['frame'] for b in ball if b['frame'] > impact]
    print(f'{len(ball)} punkter, varav {len(fl)} efter träffen (bild {fl[0] if fl else "-"}–{fl[-1] if fl else "-"}). '
          f'Skrev {dst}', file=sys.stderr)


if __name__ == '__main__':
    main()
