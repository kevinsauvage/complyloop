/** Submits the first HTML5-validated form that has a submit control and a validatable field. */
export function submitFirstValidatableForm(): boolean {
  for (const form of document.querySelectorAll("form")) {
    if (form.hasAttribute("novalidate")) continue;
    const submit = form.querySelector(
      'button[type="submit"], input[type="submit"], button:not([type])',
    );
    if (!submit) continue;
    const field = form.querySelector(
      "input[required], select[required], textarea[required], input[type=email]:not([readonly]), input[type=url]:not([readonly])",
    );
    if (!field) continue;
    if (submit instanceof HTMLElement) submit.click();
    else form.requestSubmit();
    return true;
  }
  return false;
}

/** Whether a control fails native validity or is marked aria-invalid. */
export function isInvalidField(el: Element): boolean {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    return !el.checkValidity();
  }
  return el.getAttribute("aria-invalid") === "true";
}
