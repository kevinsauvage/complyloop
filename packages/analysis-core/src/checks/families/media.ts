import { isDecorativeOrHidden } from "../../a11y-aria.ts";
import { hasAriaName, isPropSpreadingHost } from "../../jsx-primitives.ts";
import {
  attributeRemovalSpan,
  booleanAttributeValue,
  getAttribute,
  hasAnyAttr,
  hasTextContent,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  type JsxTagNode,
  visitJsxTags,
} from "../../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../../types.ts";
import {
  AUDIO_ALT_KINDS,
  CAPTION_KINDS,
  hasAdjacentTagMatching,
  hasChildTrackKind,
  hasKeyboardHandlers,
  hasTrackOrTranscriptAlt,
  isInsideNamingHost,
  KEY_HANDLERS,
  makeVideoDescriptionCheck,
  textContentOf,
} from "../heuristic-utils.ts";

export const autoplayMediaCheck: AccessibilityCheck = {
  id: "autoplay-media",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "video" && tag !== "audio") return;
      const autoPlay =
        getAttribute(node, "autoPlay") ?? getAttribute(node, "autoplay");
      if (!autoPlay) return;
      // Only a statically-true autoPlay is a violation; `autoPlay={false}`,
      // `autoPlay="false"`, and dynamic expressions are not proven enabled.
      if (booleanAttributeValue(autoPlay) !== true) return;

      findings.push({
        checkId: "autoplay-media",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason: `<${tag}> uses autoPlay, which can disorient users and conflict with accessibility preferences for motion and sound.`,
        location: locationOf(source, node),
        fix: {
          kind: "remove_attribute",
          attribute: autoPlay.name.getText(),
          span: attributeRemovalSpan(
            autoPlay,
            source.sourceFile,
            source.text,
          ),
        },
      });
    });
    return findings;
  },
};

