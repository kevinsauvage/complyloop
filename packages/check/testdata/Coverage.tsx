export function Coverage() {
  return (
    <div>
      <video src="/talk.mp4" />
      <audio src="/podcast.mp3" controls />
      <marquee>News</marquee>
      <p style={{ letterSpacing: "0.12em !important" }}>Locked</p>
      <img src="/org-chart.png" alt="Organization chart for 2026 showing reporting lines across all departments" />
      <table>
        <thead>
          <tr>
            <th>A</th>
            <th>B</th>
            <th>C</th>
            <th>D</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>2</td><td>3</td><td>4</td></tr>
          <tr><td>5</td><td>6</td><td>7</td><td>8</td></tr>
          <tr><td>9</td><td>10</td><td>11</td><td>12</td></tr>
          <tr><td>13</td><td>14</td><td>15</td><td>16</td></tr>
        </tbody>
      </table>
      <div role="dialog">
        <p>Body</p>
      </div>
      <div role="tab" />
      <details>
        <summary />
      </details>
      <p className="text-4xl">Fake heading</p>
      <fieldset>
        <input type="radio" name="plan" value="a" />
      </fieldset>
      <input type="email" id="email" aria-label="Email" />
      <button accessKey="s">Save</button>
      <select>
        <optgroup>
          <option>One</option>
        </optgroup>
      </select>
      <table>
        <tr>
          <th>Name</th>
          <td>Ada</td>
        </tr>
      </table>
      <table role="presentation">
        <tr>
          <th>X</th>
        </tr>
      </table>
      <svg viewBox="0 0 10 10" />
      <figure>
        <img src="/chart.png" alt="Sales" />
        Sales by quarter
      </figure>
      <button role="button">Save</button>
      <div tabIndex={0}>Panel</div>
      <div role="listbox" aria-activedescendant="opt-1">
        <div id="opt-1" role="option">
          One
        </div>
      </div>
      <blockquote cite="https://example.com" />
      <button className="outline-none">No ring</button>
      <input type="password" autoComplete="off" aria-label="Password" />
      <div draggable onDragStart={() => {}} />
      <input aria-invalid="true" aria-label="Email" />
      <p style={{ color: "red" }}>Solo color</p>
      <input type="email" name="email" autoComplete="email" aria-label="Email" />
      <input type="email" name="email" autoComplete="email" aria-label="Email again" />
    </div>
  );
}
