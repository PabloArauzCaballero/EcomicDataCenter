"""Ordena las 300 fichas por un índice de atención medible, con todas sus piezas a la vista.

Índice (0–100) = 55 % visitas a Wikipedia (es+en, 12 meses) + 25 % audiencia de cuentas verificadas
+ 20 % puesto en Merco Líderes 2025/26. Visitas y audiencia van en escala logarítmica respecto al máximo
observado; una pieza sin dato aporta 0 (el índice mide lo que se puede medir, no fama real). Las menciones
de prensa se publican pero no entran: la búsqueda por nombre mezcla homónimos. Además se publica el puesto dentro del sector, que no depende de qué fuentes cubren a cada
sector. Las cuentas que solo coinciden por nombre se muestran pero no suman.
"""
import json, math, time
from datetime import date
from pathlib import Path

from people_io import load_people

HERE = Path(__file__).parent
COUNTED = ('WIKIDATA_DECLARED', 'PLATFORM_VERIFIED', 'HANDLE_MATCHES_WIKIDATA', 'SOURCE_LINKED')
WEIGHTS = {'views': 0.55, 'social': 0.25, 'merco': 0.20}


def logscale(top, v):
    if not v or v <= 1 or top <= 1:
        return 0.0
    return min(1.0, math.log10(v) / math.log10(top))


