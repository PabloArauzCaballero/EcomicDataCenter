"""Audita las coincidencias de Wikidata: ¿la entidad hallada es la misma persona de la ficha?

Marca como sospechosa toda coincidencia donde la descripción de Wikidata (a) nombra otra nacionalidad sin
decir boliviano, (b) no encaja con el sector de la ficha, o (c) repite la misma entidad en dos fichas.
Las decisiones revisadas a mano viven en identity-overrides.json y mandan sobre la regla automática.
"""
import json, re, sys
from collections import defaultdict
from pathlib import Path

from people_io import load_people

HERE = Path(__file__).parent
FOREIGN = re.compile(r'ucrania|argentin|brasile|sueco|sueca|italian|español|peruan|chilen|colombian|mexican|estadounidense|american|swedish|ecuatorian|paraguay|urugua|venezolan|french|franc[eé]s|alem[aá]n|german|korean|coreano', re.I)
SECTOR_WORDS = {
    'POLITICS': r'polític|politic|president|alcalde|senador|ministr|diputad|dirigente|sindical|activista|jurista|juez|judge|militar|abogad|embajador|candidat|vicepresident|cocalero|asambleísta',
    'BUSINESS': r'empresari|business|ejecutiv|banquer|economist|industrial|financ|gerente|presidente de',
    'SPORTS': r'fútbol|futbol|football|footballer|atleta|ciclista|piloto|deport|corredor|tenist|nadador|boxe|jugador|entrenador|rally|esquia|gimnast|skat|runner|racer|driver',
    'MEDIA': r'periodista|presentador|influenc|internet|youtuber|tiktok|modelo|actor|actriz|comunicador|escritor|locutor|cantante|humorista|conductor|streamer|reina de belleza',
    'SCIENCE': r'cient[ií]fic|biólog|bióloga|investigador|físic|químic|ingenier|académic|matemátic|médic|doctor|botánic|geólog|ecólog|astrónom|profesor',
    'CULTURE': r'actor|actriz|escritor|pintor|artista|cantante|músic|cine|arquitect|director|poeta|compositor|violin|diseñador|modelo|reina de belleza|cineasta|novelista|dramaturg|fotógraf|escultor|ceramista',
    'CIVIC': r'activista|obispo|sacerdote|arzobispo|sindical|abogad|bishop|archbishop|periodista|defensor|teólogo|cardenal|política|ambiental|feminista',
    'UNCLASSIFIED': r'.',
}


def main():
    people = {p['slug']: p for p in load_people()}
    att = json.loads((HERE / 'attention.json').read_text(encoding='utf8'))['people']
    overrides = {}
    f = HERE / 'identity-overrides.json'
    if f.exists():
        overrides = json.loads(f.read_text(encoding='utf8'))
    by_qid = defaultdict(list)
    for a in att:
        if a['status'] == 'MATCHED':
            by_qid[a['wikidata']].append(a['slug'])
    flags = []
    for a in att:
        if a['status'] != 'MATCHED':
            continue
        p = people[a['slug']]
        desc = a.get('description') or ''
        why = []
        if FOREIGN.search(desc) and not re.search(r'bolivi', desc, re.I):
            why.append('nacionalidad ajena')
        if not re.search(SECTOR_WORDS[p['sector']], desc, re.I):
            why.append(f'descripción no encaja con sector {p["sector"]}')
        if len(by_qid[a['wikidata']]) > 1:
            why.append('misma entidad en varias fichas: ' + ', '.join(by_qid[a['wikidata']]))
        if why:
            ov = overrides.get(a['slug'])
            flags.append({'slug': a['slug'], 'name': p['name'], 'sector': p['sector'], 'label': a['label'], 'description': desc,
                          'wikidata': a['wikidata'], 'why': why, 'override': ov})
    print(len(flags), 'coincidencias sospechosas')
    for x in flags:
        print(f"{x['slug']:<38} {x['sector']:<8} {x['label'][:26]:<26} | {x['description'][:55]:<55} | {'; '.join(x['why'])[:70]} | override={x['override']}")
    return flags


if __name__ == '__main__':
    main()