export const audioCaptionCheck: AccessibilityCheck = {
  id: "audio-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "audio") return;
      if (hasTrackOrTranscriptAlt(node, AUDIO_ALT_KINDS, source.sourceFile)) {
        return;
      }

      findings.push({
        checkId: "audio-caption",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<audio> has no captions or descriptions track, so users who cannot hear the audio have no equivalent.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

export const audioDescriptionOrAltCheck = makeVideoDescriptionCheck({
  id: "audio-description-or-alt",
  acceptTranscriptAlternative: true,
  reason:
    "<video> has no descriptions track or adjacent transcript alternative; visual information not in the soundtrack may be inaccessible (WCAG 1.2.3).",
});

export const audioDescriptionTrackCheck = makeVideoDescriptionCheck({
  id: "audio-description-track",
  acceptTranscriptAlternative: false,
  reason:
    "<video> has no descriptions track; visual information not in the soundtrack may be missing for blind users (RGAA 4.5).",
});

const EMBED_HOSTS = /(?:youtube(?:-nocookie)?\.com|youtu\.be|player\.vimeo\.com|vimeo\.com)/i;
const EMBED_TAGS = new Set(["YouTube", "Vimeo"]);

function iframeSrcOf(node: JsxTagNode): string {
  const src = getAttribute(node, "src");
  if (!src) return "";
  return stringValueOf(src) ?? src.initializer?.getText() ?? "";
}

function isKnownCaptionEmbed(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (EMBED_TAGS.has(tag)) return true;
  if (tag !== "iframe") return false;
  return EMBED_HOSTS.test(iframeSrcOf(node));
}

export const videoCaptionCheck: AccessibilityCheck = {
  id: "video-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag === "video") {
        if (hasChildTrackKind(node, CAPTION_KINDS)) return;
        findings.push({
          checkId: "video-caption",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "<video> has no captions or subtitles track, so users who cannot hear the audio cannot follow the spoken content.",
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      if (!isKnownCaptionEmbed(node)) return;

      findings.push({
        checkId: "video-caption",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "YouTube/Vimeo embeds cannot be checked for captions automatically; confirm captions are enabled on the host (RGAA 4.3 / WCAG 1.2.2).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const LIVE_HINT = /live|stream|broadcast|\.m3u8/i;

function isLiveMedia(node: JsxTagNode): boolean {
  const src = getAttribute(node, "src");
  const srcValue = src ? stringValueOf(src) : undefined;
  if (srcValue && LIVE_HINT.test(srcValue)) return true;
  return getAttribute(node, "data-live") !== undefined;
}

export const captionsLiveCheck: AccessibilityCheck = {
  id: "captions-live",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "video") return;
      if (!isLiveMedia(node)) return;
      if (hasChildTrackKind(node, CAPTION_KINDS)) return;

      findings.push({
        checkId: "captions-live",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Live or streaming <video> has no captions track; synchronized live audio may be inaccessible (WCAG 1.2.4).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const MEDIA_TAGS = new Set(["video", "audio"]);

export const mediaControlsPresentCheck: AccessibilityCheck = {
  id: "media-controls-present",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (getAttribute(node, "controls") !== undefined) return;
      if (hasKeyboardHandlers(node)) return;

      findings.push({
        checkId: "media-controls-present",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `<${tag}> has no controls attribute and no keyboard handlers for a custom player, so keyboard users may not be able to operate the media.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const STATIC_MEDIA_TAGS = new Set(["object", "embed"]);

function hasKeyboardPath(node: JsxTagNode): boolean {
  return hasAnyAttr(node, ["tabIndex", "tabindex", ...KEY_HANDLERS]);
}

export const mediaKeyboardStaticCheck: AccessibilityCheck = {
  id: "media-keyboard-static",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!STATIC_MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if (hasKeyboardPath(node)) return;

      findings.push({
        checkId: "media-keyboard-static",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason: `<${tag}> has no keyboard handlers or tabIndex, so keyboard users may not be able to operate the embedded content (RGAA 4.12).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const NON_TEMPORAL_MEDIA_TAGS = new Set(["object", "embed", "canvas"]);
const IMAGE_MIME = /^image\//i;
const TEMPORAL_MIME = /^(audio|video)\//i;
const TEXT_ALTERNATIVE_HOSTS = new Set(["a", "button"]);

function hasAdjacentAlternative(node: JsxTagNode): boolean {
  return hasAdjacentTagMatching(node, (siblingTag, siblingElement) => {
    if (!TEXT_ALTERNATIVE_HOSTS.has(tagNameOf(siblingTag))) return false;
    if (hasAriaName(siblingTag)) return true;
    if (!siblingElement) return false;
    return hasTextContent(siblingElement);
  });
}

function isSkippedTypedMedia(node: JsxTagNode): boolean {
  const typeAttribute = getAttribute(node, "type");
  const typeValue = typeAttribute ? stringValueOf(typeAttribute) : undefined;
  if (!typeValue) return false;
  return IMAGE_MIME.test(typeValue) || TEMPORAL_MIME.test(typeValue);
}

export const nontemporalMediaAltCheck: AccessibilityCheck = {
  id: "nontemporal-media-alt",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!NON_TEMPORAL_MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if ((tag === "object" || tag === "embed") && isSkippedTypedMedia(node)) return;
      if (hasAriaName(node)) return;
      if (tag === "canvas") {
        const element = jsxElementOf(node);
        if (element && hasTextContent(element)) return;
      }
      if (hasAdjacentAlternative(node)) return;

      findings.push({
        checkId: "nontemporal-media-alt",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason:
          `<${tag}> does not expose a text alternative. Add an accessible name or an adjacent link/button alternative.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const COMPLEX_SRC = /chart|graph|diagram|map|plot|infographic/i;
const LONG_ALT_THRESHOLD = 80;

function hasDetailedDescription(node: JsxTagNode): boolean {
  return (
    getAttribute(node, "aria-describedby") !== undefined ||
    getAttribute(node, "aria-details") !== undefined ||
    getAttribute(node, "longdesc") !== undefined
  );
}

function isLikelyComplexImage(node: JsxTagNode): boolean {
  const altAttr = getAttribute(node, "alt");
  const alt = altAttr ? stringValueOf(altAttr) : undefined;
  if (alt === "") return false;

  const srcAttr = getAttribute(node, "src");
  const src = srcAttr ? stringValueOf(srcAttr) : undefined;
  if (src && COMPLEX_SRC.test(src)) return true;

  if (alt && alt.length >= LONG_ALT_THRESHOLD) return true;

  return false;
}

export const imageDetailedDescriptionCheck: AccessibilityCheck = {
  id: "image-detailed-description",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "img" && tag !== "Image") return;
      if (isPropSpreadingHost(node)) return;
      if (isInsideNamingHost(node)) return;
      if (!isLikelyComplexImage(node)) return;
      if (hasDetailedDescription(node)) return;

      findings.push({
        checkId: "image-detailed-description",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Image may be complex (long alt or chart-like source) but has no aria-describedby, aria-details, or longdesc for a detailed description.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const OFFICE_DOC_HREF = /\.(pdf|docx?|odt|pptx?|xlsx?)(\?|#|$)/i;
const HTML_ALTERNATIVE_HREF = /\.(html?|txt)(\?|#|$)/i;

function hrefOf(node: JsxTagNode): string | undefined {
  const href = getAttribute(node, "href");
  return href ? stringValueOf(href) : undefined;
}

function hasAdjacentHtmlAlternative(node: JsxTagNode): boolean {
  return hasAdjacentTagMatching(node, (siblingTag, siblingElement) => {
    if (tagNameOf(siblingTag) !== "a") return false;
    const href = hrefOf(siblingTag);
    if (href && HTML_ALTERNATIVE_HREF.test(href)) return true;
    if (!siblingElement) return false;
    return textContentOf(siblingElement).trim().length > 20;
  });
}

export const officeDocsAltPresentCheck: AccessibilityCheck = {
  id: "office-docs-alt-present",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      if (isPropSpreadingHost(node)) return;
      const href = hrefOf(node);
      if (!href || !OFFICE_DOC_HREF.test(href)) return;
      if (hasAdjacentHtmlAlternative(node)) return;

      findings.push({
        checkId: "office-docs-alt-present",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Downloadable office document link has no adjacent HTML or text alternative (RGAA 13.3).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
