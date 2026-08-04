export function NewsletterForm() {
  return (
    <form action="/subscribe" method="post">
      <h2>Stay in the loop</h2>
      <input type="email" name="subscriber-email" placeholder="you@example.com" />
      <button type="submit" tabIndex={5}>
        Subscribe
      </button>
    </form>
  );
}
