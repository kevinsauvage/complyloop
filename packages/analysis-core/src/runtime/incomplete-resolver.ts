/**
 * Resolves axe `incomplete` ("could not decide") results ComplyLoop can decide
 * itself, so they stop appearing as needs-review noise:
 *
 * - `color-contrast` where axe could not read the background (gradient,
 *   overlapping element, image): the rendered pixels behind the text are
 *   sampled with the text hidden, and the real contrast is computed against
 *   the actual colors.
 * - `heading-order` where axe could not find the previous heading: the real
 *   document-order heading sequence is checked directly.
 *
 * Verdicts: a node that passes is dropped, a node that clearly fails is
 * promoted to a violation, anything ambiguous (or any error) stays as the
 * needs-review warning axe produced. Never throws.
 */
import type { Page } from "playwright-core";

import { parseCssColor } from "./css-color.ts";
import type { AxeViolationLike } from "./findings.ts";

const MAX_CONTRAST_NODES = 60;
const BUDGET_MS = 25_000;

export interface ResolvedIncomplete {
  /** Still undecided — kept as needs-review. */
  incomplete: AxeViolationLike[];
  /** Confirmed failures, shaped like axe violations. */
  confirmed: AxeViolationLike[];
}

type Verdict = "pass" | "fail" | "unsure";

interface PreparedElement {
  rect: { x: number; y: number; width: number; height: number };
  color: { rgb: [number, number, number]; alpha: number } | null;
  fontSize: number;
  fontWeight: number;
}

function selectorOf(target: ReadonlyArray<unknown>): string | null {
  // Only plain document selectors: iframe/shadow targets are nested arrays.
  return target.length === 1 && typeof target[0] === "string"
    ? (target[0] as string)
    : null;
}

async function prepareElement(
  page: Page,
  selector: string,
): Promise<PreparedElement | null> {
  return page.evaluate(
    ({ sel, parseColorSrc }) => {
      const parseColor = new Function(
        "value",
        `const parseCssColor = (${parseColorSrc}); return parseCssColor(value);`,
      ) as (value: string) => {
        rgb: [number, number, number];
        alpha: number;
      } | null;
      let el: Element | null = null;
      try {
        el = document.querySelector(sel);
      } catch {
        return null;
      }
      if (!(el instanceof HTMLElement)) return null;
      el.scrollIntoView({ block: "center", inline: "center" });
      const style = getComputedStyle(el);
      // Sample only where the text is: the element's own box also holds rounded
      // corners and padding that show whatever lies behind the element.
      let rect = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let textBox: { l: number; t: number; r: number; b: number } | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        textBox = textBox
          ? {
              l: Math.min(textBox.l, box.left),
              t: Math.min(textBox.t, box.top),
              r: Math.max(textBox.r, box.right),
              b: Math.max(textBox.b, box.bottom),
            }
          : { l: box.left, t: box.top, r: box.right, b: box.bottom };
      }
      if (textBox) {
        rect = new DOMRect(
          textBox.l,
          textBox.t,
          textBox.r - textBox.l,
          textBox.b - textBox.t,
        );
      }
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.right);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (right - left < 2 || bottom - top < 2) return null;

      // Read the text's own color before hiding it: computed style is live.
      const color = parseColor(style.color);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;

      // Hide the text (and nothing else) so the screenshot is the background.
      if (!document.getElementById("cl-probe-style")) {
        const sheet = document.createElement("style");
        sheet.id = "cl-probe-style";
        sheet.textContent =
          "[data-cl-probe], [data-cl-probe] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }";
        document.head.appendChild(sheet);
      }
      el.setAttribute("data-cl-probe", "1");
      return {
        rect: {
          x: left,
          y: top,
          width: Math.min(right - left, 800),
          height: Math.min(bottom - top, 400),
        },
        color,
        fontSize,
        fontWeight,
      };
    },
    { sel: selector, parseColorSrc: parseCssColor.toString() },
  );
}

async function releaseElement(page: Page, selector: string): Promise<void> {
  await page
    .evaluate((sel) => {
      try {
        document.querySelector(sel)?.removeAttribute("data-cl-probe");
      } catch {
        // Selector no longer valid: nothing to release.
      }
    }, selector)
    .catch(() => {
      // Page may be closing; the probe attribute dies with it.
    });
}

/** Contrast of `fg` over every sampled background pixel, as a verdict. */
async function judgePixels(
  aux: Page,
  png: Buffer,
  fg: { rgb: [number, number, number]; alpha: number },
  required: number,
): Promise<Verdict> {
  return aux.evaluate(
    async ({ b64, color, need }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "unsure" as const;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

      const ratios: number[] = [];
      const pixels = data.length / 4;
      const stride = Math.max(1, Math.floor(pixels / 20_000));
      for (let p = 0; p < pixels; p += stride) {
        const r = data[p * 4] ?? 0;
        const g = data[p * 4 + 1] ?? 0;
        const b = data[p * 4 + 2] ?? 0;
        const a = color.alpha;
        const fr = color.rgb[0] * a + r * (1 - a);
        const fg2 = color.rgb[1] * a + g * (1 - a);
        const fb = color.rgb[2] * a + b * (1 - a);
        const l1 = luminance(fr, fg2, fb);
        const l2 = luminance(r, g, b);
        ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
      }
      if (ratios.length === 0) return "unsure" as const;
      ratios.sort((a, b) => a - b);
      // 2nd percentile, not the minimum: anti-aliased edges and a stray
      // pixel should not decide a verdict.
      const worst = ratios[Math.floor(ratios.length * 0.02)] ?? 0;
      const median = ratios[Math.floor(ratios.length / 2)] ?? 0;
      if (worst >= need) return "pass" as const;
      if (median < need) return "fail" as const;
      return "unsure" as const;
    },
    { b64: png.toString("base64"), color: fg, need: required },
  );
}

