/** Deliberate accessibility violations for Playwright e2e assessment.
 * Keep separate from packages/check/testdata/Bad.tsx (CLI fixture; do not dedupe). */
export function Bad() {
  return (
    <div>
      <img src="/x.png" />
      <button type="button" />
      <a href="/docs" />
    </div>
  );
}
