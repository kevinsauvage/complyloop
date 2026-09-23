import type { Locator, Page } from "playwright-core";

import {
  BROWSER_HIT_CAPTURE_SRC,
  type CapturedHit,
  type CaptureHitOptions,
  type HitCaptureHelpers,
  LOAD_HIT_CAPTURE_SRC,
} from "./hit-capture.ts";
import type { CustomViolationNode } from "./types.ts";
import { selectorOf, type SelectorRef } from "./widget-keyboard-utils.ts";

export type CaptureHitFn = (
  el: Element,
  options?: CaptureHitOptions,
) => CapturedHit;

/**
 * Maps captured hits to violation nodes (`html` + selector target).
 * Centralizes the `nodes.map((node) => ({ html, target: [selectorOf] }))`
 * tail repeated by every probe so selector construction stays in one place.
 * Accepts any `SelectorRef & { html }` (full `CapturedHit` or a probe-local
 * `{ html, id, role, tagName }` literal) — only `html` and the selector
 * fields are read.
 */
export function toViolationNodes(
  hits: ReadonlyArray<SelectorRef & { html: string }>,
): CustomViolationNode[] {
  return hits.map((hit) => ({ html: hit.html, target: [selectorOf(hit)] }));
}

type EvaluatePayload = {
  bodySrc: string;
  loadSrc: string;
  hitCaptureSrc: string;
  hasArg: boolean;
  arg?: unknown;
};

/**
 * Browser-side evaluator shared by page- and locator-scoped calls. Playwright
 * serializes this function, so it must stay self-contained (no module refs).
 * `locator.evaluate` passes the element first, `page.evaluate` does not — that
 * arity difference is how the element is detected.
 */
function runHitCapture<T>(
  elOrPayload: unknown,
  maybePayload?: EvaluatePayload,
): T {
  const payload = (maybePayload ?? elOrPayload) as EvaluatePayload;
  const el = maybePayload ? elOrPayload : undefined;
  const loadHitCapture = new Function(`return (${payload.loadSrc})`)() as (
    src: string,
  ) => HitCaptureHelpers;
  const { captureHit } = loadHitCapture(payload.hitCaptureSrc);
  const run = new Function(`return (${payload.bodySrc})`)() as (
    captureHit: CaptureHitFn,
    ...rest: unknown[]
  ) => T;
  if (el !== undefined) {
    return payload.hasArg
      ? run(captureHit, el, payload.arg)
      : run(captureHit, el);
  }
  return payload.hasArg ? run(captureHit, payload.arg) : run(captureHit);
}

function payloadFor(
  body: { toString(): string },
  hasArg: boolean,
  arg: unknown,
): EvaluatePayload {
  return {
    bodySrc: body.toString(),
    loadSrc: LOAD_HIT_CAPTURE_SRC,
    hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
    hasArg,
    arg,
  };
}

/**
 * Run `body` in the page with `captureHit` already bound.
 * Keeps the Vite-safe hit-capture reconstitution in one module.
 */
export async function pageEvaluateWithHitCapture<T>(
  page: Page,
  body: (captureHit: CaptureHitFn) => T,
): Promise<T>;
export async function pageEvaluateWithHitCapture<T, Arg>(
  page: Page,
  body: (captureHit: CaptureHitFn, arg: Arg) => T,
  arg: Arg,
): Promise<T>;
export async function pageEvaluateWithHitCapture<T, Arg>(
  page: Page,
  body: (captureHit: CaptureHitFn, arg?: Arg) => T,
  ...rest: [] | [Arg]
): Promise<T> {
  const [arg] = rest;
  return page.evaluate(
    runHitCapture as (payload: EvaluatePayload) => T,
    payloadFor(body, rest.length > 0, arg),
  );
}

/**
 * Like {@link pageEvaluateWithHitCapture} for `locator.evaluate` (element first).
 */
export async function locatorEvaluateWithHitCapture<T>(
  locator: Locator,
  body: (captureHit: CaptureHitFn, el: Element) => T,
): Promise<T>;
export async function locatorEvaluateWithHitCapture<T, Arg>(
  locator: Locator,
  body: (captureHit: CaptureHitFn, el: Element, arg: Arg) => T,
  arg: Arg,
): Promise<T>;
export async function locatorEvaluateWithHitCapture<T, Arg>(
  locator: Locator,
  body: (captureHit: CaptureHitFn, el: Element, arg?: Arg) => T,
  ...rest: [] | [Arg]
): Promise<T> {
  const [arg] = rest;
  return locator.evaluate(
    runHitCapture as (el: Element, payload: EvaluatePayload) => T,
    payloadFor(body, rest.length > 0, arg),
  );
}
