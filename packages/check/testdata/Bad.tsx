export function Bad() {
  return (
    <div>
      <img src="/x.png" />
      <form action="/paiement">
        <input type="password" autoComplete="current-password" name="card" />
        <div aria-label="Sélectionnez tous les feux tricolores">Captcha images</div>
        <button type="submit">Payer</button>
      </form>
      <ReCAPTCHA sitekey="x" />
      <button type="button" className="transition-all" onClick={() => {}}>
        Animer
      </button>
      <a href="/details">cliquez ici</a>
    </div>
  );
}
