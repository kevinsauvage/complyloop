import { makeVideoDescriptionCheck } from "./heuristic-utils.ts";

export const audioDescriptionTrackCheck = makeVideoDescriptionCheck({
  id: "audio-description-track",
  acceptTranscriptAlternative: false,
  reason:
    "<video> has no descriptions track; visual information not in the soundtrack may be missing for blind users (RGAA 4.5).",
});