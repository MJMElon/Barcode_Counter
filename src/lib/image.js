/**
 * Shrinking a photo before it is kept.
 *
 * A phone camera hands over three to eight megabytes. A maintenance record
 * only needs to show that the work was done, and the nursery pays for every
 * megabyte it stores — so the picture is scaled down and re-encoded as JPEG
 * before it goes anywhere.
 *
 * No imports, so it stays testable outside a bundle.
 */

/** Roughly how many bytes a data: URL's payload decodes to. */
export function dataUrlBytes(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i < 0) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

/**
 * → a JPEG data: URL no wider than maxW and, where it can manage it, no
 * bigger than maxBytes.
 *
 * Quality is stepped down rather than guessed at once: a photo of a green
 * plot compresses very differently from one of a bare polybag, so the only
 * reliable way to hit a size is to encode and look. It stops at the first
 * quality that fits, and never goes below floorQuality — past that the
 * picture stops being evidence of anything.
 */
export function compressImage(file, opts = {}) {
  const {
    maxW = 1280,
    quality = 0.7,
    floorQuality = 0.4,
    maxBytes = 300 * 1024,
  } = opts;

  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no file'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / (img.width || maxW));
        const c = document.createElement('canvas');
        c.width  = Math.max(1, Math.round((img.width  || maxW) * scale));
        c.height = Math.max(1, Math.round((img.height || maxW) * scale));
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('canvas unsupported');
        // Photos have no transparency, and a JPEG would render any there is
        // as black. White is the safer ground.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);

        let q = quality;
        let out = c.toDataURL('image/jpeg', q);
        while (dataUrlBytes(out) > maxBytes && q > floorQuality) {
          q = Math.max(floorQuality, q - 0.1);
          out = c.toDataURL('image/jpeg', q);
        }
        URL.revokeObjectURL(url);
        resolve(out);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable image'));
    };
    img.src = url;
  });
}

/** A JPEG data: URL as a Blob, ready to upload. */
export function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl || '').split(',');
  const type = (/data:([^;]+)/.exec(head || '') || [])[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/**
 * The palms module's own name for this, kept so its settings page goes on
 * working unchanged. It wants a bigger, better picture than a work record
 * does — a plot map is read closely — so its defaults come through as given.
 */
export function readImageScaled(file, maxW = 1280, quality = 0.82) {
  return compressImage(file, { maxW, quality, maxBytes: Infinity });
}
