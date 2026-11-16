// Läsa och spara facit. Mot dev-servern skrivs filen direkt till samples/, annars laddas den ner.
import { downloadBlob } from '../export/save';
import { facitFileName, parseFacit, serializeFacit, type Facit } from './facit';

/** Klipp som dev-servern hittar i samples/. Tom lista utanför dev-läget. */
export async function listSampleClips(): Promise<string[]> {
  if (!import.meta.env.DEV) return [];
  try {
    const r = await fetch('/__samples');
    return r.ok ? ((await r.json()) as string[]) : [];
  } catch { return []; }
}

/** Hämtar samples/<klipp>.json från dev-servern om den finns. */
export async function fetchSampleFacit(clip: string): Promise<Facit | null> {
  if (!import.meta.env.DEV || !clip) return null;
  try {
    const r = await fetch('/__facit/' + encodeURIComponent(facitFileName(clip)));
    if (!r.ok) return null;
    return parseFacit(await r.json());
  } catch { return null; }
}

export async function readFacitFile(file: File): Promise<Facit> {
  let data: unknown;
  try { data = JSON.parse(await file.text()); }
  catch { throw new Error('Filen är inte giltig JSON.'); }
  return parseFacit(data);
}

export type SaveResult = { where: 'samples' | 'download'; name: string };

export async function saveFacit(f: Facit): Promise<SaveResult> {
  const name = facitFileName(f.clip);
  const text = serializeFacit(parseFacit(f));
  if (import.meta.env.DEV) {
    const r = await fetch('/__facit/' + encodeURIComponent(name), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text,
    });
    if (r.ok) return { where: 'samples', name };
  }
  await downloadBlob(name, new Blob([text], { type: 'application/json' }));
  return { where: 'download', name };
}
