import { buildIssuers, matchIssuers } from './issuers';
import { dates } from './normalize';
import { legacyEntries, normalizeLegacy } from './legacy';
import { plain, safeLink, quantities } from './text';
import { sha, type Capture } from './http';

describe('ABI evidence and company attribution', () => {
  const issuers = buildIssuers();
  it('does not attach a parent company or a surname to an issuer', () => {
    const codes = matchIssuers(
      'YPFB y ENDE firman acuerdo',
      'Juan Ovando informó el resultado.',
      issuers,
    ).map((m) => m.filerCode);
    expect(codes).not.toContain('OVA');
    expect(codes).not.toContain('EPA');
    expect(codes).not.toContain('TDE');
    expect(matchIssuers('YPFB Andina invierte', '', issuers).map((m) => m.filerCode)).toContain(
      'EPA',
    );
  });
  it('uses boundaries and accepts a valid later occurrence', () => {
    const rows = matchIssuers('xBancoSol BancoSol anuncia crédito', '', issuers);
    expect(rows.find((m) => m.filerCode === 'BSO')?.start).toBe(10);
    expect(rows.find((m) => m.filerCode === 'BSO')?.role).toBe('HEADLINE');
  });
  it('preserves a conflicting source date without inventing a UTC instant', () => {
    expect(dates('2026-01-01T10:00:00', '2026-01-01T09:00:00')).toEqual({
      publicationDay: '2026-01-01',
      publishedAt: null,
      dateQuality: 'CONFLICT',
    });
    expect(dates('2026-01-01T10:00:00', '2026-01-01T14:00:00').publishedAt).toBe(
      '2026-01-01T10:00:00-04:00',
    );
    expect(() => dates('2026-02-30T10:00:00', '2026-02-30T14:00:00')).toThrow();
  });
  it('cleans unsafe links and retains textual evidence', () => {
    expect(safeLink('javascript:alert(1)', 'https://abi.bo')).toBeNull();
    expect(safeLink('/nota?utm_source=x#inicio', 'https://abi.bo')).toBe('https://abi.bo/nota');
    expect(plain('<script>alert(1)</script><p>Banco &amp; crédito</p>')).toBe('Banco & crédito');
    expect(quantities('El 15% del total corresponde a Bs 2 millones.').map((q) => q.text)).toEqual([
      '15%',
      'Bs 2 millones',
    ]);
  });
  it('parses Joomla identity, body and evidence independently of the slug', () => {
    const html =
      '<h1>Banco Unión anuncia inversión</h1><time itemprop="datePublished" datetime="2025-06-01T12:30:00-04:00"></time><div itemprop="articleBody"><p>Banco Unión anunció una inversión de Bs 20 millones.</p><div>Más detalles.</div></div>';
    const source: Capture = {
      url: 'https://historico.abi.bo/index.php/71358-banco',
      sha256: sha(html),
      storage: `evidence/${sha(html)}.gz`,
      retrievedAt: new Date().toISOString(),
      total: null,
      pages: null,
      contentType: 'text/html',
    };
    const entry = legacyEntries(
      '<a href="/index.php/noticias/economia/71358-banco">Banco Unión anuncia inversión</a>',
      36,
      'Economía',
    )[0]!;
    const article = normalizeLegacy(html, entry, source, issuers);
    expect(article.key).toBe('abi:legacy:71358');
    expect(article.text).toContain('Más detalles.');
    expect(article.mentions.map((m) => m.filerCode)).toContain('BUN');
    expect(article.responseSha256).toBe(sha(html));
  });
});
