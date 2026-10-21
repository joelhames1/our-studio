/** Painted artwork shown on screen comes from a small WebP copy kept beside the original; print always uses the original. */
export const PREVIEW_WIDTH = 768;

/** "art/riveras/abc.png" → "art/riveras/abc.preview.webp". Anything that isn't a painted PNG (vector art) is used as it is. */
export const previewKey = (key: string) => (/\.png$/i.test(key) ? key.replace(/\.png$/i, '.preview.webp') : key);

/** The original a preview was made from, or null if `key` isn't a preview. */
export const originalOf = (key: string) => (/\.preview\.webp$/i.test(key) ? key.replace(/\.preview\.webp$/i, '.png') : null);

/** Where a preview fetches a stored file from: the small copy for painted artwork. */
export const previewHref = (key: string) => `/api/assets/${previewKey(key)}`;
