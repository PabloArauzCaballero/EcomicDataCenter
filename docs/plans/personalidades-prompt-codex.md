# Prompt de arranque para Codex (pegar tal cual)

Trabajas en el Observatorio Económico de Bolivia. Tu tarea es ejecutar **completo** el plan
`EcomicDataCenter/docs/plans/personalidades-top300-plan-por-carriles.md` (rama `test` del repo `EcomicDataCenter`; léelo entero antes de empezar).

Reglas de la misión:

1. **No me hagas preguntas.** Todas las decisiones previsibles están en las secciones 5, 6 y 9 del plan, incluida la autorización para commitear y empujar a `test`, relanzar despliegues en Coolify de Contabo y leer por SSH el estado de los despliegues. Si surge algo que no esté, elige la opción más conservadora y reversible, anótala en `docs/plans/personalidades-progreso.md` y sigue.
2. **Solo `test`** (core `EcomicDataCenter` y tablero `observatorio-dashboard`). No toques `dev`. Trabaja en worktrees desde `origin/test`, commitea solo tus rutas, `fetch` + `rebase` antes de empujar. Nunca `git add -A`, nunca force-push, no cambies el HEAD del checkout principal.
3. **Nada inventado:** cada cifra con fuente, fecha y método; lo que no se pueda medir va `null` y con el motivo. Sin sesión, sin captcha, sin cuentas ni cookies del usuario.
4. **Cuidado con la memoria** de la laptop (16 GB, llegó a 0,5 GB libres): nada pesado con menos de 3 GB libres (sección 5 del plan).
5. **Cada entrega se verifica en vivo** en `https://test.datosbolivia.com/?pestana=personalidades` (commit desplegado en Coolify con estado `finished`, lectura real de la pestaña con navegador, captura) y deja una línea en `docs/plans/personalidades-progreso.md`.
6. Ejecuta los carriles en el orden de la sección 10 y publica por hitos (H1–H5). Si un frente se bloquea, márcalo como bloqueado con el motivo y sigue con el siguiente; al final, entrega el informe con lo hecho, lo bloqueado y qué haría falta para destrabarlo.

Empieza ahora por la sección 10, paso 1.
