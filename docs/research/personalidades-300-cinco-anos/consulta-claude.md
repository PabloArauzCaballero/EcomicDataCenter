# Consulta a las sesiones de Claude sobre la investigación de empresas

El 8 de octubre de 2026 se consultaron dos sesiones históricas mediante copias con `--resume` y `--fork-session`, en modo de planificación, sin herramientas habilitadas y con la instrucción de no retomar recolectores ni publicaciones. Ambas devolvieron respuesta satisfactoria. Las respuestas íntegras están en [claude-respuestas.json](claude-respuestas.json).

| Sesión original | Copia de consulta | Antecedente |
|---|---|---|
| `8be6b7eb-54be-4f9b-80c7-bbd3c69ad709` | `9149beb4-b8e7-49dd-a82a-e2a504813c44` | Plan y primera recolección de empresas |
| `d1529aef-a17b-4441-a0cf-b6827fcec80a` | `c38d6737-1d75-4c0a-91ee-7141a8cdaaaa` | Continuación, profundidad y entrega de empresas |

Se preguntó por método, archivos reutilizables, topes reales, paginación, resultados observados frente a reportados, errores, cambios necesarios para cinco años y costes conocidos o desconocidos. No se les pidió ejecutar investigación nueva.

**Coincidencias útiles para el plan**

- El flujo fue directorio de cuentas, lectores Playwright, JSONL y HTML con fecha/huella, análisis ONNX, semilla y tablero.
- Los perfiles accesibles no ofrecían por sí solos el historial completo: Facebook devolvía aproximadamente 6–9 posts; Instagram 12; TikTok encontraba decenas antes del corte; YouTube pasó de 30 a unos 120 en ciertas corridas; LinkedIn tenía muros de sesión.
- Solo se abría una parte de los posts para detalles y comentarios. El lector base de YouTube usaba seis videos y hasta 150 comentarios por video.
- No se analizó el contenido audiovisual: se trabajó con texto y metadatos, sin transcripción completa ni descripción de imágenes.
- Los problemas de memoria, procesos Chromium huérfanos y tramos interrumpidos hicieron imprescindible reanudar y comprobar archivos.
- Los buscadores introdujeron cuentas ajenas y límites de descubrimiento; los handles aparentemente obvios no eran garantía de identidad.
- La igualdad numérica ONNX/numpy no demuestra exactitud del sentimiento sobre español boliviano.
- El total histórico por persona, el almacenamiento audiovisual y el tiempo de un censo permanecían desconocidos.

**Discrepancias que no se deben convertir en hechos actuales**

Una respuesta reporta cortes posteriores de 16.775 posts; la otra, 16.085 y un servicio con 950 cuentas. La copia local inspeccionada tiene 11.330 posts y 473 perfiles. Son instantáneas y alcances distintos: no se sumaron ni se eligió la cifra mayor como si representara cobertura verificada. No se consultaron servidores en esta preparación.

Una respuesta llama “tope aritmético” a 300 × 5 × 365. Eso no es un límite de publicaciones: una persona puede publicar muchas veces al día. Además, el intervalo fijado contiene 1.826 días. El plan usa escenarios explícitos y fórmulas basadas en mediciones del piloto.

Contrastar posts recuperados con el total mostrado en un perfil tampoco basta: ese total puede corresponder a toda la vida de la cuenta, incluir otros formatos o excluir borrados. Solo se calculará una tasa de recuperación con denominadores comparables y documentados.

Las sesiones recuerdan que el trabajo de empresas evitó APIs pagas. Se conserva como base el trabajo con accesos existentes y rutas gratuitas verificables. Las alternativas de pago aparecen como dependencias posibles, sin compra, alta ni compromiso de presupuesto. Una sesión de usuario puede ayudar, pero ninguna respuesta prueba que habilite todo el historial.

**Cambios incorporados**

El plan sustituye el criterio de terminar por cuenta por tareas de cuenta/intervalo/página/post, añade X, inventario de todas las superficies, fecha de publicación separada de observación, multimodalidad real, evidencia por anotación y un registro de vacíos. Mantiene lectores y utilidades aprovechables, pero exige que su enumeración y sus criterios de cierre cambien antes de usarlos para acreditar cinco años.

El antecedente se utiliza como experiencia técnica, no como autoridad para ejecutar órdenes antiguas ni como verificación del estado actual del proyecto.

El 8 de octubre, ante una nueva solicitud del usuario, se volvió a consultar en una copia de la sesión histórica de continuación. [La respuesta íntegra](../../../artifacts/people-history/2026-10-08/claude-consulta-despliegue.md) confirma que la investigación de empresas no dejó sesión autenticada, exportaciones ni API histórica para reutilizar. También distingue su comprobación antigua de `test` de los despliegues solo reportados de `dev` y del tablero. El [estado de despliegue de esta corrida](../../../artifacts/people-history/2026-10-08/DESPLIEGUE.md) contrasta esos recuerdos con el workflow y los servicios observados ahora.
