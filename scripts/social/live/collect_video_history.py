"""Lectura histórica de videos de TikTok por cuenta, sin sesión (F1/F2 de PLAN-RETROSPECTIVA-VIDEOS).

Usa la API de Python de yt_dlp con suplantación de navegador (curl_cffi) y pagina el listado plano del perfil
(`creator/item_list`, de más nuevo a más viejo). Es la misma vía pública que usa un visitante sin cuenta:
nunca usa cookies ni sesión y, si ve captcha o pedido de login, PARA esa cuenta y lo registra.

Reanudable: el cursor del paginador (marca de tiempo del último video de la última página guardada) se guarda
en `<cuenta>/state.json`; cada ventana de ~200 videos va a `<cuenta>/win-NNN.jsonl` al terminar. Al reanudar se
pide desde ese cursor (no desde el principio) y se deduplica por id.

Salida (fuera de Git): artifacts/video-history/
  <cuenta>/win-NNN.jsonl   una línea por video (id, timestamp, vistas, likes, comentarios, compartidos, descripción…)
  <cuenta>/state.json      cursor y estado (done = motivo terminal)
  coverage.jsonl           un resumen por cuenta y corrida; motivo: FIN | ERROR | CAPTCHA | LOGIN | TECHO
    FIN     = la lista se agotó antes del tope de 5 años (la cuenta no tiene más videos públicos)
    TECHO   = se alcanzó el tope de 5 años (timestamp < 2021-10-08) -> cuenta completa para el análisis
    ERROR   = la paginación se cortó tras agotar reintentos (reanudable)
    PAUSA   = detenida por --max-seconds (reanudable)
    CAPTCHA = el servicio devolvió verificación; no se reintenta antes de 24 h
    LOGIN   = perfil privado / pide sesión; no se intenta saltar

Uso (siempre con el venv del proyecto y -I):
  python -I collect_video_history.py --handles zonanoob,unitel.bo      # F1: cuentas elegidas
  python -I collect_video_history.py --all                             # F2: todas, de mayor a menor videoCount
  python -I collect_video_history.py --all --retry-error               # reanudar cuentas cortadas por ERROR
"""
from __future__ import annotations

import argparse
import itertools
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'artifacts' / 'video-history'
PROFILES = ROOT / 'artifacts' / 'video-raw' / '2026-10-06' / 'profiles.jsonl'
LIVE_RAW = ROOT / 'artifacts' / 'live-raw'

CUTOFF = int(datetime(2021, 10, 8, tzinfo=timezone.utc).timestamp())
WINDOW = 200
MAX_RETRIES = 6
EMPTY_END = 12
BACKOFF = [5, 10, 20, 40, 80, 120]
CAPTCHA_RE = re.compile(r'captcha|verif(?:y|ication)|are you human|security check', re.I)
LOGIN_RE = re.compile(r'log ?in|private|sign ?in|requires? authentication', re.I)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def log(msg: str) -> None:
    print(f'{datetime.now().strftime("%H:%M:%S")} {msg}', flush=True)


def iso_day(ts: int | None) -> str | None:
    return datetime.fromtimestamp(ts, timezone.utc).strftime('%Y-%m-%d') if ts else None


class Captcha(Exception):
    pass


class LoginWall(Exception):
    pass


