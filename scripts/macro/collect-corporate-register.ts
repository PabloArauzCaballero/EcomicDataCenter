import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORTERS,
  EXPORTER_PREFIX,
  MERCO,
  REPUTATION_EDITIONS,
  REPUTATION_PREFIX,
  REPUTATION_PUBLISHER,
  type ReputationEdition,
} from './corporate-sources';
import { canonicalCompany } from './corporate-aliases';
import { fetchHtml, fetchPage, mercoTables } from './corporate-pages';
import { countPoints, type RegisterPoint, type RegisterSeries } from './annual-register-shape';

/**
 * Recoge quién exporta más y quién está mejor visto, y nada más de cada uno.
 *
 * `corporate-sources` explica por qué estas dos fuentes y no otras, y por qué
 * de la primera se publica el orden y la cuota pero no los dólares. Aquí sólo
 * está el cómo, y el cómo tiene una regla: **no se transcribe, se extrae**. Las
 * páginas —la de Datasur y las trece ediciones de Merco— se descargan en cada
 * corrida, se les toma la huella y las cifras salen de su HTML. Una lista
 * copiada a mano envejece sin avisar; una extraída se rompe el día que la
 * fuente cambia, que es cuando hay que enterarse.
 *
 * Se corre con `yarn corporate:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'corporate-register.json');
/**
 * La cuota, escrita con el punto decimal que el corpus usa.
 *
 * La página la imprime a la española —«9,7%»— y el valor que se guarda tiene
 * que ser un número. La coma se cambia por punto y nada más: la comprobación de
 * anclaje del sembrador entiende las dos ortografías como el mismo número, así
 * que el extracto puede seguir citando la página tal como está escrita.
 */
const decimal = (value: string): string => value.replace(',', '.');

/** Las cien exportadoras, con el puesto y la cuota que la página publica. */
function exporterSeries(text: string, sha256: string, retrievedAt: string): RegisterSeries[] {
  const table = text.slice(text.indexOf('RK EXPORTADOR'));
  const rows = [...table.matchAll(/(\d{1,3}) EXPORTACIONES DE (.+?) ([\d.]+) ([\d,]+)%/gu)];
  if (rows.length < EXPORTERS.expected) {
    throw new Error(
      `el ránking trajo ${rows.length} filas y la página publica ${EXPORTERS.expected}: cambió de forma`,
    );
  }

  const series: RegisterSeries[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const rank = row[1] ?? '';
    const published = (row[2] ?? '').trim();
    const { slug, name: company } = canonicalCompany(published);
    const share = row[4] ?? '';
    if (seen.has(slug)) {
      throw new Error(`«${published}» colapsa al mismo código que otra empresa: ${slug}`);
    }
    seen.add(slug);

    /*
     * La fila entera, con los dólares dentro.
     *
     * El extracto es lo que la fuente dijo; lo que el observatorio publica son
     * las dos series de abajo, y los dólares no están entre ellas. Recortar la
     * prueba para que se pareciera a la publicación sería falsear la prueba.
     */
    const excerpt = row[0] ?? '';
    const base = {
      group: slug,
      groupLabel: company,
      level: 'COMPANY' as const,
      publisher: EXPORTERS.publisher,
      frequency: 'ANNUAL' as const,
      points: [
        {
          period: EXPORTERS.period,
          value: '',
          excerpt,
          sourceUrl: EXPORTERS.url,
          upstreamSha256: sha256,
          retrievedAt,
        },
      ],
    };

    series.push({
      ...base,
      indicatorCode: `${EXPORTER_PREFIX}RANK_${slug}`,
      name: `${company}: puesto entre las exportadoras`,
      measure: 'Puesto en el ránking de exportadoras',
      unit: 'RANK',
      basis:
        'Puesto entre las cien mayores exportadoras de Bolivia en 2024, según registros aduaneros recopilados por Datasur. El valor FOB que la misma fuente publica no se reproduce: su total no cuadra con el del INE.',
      points: base.points.map((point) => ({ ...point, value: rank })),
    });

    series.push({
      ...base,
      indicatorCode: `${EXPORTER_PREFIX}SHARE_PCT_${slug}`,
      name: `${company}: cuota de las exportaciones`,
      measure: 'Cuota de las exportaciones del país',
      unit: 'PERCENT',
      basis:
        'Parte de las exportaciones de 2024 atribuida a la empresa por Datasur. Es una proporción del total que la propia fuente calcula, no del total oficial del INE.',
      points: base.points.map((point) => ({ ...point, value: decimal(share) })),
    });
  }

  return series;
}

/** Una celda de una serie de reputación: el puesto o la puntuación, con su fila. */
function reputationPoint(
  edition: ReputationEdition,
  value: number,
  quote: Record<string, string>,
  sha256: string,
  retrievedAt: string,
): RegisterPoint {
  return {
    period: edition.period,
    value: String(value),
    /*
     * La fila de la tabla, con los nombres de sus columnas. El valor va dentro
     * porque la comprobación de anclaje lo busca ahí, y la empresa va escrita
     * como Merco la escribe: lo que se unifica es la serie, no la cita.
     */
    excerpt: JSON.stringify({ edicion: edition.edition, ...quote }),
    sourceUrl: `${MERCO.url}?edicion=${edition.edicion}`,
    upstreamSha256: sha256,
    retrievedAt,
  };
}

