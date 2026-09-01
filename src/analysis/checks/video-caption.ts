import { hasChildTrackKind } from "./heuristic-utils";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const CAPTION_KINDS = new Set(["captions", "subtitles"]);
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
