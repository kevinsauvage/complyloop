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
};

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
  const payload: EvaluatePayload = {
    bodySrc: body.toString(),
    loadSrc: LOAD_HIT_CAPTURE_SRC,
    hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
  };

  if (rest.length === 0) {
    return page.evaluate(({ bodySrc, loadSrc, hitCaptureSrc }) => {
      const loadHitCapture = new Function(`return (${loadSrc})`)() as (
        src: string,
      ) => HitCaptureHelpers;
      const { captureHit } = loadHitCapture(hitCaptureSrc);
      const run = new Function(`return (${bodySrc})`)() as (
        captureHit: CaptureHitFn,
      ) => T;
      return run(captureHit);
    }, payload);
  }

  const [arg] = rest;
  return page.evaluate(
    ({ bodySrc, loadSrc, hitCaptureSrc, arg: innerArg }) => {
      const loadHitCapture = new Function(`return (${loadSrc})`)() as (
        src: string,
      ) => HitCaptureHelpers;
      const { captureHit } = loadHitCapture(hitCaptureSrc);
      const run = new Function(`return (${bodySrc})`)() as (
        captureHit: CaptureHitFn,
        arg: unknown,
      ) => T;
      return run(captureHit, innerArg);
    },
    { ...payload, arg },
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
  const payload: EvaluatePayload = {
    bodySrc: body.toString(),
    loadSrc: LOAD_HIT_CAPTURE_SRC,
    hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
  };

  if (rest.length === 0) {
    return locator.evaluate((el, { bodySrc, loadSrc, hitCaptureSrc }) => {
      const loadHitCapture = new Function(`return (${loadSrc})`)() as (
        src: string,
      ) => HitCaptureHelpers;
      const { captureHit } = loadHitCapture(hitCaptureSrc);
      const run = new Function(`return (${bodySrc})`)() as (
        captureHit: CaptureHitFn,
        el: Element,
      ) => T;
      return run(captureHit, el);
    }, payload);
  }

  const [arg] = rest;
  return locator.evaluate(
    (el, { bodySrc, loadSrc, hitCaptureSrc, arg: innerArg }) => {
      const loadHitCapture = new Function(`return (${loadSrc})`)() as (
        src: string,
      ) => HitCaptureHelpers;
      const { captureHit } = loadHitCapture(hitCaptureSrc);
      const run = new Function(`return (${bodySrc})`)() as (
        captureHit: CaptureHitFn,
        el: Element,
        arg: unknown,
      ) => T;
      return run(captureHit, el, innerArg);
    },
    { ...payload, arg },
  );
}
