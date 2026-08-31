export function Coverage() {
  return (
    <div>
      <video src="/talk.mp4" controls />
      <audio src="/podcast.mp3" controls />
      <marquee>News</marquee>
      <p style={{ letterSpacing: "0.12em !important" }}>Locked</p>
      <table>
        <thead>
          <tr>
            <th />
          </tr>
        </thead>
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
    </div>
  );
}
