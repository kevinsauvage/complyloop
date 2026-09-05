import { makeVideoDescriptionCheck } from "./heuristic-utils.ts";

export const audioDescriptionOrAltCheck = makeVideoDescriptionCheck({
  id: "audio-description-or-alt",
  acceptTranscriptAlternative: true,
  reason:
    "<video> has no descriptions track or adjacent transcript alternative; visual information not in the soundtrack may be inaccessible (WCAG 1.2.3).",
});