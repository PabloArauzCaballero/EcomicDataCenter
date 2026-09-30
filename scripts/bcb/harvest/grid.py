"""Lectura de cuadernos del BCB: celdas, números a la boliviana y períodos.

Portado del analizador con que se catalogaron los 500 cuadernos públicos. Un número
puede venir como texto («1.234,5»), un período como fecha de Excel, como «ene-20»,
como «2020 T1» o con el año en otra fila; todo eso se resuelve aquí y en ningún otro sitio.
"""
from __future__ import annotations

import re,datetime as dt,collections
import openpyxl
try: import xlrd
except Exception: xlrd=None
MES={'ene':1,'enero':1,'feb':2,'febrero':2,'mar':3,'marzo':3,'abr':4,'abril':4,'may':5,'mayo':5,'jun':6,'junio':6,'jul':7,'julio':7,'ago':8,'agosto':8,'sep':9,'sept':9,'set':9,'septiembre':9,'oct':10,'octubre':10,'nov':11,'noviembre':11,'dic':12,'diciembre':12,
     'jan':1,'apr':4,'aug':8,'dec':12}
ROM={'i':1,'ii':2,'iii':3,'iv':4}
def y2(y):
    y=int(y);return y if y>=100 else (2000+y if y<50 else 1900+y)
def clean(s): return re.sub(r'\s+',' ',str(s).replace('\xa0',' ')).strip()
def parse_num(v):
    if isinstance(v,bool): return None
    if isinstance(v,(int,float)): return float(v)
    if isinstance(v,str):
        s=v.strip().replace('\xa0','').replace(' ','')
        s=re.sub(r'^\(?([-+]?[\d.,]+)\)?%?$',r'\1',s)
        if not re.fullmatch(r'[-+]?(\d{1,3}(\.\d{3})+(,\d+)?|\d+(,\d+)?|\d+\.\d+|\d{1,3}(,\d{3})+\.\d+)',s): return None
        if re.fullmatch(r'[-+]?\d{1,3}(\.\d{3})+(,\d+)?',s) or (',' in s and '.' not in s): s=s.replace('.','').replace(',','.')
        elif re.fullmatch(r'[-+]?\d{1,3}(,\d{3})+\.\d+',s): s=s.replace(',','')
        try: return float(s)
        except: return None
    return None
def parse_period(v):
    if isinstance(v,dt.datetime): return (v.date(),'d')
    if isinstance(v,dt.date): return (v,'d')
    if isinstance(v,(int,float)) and not isinstance(v,bool):
        if float(v).is_integer() and 1950<=v<=2100: return (dt.date(int(v),1,1),'a')
        return None
    if not isinstance(v,str): return None
    s=clean(v).lower().rstrip('.')
    if not s or len(s)>40: return None
    if re.fullmatch(r'(?:\d ){3}\d',s): s=s.replace(' ','')
    m=re.fullmatch(r'sem(?:ana)?\.? del (\d{1,2})/(\d{1,2})/(\d{4})',s)
    if m:
        try: return (dt.date(int(m.group(3)),int(m.group(2)),int(m.group(1))),'s')
        except Exception: return None
    m=re.fullmatch(r'((?:19|20)\d{2})\s*([1-4])\s*t\s*[pe]?',s) or re.fullmatch(r'([1-4])\s*t\s*((?:19|20)\d{2})',s)
    if m:
        a,b=m.group(1),m.group(2)
        y,q=(int(a),int(b)) if len(a)==4 else (int(b),int(a))
        return (dt.date(y,3*q-2,1),'q')
    m=re.fullmatch(r'((?:19|20)\d{2})(?!\s*[tq]\s*(?:[1-4]|i{1,3}|iv))\s*[\(\[]?\s*(?:p|e|pr|\*|[a-z]|/)?\s*[\)\]]?\s*\**\(?\d?\)?',s)
    if m: return (dt.date(int(m.group(1)),1,1),'a')
    m=re.fullmatch(r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})',s)
    if m:
        a,b,c=int(m.group(1)),int(m.group(2)),y2(m.group(3))
        try: return (dt.date(c,b,a),'d')
        except Exception:
            try: return (dt.date(c,a,b),'d')
            except Exception: return None
    m=re.fullmatch(r'(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})',s)
    if m:
        try: return (dt.date(int(m.group(1)),int(m.group(2)),int(m.group(3))),'d')
        except Exception: return None
    m=re.fullmatch(r'(\d{1,2})[\s\-/]+([a-zñ]{3,10})[\s\-/.]+(\d{2,4})',s)
    if m and m.group(2) in MES:
        try: return (dt.date(y2(m.group(3)),MES[m.group(2)],int(m.group(1))),'d')
        except Exception: return None
    m=re.fullmatch(r'([a-zñ]{3,10})[\s\-/.,]*(?:de\s+|del\s+)?(\d{2,4})\s*[\(\[]?[pe]?[\)\]]?',s)
    if m and m.group(1) in MES: return (dt.date(y2(m.group(2)),MES[m.group(1)],1),'m')
    m=re.fullmatch(r'((?:19|20)\d{2})[\s\-/.]+([a-zñ]{3,10})',s)
    if m and m.group(2) in MES: return (dt.date(int(m.group(1)),MES[m.group(2)],1),'m')
    m=re.fullmatch(r'(i{1,3}|iv|[1-4])\s*(?:er|do|to|ro)?\.?\s*(?:trim\w*|t|tr)\.?[\s\-/,]*(?:de\s+)?((?:19|20)?\d{2,4})\s*[\(\[]?[pe]?[\)\]]?',s)
    if m:
        q=ROM.get(m.group(1)) or int(m.group(1));return (dt.date(y2(m.group(2)),3*q-2,1),'q')
    m=re.fullmatch(r'((?:19|20)\d{2})[\s\-/.]*(?:t|q|trim\w*)\s*(i{1,3}|iv|[1-4])\s*[\(\[]?[pe]?[\)\]]?',s)
    if m:
        q=ROM.get(m.group(2)) or int(m.group(2));return (dt.date(int(m.group(1)),3*q-2,1),'q')
    m=re.fullmatch(r't(?:rim)?\.?\s*([1-4])[\s\-/]*((?:19|20)?\d{2,4})',s)
    if m: return (dt.date(y2(m.group(2)),3*int(m.group(1))-2,1),'q')
    return None
