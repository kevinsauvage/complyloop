/** Collects captcha candidate elements (iframe, class/id/data-sitekey, captcha imgs). */
export function collectCaptchaCandidates(doc: Document = document): Element[] {
  return [
    ...doc.querySelectorAll("iframe"),
    ...doc.querySelectorAll("[class*='captcha' i], [id*='captcha' i], [data-sitekey]"),
    ...doc.querySelectorAll("img[alt*='captcha' i], img[src*='captcha' i]"),
  ];
}
