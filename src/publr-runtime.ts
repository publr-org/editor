// The library's ONE import point for the PublrJS runtime.
//
// Default build: re-export the vendored copy (standalone hosts get a
// batteries-included bundle; importing it sets window.Publr and schedules
// the auto-hydrate pass).
//
// Host build (`npm run build:host`, vite.host.config.ts): this module is
// aliased to ./publr-runtime-host, which delegates to the PublrJS instance
// the HOST page already loaded (window.Publr) — no second runtime in the
// bundle, no global clobbering. Built for hosts like the Publr CMS admin,
// which ships its own publr-core.js.
export { Publr, destroy, effect, hydrate, reactive } from "../vendor/publr/publr.js";
