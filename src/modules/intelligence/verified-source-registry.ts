/**
 * Publisher identity that is established by the downloaded domain instead of by
 * page metadata.
 *
 * Legacy institutional pages in Bolivia publish authoritative tables as bare
 * HTML with no Open Graph, no JSON-LD and no `<meta>` dates, and market data
 * endpoints answer with plain JSON. Neither exposes the metadata
 * `htmlSourceMetadata` looks for, so an otherwise verifiable reading was being
 * treated as an unverified publisher and demoted below the automatic
 * publication threshold.
 *
 * The domain is not self-reported: the collector downloads that exact URL after
 * the SSRF guard resolved it, so whoever discovered the URL — a deterministic
 * parser or the research model — cannot forge the host.
 */

export type VerifiedSourceTier = 'OFFICIAL' | 'MARKET' | 'SECTOR' | 'PRESS';

export interface VerifiedSource {
  /** Registered name of the institution or venue that publishes the domain. */
  readonly publisher: string;
  /**
   * OFFICIAL is an institutional publisher; MARKET is a quoted trading venue;
   * SECTOR is a private compiler that publishes its own figures under its own
   * method; PRESS is a news outlet.
   *
   * The distinction is load-bearing rather than descriptive. An official table
   * and a venue's endpoint state a measurement; an outlet reports one. So a
   * PRESS domain establishes who published an article and never authorises a
   * figure inside it to enter a series — the checks below admit only OFFICIAL.
   *
   * SECTOR sits between the two on purpose. A chamber of commerce publishes a
   * real compilation with a method behind it, which is more than an outlet
   * offers, and it is exactly who a reader asks about construction permits or
   * export volumes that no ministry breaks out. But it is a member
   * organisation reporting on its own members' industry, not a statistics
   * office, so it establishes attribution and stops there: the OFFICIAL-only
   * checks below never widen to it. A research firm that publishes its own
   * survey of a market sits here for the same reason and on the same terms.
   *
   * There is deliberately no tier for a social platform. One existed and ADR
   * 0025 removed it: a platform domain is the one address that establishes
   * nothing, because it serves whatever an account posted and an account can
   * call itself anything. In the monitoring of Bolivia's May 2026 conflict, 39%
   * of the accounts spreading content presented themselves as newsrooms
   * without being any. Rather than registering that surface and warning about
   * it everywhere afterwards, the register simply does not admit it.
   */
  readonly tier: VerifiedSourceTier;
}

