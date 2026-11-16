// Spara en fil hos användaren. I en claude.ai-artifact måste det gå via downloads-förmågan.

interface ClaudeDownloads {
  save(o: { filename: string; data: Blob }): Promise<unknown>;
}
interface ClaudeGlobal {
  use?: (name: string) => Promise<ClaudeDownloads>;
}

let downloads: ClaudeDownloads | null = null;
const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
if (claude && claude.use) {
  claude.use('downloads').then((d) => { downloads = d; }).catch(() => {});
}

/** Sant när filer måste sparas via artifact-förmågan i stället för en vanlig nedladdningslänk. */
export function usesArtifactDownloads(): boolean {
  return downloads != null;
}

/** Sparar via artifact-förmågan. Kastar ett fel med .code om det misslyckas. */
export async function saveViaArtifact(filename: string, data: Blob): Promise<void> {
  if (!downloads) throw new Error('downloads saknas');
  await downloads.save({ filename, data });
}

/** Laddar ner en fil: via artifact-förmågan om den finns, annars med en tillfällig länk. */
export async function downloadBlob(filename: string, data: Blob): Promise<void> {
  if (downloads) { await downloads.save({ filename, data }); return; }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