def build_extractor():
    """TikTokUserIE con el paginador reanudable desde un cursor propio."""
    import yt_dlp
    from yt_dlp.extractor.tiktok import TikTokUserIE, TikTokIE
    from yt_dlp.networking.impersonate import ImpersonateTarget
    from yt_dlp.utils import ExtractorError

    class Quiet:
        def debug(self, m): pass
        def info(self, m): pass
        def warning(self, m): log(f'  yt-dlp aviso: {m}'[:300])
        def error(self, m): log(f'  yt-dlp error: {m}'[:300])

    ydl = yt_dlp.YoutubeDL({
        'quiet': True, 'no_warnings': False, 'logger': Quiet(),
        'extract_flat': True,
        'impersonate': ImpersonateTarget('chrome'),
        'extractor_retries': 10,
        'sleep_interval_requests': 1,
        'socket_timeout': 30,
    })

    class ResumableUser(TikTokUserIE):
        start_cursor: int | None = None
        next_cursor: int | None = None

        def _entries(self, sec_uid, user_name, fail_early=False):
            display_id = user_name or sec_uid
            seen_ids: set[str] = set()
            empty_streak = 0
            cursor = self.start_cursor or int(time.time() * 1e3)
            for page in itertools.count(1):
                response = self._download_json(
                    self._API_BASE_URL, display_id, f'Downloading page {page}',
                    query=self._build_web_query(sec_uid, cursor))
                text = json.dumps(response)[:2000] if isinstance(response, dict) else str(response)[:2000]
                items = [v for v in (response.get('itemList') or []) if isinstance(v, dict) and v.get('id')] \
                    if isinstance(response, dict) else []
                if not items and CAPTCHA_RE.search(text) and 'hasMorePrevious' not in text:
                    raise Captcha(text[:200])
                batch = []
                for video in items:
                    vid = video['id']
                    if vid in seen_ids:
                        continue
                    seen_ids.add(vid)
                    url = self._create_url(display_id, vid)
                    batch.append(self.url_result(url, TikTokIE, **self._parse_aweme_video_web(
                        video, url, vid, extract_flat=True)))
                old_cursor = cursor
                last_ct = items[-1].get('createTime') if items else None
                cursor = int(last_ct * 1e3) if last_ct else None
                if not cursor or old_cursor == cursor:
                    cursor = old_cursor - 7 * 86_400_000
                more = bool(response.get('hasMorePrevious')) if isinstance(response, dict) else False
                # `hasMorePrevious` llega en False de forma espuria a mitad de historia (medido: alexsg__oficial
                # cortaba en dic-2022 con 726 de 1.702 y la API seguía devolviendo páginas). Solo se acepta el fin
                # tras EMPTY_END páginas vacías seguidas retrocediendo 7 días cada vez.
                empty_streak = 0 if items else empty_streak + 1
                end = cursor < 1472706000000 or empty_streak >= EMPTY_END
                yield {'_page': True, 'items': batch, 'cursor': cursor, 'end': end,
                       'lastTs': int(last_ct) if last_ct else None}
                if end:
                    if fail_early and not seen_ids:
                        raise LoginWall('perfil privado o sin videos visibles')
                    return

    return ydl, ResumableUser(ydl), ExtractorError


def load_accounts(only: list[str] | None) -> list[dict]:
    accounts: dict[str, dict] = {}
    if PROFILES.exists():
        for line in PROFILES.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            p = json.loads(line)
            accounts[p['handle']] = {'handle': p['handle'], 'declared': p.get('videoCount'),
                                     'followers': p.get('followers'), 'src': 'profiles'}
    cands: dict[str, dict] = {}
    for f in sorted(LIVE_RAW.glob('*/candidates.jsonl')):
        for line in f.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            try:
                c = json.loads(line)
            except ValueError:
                continue
            h = c.get('handle')
            if not h or h in accounts:
                continue
            # comerciales / gastronomía (kindOf != null) con título o bio
            if (c.get('commerce') or 0) <= 0 and (c.get('food') or 0) <= 0:
                continue
            if not (c.get('title') or c.get('bio')):
                continue
            prev = cands.get(h)
            score = (c.get('bolivia') or 0, c.get('viewers') or 0)
            if not prev or score > prev['score']:
                cands[h] = {'handle': h, 'declared': None, 'followers': None, 'src': 'candidates', 'score': score}
    ordered = sorted(accounts.values(), key=lambda a: -(a['declared'] or 0))
    ordered += sorted(cands.values(), key=lambda a: a['score'], reverse=True)
    if only:
        by = {a['handle']: a for a in ordered}
        return [by.get(h, {'handle': h, 'declared': None, 'followers': None, 'src': 'manual'}) for h in only]
    return ordered


def read_state(d: Path) -> dict:
    p = d / 'state.json'
    if p.exists():
        try:
            return json.loads(p.read_text(encoding='utf-8'))
        except ValueError:
            pass
    return {}


def write_state(d: Path, st: dict) -> None:
    tmp = d / 'state.json.tmp'
    tmp.write_text(json.dumps(st, ensure_ascii=False), encoding='utf-8')
    tmp.replace(d / 'state.json')


def read_saved(d: Path) -> tuple[set[str], int, list[dict]]:
    ids: set[str] = set()
    rows: list[dict] = []
    nwin = 0
    for f in sorted(d.glob('win-*.jsonl')):
        nwin = max(nwin, int(f.stem.split('-')[1]))
        for line in f.read_text(encoding='utf-8').splitlines():
            if line.strip():
                r = json.loads(line)
                ids.add(r['id'])
                rows.append(r)
    return ids, nwin, rows


