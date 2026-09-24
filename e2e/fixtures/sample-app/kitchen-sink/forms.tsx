/**
 * Deliberate form violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 */
export function KitchenSinkForms() {
  return (
    <div>
      {/* kitchen-sink: input-label */}
      <input type="email" name="work-email" />
      {/* kitchen-sink: form-error-association */}
      <input aria-invalid="true" aria-label="Email" />
      {/* kitchen-sink: field-grouping */}
      <input type="checkbox" name="interests" value="news" />
      <input type="checkbox" name="interests" value="events" />
      {/* kitchen-sink: fieldset-legend */}
      <fieldset>
        <input type="radio" name="plan" value="free" aria-label="Free" />
      </fieldset>
      {/* kitchen-sink: optgroup */}
      <select aria-label="Choice">
        <optgroup>
          <option>One</option>
        </optgroup>
      </select>
      {/* kitchen-sink: autocomplete-purpose */}
      <input type="email" id="contact-email" aria-label="Email" />
      {/* kitchen-sink: redundant-entry */}
      <input type="email" name="email" autoComplete="email" aria-label="Email" />
      <input
        type="email"
        name="email"
        autoComplete="email"
        aria-label="Email repeat"
      />
      {/* kitchen-sink: accessible-auth */}
      <input type="password" autoComplete="off" aria-label="Password" />
      {/* kitchen-sink: accessible-auth-enhanced */}
      <form>
        <input
          type="password"
          autoComplete="current-password"
          aria-label="Password"
        />
        <PuzzleCaptcha />
      </form>
      {/* kitchen-sink: captcha-alternative */}
      <ReCAPTCHA sitekey="test-site-key" />
      {/* kitchen-sink: error-prevention */}
      <form action="/pay">
        <input name="card" aria-label="Card number" />
        <button type="submit">Place order</button>
      </form>
    </div>
  );
}

function PuzzleCaptcha() {
  return null;
}

function ReCAPTCHA({ sitekey }: { sitekey: string }) {
  return <div data-sitekey={sitekey} />;
}
