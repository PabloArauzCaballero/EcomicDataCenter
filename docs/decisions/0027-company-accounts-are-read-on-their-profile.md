# ADR 0027 — Las cuentas oficiales de las empresas se leen en su perfil

- **Estado**: aceptada
- **Fecha**: 2026-10-01
- **Reemplaza a**: ninguna (acota la ADR 0022 §«Alternativas descartadas» y la ADR 0025)
- **Relacionada con**: ADR 0022 (lecturas sociales), ADR 0025 (el registro lee comercio, no
  plataformas)

## Contexto

La pestaña «Reputación empresarial» muestra el ranking Merco de 257 empresas. Se pidió sumarle lo
que pasa en las redes de cada una: seguidores, posts, interacción, el sentimiento de lo que le
comentan y las palabras que más se repiten.

Las dos decisiones vigentes lo cerraban:

- La **ADR 0022** descartó «recolectar perfiles públicos con navegador» porque viola términos de uso,
  choca con muros de inicio de sesión y no deja procedencia verificable. Además advirtió que el tono
  social no es polaridad: la burla marca bando y un clasificador simple la lee como afecto positivo.
- La **ADR 0025** retiró las métricas de plataforma (`AUDIENCE`, `TOPIC`, `EMOTION`) y dejó escrito
  que traerlas de vuelta «cuesta otra decisión, no un commit».

Esta es esa decisión, tomada por el responsable del observatorio el 1 de octubre de 2026. El objeto es
distinto del que se descartó. Aquellas eran **audiencias que una plataforma declara sobre un país**.
Esto es lo que **una empresa publica en su propia cuenta**, que ella misma enlaza desde su web.

Lo que se midió antes de decidir, desde una conexión residencial y sin sesión:

| Red | Perfil | Posts | Comentarios |
|---|---|---|---|
| Facebook | seguidores, «personas hablando» | los primeros, embebidos en el HTML | el destacado, a veces |
| Instagram | seguidores, seguidos, publicaciones | 12 de la grilla, con likes y comentarios | no |
| TikTok | seguidores, corazones, videos | la grilla termina en captcha; videos sueltos sí | no |
| YouTube | suscriptores, videos | todos, con vistas, likes y comentarios | sí |
| LinkedIn | seguidores | unas diez tarjetas | no; muro de sesión frecuente |

Las bebidas alcohólicas exigen mayoría de edad en Facebook e Instagram.

## Decisión

### 1. Sólo cuentas oficiales de empresas, halladas en su propia web

El directorio (`scripts/social/company/company-accounts.json`) sale primero de los enlaces de la
portada de cada empresa. Eso vale `HIGH`, o `MEDIUM` si la web es de la marca global. Sólo cuando la
web no enlaza una red se busca en Bing, y ese hallazgo vale `LOW` hasta que una persona lo revise
(`reviewed: true`).

Nunca se leen cuentas de personas.

### 2. Sin sesión, sin captchas, despacio

Se usa Playwright con un Chrome de escritorio, una red por trabajador, de a una cuenta, con pausas al
azar. Los captchas no se resuelven y los muros de inicio de sesión no se esquivan. Lo que no se dejó
leer queda `BLOCKED`, `RESTRICTED` o `NOT_FOUND`, **nunca 0**.

Una sesión opcional (`--session=<storageState>`) queda prevista. La aporta una persona, con una cuenta
propia y fuera del repositorio.

### 3. Cifras declaradas por la plataforma, con su fecha de captura

Cada perfil guarda la huella del HTML que se leyó y la fecha. Las cifras se muestran como «declaradas
por la red el <día>» y **no alimentan ninguna serie macro**: viven en sus propias vistas
(`read_models.company_social_*`), fuera de `economic_indicator_*`.

### 4. Nada de quien comenta

El texto de los comentarios se clasifica en memoria (`analyze_company_social.py`) y no entra a la
semilla. Al repositorio y a la base llegan conteos, sentimiento agregado y términos frecuentes. No
llegan autores, identificadores ni comentarios.

### 5. Polaridad, y la ironía aparte

Se usan los modelos de pysentimiento (RoBERTuito, entrenado con tuits en español), corridos en ONNX.
La polaridad (POS/NEG/NEU) es obligatoria. La emoción y la ironía se agregan cuando sus modelos están.

La ironía se informa por separado y no se suma a lo positivo. Es la respuesta a la advertencia de la
ADR 0022.

## Consecuencias

- La cobertura es desigual por red, y el tablero la muestra como cobertura: cuántas cuentas se
  leyeron, cuántas bloquearon y cuántos comentarios sostienen cada porcentaje. En Instagram y TikTok,
  sin sesión, el sentimiento de la audiencia descansa casi entero en YouTube y Facebook.
- Las cifras de los videos de TikTok son de **videos que el buscador conoce**, no de los últimos
  (`discovery: 'SEARCH'`).
- La corrida es manual y semanal, desde una conexión residencial. Las IP de centros de datos (Actions,
  Contabo) se bloquean antes.
- Cada corrida suma una fecha y no pisa la anterior: el crecimiento de seguidores se puede ver.
