import {
  documentStatesInstant,
  materialEventAssertion,
  parseMaterialEvents,
} from '../bbv-material-events';

// Captured verbatim from the exchange's material events listing.
const LISTING = `
<div class="bbvpress-item__content">
  <h3 class="bbvpress-item__title">BOLSA BOLIVIANA DE VALORES S.A.</h3>
  <h4 class="bbvpress-item__subtitle">Determinaciones de Gerencia General</h4>
  <p class="bbvpress-item__excerpt">La Bolsa Boliviana de Valores S.A. comunica que, el 19 de agosto...</p>
  <div class="bbvpress-item__data">
    <p class="bbvpress-item__date">19/08/2026 15:46:15</p>
    <a class="bbvpress-item__link" href="https://www.bbv.com.bo/acerca-de-la-bolsa/hechos-relevantes-y-noticias/hechos-relevantes/?hecho=666102">
      <span>Ver más</span>
    </a>
  </div>
</div>
<div class="bbvpress-item__content">
  <h3 class="bbvpress-item__title">Pacific Credit Rating S.A.</h3>
  <h4 class="bbvpress-item__subtitle">Calificaci&amp;#8211;n de Riesgo</h4>
  <div class="bbvpress-item__data">
    <p class="bbvpress-item__date">17/08/2026 17:02:43</p>
    <a class="bbvpress-item__link" href="https://www.bbv.com.bo/acerca-de-la-bolsa/hechos-relevantes-y-noticias/hechos-relevantes/?hecho=666078">
      <span>Ver más</span>
    </a>
  </div>
</div>`;

describe('parseMaterialEvents', () => {
  it('reads the filer, the subject, the stamp and the address', () => {
    const events = parseMaterialEvents(LISTING);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      filer: 'BOLSA BOLIVIANA DE VALORES S.A.',
      subject: 'Determinaciones de Gerencia General',
      statedInstant: '19/08/2026 15:46:15',
      eventDate: '2026-08-19',
    });
    expect(events[0]?.url).toContain('hecho=666102');
  });

  it('carries the stamp to an instant in the country it was filed in', () => {
    const [first] = parseMaterialEvents(LISTING);

    // Bolivia holds one offset the whole year, so the instant is unambiguous.
    expect(first?.publishedAt).toBe('2026-08-19T15:46:15-04:00');
    expect(new Date(first?.publishedAt ?? '').toISOString()).toBe('2026-08-19T19:46:15.000Z');
  });

  it('skips an item missing any of its four parts rather than filling it in', () => {
    const withoutStamp = LISTING.replace(
      '<p class="bbvpress-item__date">19/08/2026 15:46:15</p>',
      '',
    );

    expect(parseMaterialEvents(withoutStamp)).toHaveLength(1);
    expect(parseMaterialEvents('<html><body>sin hechos</body></html>')).toEqual([]);
  });

  it('rejects a stamp that is not a date', () => {
    const broken = LISTING.replace('19/08/2026 15:46:15', '99/99/9999 99:99:99');

    expect(parseMaterialEvents(broken)).toHaveLength(1);
  });
});

describe('documentStatesInstant', () => {
  it('confirms a filing whose own page repeats its stamp', () => {
    expect(
      documentStatesInstant('… 19/08/2026 15:46:15 BOLSA BOLIVIANA …', '19/08/2026 15:46:15'),
    ).toBe(true);
  });

  it('does not confirm a page that only carries the calendar date', () => {
    // A date alone leaves the instant unverified; the filing is still loaded,
    // it simply is not treated as date-verified.
    expect(documentStatesInstant('publicado el 19/08/2026', '19/08/2026 15:46:15')).toBe(false);
  });
});

describe('materialEventAssertion', () => {
  it('states the filing without inventing a figure', () => {
    const [first] = parseMaterialEvents(LISTING);
    const assertion = materialEventAssertion(
      first ?? {
        filer: '',
        subject: '',
        statedInstant: '',
        publishedAt: '',
        eventDate: '',
        url: '',
      },
    );

    expect(assertion).toContain('BOLSA BOLIVIANA DE VALORES S.A.');
    expect(assertion).toContain('Determinaciones de Gerencia General');
    // Everything quantitative in a filing lives in its text; restating a number
    // here would put it outside the excerpt that has to support it.
    expect(assertion).not.toMatch(/\d/u);
  });
});
