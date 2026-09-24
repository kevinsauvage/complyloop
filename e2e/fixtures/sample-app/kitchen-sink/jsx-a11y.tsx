/**
 * Deliberate jsx-a11y violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 * NOTE: no empty headings — e2e/webhook.spec.ts requires the empty-heading
 * control to pass at a clean baseline.
 */
export function KitchenSinkJsxA11y() {
  return (
    <div>
      {/* kitchen-sink: img-alt */}
      <img src="/banner.png" />
      {/* kitchen-sink: anchor-name */}
      <a href="/about" />
      {/* kitchen-sink: aria-activedescendant */}
      <div aria-activedescendant="option-1">Combobox value</div>
      {/* kitchen-sink: aria-props */}
      <div aria-foo="bar">Custom ARIA</div>
      {/* kitchen-sink: aria-role */}
      <div role="foo">Unknown role</div>
      {/* kitchen-sink: autocomplete-valid */}
      <input type="text" autoComplete="foo" aria-label="Nickname" />
      {/* kitchen-sink: keyboard-interaction */}
      <div onClick={() => undefined}>Clickable div</div>
      {/* kitchen-sink: html-lang */}
      <html>
        <head />
        <body />
      </html>
      {/* kitchen-sink: html-lang-valid */}
      <html lang="foo">
        <body />
      </html>
      {/* kitchen-sink: iframe-title */}
      <iframe src="/embed.html" />
      {/* kitchen-sink: no-accesskey */}
      <button type="button" accessKey="s">
        Save
      </button>
      {/* kitchen-sink: aria-hidden-focusable */}
      <button type="button" aria-hidden="true">
        Hidden action
      </button>
      {/* kitchen-sink: no-autofocus */}
      <input autoFocus aria-label="Search" />
      {/* kitchen-sink: noninteractive-tabindex */}
      <div tabIndex={0}>Focusable div</div>
      {/* kitchen-sink: redundant-role */}
      <button type="button" role="button">
        Redundant
      </button>
      {/* kitchen-sink: aria-required-attr */}
      <div role="checkbox">Accept terms</div>
      {/* kitchen-sink: th-scope (scope is only valid on th) */}
      <table>
        <tbody>
          <tr>
            <td scope="row">Name</td>
          </tr>
        </tbody>
      </table>
      {/* kitchen-sink: positive-tabindex */}
      <div tabIndex={1}>Positive tabindex</div>
    </div>
  );
}
