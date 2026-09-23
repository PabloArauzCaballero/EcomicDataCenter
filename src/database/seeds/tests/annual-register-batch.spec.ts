import { writeChunk } from '../runners/boot-seed.annual-register.batch';
import type { QueuedPoint, RegisterContext } from '../runners/boot-seed.annual-register.batch';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';

jest.mock('../../models', () => ({
  RawObservationModel: { findAll: jest.fn(), bulkCreate: jest.fn() },
  FactClaimModel: { bulkCreate: jest.fn() },
  ClaimEvidenceModel: { bulkCreate: jest.fn() },
  SourceArtifactModel: { findOne: jest.fn(), create: jest.fn() },
}));

/**
 * Guards the batched writer for the annual registers.
 *
 * It replaced a loop that made five sequential queries per reading, and the
 * reason it can be trusted is not that it is faster: it is that the three
 * things the old loop got right by construction it now has to get right on
 * purpose. A reading already in the database must not be written twice; a claim
 * must hang from its own observation and not from the next one's; and a figure
 * missing from the excerpt kept as evidence must still stop the run.
 *
 * There is no database here on purpose. What is being checked is the shape of
 * what the writer sends — which rows, in which order, with which links — and
 * that is exactly what a real database would not tell you until the corpus was
 * already wrong.
 */

const asMock = <T>(value: T): jest.Mock => value as unknown as jest.Mock;

const observations = asMock(RawObservationModel.bulkCreate);
const observationQuery = asMock(RawObservationModel.findAll);
const claims = asMock(FactClaimModel.bulkCreate);
const evidence = asMock(ClaimEvidenceModel.bulkCreate);
const artifactQuery = asMock(SourceArtifactModel.findOne);
const artifactCreate = asMock(SourceArtifactModel.create);

const reading = (period: string, value: string, excerpt?: string): QueuedPoint =>
  ({
    series: {
      indicatorCode: `DEPT_ACT_VALUE_TARIJA_PETROLEO_Y_GAS`,
      name: 'Petróleo crudo y gas natural en Tarija',
      unit: 'BOB_THOUSANDS_1990',
      publisher: 'INSTITUTO NACIONAL DE ESTADISTICA',
      group: 'TARIJA',
      level: 'ACTIVITY',
      frequency: 'ANNUAL',
    },
    point: {
      period,
      value,
      excerpt: excerpt ?? `{"cifra":"${value}"}`,
      sourceUrl: 'https://nube.ine.gob.bo/index.php/s/abc/download',
      upstreamSha256: 'f'.repeat(64),
      retrievedAt: '2026-09-23T10:00:00Z',
    },
    payload: {
      measures: [{ indicatorCode: 'DEPT_ACT_VALUE_TARIJA_PETROLEO_Y_GAS', value, unit: 'X' }],
    },
    payloadHash: `hash-${period}`,
  }) as unknown as QueuedPoint;

const context = (): RegisterContext =>
  ({
    sourceId: 'source',
    agentRunId: 'run',
    transaction: {},
    artifacts: new Map<string, string>(),
  }) as unknown as RegisterContext;

describe('batched annual register writer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    observationQuery.mockResolvedValue([]);
    observations.mockImplementation((rows: unknown[]) =>
      Promise.resolve(rows.map((_, index) => ({ rawObservationId: String(100 + index) }))),
    );
    claims.mockResolvedValue([]);
    evidence.mockResolvedValue([]);
    artifactQuery.mockResolvedValue(null);
    artifactCreate.mockResolvedValue({});
  });

  it('asks once whether the whole batch is already filed', async () => {
    await writeChunk(context(), [reading('2022', '1'), reading('2023', '2')]);

    expect(observationQuery).toHaveBeenCalledTimes(1);
    expect(observations).toHaveBeenCalledTimes(1);
    expect(observations.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('leaves out the readings the database already holds', async () => {
    observationQuery.mockResolvedValue([{ payloadHash: 'hash-2022' }]);

    const written = await writeChunk(context(), [reading('2022', '1'), reading('2023', '2')]);

    expect(written).toBe(1);
    expect(observations.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('writes nothing at all when the batch is a replay', async () => {
    observationQuery.mockResolvedValue([
      { payloadHash: 'hash-2022' },
      { payloadHash: 'hash-2023' },
    ]);

    const written = await writeChunk(context(), [reading('2022', '1'), reading('2023', '2')]);

    expect(written).toBe(0);
    expect(observations).not.toHaveBeenCalled();
    expect(claims).not.toHaveBeenCalled();
    expect(evidence).not.toHaveBeenCalled();
  });

  /*
   * La comprobación que el lote podría haber roto sin que nada se quejara: cada
   * afirmación cuelga de SU observación. Con `returning` las filas vuelven en el
   * orden en que se mandaron, y de eso depende el emparejamiento; si algún día
   * dejara de ser cierto, esta prueba es la que lo dice.
   */
  it('hangs each claim from its own observation, in order', async () => {
    await writeChunk(context(), [reading('2022', '1'), reading('2023', '2')]);

    const written = claims.mock.calls[0]?.[0] as Array<{
      rawObservationId: string;
      factClaimId: string;
      assertion: string;
    }>;
    expect(written.map((one) => one.rawObservationId)).toEqual(['100', '101']);
    expect(written[0]?.assertion).toContain('en 2022');
    expect(written[1]?.assertion).toContain('en 2023');

    const proof = evidence.mock.calls[0]?.[0] as Array<{ factClaimId: string }>;
    expect(proof.map((one) => one.factClaimId)).toEqual(written.map((one) => one.factClaimId));
  });

  /*
   * Treinta y siete mil lecturas citan treinta cuadernos. Buscar el artefacto
   * una vez por lectura era la mitad del coste de la carga, y recordarlo es el
   * cambio que más tiempo ahorra de los tres.
   */
  it('looks the source workbook up once, however many readings cite it', async () => {
    await writeChunk(context(), [reading('2022', '1'), reading('2023', '2'), reading('2024', '3')]);

    expect(artifactQuery).toHaveBeenCalledTimes(1);
    expect(artifactCreate).toHaveBeenCalledTimes(1);
  });

  it('still stops the run when a figure is absent from the excerpt it cites', async () => {
    await expect(
      writeChunk(context(), [reading('2022', '4321', '{"cifra":"9999"}')]),
    ).rejects.toThrow(/cifras ausentes del registro citado/u);

    expect(observations).not.toHaveBeenCalled();
  });
});
