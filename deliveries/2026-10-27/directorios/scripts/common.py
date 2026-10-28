"""Shared helpers for directory collectors: HTTP session with pauses, normalization, NDJSON.gz writer."""
import gzip, json, os, re, time, unicodedata, datetime, random
import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
SCRATCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(SCRATCH, "out")
os.makedirs(OUT, exist_ok=True)


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def free_kb():
    import ctypes

    class MS(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
    m = MS(); m.dwLength = ctypes.sizeof(MS)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return m.ullAvailPhys // 1024


def wait_for_ram(min_kb=800000):
    """Regla del coordinador: si queda menos de ~800 MB libres, esperar 60 s y volver a medir."""
    while True:
        f = free_kb()
        if f >= min_kb:
            return f
        print(f"RAM libre {f} KB < {min_kb}; espero 60 s", flush=True)
        time.sleep(60)


class Http:
    def __init__(self, pause=1.0, jitter=0.5, referer=None):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "es-BO,es;q=0.9,en;q=0.8",
                               "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"})
        if referer:
            self.s.headers["Referer"] = referer
        self.pause, self.jitter, self.last, self.n = pause, jitter, 0.0, 0

    def get(self, url, tries=4, **kw):
        self.n += 1
        if self.n % 25 == 1:
            wait_for_ram()
        for i in range(tries):
            wait = self.pause + random.random() * self.jitter - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            try:
                r = self.s.get(url, timeout=60, **kw)
                self.last = time.time()
                if r.status_code in (429, 502, 503, 504):
                    time.sleep(10 * (i + 1))
                    continue
                return r
            except requests.RequestException:
                self.last = time.time()
                time.sleep(5 * (i + 1))
        return None


DEPTS = {
    "la paz": "La Paz", "santa cruz": "Santa Cruz", "cochabamba": "Cochabamba", "oruro": "Oruro",
    "potosi": "Potosí", "chuquisaca": "Chuquisaca", "tarija": "Tarija", "beni": "Beni", "pando": "Pando",
}
# ciudad capital / ciudades grandes -> departamento
CITY_DEPT = {
    "la paz": "La Paz", "el alto": "La Paz", "santa cruz de la sierra": "Santa Cruz", "santa cruz": "Santa Cruz",
    "montero": "Santa Cruz", "warnes": "Santa Cruz", "cotoca": "Santa Cruz", "la guardia": "Santa Cruz",
    "cochabamba": "Cochabamba", "quillacollo": "Cochabamba", "sacaba": "Cochabamba", "tiquipaya": "Cochabamba",
    "oruro": "Oruro", "potosi": "Potosí", "uyuni": "Potosí", "sucre": "Chuquisaca", "tarija": "Tarija",
    "yacuiba": "Tarija", "bermejo": "Tarija", "villamontes": "Tarija", "trinidad": "Beni", "riberalta": "Beni",
    "guayaramerin": "Beni", "cobija": "Pando", "camiri": "Santa Cruz", "puerto suarez": "Santa Cruz",
    "puerto quijarro": "Santa Cruz", "san ignacio de velasco": "Santa Cruz", "viacha": "La Paz",
    "copacabana": "La Paz", "coroico": "La Paz", "caranavi": "La Paz", "achocalla": "La Paz", "tupiza": "Potosí",
    "villazon": "Potosí", "llallagua": "Potosí", "punata": "Cochabamba", "colcapirhua": "Cochabamba",
    "vinto": "Cochabamba", "rurrenabaque": "Beni", "san borja": "Beni", "monteagudo": "Chuquisaca",
    "camargo": "Chuquisaca", "samaipata": "Santa Cruz", "mineros": "Santa Cruz", "yapacani": "Santa Cruz",
    "san julian": "Santa Cruz", "portachuelo": "Santa Cruz", "ascension de guarayos": "Santa Cruz",
    "concepcion": "Santa Cruz", "robore": "Santa Cruz", "challapata": "Oruro", "huanuni": "Oruro",
}
CAPITAL = {"La Paz": "La Paz", "Santa Cruz": "Santa Cruz de la Sierra", "Cochabamba": "Cochabamba",
           "Oruro": "Oruro", "Potosí": "Potosí", "Chuquisaca": "Sucre", "Tarija": "Tarija",
           "Beni": "Trinidad", "Pando": "Cobija"}


def fold(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


def dept_of(*vals):
    for v in vals:
        f = fold(v)
        if not f:
            continue
        if f in DEPTS:
            return DEPTS[f]
        if f in CITY_DEPT:
            return CITY_DEPT[f]
    for v in vals:
        f = fold(v)
        for k, d in CITY_DEPT.items():
            if re.search(r"\b" + re.escape(k) + r"\b", f):
                return d
    return None


LEGAL = re.compile(r"\b(s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?(\s?s\.?)?|ltda\.?|e\.?\s?i\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?m\.?|"
                   r"s\.?\s?c\.?|cooperativa|coop\.?|asociacion|fundacion|empresa|corporacion|compania|cia\.?|"
                   r"grupo|industria|industrias|importadora|exportadora|distribuidora|comercial|consultora|"
                   r"constructora|inversiones|servicios|farmacia|hotel|restaurant|restaurante|clinica|"
                   r"laboratorio|instituto|colegio|universidad|banco|agencia|transporte|transportes|"
                   r"inmobiliaria|ferreteria|libreria|taller|tienda|centro|estudio|bufete|consultorio|"
                   r"hostal|cafe|pizzeria|panaderia|mueble|muebleria|boutique|market|store|shop|import|export|"
                   r"group|bolivia|ltd|inc|corp|s\.?a\.?c\.?|y\s+cia)\b", re.I)


def looks_like_person(name):
    """True when the listing name looks like a natural person (unipersonal / professional), not a firm."""
    f = fold(name)
    if not f or LEGAL.search(f) or re.search(r"\d", f):
        return False
    toks = [t for t in re.split(r"[\s,]+", f) if t]
    if not (2 <= len(toks) <= 5):
        return False
    if toks[0] in ("el", "la", "los", "las", "mi", "tu", "su", "don", "super", "mega", "casa", "mundo", "punto"):
        return False
    return all(re.fullmatch(r"[a-zñ'.-]+", t) for t in toks)


def clean_phone(p):
    if not p:
        return None
    p = re.sub(r"[^\d+]", "", str(p))
    if len(re.sub(r"\D", "", p)) < 6:
        return None
    return p


def to_float(v):
    try:
        f = float(str(v).replace(",", "."))
        if f == 0:
            return None
        return f
    except (TypeError, ValueError):
        return None


def in_bolivia(lat, lon):
    return lat is not None and lon is not None and -23.0 <= lat <= -9.5 and -69.8 <= lon <= -57.3


FIELDS = ["source", "source_id", "name", "category_raw", "address", "locality", "municipality", "department",
          "lat", "lon", "phone", "website", "hours", "source_updated_at", "source_url", "retrieved_at", "nit",
          "matricula", "raw"]


def record(**kw):
    r = {k: kw.get(k) for k in FIELDS}
    lat, lon = to_float(r["lat"]), to_float(r["lon"])
    if not in_bolivia(lat, lon):
        if lat is not None or lon is not None:
            r.setdefault("raw", {})
        lat = lon = None
    r["lat"], r["lon"] = lat, lon
    for k in FIELDS:
        if isinstance(r[k], str):
            r[k] = re.sub(r"\s+", " ", r[k]).strip() or None
    if r.get("nit") is None:
        r.pop("nit")
    if r.get("matricula") is None:
        r.pop("matricula")
    return r


def write_ndjson_gz(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=False) + "\n")
