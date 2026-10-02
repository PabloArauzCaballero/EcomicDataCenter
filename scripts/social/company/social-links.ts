/**
 * Cómo se reconoce, en el HTML de la web de una empresa, la dirección de su
 * cuenta oficial en cada red.
 *
 * La portada de una empresa enlaza sus cuentas en el pie, y ese enlace es la
 * mejor credencial que hay: lo puso la empresa. Pero la misma página trae
 * direcciones de esas redes que NO son la cuenta, y hay que descartarlas:
 *
 * - el píxel de Meta (`facebook.com/tr?id=…`) y sus plugins (`/plugins/`, `/sharer`);
 * - videos sueltos, cortos y embebidos de YouTube (`/watch`, `/shorts/`, `/embed/`);
 * - posts y reels sueltos de Instagram (`/p/`, `/reel/`), que son de quien los subió;
 * - el muro de LinkedIn (`/authwall?…&sessionRedirect=<la cuenta>`), del que se
 *   rescata la dirección real.
 *
 * El handle «obvio» engaña: `instagram.com/tigobolivia` es una cuenta ajena con
 * 203 seguidores; la de Tigo es `tigobol`, y sólo la web lo dice.
 */

export const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin'] as const;
export type Platform = (typeof PLATFORMS)[number];

const LINK =
  /https?:\/\/(?:[a-z0-9-]+\.)?(?:facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|linkedin\.com)\/[^\s"'<>)\\]+/giu;

const RESERVED: Record<Platform, RegExp> = {
  facebook:
    /^(?:tr|plugins|sharer|sharer\.php|share|dialog|login|events|groups|watch|hashtag|help|policies|privacy|business|ads|photo|photo\.php|story\.php|permalink\.php|profile\.php|reel|videos|posts)$/iu,
  instagram:
    /^(?:p|reel|reels|tv|explore|stories|accounts|about|developer|legal|popular|directory)$/iu,
  tiktok: /^(?:embed|tag|music|discover|foryou|legal|login|video)$/iu,
  youtube:
    /^(?:watch|embed|shorts|playlist|results|iframe_api|feed|redirect|live|t|s|yts|about|account)$/iu,
  linkedin:
    /^(?:authwall|feed|jobs|login|signup|shareArticle|sharing|posts|pulse|learning|legal)$/iu,
};

function platformOf(host: string): Platform | null {
  if (/(?:^|\.)(?:facebook|fb)\.com$/iu.test(host)) return 'facebook';
  if (/(?:^|\.)instagram\.com$/iu.test(host)) return 'instagram';
  if (/(?:^|\.)tiktok\.com$/iu.test(host)) return 'tiktok';
  if (/(?:^|\.)youtube\.com$/iu.test(host)) return 'youtube';
  if (/(?:^|\.)linkedin\.com$/iu.test(host)) return 'linkedin';
  return null;
}

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * La dirección canónica de una cuenta, o `null` si el enlace no es una cuenta.
 * Canónica quiere decir sin parámetros, sin barra final y con el host de
 * escritorio, para que dos enlaces a la misma cuenta se reconozcan iguales.
 */
export function accountUrl(
  raw: string,
): { platform: Platform; url: string; handle: string } | null {
  let url: URL;
  try {
    url = new URL(raw.replace(/&amp;/gu, '&'));
  } catch {
    return null;
  }
  const platform = platformOf(url.hostname);
  if (!platform) return null;
  if (platform === 'linkedin' && url.pathname.startsWith('/authwall')) {
    const redirect = url.searchParams.get('sessionRedirect');
    return redirect ? accountUrl(redirect) : null;
  }
  const segments = url.pathname.split('/').filter(Boolean).map(decoded);
  const [first, second] = segments;
  if (!first || RESERVED[platform].test(first)) return null;

  if (platform === 'facebook') {
    // Las páginas nuevas de Facebook viven en /p/<nombre>-<id>/.
    if (first === 'p' && second) {
      return { platform, url: `https://www.facebook.com/p/${second}/`, handle: second };
    }
    if (first === 'pages' && segments.length >= 3) {
      const id = segments[segments.length - 1] ?? '';
      return /^\d+$/u.test(id)
        ? { platform, url: `https://www.facebook.com/${id}`, handle: id }
        : null;
    }
    return { platform, url: `https://www.facebook.com/${first}`, handle: first };
  }
  if (platform === 'instagram') {
    return { platform, url: `https://www.instagram.com/${first}/`, handle: first };
  }
  if (platform === 'tiktok') {
    if (!first.startsWith('@')) return null;
    return { platform, url: `https://www.tiktok.com/${first}`, handle: first.slice(1) };
  }
  if (platform === 'youtube') {
    if (first.startsWith('@'))
      return { platform, url: `https://www.youtube.com/${first}`, handle: first };
    if ((first === 'channel' || first === 'c' || first === 'user') && second) {
      return {
        platform,
        url: `https://www.youtube.com/${first}/${second}`,
        handle: `${first}/${second}`,
      };
    }
    return null;
  }
  if ((first === 'company' || first === 'showcase' || first === 'school') && second) {
    return {
      platform,
      url: `https://www.linkedin.com/${first}/${encodeURIComponent(second)}/`,
      handle: second,
    };
  }
  return null;
}

export interface FoundAccount {
  readonly platform: Platform;
  readonly url: string;
  readonly handle: string;
  /** Cuántas veces la página enlaza esa cuenta: el pie y la cabecera suman dos. */
  readonly mentions: number;
}

/** Las cuentas que un HTML enlaza, la más enlazada primero en cada red. */
export function accountsIn(html: string): FoundAccount[] {
  const counted = new Map<string, FoundAccount>();
  for (const raw of html.match(LINK) ?? []) {
    const account = accountUrl(raw);
    if (!account) continue;
    const key = account.url.toLowerCase();
    const seen = counted.get(key);
    counted.set(key, { ...account, mentions: (seen?.mentions ?? 0) + 1 });
  }
  return [...counted.values()].sort(
    (left, right) => left.platform.localeCompare(right.platform) || right.mentions - left.mentions,
  );
}
