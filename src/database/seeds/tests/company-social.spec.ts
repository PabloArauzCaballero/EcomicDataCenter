import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { companySocialSchema } from '../schemas/company-social.schema';
import { countBefore, parseCount } from '../../../../scripts/social/company/parse-count';
import { accountUrl, accountsIn } from '../../../../scripts/social/company/social-links';
import { bingTarget, resembles } from '../../../../scripts/social/company/search-account';
import {
  postFigures,
  profileFigures,
} from '../../../../scripts/social/company/platforms/instagram';
import { pageFigures, postsFromBlobs } from '../../../../scripts/social/company/platforms/facebook';
import { initialJson, relativeDate } from '../../../../scripts/social/company/platforms/youtube';
import { linkedinAge } from '../../../../scripts/social/company/platforms/linkedin';
import { completedDeepSlugs } from '../../../../scripts/social/company/deep-progress';

/**
 * Guards the company social accounts (ADR 0027).
 *
 * Every figure here is printed by a platform in its own rounding and language,
 * and every one of them fails in silence elsewhere: «2,030» read as two, a
 * Meta pixel taken for the company's page, a blocked profile stored as zero
 * followers, or a comment's author reaching the seed.
 */
describe('company social accounts', () => {
  it('reads the counts each platform prints', () => {
    expect(parseCount('20K')).toBe(20_000);
    expect(parseCount('2,030')).toBe(2_030);
    expect(parseCount('1,2 mil')).toBe(1_200);
    expect(parseCount('166.183')).toBe(166_183);
    expect(parseCount('61.6K')).toBe(61_600);
    expect(parseCount('3,4 mill.')).toBe(3_400_000);
    expect(parseCount('974 mil')).toBe(974_000);
    expect(parseCount('sin cifra')).toBeNull();
    expect(countBefore('18K seguidores, 58 seguidos, 4,301 publicaciones', /publicaciones/)).toBe(
      4_301,
    );
    expect(countBefore('|61.6K me gusta.21K seguidores.', /seguidores/)).toBe(21_000);
  });

  it('keeps the account and drops what only looks like one', () => {
    expect(accountUrl('https://www.facebook.com/tr?id=259567960900095&ev=PageView')).toBeNull();
    expect(accountUrl('https://www.youtube.com/embed/vJwDSq3MM3w')).toBeNull();
    expect(accountUrl('https://www.instagram.com/p/Dd7UMD1IKb6/')).toBeNull();
    expect(accountUrl('https://www.tiktok.com/@tigobol/video/7467629546704063749')?.url).toBe(
      'https://www.tiktok.com/@tigobol',
    );
    expect(accountUrl('https://www.instagram.com/entel.bolivia/?hl=es-la')?.handle).toBe(
      'entel.bolivia',
    );
    expect(
      accountUrl(
        'https://www.linkedin.com/authwall?trk=gf&sessionRedirect=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Fentelbolivia',
      )?.url,
    ).toBe('https://www.linkedin.com/company/entelbolivia/');
    const found = accountsIn(
      '<a href="https://www.facebook.com/Entel.Bolivia/">f</a><a href="https://facebook.com/Entel.Bolivia">f</a>',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.mentions).toBe(2);
  });

  it('accepts a search hit only when it resembles the company', () => {
    expect(resembles('Tigo', 'Tigo Bolivia (@tigobol) | TikTok', 'tigobol')).toBe(true);
    expect(
      resembles(
        'Banco Nacional de Bolivia',
        'BNB (@banconacionaldeboliviasa)',
        'banconacionaldeboliviasa',
      ),
    ).toBe(true);
    expect(resembles('Banco Nacional de Bolivia', 'Banco Unión', 'bancounion')).toBe(false);
    const href = `https://www.bing.com/ck/a?!&&p=x&u=a1${Buffer.from('https://www.tiktok.com/@tigobol').toString('base64url')}&ntb=1`;
    expect(bingTarget(href)).toBe('https://www.tiktok.com/@tigobol');
  });

  it('reads Instagram, Facebook, YouTube and LinkedIn as they print', () => {
    expect(profileFigures('18K seguidores, 58 seguidos, 4,301 publicaciones - Ver fotos')).toEqual({
      followers: 18_000,
      following: 58,
      postCount: 4_301,
    });
    const post = postFigures(
      '711 likes, 19 comments - pedrito_daza el September 30, 2026: "Cuál es el auto".',
    );
    expect(post).toEqual({
      likes: 711,
      comments: 19,
      publishedAt: '2026-09-30',
      text: 'Cuál es el auto',
    });
    expect(
      pageFigures(
        'Entel Bolivia, La Paz. 974.179 seguidores · 17.980 personas están hablando de esto',
      ),
    ).toMatchObject({
      followers: 974_179,
      talkingAbout: 17_980,
    });
    const blob = {
      post_id: '1',
      comet_sections: {},
      creation_time: 1_790_818_293,
      message: { text: 'Lanzamiento' },
      feedback: {
        reaction_count: { count: 27 },
        comments: { total_count: 1 },
        share_count: { count: 3 },
      },
    };
    expect(postsFromBlobs([blob], 'ENTEL').posts[0]).toMatchObject({
      likes: 27,
      comments: 1,
      shares: 3,
      publishedAt: '2026-10-01',
    });
    expect(
      initialJson('var ytInitialData = {"a":"}{","b":{"c":1}};var meta = 1;', 'ytInitialData'),
    ).toEqual({ a: '}{', b: { c: 1 } });
    const now = new Date('2026-10-01T12:00:00Z');
    expect(relativeDate('hace 9 días', now)).toBe('2026-09-22');
    expect(linkedinAge('3 días', now)).toBe('2026-09-28');
  });

  it('loads a seed with no blocked account counted as zero and no commenter in it', async () => {
    const raw = await readFile(join(__dirname, '..', 'boot', 'company-social.json'), 'utf8');
    const seed = companySocialSchema.parse(JSON.parse(raw) as unknown);
    for (const profile of seed.profiles.filter((row) => row.status !== 'OK')) {
      expect(profile.followers).toBeNull();
    }
    expect(raw).not.toMatch(/"(?:author|username|commenter|userId)"/u);
  });

  it('retries empty deep readings only when explicitly requested', () => {
    const reading = (slug: string, posts: number, status = 'OK') => ({
      profile: { slug, status },
      posts: Array.from({ length: posts }, (_, index) => ({ postId: `${index}` })),
      comments: [],
      html: null,
    });
    const rows = [reading('WITH_POSTS', 2), reading('EMPTY', 0), reading('BLOCKED', 0, 'BLOCKED')];

    expect(completedDeepSlugs(rows as never, false)).toEqual(
      new Set(['WITH_POSTS', 'EMPTY']),
    );
    expect(completedDeepSlugs(rows as never, true)).toEqual(new Set(['WITH_POSTS']));
  });
});
