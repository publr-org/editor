// media-adapter.ts — the host seam for media persistence. Every media intake
// surface (canvas placeholder card, toolbar Replace menu, sidebar media
// control) funnels through ONE resolved adapter, so a host swaps the whole
// upload/browse story with a single `media` option:
//
//   media: true | undefined  the built-in OPFS store (media-store.ts) —
//                            upload only, gated on the /media/* service worker.
//   media: false             no uploads and no library; URL insertion stays.
//   media: MediaAdapter      the host's own upload()/browse() — a CMS points
//                            these at its media library.
//
// The model's wire contract is untouched either way: whatever the adapter
// returns is normalized to the exact ImageValue shape ({src, alt, width,
// height} strings) via toImageValue before it reaches setField.

import type { ImageValue } from "./carriers";
import { mediaStoreSupported, putMedia, registerMediaWorker } from "./media-store";

/**
 * What an adapter yields. `src` is the only required part — dimensions the
 * host doesn't know are probed client-side (see toImageValue), and a missing
 * `alt` preserves the field's current alt text (host-explicit "" clears it).
 * `id` is a host-opaque library identifier: accepted but NOT persisted — the
 * wire contract stays {src, alt, width, height}.
 */
export interface MediaValue {
  src: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
  id?: string;
}

/**
 * A host's media integration. Both members are optional:
 * upload-only hosts get no "Media Library" buttons; browse-only hosts get no
 * Upload affordance (URL insertion works regardless).
 */
export interface MediaAdapter {
  /** Persist a user-picked file; resolve with where it now lives. */
  upload?: (file: File) => Promise<MediaValue>;
  /**
   * Open the host's media library UI and resolve with the pick (null =
   * cancelled, a no-op). `current` is the field's present value, when set —
   * hosts with pre-selection can highlight it.
   */
  browse?: (current?: MediaValue) => Promise<MediaValue | null>;
}

/**
 * The internal, always-resolved form the chrome layers consume. Not part of
 * the public API (index.ts exports only MediaAdapter/MediaValue).
 */
export interface ResolvedMediaAdapter {
  upload: ((file: File) => Promise<MediaValue>) | null;
  browse: ((current?: MediaValue) => Promise<MediaValue | null>) | null;
  /** Upload affordances render only while this is true (OPFS: worker live). */
  uploadAvailable: () => boolean;
  /** Settles when availability is final — chrome re-syncs affordances then. */
  ready: Promise<boolean>;
}

/**
 * Resolve the public `media` option. Pure apart from `register`: the shell
 * passes `{register: true}` so the OPFS worker registers once per boot;
 * standalone attachInlineChrome resolves without registering (the host owns
 * worker registration there, exactly as before).
 */
export function resolveMediaAdapter(
  option: boolean | MediaAdapter | undefined,
  opts?: { register?: boolean },
): ResolvedMediaAdapter {
  if (option === false) {
    return {
      upload: null,
      browse: null,
      uploadAvailable: () => false,
      ready: Promise.resolve(false),
    };
  }
  if (option === true || option === undefined) {
    // The built-in OPFS store. Availability tracks the service worker: the
    // stored /media/* URLs only resolve while a worker controls the page.
    const swReady = (): Promise<boolean> => {
      if (!mediaStoreSupported() || !("serviceWorker" in navigator)) return Promise.resolve(false);
      return navigator.serviceWorker.ready.then(
        () => true,
        () => false,
      );
    };
    return {
      upload: async (file) => ({ src: (await putMedia(file, file.name)).url }),
      browse: null,
      uploadAvailable: () => mediaStoreSupported() && !!navigator.serviceWorker?.controller,
      ready: opts?.register ? registerMediaWorker().then((reg) => !!reg) : swReady(),
    };
  }
  return {
    upload: option.upload ?? null,
    browse: option.browse ?? null,
    uploadAvailable: () => !!option.upload,
    ready: Promise.resolve(true),
  };
}

const dim = (v: string | number | undefined): string => {
  if (v === undefined || v === null || v === "" || v === 0) return "";
  return String(v);
};

/** Best-effort natural-size probe for a browse pick (no File to decode). */
const probeSrc = (src: string): Promise<{ width: string; height: string }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: String(img.naturalWidth || ""), height: String(img.naturalHeight || "") });
    img.onerror = () => resolve({ width: "", height: "" }); // non-image src etc.
    img.src = src;
  });

/**
 * Normalize an adapter result to the exact wire shape — always the four
 * string keys, `id` dropped. Host-provided dimensions win; otherwise the
 * uploaded File is decoded (createImageBitmap, today's behavior), or a
 * browse pick's src is probed — awaited BEFORE the single setField, so the
 * write stays one history entry.
 */
export async function toImageValue(
  value: MediaValue,
  ctx: { file?: File; prevAlt?: string } = {},
): Promise<ImageValue> {
  const alt = value.alt ?? ctx.prevAlt ?? "";
  let width = dim(value.width);
  let height = dim(value.height);
  if (!width && !height) {
    if (ctx.file) {
      if (ctx.file.type.startsWith("image/")) {
        try {
          const bmp = await createImageBitmap(ctx.file);
          width = String(bmp.width);
          height = String(bmp.height);
          bmp.close();
        } catch {
          /* not decodable (e.g. some SVGs) — dims stay empty */
        }
      }
    } else if (value.src) {
      ({ width, height } = await probeSrc(value.src));
    }
  }
  return { src: value.src, alt, width, height };
}