def is_month_name(v):
    return isinstance(v,str) and clean(v).lower().rstrip('.') in MES
def load_grid(path):
    with open(path,'rb') as f: head=f.read(8)
    sheets=[]
    if head[:2]==b'PK':
        wb=openpyxl.load_workbook(path,data_only=True,read_only=True)
        for ws in wb.worksheets:
            rows=[list(r) for r in ws.iter_rows(values_only=True)]
            sheets.append((ws.title,getattr(ws,'sheet_state','visible'),rows))
        wb.close()
    elif head[:4]==b'\xd0\xcf\x11\xe0':
        if not xlrd: raise RuntimeError('xls sin xlrd')
        wb=xlrd.open_workbook(path)
        for sh in wb.sheets():
            rows=[]
            for r in range(sh.nrows):
                row=[]
                for c in range(sh.ncols):
                    cell=sh.cell(r,c);t=cell.ctype;v=cell.value
                    if t==xlrd.XL_CELL_DATE:
                        try: v=xlrd.xldate_as_datetime(v,wb.datemode)
                        except Exception: pass
                    elif t in (xlrd.XL_CELL_EMPTY,xlrd.XL_CELL_BLANK,xlrd.XL_CELL_ERROR): v=None
                    elif t==xlrd.XL_CELL_BOOLEAN: v=bool(v)
                    row.append(v)
                rows.append(row)
            sheets.append((sh.name,'visible' if sh.visibility==0 else 'hidden',rows))
    else:
        raise RuntimeError('no es xlsx ni xls (cabecera %r)'%head)
    return sheets
def empty(v): return v is None or (isinstance(v,str) and not v.strip())
def trim(rows):
    rows=list(rows)
    while rows and all(empty(v) for v in rows[-1]): rows.pop()
    w=0
    for r in rows:
        for j in range(len(r)-1,-1,-1):
            if not empty(r[j]): w=max(w,j+1);break
    return [(list(r)+[None]*w)[:w] for r in rows],w
def isnum(v): return parse_num(v) is not None
UNIT_RE=re.compile(r'(en\s+(?:millones|miles|porcentaje|bolivianos|d[oó]lares|\$us|usd|bs|toneladas|kilos|unidades|puntos|base)[^)\]]{0,80}|\(%\)|porcentaje|millones de [^,;)]{0,50}|miles de [^,;)]{0,50}|[íi]ndice[^,;]{0,40}base[^,;]{0,25}|base\s*\d{4}\s*=\s*100|bolivianos por [^,;)]{0,30}|toneladas m[eé]tricas)',re.I)
FECHA_RE=re.compile(r'(\d{1,2}) de ([a-zñ]+) de (\d{4})|al (\d{1,2})[-/](\d{1,2})[-/](\d{4})',re.I)
def find_corte(rows,upto=14):
    for r in rows[:upto]:
        for v in r:
            if isinstance(v,str):
                m=FECHA_RE.search(v)
                if m:
                    try:
                        if m.group(1) and m.group(2).lower() in MES: return str(dt.date(int(m.group(3)),MES[m.group(2).lower()],int(m.group(1))))
                        if m.group(4): return str(dt.date(int(m.group(6)),int(m.group(5)),int(m.group(4))))
                    except Exception: pass
    return None
def find_unit(rows,upto=14):
    for r in rows[:upto]:
        for v in r:
            if isinstance(v,str):
                m=UNIT_RE.search(v)
                if m: return clean(m.group(0))[:90]
    return None
def freq_from(dates):
    ds=sorted(set(dates))
    if len(ds)<2: return None,{}
    diffs=[(b-a).days for a,b in zip(ds,ds[1:])]
    def cls(d):
        if d<=4: return 'diaria'
        if d<=10: return 'semanal'
        if d<=45: return 'mensual'
        if d<=110: return 'trimestral'
        if d<=200: return 'semestral'
        return 'anual'
    c=collections.Counter(cls(d) for d in diffs)
    return c.most_common(1)[0][0],dict(c)
def fmt(x):
    if isinstance(x,dt.datetime): return str(x.date())
    if isinstance(x,float): return round(x,6)
    if isinstance(x,str): return clean(x)[:40]
    return x
