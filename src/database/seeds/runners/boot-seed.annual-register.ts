import type { Transaction } from 'sequelize';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { CHUNK, writeChunk } from './boot-seed.annual-register.batch';
import type { QueuedPoint, RegisterContext } from './boot-seed.annual-register.batch';
import { rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { annualRegisterSchema, type AnnualRegisterSeries } from '../schemas/annual-register.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las series anuales que pertenecen a un sitio o a alguien.
 *
 * Seis archivos y un solo cargador, porque todos tienen la misma forma y el
 * mismo problema: son un cuadro de dos entradas —una dimensión que el corpus no
 * tenía, cruzada con los años— y la vista anual del observatorio archiva por
 * `indicator_code` sin columna para esa dimensión. El esquema explica por qué
 * la dimensión viaja dentro del código y repetida en claro.
 *
 * Lo que traen:
 *
 * - **Las cuentas regionales.** Seis medidas del INE por cada uno de los nueve
 *   departamentos y por el país, de 1988 a 2024. Hasta aquí el observatorio
 *   medía un solo Bolivia, y en esa cifra Tarija perdiendo el gas y La Paz
 *   ganando el oro se cancelaban hasta parecer quietud.
 * - **Las exportaciones por departamento y producto.** Lo que cada
 *   departamento vende, en dólares y en toneladas, de 2010 en adelante.
 * - **El registro empresarial.** Quién exportó más en 2024 y quién está mejor
 *   visto según Merco. De lo primero se carga el puesto y la cuota y **no los
 *   dólares**, por lo que `corporate-sources` explica: el total de esa fuente
 *   no cuadra con el del INE y su base no está declarada.
 * - **El producto por actividad económica.** Las once actividades de cada
 *   departamento y las treinta y cinco del país, en tres medidas. Se cargan
 *   desde aquí y en su propio catálogo, porque son cinco veces todo lo demás
 *   junto.
 *
 * Cada punto lleva su procedencia porque una descarga trae un cuadro entero:
 * las diez filas de un cuadro del INE citan el mismo archivo y la misma huella,
 * y el artefacto se concilia por esa huella para que la descarga entre una vez
 * y no diez. Es lo mismo que hace el sembrador de partidas arancelarias, y por
 * la misma razón.
 */

/**
 * Los archivos, con quién los recogió y con qué categoría entran al corpus.
 *
 * Dos identidades y no una, aunque el cargador sea uno solo: todos menos el
 * último salen del colector del INE, y ése de otro que lee dos publicaciones
 * privadas. Un auditor que abra una fila de Potosí y una de una
 * exportadora tiene que ver dos corridas distintas, porque son dos
 * procedencias distintas; meterlas bajo un mismo agente ahorraría una entrada
 * de catálogo y borraría esa diferencia.
 *
 * La categoría no decide nada aguas abajo —el rubro lo pone la vista anual por
 * el prefijo del código— pero queda en la observación cruda, que es lo que
 * alguien lee cuando audita de dónde salió una fila sin el tablero delante.
 */
/** Un archivo de semilla, con quién lo recogió y bajo qué categoría entra. */
interface Register {
  readonly file: string;
  readonly agentCode: string;
  readonly dataCategory: string;
}

const REGISTERS: readonly Register[] = [
  {
    file: 'boot/department-accounts.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'REGIONAL_ACCOUNTS',
  },
  {
    file: 'boot/department-exports.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'FOREIGN_TRADE',
  },
  {
    file: 'boot/corporate-register.json',
    agentCode: 'CORPORATE_REGISTER_BACKFILL',
    dataCategory: 'CORPORATE_REGISTER',
  },
];

/**
 * Los tres cuadros del producto abierto por actividad económica.
 *
 * Misma fuente, misma corrida y misma categoría que las cuentas regionales
 * —son su apertura, no otro corpus— y aun así **catálogo aparte**, por lo que
 * explica `reconcileAnnualActivities`: son treinta y siete mil lecturas contra
 * las siete mil de los otros tres, y el sembrador abre una transacción por
 * catálogo. Van en tres archivos porque el esquema admite cuatrocientas series
 * por archivo y aquí son mil once.
 */
const ACTIVITIES: readonly Register[] = [
  {
    file: 'boot/department-activities-value.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'REGIONAL_ACCOUNTS',
  },
  {
    file: 'boot/department-activities-growth.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'REGIONAL_ACCOUNTS',
  },
  {
    file: 'boot/department-activities-share.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'REGIONAL_ACCOUNTS',
  },
];

type RegisterPoint = AnnualRegisterSeries['points'][number];

/**
 * La carga de un año.
 *
 * `eventDate` cierra el año en vez de abrirlo, como cualquier otra cifra anual
 * de este corpus: un total de un año sólo se conoce cuando el año terminó, y
 * quien ordene por fecha no debería encontrárselo antes.
 */
function annualPayload(
  series: AnnualRegisterSeries,
  point: RegisterPoint,
  dataCategory: string,
): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory,
    eventDate: `${point.period}-12-31`,
    period: point.period,
    frequency: series.frequency,
    measures: [
      {
        indicatorCode: series.indicatorCode,
        priceSide: null,
        value: point.value,
        unit: series.unit,
      },
    ],
    indicatorName: series.name,
    compilerCode: `${series.group}_${series.level}`,
    publisher: series.publisher,
    publisherVerified: true,
    url: point.sourceUrl,
    sha256: point.upstreamSha256,
    storageUri: point.sourceUrl,
  };
}

