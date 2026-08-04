# ADR-0016: credencial compartida para el colector alojado

- Estado: aceptado
- Fecha: 2026-08-04
- Responsables: arquitectura y seguridad

## Contexto

El ADR-0002 exige `AUTH_MODE=jwks` en producción: un proveedor de identidad externo emite un JWT
RS256 con `iss`, `aud`, `exp`, claim de roles y claim de organización. El colector diario del
Observatorio es un agente alojado en ChatGPT, cuyo panel de acciones acepta una credencial estática
o un flujo OAuth, pero no rota tokens por sí mismo.

El operador no dispone hoy de proveedor de identidad y necesita desplegar el backend en Render de
forma que su agente pueda entregar la carga diaria con una configuración mínima: la URL pública y una
contraseña que solo él entrega al agente. Con el contrato vigente eso era imposible: sin proveedor,
la única configuración que arrancaba era `AUTH_MODE=disabled`, que sintetiza un actor con **todos**
los roles —incluidos `METHODOLOGY_STEWARD` y `DATA_REVIEWER`— y por tanto habría dejado la revisión,
la gobernanza y el núcleo estadístico oficial abiertos a cualquiera.

## Drivers

- Reducir la configuración del agente a dos valores: URL base y una credencial.
- Que ningún llamante, tenga o no la credencial, pueda aprobar, publicar ni gobernar datos.
- No inventar un subsistema de identidad ni emisión de tokens dentro del core (ADR-0002).
- Mantener intacta la frontera de contenido no confiable: lo que envía un agente sigue siendo
  evidencia sujeta a revisión, nunca dato oficial.

## Opciones

1. **`AUTH_MODE=disabled` en el despliegue público.** Descartada: concede los cinco roles, de modo
   que un tercero podría aprobar sus propias afirmaciones, registrar organizaciones y escribir
   observaciones oficiales.
2. **Ingesta sin credencial con identidad mínima.** Considerada y descartada: elimina la barrera de
   entrada por completo, de forma que cualquiera que descubra la URL puede llenar la cola de revisión
   y consumir la cuota. La contraseña cuesta un campo de configuración y elimina esa clase entera de
   abuso.
3. **Proveedor de identidad gestionado (Auth0, Keycloak, Entra ID).** Es la opción correcta a
   término y sigue siendo la recomendada; requiere una infraestructura que hoy no existe.
4. **Clave compartida verificada por el propio backend, con una identidad mínima.** Elegida.

## Decisión

Se añade el valor `agent_key` a `AUTH_MODE` y la variable `AGENT_INGESTION_KEY`, obligatoria y de
32 caracteres como mínimo cuando ese modo está activo. La configuración falla al arrancar si el modo
se habilita sin clave, en lugar de degradar silenciosamente a acceso abierto.

El colector presenta la clave como `Authorization: Bearer <clave>`. Se reutiliza la cabecera estándar
en lugar de una propia por dos razones concretas del código existente: Pino ya redacta
`req.headers.authorization`, de modo que la clave nunca aparece en los logs; y `rateLimitKey()`
deriva el bucket de cuota del hash de la credencial, así que el colector obtiene su propia cuota
`RATE_LIMIT_AGENT_MAX` (1200/min) en vez de compartir la cuota por dirección con el tráfico anónimo.

`JwtAuthGuard` compara la clave en tiempo constante con `matchesBearerToken()` —extraído del
controlador de salud, que ya protegía `/metrics` con esa misma técnica— y, si coincide, sintetiza
**una sola** identidad mediante `createHostedCollectorActor()`:

- `subject`: `hosted-collector`, registrado en toda fila de auditoría;
- `roles`: exclusivamente `INGESTION_AGENT`;
- `organizationId`: la organización del Observatorio sembrada por `boot/agent-bootstrap.json`.

Una clave ausente, mal formada o incorrecta produce `401` con un mensaje idéntico en los tres casos,
de modo que sondear el endpoint no revela si un intento estuvo más cerca que otro.

En consecuencia, el portador de la clave alcanza únicamente lo que ese rol permite: abrir una
ejecución, entregar afirmaciones, cerrarla, consultar el estado de sus ejecuciones y registrar
artefactos de origen. Todo lo demás sigue siendo default-deny.

Se amplía `POST /provenance/artifacts` para admitir `INGESTION_AGENT` junto a `DATA_OFFICER` y
`METHODOLOGY_STEWARD`. Registrar el documento que el colector acaba de descargar es **producción de
evidencia**, no aprobación de ella; la separación de deberes que impone `token-claims.parser.ts`
prohíbe que un colector revise o publique lo que produjo, no que deje constancia del documento que
citó. Sin esta ampliación el modo sería inservible: toda evidencia exige un `sourceArtifactId`
existente y el lote completo falla con `409` si no lo encuentra.

`boot/agent-bootstrap.json` siembra la organización del Observatorio, la fuente de recolección
documental y el agente `CHATGPT_DAILY_MACRO` en estado `ACTIVE`, de modo que una base recién migrada
queda operativa sin registro manual previo.

`agent_key` se admite con `NODE_ENV=production`. Prohibirlo habría empujado el despliegue a
`NODE_ENV=development`, que además reactiva Swagger y deja de exigir credencial de migrador separada
y token de scrape: un resultado estrictamente peor. La prohibición de `AUTH_MODE=disabled` en
producción se mantiene sin cambios.

## Consecuencias

- La credencial es un secreto único, de larga vida y sin caducidad. No hay revocación selectiva:
  rotarla es cambiar `AGENT_INGESTION_KEY` en Render y actualizar el panel del agente. Esa es la
  deuda que este modo asume conscientemente frente a `jwks`.
- Un `exp` inexistente significa que una clave filtrada sirve hasta que alguien la rote. El daño
  máximo sigue acotado por el rol: quien la obtenga puede ensuciar la cola de revisión y consumir
  cuota, no publicar hechos falsos como oficiales ni tocar el núcleo estadístico.
- La auditoría atribuye toda la actividad al mismo `subject`, de modo que no distingue entre dos
  colectores. El modo está pensado para un único agente.
- La política de enrutamiento (`review-routing.policy.ts`) sigue aplicándose sin cambios:
  interpretaciones, confianza baja e impacto alto van a `PENDING_REVIEW`, y el contenido con
  marcadores de inyección va a `QUARANTINED`.
- Migrar a `jwks` no requiere cambios de código ni de contrato: basta cambiar variables de entorno y
  emitir al agente un token con rol `INGESTION_AGENT` y el claim de organización sembrado.

## Validación

- `src/common/auth/tests/jwt-auth.guard.spec.ts`: la clave correcta concede solo `INGESTION_AGENT`;
  una clave ausente, fuera del esquema `Bearer`, incorrecta de la misma longitud, o un modo sin clave
  configurada, producen `401`; `jwks` sigue rechazando al anónimo.
- `src/common/auth/tests/hosted-collector.actor.spec.ts`: la identidad nunca porta un rol capaz de
  aprobar o publicar, y su organización coincide con la que siembra el catálogo boot.
- `src/config/tests/environment.spec.ts`: el modo se acepta en producción con clave válida y se
  rechaza sin clave o con una demasiado corta.
- `src/database/seeds/tests/boot-catalogs.spec.ts`: el catálogo declara los identificadores estables
  que el runtime resuelve.
- `yarn quality:security` mantiene el contrato default-deny de las 47 rutas de OpenAPI.
