/**
 * Deliberate time-based media violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 */
export function KitchenSinkMedia() {
  return (
    <div>
      {/* kitchen-sink: autoplay-media */}
      <video autoPlay src="/intro.mp4" />
      {/* kitchen-sink: video-caption */}
      <video src="/talk.mp4" controls />
      {/* kitchen-sink: audio-caption */}
      <audio src="/podcast.mp3" controls />
      {/* kitchen-sink: audio-description-track */}
      <video src="/documentary.mp4" controls />
      {/* kitchen-sink: audio-description-or-alt */}
      <video src="/interview.mp4" controls />
      {/* kitchen-sink: captions-live */}
      <video src="/live/stream.m3u8" controls />
      {/* kitchen-sink: media-controls-present */}
      <video src="/clip.mp4" />
      {/* kitchen-sink: media-keyboard-static */}
      <object data="/chart.svg" type="image/svg+xml" />
      {/* kitchen-sink: nontemporal-media-alt */}
      <canvas />
      {/* kitchen-sink: image-detailed-description */}
      <img src="/sales-chart.png" alt="Sales" />
      {/* kitchen-sink: office-docs-alt-present */}
      <a href="/guide.pdf">Download the guide</a>
    </div>
  );
}
