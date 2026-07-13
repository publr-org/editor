// Host-build implementation of ./publr-runtime (see that file): delegate to
// the PublrJS runtime the host page already loaded. All access is LAZY —
// the editor bundle may be injected before the host's module scripts have
// executed, so window.Publr is resolved per call, never at import time.

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyPublr = Record<string, any>;

function host(): AnyPublr {
  const P = (window as unknown as { Publr?: AnyPublr }).Publr;
  if (!P) {
    throw new Error(
      "[publr-editor] host build: window.Publr is missing — load the host's PublrJS runtime before using the editor",
    );
  }
  return P;
}

export const reactive = ((obj: unknown) =>
  host().reactive(obj)) as typeof import("../vendor/publr/publr.js").reactive;
export const effect = ((fn: unknown) =>
  host().effect(fn)) as typeof import("../vendor/publr/publr.js").effect;
export const hydrate = ((root?: unknown) =>
  host().hydrate(root)) as typeof import("../vendor/publr/publr.js").hydrate;
export const destroy = ((root?: unknown) =>
  host().destroy(root)) as typeof import("../vendor/publr/publr.js").destroy;

// The Publr namespace object (Publr.store, Publr.editor = …): a lazy proxy
// over the host global so property reads, writes, and method calls all land
// on the host instance.
export const Publr = new Proxy({} as AnyPublr, {
  get(_t, key: string) {
    const value = host()[key];
    return typeof value === "function" ? value.bind(host()) : value;
  },
  set(_t, key: string, value) {
    host()[key] = value;
    return true;
  },
  has(_t, key: string) {
    return key in host();
  },
}) as typeof import("../vendor/publr/publr.js").Publr;
