/**
 * Deliberate accessible-name violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 * NOTE: no empty headings in this directory — e2e/webhook.spec.ts requires
 * the empty-heading control to pass at a clean baseline.
 */
export function KitchenSinkNames() {
  return (
    <div>
      {/* kitchen-sink: button-name */}
      <button type="button">
        <svg viewBox="0 0 10 10" />
      </button>
      {/* kitchen-sink: svg-name */}
      <svg viewBox="0 0 10 10" />
      {/* kitchen-sink: tab-name */}
      <div role="tab" />
      {/* kitchen-sink: summary-name */}
      <details>
        <summary />
      </details>
      {/* kitchen-sink: dialog-name */}
      <div role="dialog">
        <p>Dialog body without a name.</p>
      </div>
    </div>
  );
}
