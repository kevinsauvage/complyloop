/**
 * Shared HTML bodies for layout-table applicability + linearization tests.
 * Wrap with a document shell when loading in Playwright.
 */

/** Explicit layout table (`role="presentation"`). */
export const LAYOUT_TABLE_PRESENTATION_BODY =
  '<table role="presentation"><tr><td>a</td><td>b</td></tr></table>';

/** Implicit layout table: multiple cells, no header markup. */
export const LAYOUT_TABLE_IMPLICIT_BODY = `<table>
  <tr><td>Alpha one</td><td>Bravo two</td></tr>
  <tr><td>Charlie three</td><td>Delta four</td></tr>
</table>`;

/** Real data table with caption / thead / th / scope. */
export const LAYOUT_TABLE_DATA_BODY = `<table>
  <caption>Scores</caption>
  <thead><tr><th scope="col">Nom</th><th scope="col">Points</th></tr></thead>
  <tbody>
    <tr><td>Alice</td><td>10</td></tr>
    <tr><td>Bob</td><td>8</td></tr>
  </tbody>
</table>`;

export function documentWithBody(body: string): string {
  return `<!doctype html><html lang="en"><body>${body}</body></html>`;
}
