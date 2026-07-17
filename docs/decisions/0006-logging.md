# ADR-0006: logs JSON a stdout/stderr

- Estado: aceptado
- Fecha: 2026-07-15
- Responsables: arquitectura y operación

## Contexto

La aplicación se despliega en contenedores y necesita logs estructurados sin bloquear el proceso por I/O local.

## Decisión

Pino es el logger único. Emite JSON a stdout/stderr con request ID, módulo, evento, estado y duración. Se redactan autorización, cookies, tokens, contraseñas y datos sensibles.

No se escribe a archivo local por defecto. La plataforma recolecta, rota y retiene logs.

## Alternativas

- `console.*`: no estructurado y difícil de gobernar.
- archivo dentro del contenedor: efímero y con riesgo de bloqueo/disco.
- doble salida: solo con volumen, rotación, backpressure y ADR operativo.

## Validación

Prueba de redacción, formato JSON, propagación de request ID y ausencia de payloads completos.
