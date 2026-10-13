"""Export observed progress, unresolved coverage, and source-linked individual text reviews."""

import argparse
import collections
import csv
import gzip
import hashlib
import json
import re
from datetime import datetime
from history_store import Store, PLAN, PLATFORMS, load, now


def export_csv(path, fields, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore', lineterminator='\n')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v for k, v in row.items()})


def report(run):
    store = Store(run)
    exports = store.path / 'exports'
    exports.mkdir(exist_ok=True)
    dossiers = exports / 'people'
    dossiers.mkdir(exist_ok=True)
    people = load(store.path / 'people.json')['people']
    searched = {}
    for path in store.path.glob('web-discovery-*.json'):
        for row in load(path)['rows']:
            searched[row['person_id']] = row
    rejected = {r['account_key'] for r in store.events('lead-reviews') if r['status'] == 'REJECTED'}
    all_leads = store.leads()
    leads = [r for r in all_leads if r['account_key'] not in rejected]
    reviews = {(r['person_id'], r['account_key']): r for r in store.events('account-reviews') if r['status'] == 'CORROBORATED'}
    probes = {r['account_key']: r for r in store.events('account-probes')}
    inventory = {r['post_id']: r for r in store.events('post-inventory')}
    dates = {r['post_id']: r for r in store.events('post-date-evidence')}
    for post_id, date in dates.items():
        if post_id in inventory and inventory[post_id]['account_key'] == date['account_key']:
            inventory[post_id] = {**inventory[post_id], 'published_at': date['published_at'],
                'date_precision': date['date_precision'], 'window_membership': date['window_membership'],
                'date_evidence_sha256': date['evidence_sha256']}
    facebook = {r['post_id']: r for r in store.events('facebook-visible-posts')}
    tiktok = {r['post_id']: r for r in store.events('tiktok-visible-posts')}
    instagram = {r['post_id']: r for r in store.events('instagram-embed-posts')}
    rss = {}
    for row in store.events('rss-posts'):
        rss[(row['person_id'], row['post_id'])] = row
    annotations = {r['post_id']: r for r in store.events('text-reviews')}
    incidents = store.events('access-incidents')
    index = []
    for person in people:
        pid = person['slug']
        if not re.fullmatch(r'P_[A-Z0-9_]+', pid):
            raise ValueError('Unsafe person identifier')
        accounts = [a for a in leads if a['person_id'] == pid]
        confirmed = [a for a in accounts if (a['person_id'], a['account_key']) in reviews]
        posts = [r for r in inventory.values() if r['person_id'] == pid]
        text_reviews = [r for r in annotations.values() if r['person_id'] == pid]
        observed_rss = [r for r in rss.values() if r['person_id'] == pid]
        row = {'person_id': pid, 'name': person['name'], 'sector': person['sector'],
               'web_search_status': searched.get(pid, {}).get('status', 'PENDING'),
               'account_candidates': len(accounts), 'corroborated_accounts': len(confirmed),
               'profile_reads': sum(a['account_key'] in probes for a in accounts),
               'youtube_entries_all_dates': len(posts), 'rss_observations_candidates': len(observed_rss),
               'individual_text_reviews': len(text_reviews), 'full_audiovisual_reviews': 0,
               'historical_windows_proven_complete': 0, 'overall_status': 'INCOMPLETE'}
        index.append(row)
        lines = [f'# Avance de investigación de {person["name"]}', '',
                 'Estado: **INCOMPLETO**. Esta ficha describe evidencia reunida y trabajo pendiente; no acredita cinco años revisados.', '',
                 f'- Identificador: `{pid}`. Sector: `{person["sector"]}`.',
                 f'- Búsqueda inicial: `{row["web_search_status"]}`.',
                 f'- Cuentas candidatas: {len(accounts)}; corroboradas: {len(confirmed)}.',
                 f'- Entradas de YouTube inventariadas, de todas las fechas: {len(posts)}.',
                 f'- Revisiones individuales de texto capturado: {len(text_reviews)}. Revisiones audiovisuales completas: 0.', '',
                 '**Cuentas y evidencia**', '']
        if not accounts:
            lines.append('No hay una cuenta registrada en esta corrida. Esto no demuestra que la persona carezca de redes sociales.')
        for account in accounts:
            status = 'CORROBORADA' if (account['person_id'], account['account_key']) in reviews else 'PISTA SIN VERIFICAR'
            access = probes.get(account['account_key'], {}).get('status', 'NO_PROBADA')
            lines.append(f'- [{account["platform"]}]({account["url"]}): {status}; acceso `{access}`; fuente `{account["source_kind"]}`.')
        lines.extend(['', '**Revisión individual del texto disponible**', ''])
        if not text_reviews:
            lines.append('Pendiente. No se han emitido conclusiones individuales de contenido para esta persona.')
        for annotation in text_reviews:
            lines.append(f'- [{annotation["post_id"]}]({annotation["url"]}) — `{annotation["topic"]}`. {annotation["summary"]} Revisión limitada al texto capturado; audiovisual pendiente.')
        lines.extend(['', '**Cobertura pendiente**', '',
                      'Las seis redes y sus 60 ventanas deben resolverse por cuenta verificada. La enumeración actual de un canal y sus feeds recientes no prueban completitud del periodo 2021-10-08/2026-10-08. Fechas heredadas aproximadas no se usan como serie histórica exacta.', ''])
        (dossiers / (pid + '.md')).write_text('\n'.join(lines), encoding='utf-8')
    export_csv(exports / 'people-progress.csv', list(index[0]), index)
    search_export = []
    for pid, search in searched.items():
        for result in search.get('results', []) or [{}]:
            search_export.append({'person_id': pid, 'name': search.get('name'),
                'query': search.get('query'), 'searched_at': search.get('searched_at'),
                'status': search.get('status'), 'result_title': result.get('title'),
                'result_url': result.get('url'), 'identity_verification': 'NOT_ESTABLISHED_BY_SEARCH'})
    export_csv(exports / 'initial-web-discovery.csv', ['person_id', 'name', 'query', 'searched_at',
               'status', 'result_title', 'result_url', 'identity_verification'], search_export)
    export_csv(exports / 'profile-observations.csv', ['person_id', 'account_key', 'platform', 'url',
               'retrieved_at', 'http_status', 'status', 'page_title', 'metadata', 'evidence_sha256'], probes.values())
    account_rows = [{**a, 'corroboration_status': 'CORROBORATED' if (a['person_id'], a['account_key']) in reviews else 'UNVERIFIED',
                     'access_status': probes.get(a['account_key'], {}).get('status', 'NOT_PROBED')} for a in leads]
    export_csv(exports / 'accounts.csv', ['person_id', 'platform', 'url', 'account_key', 'source_kind', 'source_url', 'corroboration_status', 'access_status'], account_rows)
    export_csv(exports / 'rejected-account-leads.csv', ['person_id', 'platform', 'url', 'account_key', 'source_kind', 'source_url'], [r for r in all_leads if r['account_key'] in rejected])
    export_csv(exports / 'youtube-inventory.csv', ['person_id', 'account_key', 'post_id', 'url', 'surface', 'title', 'duration_seconds', 'published_at', 'date_precision', 'window_membership', 'date_evidence_sha256', 'review_status', 'evidence_sha256'], inventory.values())
    export_csv(exports / 'facebook-visible-posts.csv', ['person_id', 'account_key', 'post_id', 'text', 'links', 'published_at', 'date_precision', 'captured_at', 'evidence_sha256'], facebook.values())
    export_csv(exports / 'tiktok-candidate-grid.csv', ['person_id', 'account_key', 'identity_status', 'post_id', 'url', 'text', 'views_display', 'published_at', 'date_precision', 'captured_at', 'evidence_sha256'], tiktok.values())
    export_csv(exports / 'instagram-embed-posts.csv', ['person_id', 'account_key', 'post_id', 'url', 'embed_url', 'caption', 'published_at', 'date_precision', 'audiovisual_review_complete', 'retrieved_at', 'evidence_sha256'], instagram.values())
    export_csv(exports / 'recent-rss-observations.csv', ['person_id', 'account_key', 'identity_status', 'post_id', 'url', 'title', 'published_at', 'window_membership', 'views', 'retrieved_at', 'evidence_sha256'], rss.values())
    export_csv(exports / 'individual-text-reviews.csv', ['person_id', 'post_id', 'url', 'topic', 'summary', 'review_method', 'review_scope', 'status', 'source_capture_key', 'source_sha256', 'text_sha256', 'character_range'], annotations.values())
    # Unknown post totals stay empty. No current evidence closes any five-year monthly cell.
    with (PLAN / 'windows.csv').open(encoding='utf-8-sig', newline='') as stream:
        windows = list(csv.DictReader(stream))
    coverage_fields = ['person_id', 'platform', 'window_id', 'start_inclusive', 'end_exclusive',
                       'discovery_status', 'candidate_accounts', 'corroborated_accounts',
                       'enumeration_status', 'review_status', 'posts_in_period_total', 'gap_reason']
    coverage_count = 0
    with gzip.open(exports / 'coverage-execution.csv.gz', 'wt', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=coverage_fields, lineterminator='\n')
        writer.writeheader()
        for person in people:
            for platform in PLATFORMS:
                candidates = [a for a in leads if a['person_id'] == person['slug'] and a['platform'] == platform]
                confirmed = sum((a['person_id'], a['account_key']) in reviews for a in candidates)
                for window in windows:
                    writer.writerow({'person_id': person['slug'], 'platform': platform,
                        'window_id': window['window_id'], 'start_inclusive': window['start_inclusive'],
                        'end_exclusive': window['end_exclusive'],
                        'discovery_status': 'INITIAL_WEB_SEARCH_DONE' if person['slug'] in searched else 'PENDING',
                        'candidate_accounts': len(candidates), 'corroborated_accounts': confirmed,
                        'enumeration_status': 'UNKNOWN_PERIOD_COVERAGE', 'review_status': 'INCOMPLETE',
                        'posts_in_period_total': None,
                        'gap_reason': 'Identity, complete historical enumeration and all applicable media require further evidence'})
                    coverage_count += 1
    assert len(index) == 300 and coverage_count == 108000
    account_coverage_fields = ['person_id', 'platform', 'account_key', 'account_url', 'identity_status',
                              'window_id', 'start_inclusive', 'end_exclusive', 'observed_dated_posts',
                              'observed_dated_posts_with_text_review', 'posts_in_period_total',
                              'enumeration_status', 'review_status']
    with gzip.open(exports / 'account-coverage.csv.gz', 'wt', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=account_coverage_fields, lineterminator='\n')
        writer.writeheader()
        for account in leads:
            key = (account['person_id'], account['account_key'])
            account_dates = [d for d in dates.values() if (d['person_id'], d['account_key']) == key]
            for window in windows:
                start = datetime.fromisoformat(window['start_inclusive'])
                end = datetime.fromisoformat(window['end_exclusive'])
                observed = [d for d in account_dates if start <= datetime.fromisoformat(d['published_at']) < end]
                writer.writerow({'person_id': account['person_id'], 'platform': account['platform'],
                    'account_key': account['account_key'], 'account_url': account['url'],
                    'identity_status': 'CORROBORATED' if key in reviews else 'PENDING_ATTRIBUTION',
                    'window_id': window['window_id'], 'start_inclusive': window['start_inclusive'],
                    'end_exclusive': window['end_exclusive'], 'observed_dated_posts': len(observed),
                    'observed_dated_posts_with_text_review': sum(d['post_id'] in annotations for d in observed),
                    'posts_in_period_total': None, 'enumeration_status': 'UNKNOWN_PERIOD_COVERAGE',
                    'review_status': 'INCOMPLETE'})
    status = {'generated_at': now(), 'overall_status': 'INCOMPLETE_ACCESS_DEPENDENCIES',
              'people': len(index), 'people_initially_searched': len(searched),
              'unique_account_candidates': len(leads), 'corroborated_accounts': len(reviews),
              'corroborated_people': len({r['person_id'] for r in reviews.values()}),
              'profile_attempts': len(probes), 'profile_statuses': dict(collections.Counter(r['status'] for r in probes.values())),
              'unique_youtube_entries_all_dates': len(inventory),
              'rss_observations_candidates': len(rss),
              'individual_text_reviews': len(annotations), 'prior_text_reviews': 90,
              'posts_with_exact_feed_date_evidence': len(dates),
              'facebook_visible_posts': len(facebook), 'full_audiovisual_reviews': 0,
              'tiktok_candidate_grid_entries': len(tiktok),
              'instagram_public_embeds': len(instagram),
              'closed_historical_windows': 0, 'planned_coverage_cells': coverage_count,
              'candidate_account_window_rows': len(leads) * len(windows),
              'missing_api_access': ['No configured historical API credentials found in current project environments'],
              'blocking_incidents': incidents}
    store.snapshot('progress.json', status)
    summary = ['# Avance real de ejecución del historial de 300 personalidades', '',
               '**Estado: INCOMPLETO.** Hay trabajo ejecutado y dependencias de acceso pendientes. No se ha terminado la revisión de cinco años.', '',
               f'Actualizado: {status["generated_at"]}.', '',
               f'- Personas con búsqueda inicial: {len(searched)} de 300.',
               f'- Cuentas candidatas: {len(leads)}. Cuentas corroboradas: {len(reviews)}, de {status["corroborated_people"]} personas.',
               f'- Lecturas de perfiles: {len(probes)}. Leer metadatos no equivale a leer el historial.',
               f'- Publicaciones de YouTube inventariadas, de todas las fechas: {len(inventory)}. Fechas exactas respaldadas por feeds de canales corroborados: {len(dates)}.',
               f'- Observaciones de feeds recientes, incluidas cuentas candidatas sin atribuir: {len(rss)}.',
               f'- Publicaciones visibles de Facebook capturadas antes del bloqueo: {len(facebook)}.',
               f'- Enlaces visibles de TikTok, en una cuenta candidata pendiente de corroboración: {len(tiktok)}.',
               f'- Leyendas recuperadas de publicaciones públicas de Instagram: {len(instagram)}; fechas y material audiovisual sin revisar.',
               f'- Revisiones individuales de texto: {len(annotations)}; incluyen 90 capturas anteriores y nuevas lecturas de RSS, Facebook e Instagram.',
               '- Revisiones audiovisuales completas: 0. Ventanas históricas cerradas: 0 de 108.000.', '',
               '**Bloqueos comprobados**', '',
               '- YouTube exige captcha en páginas de video y devuelve HTTP 429. Se detuvo esa ruta. Los feeds RSS públicos ofrecen metadatos recientes, no cinco años ni el contenido audiovisual.',
               '- Instagram permitió enumerar 12 enlaces en una grilla, pero al abrir una publicación exigió iniciar sesión.',
               '- Facebook permitió capturar cinco publicaciones de una cuenta corroborada y después exigió iniciar sesión para seguir desplazándose.',
               '- TikTok mostró una cuadrícula pública de 25 enlaces. Abrir un video activó un captcha de puzle; se detuvo esa ruta.',
               '- LinkedIn rechazó una lectura de perfil. Las otras cuentas no se declaran revisadas por esa prueba.',
               '- X devolvió un error HTTP al abrir en navegador el perfil probado; los metadatos obtenidos por otras lecturas no equivalen a un timeline.',
               '- No se encontraron credenciales configuradas para las APIs históricas en los entornos del proyecto.', '',
               '**Datos y evidencia**', '',
               '- [Estado por persona](exports/people-progress.csv). Las 300 fichas de avance están en `exports/people/`.',
               '- [Directorio de cuentas candidatas y corroboradas](exports/accounts.csv).',
               '- [Resultados de búsqueda por persona](exports/initial-web-discovery.csv) y [observaciones de perfiles](exports/profile-observations.csv). Son evidencia de descubrimiento y acceso, no historiales revisados.',
               '- [Inventario individual de YouTube](exports/youtube-inventory.csv).',
               '- [Observaciones recientes de RSS](exports/recent-rss-observations.csv). No sumar como publicaciones nuevas sin deduplicar.',
               f'- [{len(annotations)} revisiones individuales de texto](exports/individual-text-reviews.csv). No equivalen a videos revisados.',
               '- [Publicaciones visibles de Facebook](exports/facebook-visible-posts.csv). Las fechas relativas se conservan sin precisión inventada.',
               '- [Cuadrícula de una cuenta candidata de TikTok](exports/tiktok-candidate-grid.csv). Identidad y fechas pendientes; no son publicaciones históricas verificadas.',
               '- [Leyendas de publicaciones públicas de Instagram](exports/instagram-embed-posts.csv). Leer el embed no cierra el historial ni verifica el video.',
               '- [Cobertura de ejecución](exports/coverage-execution.csv.gz). Los totales desconocidos se mantienen vacíos.', '',
               '- [Cobertura por cuenta y ventana](exports/account-coverage.csv.gz). El conteo observado es un mínimo recuperado; cero observados no significa cero publicaciones.', '',
               '**Despliegue**', '',
               '- [Comprobación de la nueva consulta a Claude y del estado de publicación](DESPLIEGUE.md). El corpus completo no está desplegado.', '',
               'Para completar las etapas restantes se necesita resolver el acceso a los historiales, atribuir las cuentas pendientes, recuperar cada publicación y su multimedia y realizar la revisión y auditoría. Un registro de bloqueo no sustituye esas etapas.', '']
    (store.path / 'AVANCE.md').write_text('\n'.join(summary), encoding='utf-8')
    print(json.dumps({k: v for k, v in status.items() if k not in ('blocking_incidents', 'profile_statuses')}, ensure_ascii=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    report(parser.parse_args().run)