const registry = new Map<string, VerifiedSource>([
  // Bolivian institutions that measure. Each of these publishes a table it
  // compiled itself under a mandate to compile it, which is what admits a
  // figure from one of them into a series without a human first agreeing.
  ['bcb.gob.bo', { publisher: 'BANCO CENTRAL DE BOLIVIA', tier: 'OFFICIAL' }],
  ['ine.gob.bo', { publisher: 'INSTITUTO NACIONAL DE ESTADISTICA', tier: 'OFFICIAL' }],
  [
    'asfi.gob.bo',
    { publisher: 'AUTORIDAD DE SUPERVISION DEL SISTEMA FINANCIERO', tier: 'OFFICIAL' },
  ],
  [
    'economiayfinanzas.gob.bo',
    { publisher: 'MINISTERIO DE ECONOMIA Y FINANZAS PUBLICAS', tier: 'OFFICIAL' },
  ],
  ['bbv.com.bo', { publisher: 'BOLSA BOLIVIANA DE VALORES', tier: 'OFFICIAL' }],
  [
    'udape.gob.bo',
    { publisher: 'UNIDAD DE ANALISIS DE POLITICAS SOCIALES Y ECONOMICAS', tier: 'OFFICIAL' },
  ],
  // The national aggregate hides the department that produced it. Santa Cruz
  // runs its own statistics office, and it is the only publisher that breaks
  // out the department the national accounts merely total.
  ['ice.santacruz.gob.bo', { publisher: 'INSTITUTO CRUCENO DE ESTADISTICA', tier: 'OFFICIAL' }],
  ['aduana.gob.bo', { publisher: 'ADUANA NACIONAL DE BOLIVIA', tier: 'OFFICIAL' }],
  ['impuestos.gob.bo', { publisher: 'SERVICIO DE IMPUESTOS NACIONALES', tier: 'OFFICIAL' }],
  ['anh.gob.bo', { publisher: 'AGENCIA NACIONAL DE HIDROCARBUROS', tier: 'OFFICIAL' }],

  // Multilateral compilers. Registered as OFFICIAL for the same reason as a
  // ministry and not as a courtesy: each publishes Bolivia's figures under a
  // documented method and a citable address, and the observatory already loads
  // annual series from two of them. Naming the domain is what stops a
  // redistributed copy from being credited to whoever redistributed it.
  ['worldbank.org', { publisher: 'BANCO MUNDIAL', tier: 'OFFICIAL' }],
  ['imf.org', { publisher: 'FONDO MONETARIO INTERNACIONAL', tier: 'OFFICIAL' }],
  ['un.org', { publisher: 'NACIONES UNIDAS', tier: 'OFFICIAL' }],
  [
    'cepal.org',
    { publisher: 'COMISION ECONOMICA PARA AMERICA LATINA Y EL CARIBE', tier: 'OFFICIAL' },
  ],
  ['iadb.org', { publisher: 'BANCO INTERAMERICANO DE DESARROLLO', tier: 'OFFICIAL' }],
  ['caf.com', { publisher: 'BANCO DE DESARROLLO DE AMERICA LATINA Y EL CARIBE', tier: 'OFFICIAL' }],
  ['ilo.org', { publisher: 'ORGANIZACION INTERNACIONAL DEL TRABAJO', tier: 'OFFICIAL' }],
  [
    'oecd.org',
    { publisher: 'ORGANIZACION PARA LA COOPERACION Y EL DESARROLLO ECONOMICOS', tier: 'OFFICIAL' },
  ],
  ['wto.org', { publisher: 'ORGANIZACION MUNDIAL DEL COMERCIO', tier: 'OFFICIAL' }],
  [
    'fao.org',
    {
      publisher: 'ORGANIZACION DE LAS NACIONES UNIDAS PARA LA ALIMENTACION Y LA AGRICULTURA',
      tier: 'OFFICIAL',
    },
  ],
  [
    'undp.org',
    { publisher: 'PROGRAMA DE LAS NACIONES UNIDAS PARA EL DESARROLLO', tier: 'OFFICIAL' },
  ],

  // Plazas cotizadas. Publican el precio al que se negocia, no un informe sobre
  // él, que es lo que las separa de un medio: la lectura se toma del libro o de
  // la tabla que la propia plaza sirve.
  ['dolarbluebolivia.click', { publisher: 'DOLAR BLUE BOLIVIA', tier: 'MARKET' }],
  /*
   * El libro entre particulares de la bolsa, en bolivianos.
   *
   * Es la única plaza con libro en bolivianos para más de una ficha estable
   * —Bybit, OKX y Bitget devuelven cero para USDC—, así que sin registrarla la
   * pregunta «cuánto cuesta el dólar por cada riel» no tiene fuente. Registrar
   * el dominio no admite nada por sí solo: establece quién sirvió los bytes,
   * que es justo lo que un endpoint JSON no puede declarar por sí mismo.
   */
  ['binance.com', { publisher: 'BINANCE P2P', tier: 'MARKET' }],

  // Trade bodies. These are the only publishers that break out foreign trade by
  // product and department, construction activity, or private-bank aggregates
  // on the calendar a business reads them on. They are also parties with an
  // interest in what their own numbers say, which is precisely why they carry
  // their own tier: attribution, never automatic entry into a series.
  ['ibce.org.bo', { publisher: 'INSTITUTO BOLIVIANO DE COMERCIO EXTERIOR', tier: 'SECTOR' }],
  [
    'cainco.org.bo',
    {
      publisher: 'CAMARA DE INDUSTRIA COMERCIO SERVICIOS Y TURISMO DE SANTA CRUZ',
      tier: 'SECTOR',
    },
  ],
  ['cadecocruz.org.bo', { publisher: 'CAMARA DE LA CONSTRUCCION DE SANTA CRUZ', tier: 'SECTOR' }],
  ['cnc.bo', { publisher: 'CAMARA NACIONAL DE COMERCIO', tier: 'SECTOR' }],
  ['asoban.bo', { publisher: 'ASOCIACION DE BANCOS PRIVADOS DE BOLIVIA', tier: 'SECTOR' }],
  [
    'asofinbolivia.com',
    { publisher: 'ASOCIACION DE ENTIDADES FINANCIERAS ESPECIALIZADAS', tier: 'SECTOR' },
  ],

  // Research compilers. Nobody measures Bolivia's household purchase channels
  // but these, and each publishes under a stated method at a citable address.
  // They are also vendors of the reading they publish, so they land where a
  // chamber lands: the domain establishes who compiled a figure, and nothing
  // more.
  ['kantar.com', { publisher: 'KANTAR WORLDPANEL', tier: 'SECTOR' }],
  ['ipdrs.org', { publisher: 'INSTITUTO PARA EL DESARROLLO RURAL DE SUDAMERICA', tier: 'SECTOR' }],
  // Research houses that read the state's own surveys for a living. They are
  // registered as compilers and not as the census they read: what the domain
  // establishes is that this institute published this reading of it, which is
  // the only claim the register makes on their behalf.
  ['inesad.edu.bo', { publisher: 'INSTITUTO DE ESTUDIOS AVANZADOS EN DESARROLLO', tier: 'SECTOR' }],
  [
    'cecasem.com',
    {
      publisher: 'CENTRO DE CAPACITACION Y SERVICIO PARA LA INTEGRACION DE LA MUJER',
      tier: 'SECTOR',
    },
  ],

  // News outlets. Registered so an article carries the masthead that published
  // it rather than a name scraped from the page, which is what makes coverage
  // attributable — not so that anything they report is treated as measured.
  ['eldeber.com.bo', { publisher: 'EL DEBER', tier: 'PRESS' }],
  ['unitel.bo', { publisher: 'UNITEL', tier: 'PRESS' }],
  ['reduno.com.bo', { publisher: 'RED UNO', tier: 'PRESS' }],
  ['larazon.bo', { publisher: 'LA RAZON', tier: 'PRESS' }],
  ['opinion.com.bo', { publisher: 'OPINION', tier: 'PRESS' }],
  ['brujuladigital.net', { publisher: 'BRUJULA DIGITAL', tier: 'PRESS' }],
  ['erbol.com.bo', { publisher: 'ERBOL', tier: 'PRESS' }],
  ['boliviaverifica.bo', { publisher: 'BOLIVIA VERIFICA', tier: 'PRESS' }],
  ['vision360.bo', { publisher: 'VISION 360', tier: 'PRESS' }],
  ['urgente.bo', { publisher: 'URGENTE BO', tier: 'PRESS' }],
  ['boliviaenergialibre.com', { publisher: 'BOLIVIA ENERGIA LIBRE', tier: 'PRESS' }],
]);

