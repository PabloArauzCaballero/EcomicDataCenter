# Cuarentena del código ajeno al núcleo económico

## Decisión

La aplicación de producción solo compila, analiza y prueba el núcleo que `AppModule` registra: configuración, persistencia, observabilidad, gobierno de metadatos, procedencia, ingestión, consultas, calidad y salud.

El repositorio conserva carpetas heredadas de otros productos, pero esas carpetas no forman parte del grafo de dependencias del Observatorio Económico. Incluirlas en los gates globales producía tiempos de análisis excesivos, cientos de hallazgos sin relación con el dominio y riesgo de incorporar accidentalmente servicios no autorizados.

## Rutas en cuarentena

- `src/modules/accounting`
- `src/modules/advertising`
- `src/modules/analytics`
- `src/modules/appointments`
- `src/modules/audit`
- `src/modules/auth`
- `src/modules/cms`
- `src/modules/content`
- `src/modules/files`
- `src/modules/homepage`
- `src/modules/legacy-compatibility`
- `src/modules/messaging`
- `src/modules/roles-permissions`
- `src/modules/scheduling`
- `src/modules/therapy-catalog`
- `src/modules/users`
- `src/database/seeders`
- `test`
- carpetas heredadas `storage`, `templates` y `workflows`

## Controles

1. `tsconfig.json` incluye explícitamente las rutas autorizadas del núcleo.
2. ESLint y Prettier excluyen las rutas en cuarentena.
3. Jest limita sus raíces a las pruebas del núcleo.
4. `tsconfig.build.json` hereda el mismo alcance y excluye pruebas y scripts.
5. Cualquier reactivación requiere ADR, revisión de seguridad, pruebas y registro explícito en `AppModule`.

## Riesgo residual

Mantener código ajeno dentro del mismo repositorio sigue aumentando la superficie de revisión y puede confundir a operadores. La corrección estructural recomendada es extraerlo a un repositorio histórico o eliminarlo en una entrega separada, después de confirmar con los propietarios que no existe dependencia contractual.
