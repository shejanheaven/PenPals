// Camera-frame cropping and photo resizing (all on-device).

export const CARD_ASPECT = 63 / 88; // standard TCG card, width / height

// Space kept clear above (game switcher) and below (hint, shutter, tab bar) the guide.
const GUIDE_TOP = 96;
const GUIDE_BOTTOM = 250;

/** Region of the scanner covered by the on-screen card guide. */
export function guideRect(width, height) {
  const avail = Math.max(120, height - GUIDE_TOP - GUIDE_BOTTOM);
  const w = Math.min(width * 0.8, avail * CARD_ASPECT);
  const h = w / CARD_ASPECT;
  return { x: (width - w) / 2, y: GUIDE_TOP + (avail - h) / 2, w, h };
}

/**
 * Crop the part of the live video inside the guide (plus a margin so edges stay
 * visible for condition grading). The video is displayed with object-fit: cover.
 */
export function cropVideoToGuide(video, margin = 0.08) {
  const vw = video.clientWidth, vh = video.clientHeight;
  const VW = video.videoWidth, VH = video.videoHeight;
  const scale = Math.max(vw / VW, vh / VH);
  const ox = (vw - VW * scale) / 2, oy = (vh - VH * scale) / 2;
  const g = guideRect(vw, vh);
  const mx = g.w * margin, my = g.h * margin;
  let sx = (g.x - mx - ox) / scale, sy = (g.y - my - oy) / scale;
  let sw = (g.w + 2 * mx) / scale, sh = (g.h + 2 * my) / scale;
  sx = Math.max(0, sx);
  sy = Math.max(0, sy);
  sw = Math.min(VW - sx, sw);
  sh = Math.min(VH - sy, sh);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Load a picked/taken photo (EXIF orientation respected by the browser). */
export async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function resize(canvas, maxSide) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  if (s === 1) return canvas;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * s);
  out.height = Math.round(canvas.height * s);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export const toDataUrl = (canvas, quality = 0.88) => canvas.toDataURL("image/jpeg", quality);

export const toBlob = (canvas, quality = 0.85) =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));

/**
 * Prepare a captured photo: AI-sized data URL + small JPEG to keep on the phone.
 * Front + back must stay under Vercel's 4.5 MB request limit.
 */
export async function preparePhoto(canvas, { maxSide = 1800, quality = 0.85 } = {}) {
  return {
    dataUrl: toDataUrl(resize(canvas, maxSide), quality),
    thumb: await toBlob(resize(canvas, 720), 0.82),
    previewUrl: toDataUrl(resize(canvas, 900), 0.8),
  };
}
