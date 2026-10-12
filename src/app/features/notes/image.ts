import type { RoomId } from "../rooms/types";

import type { ImageId } from "./types";

/** The longest side a picture is sent at: plenty for a card and a phone screen */
const MAX_SIDE = 1600;
/** The Worker takes at most 1 MB (worker/wire.ts); this leaves room */
const MAX_BYTES = 900 * 1024;

/** Where a room's picture is shown from; the Worker checks the viewer is a member */
export const imageSrc = (room: RoomId, id: ImageId) => `/api/rooms/${room}/images/${id}`;

/**
 * A photo as it is sent: at most MAX_SIDE on its longest side, as WebP (JPEG where the browser
 * cannot write WebP), lowered in quality until it fits under MAX_BYTES. The original never
 * leaves the device, nor its location and camera data, which redrawing drops.
 */
export async function shrinkImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("this browser cannot draw the picture");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await encode(canvas, "image/webp", quality);
    // a browser that cannot write WebP hands back PNG, which is too big for a photo
    const fitted = blob.type === "image/webp" ? blob : await encode(canvas, "image/jpeg", quality);
    if (fitted.size <= MAX_BYTES) return fitted;
  }
  throw new Error("the picture is too large even at the lowest quality");
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b === null ? reject(new Error("could not encode")) : resolve(b)),
      type,
      quality,
    ),
  );
