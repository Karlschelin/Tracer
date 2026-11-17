// Gemensamma typer för detekteringen. Inga DOM-beroenden.

/** En bild som RGBA-byte, rad för rad (samma layout som ImageData). */
export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Källa för bildrutor: videon i webbläsaren, eller ffmpeg i testerna. */
export interface FrameSource {
  /** Bildens storlek i pixlar (efter rotation). */
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  /** Hela bildruta n, nedskalad så att längsta sidan är högst maxSide. */
  grab(frame: number, maxSide: number): Promise<Frame>;
  /** Ett utsnitt ur bildruta n i full upplösning. Utsnittet ligger alltid inom bilden. */
  crop(frame: number, x: number, y: number, w: number, h: number): Promise<Frame>;
}

/** Ljudspåret som mono. */
export interface AudioTrack {
  samples: Float32Array;
  sampleRate: number;
}

export interface AudioPeak {
  /** När ljudet börjar (s). */
  time: number;
  /** Toppens styrka (RMS, 0..1). */
  strength: number;
}

/** En ljus, rund fläck som finns före en tidpunkt och är borta efter. */
export interface VanishCandidate {
  /** Mittpunkt i källbildens pixlar. */
  x: number;
  y: number;
  /** Ungefärlig diameter i källbildens pixlar. */
  diameter: number;
  /** 0..1, högre är mer boll-lik. */
  score: number;
}

export interface ImpactResult {
  /** Sista bildrutan där bollen ligger still. Träffen sker mellan den och nästa. */
  impactFrame: number;
  /** Skattad tid för träffen (s), inom intervallet mellan impactFrame och nästa bildruta. */
  impactTime: number;
  /** Bollens mittpunkt före träffen, i pixlar och normaliserat. */
  ballPx: { x: number; y: number };
  ball: { x: number; y: number };
  /** Bollens diameter i pixlar. */
  diameter: number;
  /** Hur träffen hittades: ljudtopp bekräftad i bilden, eller enbart bilden. */
  method: 'ljud+bild' | 'bild';
  /** Ljudtoppen som hör till träffen (s), om en sådan hittades. */
  audioTime: number | null;
  /** 0..1 från bildanalysen. */
  score: number;
}
