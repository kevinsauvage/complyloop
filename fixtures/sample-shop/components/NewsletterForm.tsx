export function NewsletterForm() {
  return (
    <form action="/subscribe" method="post">
      <h2>Stay in the loop</h2>
      <input
        type="email"
        name="subscriber-email"
        id="email"
        placeholder="you@example.com"
        aria-invalid="true"
      />
      <p id="email-error">Enter a valid email.</p>
      <button type="submit" tabIndex={5} id="email">
        Subscribe
      </button>
      <button type="button" aria-hidden="true">
        Hidden focusable
      </button>
    </form>
  );
}
