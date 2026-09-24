/**
 * Deliberate document-structure violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 * NOTE: no empty headings — e2e/webhook.spec.ts requires the empty-heading
 * control to pass at a clean baseline.
 */
export function KitchenSinkStructure() {
  return (
    <div>
      {/* kitchen-sink: heading-order */}
      <h1>Page title</h1>
      <h3>Skipped level</h3>
      {/* kitchen-sink: list-structure */}
      <div>
        <li>Orphan list item</li>
      </div>
      {/* kitchen-sink: p-as-heading */}
      <p className="text-4xl font-bold">Section styled as a heading</p>
      {/* kitchen-sink: empty-th */}
      <table>
        <thead>
          <tr>
            <th />
          </tr>
        </thead>
      </table>
      {/* kitchen-sink: table-caption */}
      <table>
        <tbody>
          <tr>
            <th>Name</th>
          </tr>
          <tr>
            <td>Ada</td>
          </tr>
        </tbody>
      </table>
      {/* kitchen-sink: table-summary */}
      <table>
        <thead>
          <tr>
            <th>Group</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4}>Spanning cell</td>
          </tr>
        </tbody>
      </table>
      {/* kitchen-sink: layout-table-markup */}
      <table role="presentation">
        <tbody>
          <tr>
            <th>Layout header</th>
          </tr>
        </tbody>
      </table>
      {/* kitchen-sink: figure-caption */}
      <figure>
        <img src="/chart.png" alt="Quarterly sales chart" />
        Sales by quarter, in thousands.
      </figure>
      {/* kitchen-sink: blockquote-cite */}
      <blockquote cite="https://example.com/source" />
      {/* kitchen-sink: duplicate-id */}
      <span id="kitchen-sink-dup" />
      <button id="kitchen-sink-dup" type="button" aria-label="Duplicate" />
      {/* kitchen-sink: decorative-ignored */}
      <img src="/border.png" alt="divider" role="presentation" />
    </div>
  );
}