/** Matches a host against a registered domain or any of its subdomains. */
function registeredDomain(host: string): VerifiedSource | undefined {
  for (const [domain, source] of registry) {
    if (host === domain || host.endsWith(`.${domain}`)) return source;
  }
  return undefined;
}

/**
 * Resolves the publisher a URL's domain establishes, or undefined when the
 * domain is not registered and the publisher must come from page metadata.
 */
export function verifiedSource(rawUrl: string | URL): VerifiedSource | undefined {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  return registeredDomain(url.hostname.toLocaleLowerCase('en').replace(/^\[|\]$/gu, ''));
}

/**
 * True when a quoted indicator declares no publication date and the candidate
 * does not claim one either.
 *
 * A daily quotation states the value in force at the moment it is read and
 * never declares a separate publication instant. Demanding one would
 * permanently demote the most authoritative readings the collector has, while
 * there is nothing here that a model could have invented: the candidate asserts
 * no publication date at all.
 *
 * **Widened from OFFICIAL to MARKET on 2026-09-21, deliberately.** The rule was
 * written for a central bank's daily table and excluded trading venues, which
 * cost nothing while the only registered venue stamped its own payloads. An
 * exchange's order book does not: it carries no timestamp field at all, so
 * under the narrow rule every stablecoin reading was demoted to LOW and routed
 * to human review, three times a day, for a series meant to run unattended. The
 * rationale in the paragraph above applies to an order book word for word — it
 * is a measurement in force when read, published without a stamp — so the tier
 * was the wrong axis to have keyed it on.
 *
 * What did **not** widen is the part that carries the risk. PRESS and SECTOR
 * stay out: an outlet reporting a figure and a trade body publishing its own
 * members' numbers are claims about a measurement, not the measurement, and no
 * absent date should admit either into a series. The guards also stay: the
 * record must be a daily indicator, the candidate must claim no date at all, the
 * source must declare none either — so there is nothing to contradict — and the
 * domain must be registered, which means the bytes came from it through the
 * SSRF guard rather than from something that named itself after it.
 */
/**
 * True when the downloaded document states the publication instant itself.
 *
 * A page that repeats the stamp its publisher gave the record is making a
 * stronger claim than a `<meta>` tag, which a site may generate for the page
 * rather than for the thing it describes. Restricted to registered official
 * publishers: on an unregistered domain, a date in the body is only a string.
 */
export function documentStatedPublication(input: {
  readonly statedInDocument: boolean;
  readonly source: VerifiedSource | undefined;
}): boolean {
  return input.statedInDocument && input.source?.tier === 'OFFICIAL';
}

export function undatedQuotedIndicator(input: {
  readonly recordType: string;
  readonly publishedAt: string | null;
  readonly publicationDateAssessment: string;
  readonly source: VerifiedSource | undefined;
}): boolean {
  return (
    input.recordType === 'DAILY_INDICATOR' &&
    input.publishedAt === null &&
    input.publicationDateAssessment === 'UNAVAILABLE' &&
    (input.source?.tier === 'OFFICIAL' || input.source?.tier === 'MARKET')
  );
}