/**
 * Carga una lista de archivos, acumulando lecturas hasta llenar un lote.
 *
 * El lote se vacía en cuanto se llena y otra vez al terminar cada archivo, de
 * modo que una lectura nunca espera a que se lea el archivo siguiente y la
 * memoria que se sostiene es la de un lote, no la del corpus. Quien quiera
 * saber por qué se escribe así, `boot-seed.annual-register.batch.ts` lo cuenta.
 */
async function loadRegisters(
  registers: readonly Register[],
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const runs = new Map<string, string>();

  for (const register of registers) {
    let agentRunId = runs.get(register.agentCode);
    if (agentRunId === undefined) {
      agentRunId = await reconcileHistoryRun(register.agentCode, transaction);
      runs.set(register.agentCode, agentRunId);
    }

    const context: RegisterContext = {
      sourceId,
      agentRunId,
      transaction,
      artifacts: new Map<string, string>(),
    };
    const loaded = await readSeed(register.file, annualRegisterSchema);
    let queued: QueuedPoint[] = [];

    for (const series of loaded.series) {
      for (const point of series.points) {
        const payload = annualPayload(series, point, register.dataCategory);
        queued.push({ series, point, payload, payloadHash: rawPayloadHash(payload) });
        if (queued.length >= CHUNK) {
          await writeChunk(context, queued);
          queued = [];
        }
      }
    }
    await writeChunk(context, queued);
  }
}

/** Las cuentas regionales, las exportaciones por producto y el registro empresarial. */
export async function reconcileAnnualRegisters(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  await loadRegisters(REGISTERS, sourceId, transaction);
}

/**
 * El producto departamental abierto por actividad económica.
 *
 * Catálogo aparte y no una cuarta entrada de la lista anterior, aunque el
 * cargador sea el mismo. Son treinta y siete mil lecturas contra las siete mil
 * de aquéllas, y el sembrador abre **una transacción por catálogo**: metidas en
 * la misma, un corte a mitad de la carga por actividad se llevaba por delante
 * las cuentas regionales que ya habían entrado, y en un servidor lento eso pasó
 * tres veces seguidas. Separadas, cada una entra o no entra por su cuenta y se
 * puede pedir sola con `--only=annual-activities`.
 */
export async function reconcileAnnualActivities(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  await loadRegisters(ACTIVITIES, sourceId, transaction);
}
