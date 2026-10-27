"""SIE: descarga la lista completa de unidades educativas (codigo=0&rol=0), con TLS verificado.

Uso: python -I sie_fetch.py <archivo_salida> [gestion]
"""
import hashlib
import http.cookiejar
import ssl
import sys
import urllib.request

PAGE = 'https://reportes.sie.gob.bo/reporteestadistico/informacion/general/regular/unidad/educativa'
XLS = PAGE + '/lista/print/xls'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DatosBolivia-recoleccion'

out = sys.argv[1]
gestion = sys.argv[2] if len(sys.argv) > 2 else '2026'
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),
                                     urllib.request.HTTPSHandler(context=ssl.create_default_context()))
opener.addheaders = [('User-Agent', UA)]
opener.open(PAGE, timeout=120).read()
req = urllib.request.Request(XLS, data=f'codigo=0&rol=0&gestion={gestion}'.encode(), headers={'Referer': PAGE})
body = opener.open(req, timeout=600).read()
with open(out, 'wb') as fh:
    fh.write(body)
print(len(body), hashlib.sha256(body).hexdigest(), body.count(b'<Row'))
