// Printers: what the printer search finds, how each one fits the approved
// order, and the message you send them. Shared by the server and the screens.

export const PRINT_METHODS = ['screen', 'dtg', 'dtf', 'embroidery', 'vinyl', 'sublimation'] as const;
export type PrintMethod = (typeof PRINT_METHODS)[number];

export const METHOD_NAMES: Record<PrintMethod, string> = {
  screen: 'Screen printing',
  dtg: 'DTG (direct to garment)',
  dtf: 'DTF transfers',
  embroidery: 'Embroidery',
  vinyl: 'Heat-press vinyl',
  sublimation: 'Sublimation',
};

/** found: turned up in a search; saved: on your shortlist; used: you've ordered from them. */
export type PrinterStatus = 'found' | 'saved' | 'used';

export interface Printer {
  id: string;
  name: string;
  /** A shop you can visit, or a service that ships to you. */
  kind: 'local' | 'online';
  website: string | null;
  phone: string | null;
  email: string | null;
  /** Street address (local shops). */
  address: string | null;
  /** Where they are or where they ship, in a few words. */
  area: string | null;
  methods: PrintMethod[];
  /** Will they print on shirts you bring? */
  ownShirts: 'yes' | 'no' | 'unknown';
  minimum: string | null;
  turnaround: string | null;
  pricing: string | null;
  fileRequirements: string | null;
  howToSend: string | null;
  notes: string | null;
  /** The pages these details came from. */
  sources: string[];
  /** When the details were last read. */
  checkedAt: string;
  /** Each ZIP code whose search turned it up, and when. */
  searches: Record<string, string>;
  status: PrinterStatus;
  note?: string;
  /** Whose list it's on. Missing on printers saved before households: those are the first household's. */
  householdId?: string;
}

/** A search's results are reused this long before searching that ZIP code again costs money. */
export const FRESH_DAYS = 30;
export const DAY_MS = 86_400_000;

/** "  sw1a 1aa" → "SW1A 1AA". */
export const normalZip = (zip: string) => zip.trim().toUpperCase();

/** When this ZIP code was last searched, from the printers that search found. */
export function lastSearched(printers: Printer[], zip: string): string | null {
  let last: string | null = null;
  for (const p of printers) {
    const at = p.searches[zip];
    if (at && (!last || at > last)) last = at;
  }
  return last;
}

/** The approved order, boiled down to what a printer needs to know. */
export interface PrintJob {
  title: string;
  quantity: number;
  garment: string;
  color: string;
  dark: boolean;
  /** "M ×1, L ×2" */
  sizes: string;
  printSize: string;
  /** Ink colors in the front print, and the back's (null: nothing on the back). */
  frontInks: number;
  /** The front art is a full-color painting rather than flat colors. */
  fullColorArt: boolean;
  backInks: number | null;
  /** How many different names the back prints (one per wearer), 0 if none. */
  names: number;
  notes: string;
}

export interface FitNote {
  level: 'ok' | 'info' | 'warn';
  text: string;
}

/** The smallest order a printer mentions: "No minimum" is 1, "12 piece minimum" is 12. */
export function minimumOf(text: string | null): number | null {
  if (!text) return null;
  if (/\bno\s+min/i.test(text)) return 1;
  const n = Number(text.match(/\d+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** How this printer fits the order, from what their own pages say. */
export function fitCheck(p: Printer, job: PrintJob): FitNote[] {
  const notes: FitNote[] = [];
  const has = (m: PrintMethod) => p.methods.includes(m);
  const digital = has('dtg') || has('dtf');

  if (!p.methods.length) notes.push({ level: 'info', text: 'Their pages don’t say how they print. Worth asking.' });
  if (digital) notes.push({ level: 'ok', text: 'Prints straight from the 300 DPI files in your package.' });
  if (has('screen')) {
    const front = job.fullColorArt ? 'full-color artwork on the front' : `${job.frontInks} ink color${job.frontInks === 1 ? '' : 's'} on the front`;
    const inks = `${front}${job.backInks ? ` and ${job.backInks} on the back` : ''}`;
    notes.push({ level: 'info', text: `Screen printing is priced per color: this design uses ${inks}. Send them the vector file.` });
  }
  if (job.fullColorArt && has('screen') && !digital) {
    notes.push({ level: 'warn', text: 'The artwork is a full-color painting. Screen printing it means many screens; DTG or DTF suits it better.' });
  }
  if (job.names > 1 && has('screen') && !digital && !has('vinyl')) {
    notes.push({ level: 'warn', text: `Each shirt has its own name on the back (${job.names} names). Screen printing can’t do that cheaply; ask about vinyl or DTF names.` });
  }
  if (p.methods.length && p.methods.every((m) => m === 'embroidery')) {
    notes.push({ level: 'warn', text: 'Embroidery needs a stitch file we don’t make. They usually charge to create one, and large prints don’t suit it.' });
  }
  if (p.methods.length && p.methods.every((m) => m === 'sublimation')) {
    notes.push({ level: 'warn', text: `Sublimation only works on white or light polyester shirts.${job.dark ? ' Yours is dark.' : ''}` });
  }

  const min = minimumOf(p.minimum);
  if (min && min > job.quantity) notes.push({ level: 'warn', text: `Their minimum is ${min} shirts; you’re ordering ${job.quantity}.` });
  else if (min) notes.push({ level: 'ok', text: `Their minimum (${min}) is fine for your ${job.quantity}.` });

  if (p.ownShirts === 'yes') notes.push({ level: 'ok', text: 'Will print on shirts you bring.' });
  else if (p.ownShirts === 'no') notes.push({ level: 'info', text: 'Uses their own blank shirts, so check they have your style and color.' });
  else notes.push({ level: 'info', text: 'Ask whether they’ll print on shirts you bring.' });

  if (job.dark && (digital || has('screen'))) notes.push({ level: 'info', text: 'Dark shirt: your package includes files adjusted for dark fabric.' });
  return notes;
}

/** A short message to send with the link. */
export function printerMessage(job: PrintJob, link: string, expires: string, from: string, printer?: Pick<Printer, 'name'>): { subject: string; body: string } {
  const lines = [
    `Hi${printer ? ` ${printer.name}` : ''},`,
    '',
    `We'd like ${job.quantity} ${job.garment.toLowerCase()}${job.quantity === 1 ? '' : 's'} printed in ${job.color.toLowerCase()} (${job.sizes}). The print is ${job.printSize}${job.backInks !== null ? ', with a second print on the back' : ''}${job.names > 1 ? ', and each shirt has its own name on the back' : ''}.`,
    '',
    `The print files, mockups and an order sheet are here (the link works until ${expires}):`,
    link,
    ...(job.notes ? ['', job.notes] : []),
    '',
    'Could you let us know the price and how soon you could do it?',
    '',
    'Thanks!',
    from,
  ];
  return { subject: `T-shirt order: ${job.title}`, body: lines.join('\n') };
}
