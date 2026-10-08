# Carga independiente del estudio automotor

El paquete `automotive-study` conserva una compilación fechada en observaciones y evidencia. La migración 0101 ofrece vistas pequeñas por oferta, red, comparación y mercado, sin reconstruir prensa ni comercio. No elimina capturas anteriores.

Después de migrar, ejecutar dentro de la imagen:

```sh
node dist/database/seeds/runners/run-boot-seeds.js --only=automotive-study
```

En una publicación de Coolify se puede seleccionar `SEED_ONLY=automotive-study` para el servicio `seed`. Registrar su salida y restituir `SEED_ONLY=all` en la configuración **después** de terminar esa publicación, sin reiniciar la semilla; así no se limita inadvertidamente el siguiente despliegue diario. El argumento `--only` tiene precedencia. Un nombre desconocido falla explícitamente.

La reconstrucción de prensa tiene su entrada propia `dist/database/cli/refresh-press-snapshot.js` y el workflow `refresh-press-snapshot`. No ejecutarla como requisito de un cambio automotor. Sus límites de ejecución son independientes del catálogo del estudio; revisar estado del servidor antes de una reconstrucción pesada.

Validar `SELECT count(*) FROM read_models.automotive_offer`, `automotive_dealer` y `automotive_comparison`; ejecutar la semilla dos veces y comprobar que el número de observaciones `AUTOMOTIVE_STUDY` no aumenta. El tablero debe devolver `catalogOrigin=core` en `/api/transporte/estudio`.

Las capturas públicas y sus SHA-256 figuran en el JSON. El archivo local de respuestas originales se conserva en el árbol `output/automotor` del trabajo de investigación; una URL original no se presenta como archivo remoto inmutable. El HTTP 403 de Hyundai se conserva como fallo de captura y no se usa como evidencia archivada de un precio.
