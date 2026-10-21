import type { Page } from '@playwright/test';

/**
 * Collects page crashes, Content Security Policy violations and hydration
 * mismatches, so a journey fails if the CSP ever blocks something the app
 * needs or a page renders differently in the browser than on the server.
 */
export async function watchErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|CSP violation|hydrat/i.test(m.text())) errors.push(m.text().slice(0, 500));
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`));
  });
  return errors;
}
