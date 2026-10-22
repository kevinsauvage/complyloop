/**
 * Deliberate behavior / language / link violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 */
export function KitchenSinkBehavior() {
  return (
    <div>
      {/* kitchen-sink: new-window-onload */}
      <a href="https://example.com" target="_blank">
        External site
      </a>
      {/* kitchen-sink: link-explicit-heuristic */}
      <a href="/report">Click here</a>
      {/* kitchen-sink: status-live */}
      <input aria-invalid="true" aria-label="Status email" />
      {/* kitchen-sink: dir-change */}
      <p>Hello שלום world</p>
      {/* kitchen-sink: lang-change (needs a page lang in the same file) */}
      <html lang="en">
        <body>
          <p>Bienvenue à Paris</p>
        </body>
      </html>
      {/* kitchen-sink: cryptic-content-alt */}
      <span>:-)</span>
      {/* kitchen-sink: text-spacing */}
      <p style={{ letterSpacing: "0.12em !important" }}>Spaced text</p>
      {/* kitchen-sink: meta-viewport */}
      <meta name="viewport" content="width=device-width, user-scalable=no" />
      {/* kitchen-sink: no-blink-marquee */}
      {/* @ts-expect-error - deliberate obsolete element for the check fixture */}
      <marquee>Breaking news ticker</marquee>
    </div>
  );
}

/* kitchen-sink: no-auto-refresh */
export function scheduleRedirect() {
  setTimeout(() => {
    window.location.href = "/next";
  }, 5000);
}
