# ADR-0019: cobertura de prensa y listados que exigen renderizado

- Estado: aceptado
- Fecha: 2026-08-25
- Responsables: arquitectura y datos

## Contexto

Hasta esta decisión el observatorio leía tres publicadores: el Banco Central, la Bolsa Boliviana
de Valores y una plaza de mercado. Esa base es correcta para una **medición** y pobre para un
país. Un decreto de diésel, un bloqueo o un desabastecimiento se reporta días antes de que
cualquier tabla registre su efecto, y una serie oficial nunca dice **por qué** se movió un número.

Se evaluaron nueve medios bolivianos. Siete resultaron utilizables:

| Medio | Vía | Notas capturadas |
|---|---|---|
| El Deber | RSS (`/rss/economia.xml`, `/rss/dinero.xml`, `/rss/pais.xml`) | 74 |
| Red Uno | secciones renderizadas | 54 |
| Brújula Digital | RSS (`/rss.xml`) | 30 |
| Unitel | secciones renderizadas | 22 |
| Opinión | RSS (`/rss/`) | 20 |
| La Razón | RSS (`larazon.bo/feed/`) | 10 |
| Bolivia Verifica | RSS (`/feed/`) | 10 |

Dos hallazgos condicionan el diseño:

- **Dos feeds están servidos pero congelados.** El RSS de Red Uno no se escribe desde abril de
  2022 y el de Erbol desde julio de 2020. Siguen respondiendo 200 con contenido antiguo, de modo
  que un recolector ingenuo publicaría cobertura de hace seis años como si fuera del día.
- **Unitel no sindica nada y Red Uno sirve su portada en cliente.** Se verificó que ninguno expone
  una vía por HTTP simple: Unitel devuelve 404 en `sitemap-news.xml`, `news-sitemap.xml`,
  `api/noticias` y `_next/data`, y su `sitemap.xml` sólo lista páginas de sección; el de Red Uno
  igual, sin sitemaps anidados. La ficha individual de ambos **sí** declara `datePublished` en su
  bloque estructurado y se obtiene por HTTP.

## Drivers

- Que el observatorio pueda explicar un movimiento, no sólo registrarlo.
- Que la cobertura periodística **no contamine** ninguna serie medida.
- Que agregar un medio no obligue a agregar peso al servicio de producción.
- Que un feed muerto se note en lugar de publicarse como si estuviera vivo.

## Decisión

### 1. La prensa es cobertura, no medición, y el modelo lo hace cumplir

Se agrega el nivel `PRESS` al registro de fuentes verificadas, junto a `OFFICIAL` y `MARKET`. El
nivel no es descriptivo: `documentStatedPublication` y `undatedOfficialIndicator` —los dos
controles que admiten una cifra al camino de publicación automática— exigen `OFFICIAL`, de modo
que **ninguna cifra citada en un artículo puede alcanzar una serie**.

La afirmación que produce cada artículo es deliberadamente estrecha: *«El Deber publicó el 25 de
agosto: …»*. Eso es lo que la evidencia sostiene. Que lo reportado sea cierto no es algo que un
recolector pueda establecer, y escribir el titular como si fuera un hallazgo lavaría una
afirmación hasta convertirla en registro. La confianza es `MEDIUM` por la misma razón.

El modelo de lectura `read_models.press_article` está separado de todos los de indicadores, y el
tema se deriva en SQL desde el titular —como el rubro de un emisor— para que la clasificación sea
discutible y corregible en una sola expresión visible.

### 2. El renderizado vive en CI, no en el servicio

El recolector diario **no corre dentro del backend**: corre en `daily-economic-research` sobre
`ubuntu-24.04`, tres veces al día, y envía por API. Por lo tanto el navegador sin cabeza es una
dependencia del **runner**, no de la imagen que despliega Render.

Esto invierte el cálculo habitual. Meter Chromium al servicio de producción sería inaceptable
—cientos de megabytes, superficie de ataque nueva por renderizar páginas no confiables, y un
arranque que depende de binarios de navegador—. En el runner de CI es barato, está aislado del
tráfico de usuarios y no toca el contenedor productivo.

`playwright` se agrega como **dependencia de desarrollo**. `yarn install --frozen-lockfile` en el
servicio no la instala en producción y la imagen no cambia.

### 3. Un feed congelado se descarta, no se disfraza

El recolector rechaza un listado sindicado cuya nota más reciente supere el umbral de frescura, y
lo registra. Red Uno se lee de sus secciones vivas; Erbol queda fuera hasta que su feed vuelva a
escribirse. La alternativa —publicar 2020 como si fuera hoy— rompería la única propiedad que hace
útil al observatorio.

### 4. La fecha sale de la ficha, nunca del slug

Las URL de Red Uno terminan en dígitos que parecen una marca de tiempo
(`...-2026825134250`). No se usan: un slug con dígitos no es un sello que el medio respalde, y su
ancho de campo es ambiguo. La fecha se lee del `datePublished` que la ficha declara, con el
digest de esa ficha al lado.

## Consecuencias

**A favor**

- Siete medios y 220 notas, con el tema derivado y auditable.
- El servicio de producción no cambia de peso ni de superficie.
- Un feed muerto produce un descarte registrado, no cobertura falsa.

**En contra, y asumido**

- El repositorio gana una dependencia de desarrollo pesada (`playwright` más su navegador, que CI
  descarga por ejecución). Se acepta porque queda fuera del artefacto desplegado.
- Los dos medios renderizados dependen de la estructura HTML de su portada, que puede cambiar sin
  aviso. El fallo es visible —cero notas de ese medio— y no corrompe nada: los otros cinco siguen
  llegando por feed.
- Renderizar ejecuta JavaScript de terceros en el runner. Se acota a dos dominios registrados, sin
  secretos en ese paso del flujo, y lo extraído se valida con Zod como cualquier otra entrada no
  confiable (ADR-0016).

## Alternativas descartadas

- **Navegador en el backend.** Rechazada: el recolector no corre allí, así que el coste sería
  gratuito en perjuicio y nulo en beneficio.
- **Reconstruir la fecha desde el slug.** Rechazada por ambigüedad de ancho de campo y porque
  atribuye al medio un sello que no publicó.
- **Servicio de terceros de agregación de noticias.** Rechazada: introduce un intermediario entre
  la cita y su fuente, que es exactamente lo que el modelo de evidencia existe para evitar.
- **Sólo los cinco medios con feed.** Rechazada: deja fuera a Unitel y Red Uno, dos de los tres
  que el requisito nombra explícitamente, y con ellos 76 de las 220 notas.
