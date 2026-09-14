/**
 * Shared text heuristics for AST and runtime checks.
 * Audited apps are often French (RGAA) or other non-English locales — patterns
 * include EN + FR + common EU terms; technical tokens (captcha, recaptcha) are locale-agnostic.
 *
 * Use {@link matchesMultilingual} instead of `pattern.test(text)` — JS `\b` does not
 * treat accented letters (e.g. É) as word characters.
 *
 * Runtime evaluate callbacks inject {@link RUNTIME_MATCHES_SRC} (see
 * `runtime/applicability.ts`, `runtime/custom-checks/error-prevention.ts`,
 * `captcha-alternative.ts`, `accessible-auth-enhanced.ts`) — same pattern as
 * hit-capture (`loadHitCapture` / `pageEvaluateWithHitCapture`). Strict CSP on
 * an audited page can block `new Function`; if that surfaces in the wild, fall
 * back to inlined copies.
 */

export function foldAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function matchesMultilingual(pattern: RegExp, text: string): boolean {
  return pattern.test(text) || pattern.test(foldAccents(text));
}

/**
 * Body for `new Function("pattern", "text", RUNTIME_MATCHES_SRC)` inside
 * `page.evaluate`. Assembles foldAccents + matchesMultilingual once so runtime
 * checks do not each re-stringify the pair.
 */
export const RUNTIME_MATCHES_SRC = `${foldAccents.toString()}; ${matchesMultilingual.toString()}; return matchesMultilingual(pattern, text);`;

export const HIGH_RISK =
  /\b(checkout|payment|pay|purchase|order|donat|transfer|withdraw|subscribe|contract|legal|terms|financial|invoice|billing|exam|quiz|test submission|submit application|delete account|cancel subscription|paiement|payer|achat|commande|don\b|virement|retrait|abonnement|souscri|contrat|juridique|l[eéEÉ]gal|conditions|financier|facture|facturation|examen|concours|candidature|supprimer|r[eéEÉ]silier|pago|pagar|compra|pedido|contrato|factura|zahlung|bezahlen|kauf|bestellung|vertrag|rechnung)\b/i;

export const CONFIRM_LABEL =
  /\b(confirm|review|verify|check|double[- ]check|are you sure|final submit|agree and submit|confirmer|confirmation|v[eéEÉ]rifier|v[eéEÉ]rification|r[eéEÉ]viser|r[eéEÉ]vision|relire|contr[oôOÖ]ler|[eêEÊ]tes[- ]vous s[uûUÜ]r|soumission finale|confirmar|revisar|verificar|best[aäAÄ]tigen|[uüUÜ]berpr[uüUÜ]fen|pr[uüUÜ]fen)\b/i;

export const AGREE_LABEL =
  /\b(i agree|accept terms|accept the terms|read and agree|confirm terms|j['\s]?accepte|accepter les conditions|lu et approuv[eéEÉ]|conditions g[eéEÉ]n[eéEÉ]rales|acepto|aceptar|ich stimme zu|akzeptieren)\b/i;

export const CAPTCHA_TOKEN =
  /\b(captcha|recaptcha|hcaptcha|turnstile|challenge|robot|human verification|v[eéEÉ]rification humaine|pas un robot)\b/i;

export const CAPTCHA_ALTERNATIVE =
  /\b(audio|sound|hear|[eéEÉ]coute|[eéEÉ]couter|contact|human|humain|phone|t[eéEÉ]l[eéEÉ]phone|email support|support|alternative|accessibility|accessibilit[eéEÉ]|aide|sonido|escuchar|tel[eéEÉ]fono|ton|h[oöOÖ]ren|kontakt|barrierefreiheit)\b/i;

export const AUTH_CONTEXT =
  /\b(sign in|log in|login|password|authenticate|verification code|one-time|otp|connexion|connecter|mot de passe|authentification|code de v[eéEÉ]rification|iniciar sesi[oóOÓ]n|contrase[nñNÑ]a|anmelden|passwort)\b/i;

export const PUZZLE_CAPTCHA =
  /\b(select all|click all|choose all|identify the|pick the|traffic light|crosswalk|bicycle|image challenge|visual challenge|object recognition|s[eéEÉ]lectionner tout|s[eéEÉ]lectionnez tout|cliquer sur toutes|choisir tous|feux tricolores|passage pi[eéEÉ]ton|v[eéEÉ]lo|d[eéEÉ]fi visuel|reconnaissance d['']objets|seleccionar todo|sem[aáAÁ]foro|paso de peatones)\b/i;

export const CAPTCHA_WITH_CHALLENGE =
  /\b(recaptcha|hcaptcha|funcaptcha|imagecaptcha|challenge)\b/i;

import { PUZZLE_HOST_NAMES as PUZZLE_HOST_LIST } from "./captcha-config.ts";

export const PUZZLE_HOSTS = new Set<string>([...PUZZLE_HOST_LIST]);

/** Exact-match vague link labels (whole accessible name). */
export const VAGUE_LINK_TEXT =
  /^(click here|read more|here|more|suite|lire la suite|ici|en savoir plus|learn more|details|continue|voir plus|plus d'infos|d[eéEÉ]tails|download|submit|go|cliquez ici|cliquer ici|appuyez ici|t[eéEÉ]l[eéEÉ]charger|envoyer|soumettre|continuer|hier|mehr|aqu[iíIÍ]|leer m[aáAÁ]s|continuar|descargar|enviar)$/i;

export const VAGUE_LINK_PREFIX =
  /^(click|tap|press|see|view|open|download|read|learn|go|continue|submit|cliquez|cliquer|appuyez|voir|ouvrir|t[eéEÉ]l[eéEÉ]charger|lire|continuer|envoyer|ver|abrir|descargar|leer|continuar|anzeigen|[oöOÖ]ffnen|herunterladen)\s+(here|more|this|now|details|ici|la suite|plus|d[eéEÉ]tails|hier|m[aáAÁ]s|jetzt|details)$/i;
