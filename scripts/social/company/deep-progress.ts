import type { AccountReading } from './social-types';

/**
 * Cuentas que una pasada profunda ya puede omitir. En el barrido normal una
 * lectura vacía cuenta como intento terminado para que no bloquee a las demás;
 * `retryEmpty` vuelve a abrir únicamente esos intentos sin repetir los útiles.
 */
export function completedDeepSlugs(
  rows: readonly AccountReading[],
  retryEmpty: boolean,
): Set<string> {
  return new Set(
    rows
      .filter((row) => row.profile.status !== 'ERROR' && row.profile.status !== 'BLOCKED')
      .filter((row) => !retryEmpty || row.posts.length > 0)
      .map((row) => row.profile.slug),
  );
}
