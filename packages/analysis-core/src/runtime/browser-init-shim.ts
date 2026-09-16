/**
 * Page-init shim for compiler-helper drift between executor stacks.
 *
 * Runtime probes execute serialized function sources in the page
 * (`fn.toString()` fragments and `page.evaluate` closures). tsx/esbuild
 * (the GitHub Actions executor) compiles nested declarations with keepNames
 * `__name()` wrappers whose file-scoped definition never travels with the
 * fragment — without this shim every probe dies in-page with
 * `ReferenceError: __name is not defined`. SWC/webpack stacks (local dev,
 * Vercel) never emit it, so the shim is a no-op there.
 *
 * The shim intentionally only preserves call semantics (return the
 * function); esbuild's real helper additionally assigns `.name`, which no
 * probe logic reads. Kept as a single statement with no nested named
 * declarations so it is bundler-proof by construction.
 */
export const BROWSER_INIT_SHIM_SRC =
  "if(typeof __name!=='function'){var __name=function(fn){return fn;};}";
