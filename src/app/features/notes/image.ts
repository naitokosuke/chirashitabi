import type { RoomId } from "../rooms/types";

import type { ImageId } from "./id";

/** The longest side a picture is sent at: plenty for a card and a phone screen */
const MAX_SIDE = 1600;
/** A sticker's: it is drawn smaller than a photo, and may have to go as PNG */
export const STICKER_SIDE = 800;
/** The Worker takes at most 1 MB (worker/wire.ts); this leaves room */
const MAX_BYTES = 900 * 1024;

/** Where a room's picture is shown from; the Worker checks the viewer is a member */
export const imageSrc = (room: RoomId, id: ImageId) => `/api/rooms/${room}/images/${id}`;

/**
 * A picture as it is sent: at most `maxSide` on its longest side, as WebP, lowered in quality
 * until it fits under MAX_BYTES. Where the browser cannot write WebP (Safari), a photo goes as
 * JPEG; one with see-through parts (a subject lifted from its background) as PNG, which has no
 * quality to lower, so it is drawn smaller until it fits. The original never leaves the device,
 * nor its location and camera data, which redrawing drops.
 */
export async function shrinkImage(file: Blob, maxSide = MAX_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
    const canvas = drawn(bitmap, side);
    const clear = seeThrough(canvas);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const blob = await encode(canvas, "image/webp", quality);
      if (blob.type === "image/webp") {
        if (blob.size <= MAX_BYTES) return blob;
        continue;
      }
      // a browser that cannot write WebP hands back PNG: too big for a photo, but JPEG has no
      // see-through
      if (clear) break;
      const jpeg = await encode(canvas, "image/jpeg", quality);
      if (jpeg.size <= MAX_BYTES) return jpeg;
    }
    if (clear)
      for (let s = side; s >= 200; s *= 0.8) {
        const png = await encode(drawn(bitmap, s), "image/png");
        if (png.size <= MAX_BYTES) return png;
      }
    throw new Error("the picture is too large even at the lowest quality");
  } finally {
    bitmap.close();
  }
}

/** The picture drawn with `side` as its longest side */
function drawn(bitmap: ImageBitmap, side: number): HTMLCanvasElement {
  const scale = side / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("this browser cannot draw the picture");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Whether any of the picture can be seen through */
function seeThrough(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (context === null) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b === null ? reject(new Error("could not encode")) : resolve(b)),
      type,
      quality,
    ),
  );