/**
 * Las series de reputación de todas las ediciones.
 *
 * Una serie por empresa y medida, con un punto por edición: así el tablero lee
 * la trayectoria de Sofía de 2013 a hoy como una línea y no como trece filas
 * sueltas. El sectorial es la excepción parcial: una serie por empresa **y
 * sector**, porque Merco renombra y parte sectores de una edición a otra
 * —«HIDROCARBUROS» pasa a «HIDROCARBUROS Y ENERGÍA»— y el nombre de la serie
 * lleva el sector, que es de donde el tablero lo lee.
 */
function reputationSeries(
  pages: ReadonlyArray<{ edition: ReputationEdition; html: string; sha256: string }>,
  retrievedAt: string,
): RegisterSeries[] {
  const series = new Map<string, RegisterSeries>();

  const push = (key: string, make: () => RegisterSeries, point: RegisterPoint): void => {
    const own = series.get(key) ?? make();
    if (own.points.some((existing) => existing.period === point.period)) {
      throw new Error(`${key}: dos puestos en ${point.period}; dos nombres colapsan a la misma empresa`);
    }
    own.points.push(point);
    series.set(key, own);
  };

  const base = (slug: string, company: string) => ({
    group: slug,
    groupLabel: company,
    level: 'COMPANY' as const,
    publisher: REPUTATION_PUBLISHER,
    frequency: 'ANNUAL' as const,
    points: [] as RegisterPoint[],
  });

  for (const { edition, html, sha256 } of pages) {
    const { general, sectors } = mercoTables(html);
    if (general.length !== MERCO.expected) {
      throw new Error(
        `${edition.edition}: el ránking general trajo ${general.length} puestos y Merco publica ${MERCO.expected}`,
      );
    }
    if (!sectors.length) throw new Error(`${edition.edition}: el ránking sectorial vino vacío`);

    for (const seat of general) {
      const { slug, name: company } = canonicalCompany(seat.company);
      const row = { puesto: String(seat.rank), empresa: seat.company, puntuacion: String(seat.score) };
      push(
        `${REPUTATION_PREFIX}MERCO_GEN_${slug}`,
        () => ({
          ...base(slug, company),
          indicatorCode: `${REPUTATION_PREFIX}MERCO_GEN_${slug}`,
          name: `${company}: puesto en Merco Empresas`,
          measure: 'Puesto en Merco Empresas',
          unit: 'RANK',
          basis:
            'Puesto entre las cien empresas con mejor reputación de Bolivia según Merco. Mide reputación percibida, no tamaño ni solvencia.',
        }),
        reputationPoint(edition, seat.rank, row, sha256, retrievedAt),
      );
      push(
        `${REPUTATION_PREFIX}MERCO_SCORE_${slug}`,
        () => ({
          ...base(slug, company),
          indicatorCode: `${REPUTATION_PREFIX}MERCO_SCORE_${slug}`,
          name: `${company}: puntuación en Merco Empresas`,
          measure: 'Puntuación en Merco Empresas',
          unit: 'POINTS',
          basis:
            'Puntuación de Merco en su propia escala: el primero de cada edición vale 10.000 y el centésimo 3.000. Se compara dentro de una edición, no entre ediciones.',
        }),
        reputationPoint(edition, seat.score, row, sha256, retrievedAt),
      );
    }

    for (const seat of sectors) {
      const { slug, name: company } = canonicalCompany(seat.company);
      const code = `${REPUTATION_PREFIX}MERCO_SEC_${slug}`;
      push(
        `${code}|${seat.sector}`,
        () => ({
          ...base(slug, company),
          indicatorCode: code,
          name: `${company}: puesto en ${seat.sector} (Merco)`,
          measure: `Puesto en el sector ${seat.sector}`.slice(0, 120),
          unit: 'RANK',
          basis: `Puesto dentro del sector «${seat.sector}» de Merco Empresas. Mide reputación percibida, no tamaño ni solvencia.`,
        }),
        reputationPoint(
          edition,
          seat.rank,
          { sector: seat.sector, puesto: String(seat.rank), empresa: seat.company },
          sha256,
          retrievedAt,
        ),
      );
    }
  }

  return [...series.values()];
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  console.log('\ncorporate-register.json');

  const exporters = await fetchPage(EXPORTERS.url);
  const series = exporterSeries(exporters.text, exporters.sha256, retrievedAt);
  console.log(`  exportadoras            ${series.length / 2} empresas`);

  const pages = [];
  for (const edition of REPUTATION_EDITIONS) {
    const page = await fetchHtml(`${MERCO.url}?edicion=${edition.edicion}`, MERCO.cookie);
    pages.push({ edition, ...page });
  }
  const reputation = reputationSeries(pages, retrievedAt);
  series.push(...reputation);
  console.log(
    `  Merco Empresas           ${pages.length} ediciones, ${reputation.length} series, ${countPoints(reputation)} puestos`,
  );

  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${SEED}: ${series.length} series, ${countPoints(series)} observaciones`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'la recolección empresarial falló'}\n`,
  );
  process.exitCode = 1;
});