function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? 3 : 4.5;
}

async function verdictForContrastNode(
  page: Page,
  aux: Page,
  selector: string,
): Promise<Verdict> {
  const prepared = await prepareElement(page, selector);
  if (!prepared?.color) return "unsure";
  // Fully transparent text (gradient clip text) has no color to measure.
  if (prepared.color.alpha === 0) return "unsure";
  try {
    const png = await page.screenshot({
      clip: prepared.rect,
      animations: "disabled",
      type: "png",
    });
    return await judgePixels(
      aux,
      png,
      prepared.color,
      requiredRatio(prepared.fontSize, prepared.fontWeight),
    );
  } finally {
    await releaseElement(page, selector);
  }
}

async function resolveContrast(
  page: Page,
  rule: AxeViolationLike,
  deadline: number,
): Promise<{
  keep: AxeViolationLike["nodes"];
  fail: AxeViolationLike["nodes"];
}> {
  const keep: AxeViolationLike["nodes"] = [];
  const fail: AxeViolationLike["nodes"] = [];
  const aux = await page.context().newPage();
  try {
    await aux.setContent('<!doctype html><meta charset="utf-8">');
    let checked = 0;
    for (const node of rule.nodes) {
      const selector = selectorOf(node.target);
      if (!selector || checked >= MAX_CONTRAST_NODES || Date.now() > deadline) {
        keep.push(node);
        continue;
      }
      checked += 1;
      let verdict: Verdict = "unsure";
      try {
        verdict = await verdictForContrastNode(page, aux, selector);
      } catch {
        verdict = "unsure";
      }
      if (verdict === "fail") fail.push(node);
      else if (verdict === "unsure") keep.push(node);
      // "pass": the real contrast clears the threshold — drop the node.
    }
  } finally {
    await aux.close().catch(() => {
      // Context teardown closes it anyway.
    });
  }
  return { keep, fail };
}

async function resolveHeadingOrder(
  page: Page,
  rule: AxeViolationLike,
): Promise<{
  keep: AxeViolationLike["nodes"];
  fail: AxeViolationLike["nodes"];
}> {
  const selectors = rule.nodes.map((node) => selectorOf(node.target));
  const offenders = await page.evaluate((selectors) => {
    const visible = (el: Element): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      return !el.closest("[hidden], [aria-hidden='true']");
    };
    const headings = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']"),
    ).filter(visible);
    const levelOf = (el: Element): number => {
      const tag = /^h([1-6])$/i.exec(el.tagName)?.[1];
      if (tag && !el.getAttribute("role")) return Number(tag);
      return Number(el.getAttribute("aria-level")) || (tag ? Number(tag) : 2);
    };
    const skipped = new Set<Element>();
    let previous = 0;
    for (const heading of headings) {
      const level = levelOf(heading);
      if (previous > 0 && level > previous + 1) skipped.add(heading);
      previous = level;
    }
    return selectors.map((sel) => {
      if (!sel) return null;
      try {
        const el = document.querySelector(sel);
        return el ? skipped.has(el) : null;
      } catch {
        return null;
      }
    });
  }, selectors);

  const keep: AxeViolationLike["nodes"] = [];
  const fail: AxeViolationLike["nodes"] = [];
  rule.nodes.forEach((node, index) => {
    const skipped = offenders[index];
    if (skipped === true) fail.push(node);
    else if (skipped === null || skipped === undefined) keep.push(node);
    // false: the heading follows its predecessor correctly — drop the node.
  });
  return { keep, fail };
}

export async function resolveIncompleteResults(
  page: Page,
  incomplete: ReadonlyArray<AxeViolationLike>,
): Promise<ResolvedIncomplete> {
  const remaining: AxeViolationLike[] = [];
  const confirmed: AxeViolationLike[] = [];
  const deadline = Date.now() + BUDGET_MS;

  for (const rule of incomplete) {
    if (rule.id !== "color-contrast" && rule.id !== "heading-order") {
      remaining.push(rule);
      continue;
    }
    try {
      const { keep, fail } =
        rule.id === "color-contrast"
          ? await resolveContrast(page, rule, deadline)
          : await resolveHeadingOrder(page, rule);
      console.info(
        `[diag] incomplete ${rule.id}: total=${rule.nodes.length} kept=${keep.length} confirmed=${fail.length} resolved=${rule.nodes.length - keep.length - fail.length}`,
      );
      if (keep.length > 0) remaining.push({ ...rule, nodes: keep });
      if (fail.length > 0) {
        const measured =
          rule.id === "color-contrast"
            ? "Measured against the rendered background pixels: contrast is below the required ratio."
            : "Heading level skipped in the document outline.";
        confirmed.push({
          ...rule,
          impact: rule.id === "color-contrast" ? "serious" : "moderate",
          nodes: fail.map((node) => ({ ...node, failureSummary: measured })),
        });
      }
    } catch {
      // Resolution is best-effort: axe's own verdict stands.
      remaining.push(rule);
    }
  }
  return { incomplete: remaining, confirmed };
}
