import { trafficQuerySchema } from '../admin.schemas';

describe('trafficQuerySchema', () => {
  it('corta los baldes en UTC si nadie pide otra zona', () => {
    expect(trafficQuerySchema.parse({}).timeZone).toBe('UTC');
  });

  it('acepta la zona de La Paz', () => {
    const parsed = trafficQuerySchema.parse({ granularity: 'day', timeZone: 'America/La_Paz' });
    expect(parsed.timeZone).toBe('America/La_Paz');
  });

  it.each(['Marte/Fobos', "UTC'; DROP TABLE operations.traffic_event;--", ''])(
    'rechaza una zona desconocida: %s',
    (timeZone) => {
      expect(trafficQuerySchema.safeParse({ timeZone }).success).toBe(false);
    },
  );
});
