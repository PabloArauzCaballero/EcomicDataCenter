import { createHash } from 'node:crypto';
import { chromium, type Browser, type BrowserContext } from 'playwright';

/**
 * El navegador con que se visitan las redes y las webs de las empresas.
 *
 * Chromium sin ventana se anuncia como «HeadlessChrome» en su agente de
 * usuario, y varias webs bolivianas —la de Tigo entre ellas— le devuelven una
 * página vacía de 4 KB en vez de la portada. Se usa la versión real del motor
 * con el agente de un Chrome de escritorio; nada más. No se resuelven
 * captchas ni se esquivan muros de inicio de sesión: lo que una red esconde
 * detrás de uno se registra como `BLOCKED`.
 */

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

export async function openContext(
  browser: Browser,
  storageState?: string,
): Promise<BrowserContext> {
  const major = browser.version().split('.')[0] ?? '141';
  return browser.newContext({
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    viewport: { width: 1366, height: 900 },
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    ...(storageState ? { storageState } : {}),
  });
}

export const sleep = (milliseconds: number): Promise<void> =>
  new Promise((done) => setTimeout(done, milliseconds));

/** Una pausa al azar entre `min` y `max` segundos: ninguna red ve un compás fijo. */
export function pause(minSeconds: number, maxSeconds: number): Promise<void> {
  return sleep((minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1_000);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