def slim(e: dict) -> dict:
    return {
        'id': str(e.get('id')), 'ts': e.get('timestamp'), 'views': e.get('view_count'),
        'likes': e.get('like_count'), 'comments': e.get('comment_count'), 'shares': e.get('repost_count'),
        'dur': e.get('duration'), 'desc': e.get('description') or e.get('title'),
    }


def collect_account(acc: dict, ydl, ie, ExtractorError, args) -> dict:
    handle = acc['handle']
    d = OUT / handle
    d.mkdir(parents=True, exist_ok=True)
    st = read_state(d)
    t0 = time.time()
    if st.get('done') in ('FIN', 'TECHO') and not args.force:
        return {'handle': handle, 'skipped': st['done']}
    if st.get('done') in ('CAPTCHA', 'LOGIN') and not args.retry_blocked:
        return {'handle': handle, 'skipped': st['done']}
    if st.get('done') == 'ERROR' and not args.retry_error and args.skip_error:
        return {'handle': handle, 'skipped': 'ERROR'}

    ids, nwin, rows = read_saved(d)
    cursor = st.get('cursor') if ids else None
    errors: list[str] = []
    motive = 'ERROR'
    buf: list[dict] = []
    fails = 0
    done_flag = False
    paused = False

    def flush():
        nonlocal buf, nwin
        if not buf:
            return
        nwin += 1
        path = d / f'win-{nwin:03d}.jsonl'
        tmp = d / f'win-{nwin:03d}.jsonl.tmp'
        tmp.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in buf), encoding='utf-8')
        tmp.replace(path)
        for r in buf:
            ids.add(r['id'])
        rows.extend(buf)
        buf = []

    while True:
        ie.start_cursor = cursor
        progressed = False
        try:
            info = ie.extract(f'https://www.tiktok.com/@{handle}')
            for page in info['entries']:
                if not page.get('_page'):
                    continue
                progressed = True
                fails = 0
                for e in page['items']:
                    s = slim(e)
                    if s['id'] in ids or any(b['id'] == s['id'] for b in buf):
                        continue
                    if s['ts'] and s['ts'] < CUTOFF:
                        continue
                    buf.append(s)
                cursor = page['cursor']
                last = page['lastTs']
                if len(buf) >= WINDOW:
                    flush()
                    write_state(d, {'cursor': cursor, 'updated': now_iso()})
                    log(f'  {handle}: ventana {nwin:03d} escrita, {len(ids)} videos, hasta {iso_day(last)}')
                if args.max_seconds and time.time() - t0 > args.max_seconds:
                    flush()
                    write_state(d, {'cursor': cursor, 'updated': now_iso()})
                    motive, done_flag = 'PAUSA', False
                    paused = True
                    break
                if page['end']:
                    motive = 'FIN'
                    done_flag = True
                    break
                if (last and last < CUTOFF) or (cursor and cursor < CUTOFF * 1000):
                    motive = 'TECHO'
                    done_flag = True
                    break
            else:
                motive = 'FIN'
                done_flag = True
            if done_flag or paused:
                break
            # el generador terminó sin marcar fin (no debería ocurrir)
            motive, done_flag = 'FIN', True
            break
        except Captcha as exc:
            motive, done_flag = 'CAPTCHA', True
            errors.append(f'CAPTCHA: {exc}'[:200])
            break
        except LoginWall as exc:
            motive, done_flag = 'LOGIN', True
            errors.append(f'LOGIN: {exc}'[:200])
            break
        except ExtractorError as exc:
            msg = str(exc).replace('\n', ' ')[:300]
            if CAPTCHA_RE.search(msg):
                motive, done_flag = 'CAPTCHA', True
                errors.append(f'CAPTCHA: {msg}')
                break
            if 'private' in msg.lower() or 'log into' in msg.lower() or 'login' in msg.lower():
                motive, done_flag = 'LOGIN', True
                errors.append(f'LOGIN: {msg}')
                break
            if 'does not have any videos' in msg:
                motive, done_flag = 'FIN', True
                break
            fails += 0 if progressed else 1
            if progressed:
                fails = 1
            errors.append(msg or '(vacío)')
        except Exception as exc:  # corte de red/SSL de curl_cffi, etc.
            msg = f'{type(exc).__name__}: {exc}'.replace('\n', ' ')[:300]
            if CAPTCHA_RE.search(msg):
                motive, done_flag = 'CAPTCHA', True
                errors.append(f'CAPTCHA: {msg}')
                break
            fails += 0 if progressed else 1
            if progressed:
                fails = 1
            errors.append(msg)
        # corte: guardar lo leído hasta aquí y reintentar desde el cursor
        flush()
        write_state(d, {'cursor': cursor, 'updated': now_iso()})
        if fails > MAX_RETRIES:
            motive = 'ERROR'
            break
        wait = BACKOFF[min(fails - 1, len(BACKOFF) - 1)] if fails > 0 else 2
        log(f'  {handle}: corte ({errors[-1][:120]}); reintento {fails}/{MAX_RETRIES} en {wait}s, '
            f'{len(ids) + len(buf)} videos, cursor {iso_day(int(cursor / 1000)) if cursor else "inicio"}')
        time.sleep(wait)

    flush()
    write_state(d, {'cursor': cursor, 'updated': now_iso(), 'done': motive if done_flag else ('PAUSA' if paused else 'ERROR')})
    all_ts = [r['ts'] for r in rows if r.get('ts')]
    years: dict[str, int] = {}
    for r in rows:
        if r.get('ts'):
            y = str(datetime.fromtimestamp(r['ts'], timezone.utc).year)
            years[y] = years.get(y, 0) + 1
    return {
        'handle': handle, 'declared': acc.get('declared'), 'listed': len(rows),
        'oldest': iso_day(min(all_ts)) if all_ts else None, 'newest': iso_day(max(all_ts)) if all_ts else None,
        'motive': motive, 'windows': nwin, 'byYear': dict(sorted(years.items())),
        'errors': len(errors), 'lastError': errors[-1] if errors else None,
        'seconds': round(time.time() - t0), 'at': now_iso(),
    }


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument('--handles', help='lista separada por comas (F1)')
    ap.add_argument('--all', action='store_true', help='todas las cuentas, de mayor a menor videoCount (F2)')
    ap.add_argument('--max-seconds', type=int, default=0, help='pausa la cuenta (reanudable) tras N s; 0 = sin tope')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--force', action='store_true', help='releer también las ya terminadas')
    ap.add_argument('--retry-error', action='store_true', help='(por defecto ya se reintentan las cortadas por ERROR)')
    ap.add_argument('--skip-error', action='store_true', help='no reintentar las cortadas por ERROR')
    ap.add_argument('--retry-blocked', action='store_true', help='reintentar CAPTCHA/LOGIN (esperar 24 h antes)')
    args = ap.parse_args()
    if not args.handles and not args.all:
        ap.error('indicar --handles o --all')
    OUT.mkdir(parents=True, exist_ok=True)
    accounts = load_accounts(args.handles.split(',') if args.handles else None)
    if args.limit:
        accounts = accounts[:args.limit]
    ydl, ie, ExtractorError = build_extractor()
    log(f'cuentas: {len(accounts)}; tope {iso_day(CUTOFF)}; salida {OUT}')
    captchas = 0
    for i, acc in enumerate(accounts, 1):
        log(f'[{i}/{len(accounts)}] @{acc["handle"]} declarados={acc.get("declared")}')
        try:
            res = collect_account(acc, ydl, ie, ExtractorError, args)
        except KeyboardInterrupt:
            log('interrumpido; lo escrito queda y se reanuda solo')
            return 130
        if res.get('skipped'):
            log(f'  omitida ({res["skipped"]})')
            continue
        with (OUT / 'coverage.jsonl').open('a', encoding='utf-8') as fh:
            fh.write(json.dumps(res, ensure_ascii=False) + '\n')
        log(f'  => {res["motive"]} listados={res["listed"]} declarados={res["declared"]} '
            f'más viejo={res["oldest"]} errores={res["errors"]} {res["seconds"]}s')
        captchas = captchas + 1 if res['motive'] == 'CAPTCHA' else 0
        if captchas >= 3:
            log('3 cuentas seguidas con CAPTCHA: se detiene la corrida (esperar 24 h)')
            return 3
    log('fin de la corrida')
    return 0


if __name__ == '__main__':
    sys.exit(main())