def main():
    people = load_people()
    att = {r['slug']: r for r in json.load(open(HERE / 'attention.json', encoding='utf8'))['people']}
    soc = {r['slug']: r['accounts'] for r in json.load(open(HERE / 'social-audience.json', encoding='utf8'))['people']}
    overrides = {k: v for k, v in json.load(open(HERE / 'identity-overrides.json', encoding='utf8')).items() if not k.startswith('_')}
    by_slug = {p['slug']: p for p in people}
    for slug, ov in overrides.items():
        if ov.get('duplicateOf') and ov.get('carryEvidence') and slug in by_slug and ov['duplicateOf'] in by_slug:
            by_slug[ov['duplicateOf']]['evidence'] = by_slug[ov['duplicateOf']]['evidence'] + by_slug[slug]['evidence']
    people = [p for p in people if not overrides.get(p['slug'], {}).get('outOfScope') and not overrides.get(p['slug'], {}).get('duplicateOf')]
    for slug, ov in overrides.items():
        if ov.get('identity') == 'REJECT':
            att[slug] = {'slug': slug, 'status': 'REJECTED'}
            soc[slug] = [x for x in soc.get(slug, []) if x['verification'] == 'SOURCE_LINKED']
    raw = {}
    for p in people:
        a = att.get(p['slug'], {})
        views = (a.get('viewsEs') or 0) + (a.get('viewsEn') or 0)
        declared = {str(h).lower() for h in a.get('accounts', {}).values()}
        for x in soc.get(p['slug'], []):
            if x['verification'] == 'NAME_MATCH' and x['platform'] == 'tiktok' and (x['handle'] or '').lower() in declared:
                x['verification'] = 'HANDLE_MATCHES_WIKIDATA'
        for x in soc.get(p['slug'], []):
            # Una figura con decenas de miles de visitas a Wikipedia y una cuenta de menos de 1.000 seguidores:
            # casi seguro es otra cuenta o una cuenta abandonada. No suma, pero se muestra.
            if x['verification'] in COUNTED and views >= 20000 and (x['followers'] or 0) < 1000:
                x['verification'] = 'IMPLAUSIBLY_SMALL'
        counted = [x for x in soc.get(p['slug'], []) if x['verification'] in COUNTED]
        by_plat = {}
        for x in counted:
            by_plat[x['platform']] = max(by_plat.get(x['platform'], 0), x['followers'] or 0)
        merco = next((e['rank'] for e in p['evidence'] if e['source'] == 'MERCO_LEADERS_2025_26' and e.get('rank')), None)
        news = p['recentNews']['articlesObserved'] if p['recentNews']['status'] == 'DISCOVERY_INDEX_NOT_COMPLETE_CENSUS' else None
        raw[p['slug']] = {'views': views, 'social': sum(by_plat.values()), 'merco': merco, 'news': news or 0,
                          'viewsEs': a.get('viewsEs'), 'viewsEn': a.get('viewsEn'), 'counted': counted, 'byPlatform': by_plat}
    top = {k: max(v[k] for v in raw.values()) for k in ('views', 'social')}
    merco_n = 100
    out = []
    for p in people:
        r, a = raw[p['slug']], att.get(p['slug'], {})
        comp = {
            'views': logscale(top['views'], r['views']), 'social': logscale(top['social'], r['social']),
            'merco': (merco_n + 1 - r['merco']) / merco_n if r['merco'] else 0.0,
        }
        score = round(100 * sum(WEIGHTS[k] * comp[k] for k in WEIGHTS), 1)
        birth = a.get('birth')
        adult = None
        if birth and not birth.endswith('-00-00') and len(birth) >= 10:
            try:
                b = date.fromisoformat(birth)
                adult = (date.today() - b).days / 365.25 >= 18
            except ValueError:
                adult = None
        out.append({
            'slug': p['slug'], 'name': p['name'], 'sector': overrides.get(p['slug'], {}).get('sector', p['sector']), 'score': score,
            'evidence': p['evidence'],
            'identity': overrides.get(p['slug'], {}).get('identity', 'AUTO'), 'identityNote': overrides.get(p['slug'], {}).get('reason'),
            'measured': any(r[k] for k in ('views', 'social', 'merco')),
            'components': {
                'wikipediaViews12m': r['views'] or None, 'wikipediaViewsEs': r['viewsEs'], 'wikipediaViewsEn': r['viewsEn'],
                'verifiedFollowers': r['social'] or None, 'verifiedFollowersByPlatform': r['byPlatform'] or None,
                'mercoRank': r['merco'], 'pressArticles': r['news'] or None,
                'percentiles': {k: round(v, 3) for k, v in comp.items()},
            },
            'wikidata': a.get('wikidata'), 'wikipediaEs': a.get('wikipediaEs'), 'birth': birth,
            'adultReview': 'ADULT_BY_WIKIDATA_BIRTH' if adult else ('MINOR_OR_UNDER_18' if adult is False else 'UNKNOWN'),
            'verifiedAccounts': [{k: x.get(k) for k in ('platform', 'url', 'followers', 'verification', 'evidence')} for x in r['counted']],
            'unverifiedAccounts': [{k: x[k] for k in ('platform', 'url', 'followers', 'verification')} for x in soc.get(p['slug'], [])
                                   if x['verification'] not in COUNTED],
        })
    out.sort(key=lambda x: (-x['score'], x['name']))
    sector_seen = {}
    for i, x in enumerate(out, 1):
        x['rank'] = i
        sector_seen[x['sector']] = sector_seen.get(x['sector'], 0) + 1
        x['sectorRank'] = sector_seen[x['sector']]
    from collections import Counter
    original = json.load(open(HERE / 'research-300.json', encoding='utf8'))['people']
    quality = {
        'padron': {'fichasOriginales': len(original), 'fichasEnElRanking': len(out),
                   'porFuente': dict(Counter(src for p in people for src in {e['source'] for e in p['evidence']}))},
        'identidad': {'coincidenciasWikidata': sum(1 for p in people if att.get(p['slug'], {}).get('status') == 'MATCHED'),
                      'revisadasYAceptadas': sum(1 for o in overrides.values() if o.get('identity') == 'ACCEPT'),
                      'descartadas': sum(1 for o in overrides.values() if o.get('identity') == 'REJECT'),
                      'duplicadasFusionadas': sum(1 for o in overrides.values() if o.get('duplicateOf')),
                      'fueraDeAlcance': sum(1 for o in overrides.values() if o.get('outOfScope'))},
        'cuentas': {'suman': dict(Counter(a['verification'] for x in out for a in x['verifiedAccounts'])),
                    'noSuman': dict(Counter(a['verification'] for x in out for a in x['unverifiedAccounts']))},
        'conVisitasWikipedia': sum(1 for x in out if x['components']['wikipediaViews12m']),
        'conAudienciaVerificada': sum(1 for x in out if x['components']['verifiedFollowers']),
        'conPuestoMerco': sum(1 for x in out if x['components']['mercoRank']),
    }
    doc = {
        'status': 'MEASURED_ATTENTION_INDEX', 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'method': {
            'weights': WEIGHTS,
            'summary': 'Índice de atención medible (0–100): 55 % visitas a Wikipedia (es+en, oct-2025 a sep-2026), 25 % audiencia de cuentas verificadas (TikTok, YouTube, Instagram y Facebook), 20 % puesto en Merco Líderes 2025/26. Visitas y audiencia en escala logarítmica respecto al máximo; sin dato aporta 0. La prensa se publica pero no puntúa (homónimos).',
            'limits': ['Mide atención pública observable, no importancia, aprobación ni mérito.',
                       'Sectores con menos cobertura en las fuentes (empresas, ciencia, medios) quedan abajo en el orden general; el puesto por sector corrige parte de ese sesgo.',
                       'X no entrega cifras sin sesión: sus cuentas no suman. Instagram y Facebook se leen de la vista pública de la página (cifra redondeada en Instagram).',
                       'Una cuenta suma solo si Wikidata la declara oficial, TikTok la marca verificada con el nombre de la persona, una fuente oficial o de prensa seria la enlaza, o su usuario coincide con una cuenta declarada en Wikidata; las que solo coinciden por nombre no suman.'],
            'measuredPeople': sum(1 for x in out if x['measured']),
            'quality': quality,
        },
        'people': out,
    }
    json.dump(doc, open(HERE / 'ranking-top300.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(out), 'fichas;', doc['method']['measuredPeople'], 'con alguna medición')
    for x in out[:20]:
        print(x['rank'], x['name'], x['sector'], x['score'], x['components']['wikipediaViews12m'], x['components']['verifiedFollowers'], x['components']['mercoRank'])


if __name__ == '__main__':
    main()
