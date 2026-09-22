import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORTERS,
  EXPORTER_PREFIX,
  REPUTATION_EDITIONS,
  REPUTATION_PREFIX,
  REPUTATION_PUBLISHER,
  type Podium,
  type ReputationEdition,
} from './corporate-sources';
import { canonicalCompany } from './corporate-aliases';
import { fetchPage, pageSlice, pageStates, rankedNames } from './corporate-pages';
import { countPoints, type RegisterPoint, type RegisterSeries } from './annual-register-shape';

/**
 * Recoge quién exporta más y quién está mejor visto, y nada más de cada uno.
 *
 * `corporate-sources` explica por qué estas dos fuentes y no otras, y por qué
 * de la primera se publica el orden y la cuota pero no los dólares. Aquí sólo
 * está el cómo, y el cómo tiene una regla: **no se transcribe, se extrae**. Las
 * dos páginas se descargan en cada corrida, se les toma la huella y las cifras
 * salen de su texto con una expresión regular. Una lista copiada a mano
 * envejece sin avisar; una extraída se rompe el día que la fuente cambia, que
 * es cuando hay que enterarse.
 *
 * Las tres posiciones del podio de 2024 son la excepción, y llevan su propio
 * candado: el artículo las pone en prosa sin numerarlas, así que van declaradas
 * en el catálogo con el trozo exacto de frase que las afirma, y si ese trozo no
 * aparece literal en la página descargada la corrida se detiene. Declarado no
 * es lo mismo que supuesto.
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

function reputationPoint(
  edition: ReputationEdition,
  rank: number,
  company: string,
  quote: string,
  sha256: string,
  retrievedAt: string,
): RegisterPoint {
  return {
    period: edition.period,
    value: String(rank),
    /*
     * El puesto, la empresa y la frase de la que salen. El puesto va en el
     * extracto porque la comprobación de anclaje lo busca ahí, y la frase va
     * porque sin ella el extracto sería una copia de la afirmación en vez de
     * su prueba.
     */
    excerpt: JSON.stringify({
      edicion: edition.edition,
      puesto: String(rank),
      empresa: company,
      cita: quote.slice(0, 600),
    }),
    sourceUrl: edition.url,
    upstreamSha256: sha256,
    retrievedAt,
  };
}

/** El ránking general y el sectorial de una edición del monitor. */
function reputationSeries(
  edition: ReputationEdition,
  text: string,
  sha256: string,
  retrievedAt: string,
): RegisterSeries[] {
  const series: RegisterSeries[] = [];
  const seen = new Set<string>();

  const add = (
    kind: 'GEN' | 'SEC',
    rank: number,
    published: string,
    quote: string,
    sector?: string,
  ): void => {
    const { slug, name: company } = canonicalCompany(published);
    const code = `${REPUTATION_PREFIX}MERCO_${kind}_${slug}`;
    if (seen.has(code)) return;
    seen.add(code);
    series.push({
      indicatorCode: code,
      name: sector
        ? `${company}: puesto en ${sector} (Merco)`
        : `${company}: puesto en Merco Empresas`,
      group: slug,
      groupLabel: company,
      measure: sector ? `Puesto en el sector ${sector}` : 'Puesto en Merco Empresas',
      level: 'COMPANY',
      unit: 'RANK',
      basis: sector
        ? `Puesto dentro del sector «${sector}» en ${edition.edition}. Mide reputación percibida, no tamaño ni solvencia.`
        : `Puesto en el ránking general de ${edition.edition}. Mide reputación percibida, no tamaño ni solvencia.`,
      publisher: REPUTATION_PUBLISHER,
      frequency: 'ANNUAL',
      points: [reputationPoint(edition, rank, published, quote, sha256, retrievedAt)],
    });
  };

  for (const seat of edition.podium) {
    verifyPodium(seat, text, edition);
    add('GEN', seat.rank, seat.company, seat.anchor);
  }

  const general = pageSlice(text, edition.general.from, edition.general.to, edition.edition);
  const ranked = rankedNames(general);
  if (ranked.length < edition.general.expected) {
    throw new Error(
      `${edition.edition}: el ránking general trajo ${ranked.length} posiciones y se esperaban ${edition.general.expected}`,
    );
  }
  for (const { rank, company } of ranked) add('GEN', rank, company, general);

  if (edition.sectors) {
    const sectorial = pageSlice(text, edition.sectors.from, edition.sectors.to, edition.edition);
    const marks = edition.sectors.names
      .map((name) => ({ name, at: sectorial.indexOf(name) }))
      .sort((left, right) => left.at - right.at);
    const missing = marks.filter((mark) => mark.at < 0).map((mark) => mark.name);
    if (missing.length) {
      throw new Error(`${edition.edition}: sectores que ya no aparecen: ${missing.join(', ')}`);
    }
    for (const [index, mark] of marks.entries()) {
      const next = marks[index + 1];
      const block = sectorial.slice(mark.at + mark.name.length, next ? next.at : undefined);
      const ranked = rankedNames(block);
      /*
       * Un sector sin ninguna empresa debajo no es un sector vacío: es un
       * rótulo que se localizó en el sitio equivocado —dentro del nombre de
       * otro sector, o dentro de una razón social— y todo lo que cuelgue de él
       * estaría mal atribuido. Se detiene la corrida en vez de publicarlo.
       */
      if (!ranked.length) {
        throw new Error(`${edition.edition}: el sector «${mark.name}» no trajo ninguna empresa`);
      }
      for (const { rank, company } of ranked) {
        add('SEC', rank, company, `${mark.name}: ${block.trim()}`, mark.name);
      }
    }
  }

  return series;
}

/**
 * Que la frase que sostiene una posición del podio siga ahí.
 *
 * Si no está, la posición pierde su prueba y la corrida se detiene con el
 * nombre de la empresa en el mensaje: este corpus no admite una afirmación sin
 * cita, y menos una que alguien declaró a mano.
 */
function verifyPodium(seat: Podium, text: string, edition: ReputationEdition): void {
  if (!pageStates(text, seat.anchor)) {
    throw new Error(
      `${edition.edition}: la página ya no dice «${seat.anchor}», así que el puesto ${seat.rank} de ${seat.company} se queda sin prueba`,
    );
  }
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  console.log('\ncorporate-register.json');

  const exporters = await fetchPage(EXPORTERS.url);
  const series = exporterSeries(exporters.text, exporters.sha256, retrievedAt);
  console.log(`  exportadoras            ${series.length / 2} empresas`);

  for (const edition of REPUTATION_EDITIONS) {
    const page = await fetchPage(edition.url);
    const own = reputationSeries(edition, page.text, page.sha256, retrievedAt);
    series.push(...own);
    console.log(`  ${edition.edition.padEnd(36)} ${own.length} posiciones`);
  }

  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${SEED}: ${series.length} series, ${countPoints(series)} observaciones`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'la recolección empresarial falló'}\n`,
  );
  process.exitCode = 1;
});
