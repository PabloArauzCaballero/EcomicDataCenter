"""Forma de una hoja: dónde están los períodos, los encabezados y las series."""
from __future__ import annotations
import datetime as dt, collections, re
from .grid import *  # noqa: F401,F403
from .grid import trim, empty, isnum, parse_num, parse_period, is_month_name, clean, find_unit, find_corte, freq_from, fmt, MES

def analyze_sheet(name,state,rows):
    detail=None
    rows,w=trim(rows)
    out={'nombre':name,'filas':len(rows),'columnas':w,'estado':state}
    if not rows:
        out['forma']='vacia';out['utilizable']=False;return out,None
    nnum=sum(1 for r in rows for v in r if isnum(v))
    ntxt=sum(1 for r in rows for v in r if isinstance(v,str) and isnum(v))
    out['celdas_numericas']=nnum
    if ntxt: out['numeros_como_texto']=ntxt
    out['unidad']=find_unit(rows)
    lc=list(range(min(3,w)))
    carry=None;rowper={};hdrper=[]
    for i,r in enumerate(rows):
        p=None;pcol=None
        for j in lc:
            pv=parse_period(r[j])
            if pv: p=pv;pcol=j;break
        if p is None or p[1]=='a':
            for j in lc:
                pv=parse_period(r[j])
                if pv and pv[1]=='a': carry=pv[0].year
            for j in lc:
                if is_month_name(r[j]) and carry:
                    p=(dt.date(carry,MES[clean(r[j]).lower().rstrip('.')],1),'m');pcol=j;break
        if p:
            if any(isnum(v) for j,v in enumerate(r) if j>pcol): rowper[i]=(p,pcol)
            else: hdrper.append((i,p,pcol))
    best=(0,None)
    for i,r in enumerate(rows[:40]):
        cps={j:parse_period(v) for j,v in enumerate(r)}
        cps={j:p for j,p in cps.items() if p}
        mj=[j for j,v in enumerate(r) if is_month_name(v)]
        if len(mj)>=4 and len(mj)>len(cps):
            ycells={}
            for k in range(i-1,max(-1,i-5),-1):
                yc={j:int(v) for j,v in enumerate(rows[k]) if isinstance(v,(int,float)) and not isinstance(v,bool) and float(v).is_integer() and 1950<=v<=2100}
                if yc: ycells=yc;break
            cps={}
            for j in mj:
                left=[c for c in ycells if c<=j]
                y=ycells[max(left)] if left else 1900
                cps[j]=(dt.date(y,MES[clean(r[j]).lower().rstrip('.')],1),'m')
        if len(cps)>best[0]: best=(len(cps),(i,cps))
    nA=len(rowper);nB=best[0]
    nonA=[h for h in hdrper if h[1][1]!='a'] or hdrper
    if nA>=4 and nA>=nB:
        forma='series_en_columnas'
        pcol=collections.Counter(pc for _,pc in rowper.values()).most_common(1)[0][0]
        rp={i:p for i,(p,pc) in rowper.items() if pc==pcol}
        idx=sorted(rp);first=idx[0]
        hdr=[i for i in range(max(0,first-8),first) if any(not empty(v) for v in rows[i])]
        cols=[]
        for j in range(w):
            if j==pcol: continue
            n=sum(parse_num(rows[i][j]) is not None for i in idx)
            if n>=max(3,0.2*len(idx)): cols.append((j,n))
        names=[]
        for j,n in cols:
            parts=[]
            for i in hdr:
                v=rows[i][j]
                if not empty(v) and not parse_period(v):
                    t=clean(v)
                    if not parts or parts[-1]!=t: parts.append(t)
            names.append(' | '.join(parts)[:100])
        dates=[rp[i][0] for i in idx]
        fr,fd=freq_from(dates)
        out.update(forma=forma,fila_encabezado=[i+1 for i in hdr] or None,columna_periodo=pcol+1,
            primera_fila_datos=first+1,periodo_primero=str(min(dates)),periodo_ultimo=str(max(dates)),
            n_periodos=len(set(dates)),frecuencia=fr,frecuencias_mixtas=fd if len(fd)>1 else None,
            n_series=len(cols),series=names[:40])
        sample=[[fmt(rows[i][j]) for j in range(min(w,7))] for i in idx[:3]]
        detail={'shape':'columns','rows':rows,'idx':idx,'rp':rp,'pcol':pcol,'cols':cols,'names':names}
        out['granularidad_celda']=dict(collections.Counter(p[1] for p in rp.values()))
        gaps=sum(1 for a,b in zip(idx,idx[1:]) if b-a>3)
        if gaps: out['bloques_de_datos']=gaps+1
    elif nB>=4:
        i,cps=best[1];forma='series_en_filas'
        pcols=sorted(cps)
        lab=[]
        for k in range(i+1,len(rows)):
            r=rows[k]
            n=sum(1 for j in pcols if isnum(r[j]))
            if n>=max(2,0.2*len(pcols)):
                lb=next((clean(v) for v in reversed(r[:max(1,pcols[0])]) if isinstance(v,str) and v.strip()),None)
                lab.append((k,lb,n))
        dates=[cps[j][0] for j in pcols]
        fr,fd=freq_from(dates)
        out.update(forma=forma,fila_encabezado=[i+1],columnas_periodo=[pcols[0]+1,pcols[-1]+1],
            primera_fila_datos=(lab[0][0]+1 if lab else None),periodo_primero=str(min(dates)),periodo_ultimo=str(max(dates)),
            n_periodos=len(set(dates)),frecuencia=fr,frecuencias_mixtas=fd if len(fd)>1 else None,
            n_series=len(lab),series=[l[1] for l in lab[:40]])
        if any(d.year==1900 for d in dates): out['aviso']='meses sin ano en el encabezado (ano=1900 en periodo_*)'
        sample=[[fmt(rows[l[0]][j]) for j in ([0] if pcols[0]>0 else [])+pcols[:5]] for l in lab[:3]]
        detail={'shape':'rows','rows':rows,'cps':cps,'pcols':pcols,'lab':lab}
        out['granularidad_celda']=dict(collections.Counter(p[1] for p in cps.values()))
    elif len(nonA)>=3 and sum(1 for i,r in enumerate(rows) if not any(x[0]==i for x in nonA) and sum(isnum(v) for v in r)>=2)>=3:
        forma='bloques_por_periodo'
        hi=[x[0] for x in nonA];first=hi[0]
        hdr=[i for i in range(max(0,first-8),first) if any(not empty(v) for v in rows[i])]
        hs=set(x[0] for x in hdrper)
        lab=[(k,clean(rows[k][0]) if isinstance(rows[k][0],str) else None) for k in range(first,len(rows)) if k not in hs and sum(isnum(v) for v in rows[k])>=2]
        cols=[j for j in range(w) if sum(isnum(rows[k][j]) for k,_ in lab)>=3]
        names=[]
        for j in cols:
            parts=[]
            for i in hdr:
                jj=j
                while jj>=0 and empty(rows[i][jj]): jj-=1
                v=rows[i][jj] if jj>=0 else None
                if not empty(v) and not parse_period(v):
                    t=clean(v)
                    if not parts or parts[-1]!=t: parts.append(t)
            names.append(' | '.join(parts)[:100])
        dates=[x[1][0] for x in nonA]
        fr,fd=freq_from(dates)
        ents=[]
        for _,l in lab:
            if l and l not in ents: ents.append(l)
        out.update(forma=forma,fila_encabezado=[i+1 for i in hdr] or None,columna_periodo=collections.Counter(x[2] for x in nonA).most_common(1)[0][0]+1,
            primera_fila_datos=first+1,periodo_primero=str(min(dates)),periodo_ultimo=str(max(dates)),
            n_periodos=len(set(dates)),frecuencia=fr,frecuencias_mixtas=fd if len(fd)>1 else None,
            n_series=len(cols),series=names[:40],n_entidades=len(ents),entidades=ents[:25])
        sample=[[fmt(v) for v in rows[k][:6]] for k in range(first,min(first+3,len(rows)))]
        out['granularidad_celda']=dict(collections.Counter(x[1][1] for x in nonA))
    else:
        ne=[r for r in rows if any(not empty(v) for v in r)]
        sample=[[fmt(v) for v in r[:7]] for r in ne[:3]]
        numcols=[j for j in range(w) if sum(isnum(r[j]) for r in rows)>=3]
        corte=find_corte(rows)
        forma='cuadro_de_corte' if (corte and len(numcols)>=2) else 'cuadro_irregular'
        out.update(forma=forma,n_series=len(numcols),frecuencia=None)
        if corte: out['fecha_corte']=corte
        out['tipo_hoja']='indice_o_texto' if nnum<10 else 'cuadro'
        out['primeras_celdas']=[clean(v)[:60] for r in ne[:4] for v in r if not empty(v)][:4]
    out['muestra']=[[fmt(x) for x in s] for s in sample]
    out['utilizable']= forma!='cuadro_irregular' and out.get('n_series',0)>=1 and nnum>=6
    return out,detail
