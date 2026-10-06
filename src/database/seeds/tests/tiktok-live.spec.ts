import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tiktokLiveSchema } from '../schemas/tiktok-live.schema';
import { eventOf, messageBody } from '../../../../scripts/social/live/live-chat';
import { commerceScore } from '../../../../scripts/social/live/live-room';

/**
 * Guards the TikTok live-selling observations (ADR 0030).
 *
 * The unit of analysis is the market, never the person. These checks fail the
 * build before a commenter's name, a quote or a seller's account could reach
 * the seed, and before a phrase said by fewer than five people is published.
 */
describe('tiktok live selling', () => {
  const seedPath = join(__dirname, '..', 'boot', 'tiktok-live.json');

  it('accepts the published seed', async () => {
    const seed = tiktokLiveSchema.parse(JSON.parse(await readFile(seedPath, 'utf8')));
    expect(seed.rooms.length).toBeGreaterThan(0);
    expect(seed.coverage.length).toBeGreaterThan(0);
  });

  it('never carries who commented or who sells', async () => {
    const forbidden = new Set([
      'author',
      'authors_list',
      'handle',
      'nickname',
      'username',
      'bio',
      'text',
      'raw',
      'title',
    ]);
    const found: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (forbidden.has(key)) found.push(`${path}.${key}`);
          walk(child, `${path}.${key}`);
        }
      }
    };
    walk(JSON.parse(await readFile(seedPath, 'utf8')), '$');
    expect(found).toEqual([]);
  });

  it('refuses a phrase that too few people said', async () => {
    const seed = JSON.parse(await readFile(seedPath, 'utf8')) as Record<string, unknown>;
    const fewPeople = {
      ...seed,
      phrases: [
        { phrase: 'mio', people: 4, lives: 3, rubro: 'CALZADO', emotion: null, signal: 'COMPRA' },
      ],
    };
    const fewLives = {
      ...seed,
      phrases: [
        { phrase: 'mio', people: 9, lives: 2, rubro: 'CALZADO', emotion: null, signal: 'COMPRA' },
      ],
    };
    expect(tiktokLiveSchema.safeParse(fewPeople).success).toBe(false);
    expect(tiktokLiveSchema.safeParse(fewLives).success).toBe(false);
  });

  it('refuses an unknown field, so a new one cannot slip in', async () => {
    const seed = JSON.parse(await readFile(seedPath, 'utf8')) as {
      rooms: Record<string, unknown>[];
    };
    const room = { ...seed.rooms[0], author: 'alguien' };
    expect(tiktokLiveSchema.safeParse({ ...seed, rooms: [room] }).success).toBe(false);
  });

  it('keeps the comment and drops the name of who wrote it', () => {
    expect(
      messageBody({
        body: 'precio de la mochila',
        full: 'Anahi Ramirez precio de la mochila',
        ownerText: 'Anahi Ramirez',
        author: 'Anahi Ramirez',
      }),
    ).toBe('precio de la mochila');
    expect(
      messageBody({
        body: '',
        full: 'Sofi_Fernandez N.º 2 q tamaños son',
        ownerText: 'Sofi_Fernandez N.º 2',
        author: 'Sofi_Fernandez',
      }),
    ).toBe('q tamaños son');
    expect(
      messageBody({ body: '', full: 'texto sin separar', ownerText: 'otra', author: 'persona' }),
    ).toBe('');
  });

  it('reads the events the chat interleaves', () => {
    expect(eventOf('ArcanoBiblico N.º 2 envió Galaxia x 1', 'ArcanoBiblico')).toMatchObject({
      kind: 'gift',
      count: 1,
    });
    expect(eventOf('Saray ha empezado a seguir al organizador', 'Saray')).toEqual({
      kind: 'follow',
    });
    expect(eventOf('Se han omitido algunos comentarios en este LIVE', '')).toBeNull();
    expect(eventOf('', '')).toBeNull();
  });

  it('scores a selling live above a social one', () => {
    const shop = commerceScore({
      title: 'Abriendo mercadería, aprovecha',
      nickname: 'MAUDI IMPORTACIONES',
      bio: 'Envíos a todo Bolivia',
      handle: 'maudi_importaciones',
    });
    const chat = commerceScore({ title: '', nickname: 'nay', bio: '', handle: 'neyb802' });
    expect(shop.commerce).toBeGreaterThan(0);
    expect(shop.bolivia).toBeGreaterThan(0);
    expect(chat.commerce).toBe(0);
  });
});
