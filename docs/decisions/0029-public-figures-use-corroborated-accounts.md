# ADR 0029 — Las personalidades públicas se investigan con cuentas corroboradas

- **Estado:** aceptada para el piloto de investigación
- **Fecha:** 2026-10-04
- **Relacionada con:** ADR 0022 y ADR 0027

## Contexto

Se solicitó estudiar 300 personalidades de Bolivia con dos criterios: alcance en redes sociales y relevancia pública en distintos sectores. El encargo incluye publicaciones, comentarios visibles, sentimiento y palabras frecuentes. La ADR 0027 prohibía leer cuentas de personas dentro del trabajo sobre empresas. Esta decisión abre un trabajo separado para figuras públicas adultas; la regla empresarial sigue vigente en su propio flujo.

Los directorios y buscadores ofrecen nombres y perfiles, pero también mezclan homónimos, cuentas de admiradores, organizaciones y personas de otros países. Una cuenta con el mismo nombre no demuestra que pertenezca a la persona. Las redes tampoco entregan la misma profundidad sin iniciar sesión: YouTube expone comentarios públicos; Instagram y TikTok casi siempre muestran solo cifras de interacción.

## Decisión

1. **Primero se documenta la persona.** El padrón de investigación reúne nombres con enlaces a Merco, el Órgano Electoral, universidades, el Comité Olímpico, el estudio IPDRS o Wikidata. El conjunto de 300 es una lista de revisión, sin puesto de popularidad. Una ficha de Wikidata por sí sola no confirma identidad, nacionalidad ni vigencia.
2. **Cada cuenta se corrobora antes de publicar métricas.** Los enlaces hallados en Wikidata, buscadores y directorios son pistas. Para el piloto se contrastan nombre, contenido del canal, actividad, fuente independiente y mayoría de edad. La ficha dice expresamente cuando no existe verificación de la plataforma.
3. **Solo se leen contenidos públicos y se respetan los muros.** La recolección no inicia sesión, no resuelve captchas, no interactúa con la cuenta ni interpreta una respuesta bloqueada como cero. El HTML y los comentarios crudos quedan en `artifacts/people-social-raw/`, fuera de Git.
4. **Los comentarios se publican solo como agregados.** El análisis toma los videos fechados en los 365 días anteriores a la corrida. Clasifica textos de cuatro palabras o más cuando el detector da al español una probabilidad mínima de 0,7. El modelo RoBERTuito en ONNX calcula polaridad; emoción e ironía se muestran por separado. Si hay menos de 30 comentarios aptos por persona o publicación, no se muestra porcentaje ni nube de palabras. No se publican autores, identificadores ni textos de quienes comentan.
5. **La muestra acompaña toda interpretación.** Un porcentaje describe únicamente los comentarios visibles que pudo leer el recolector en los videos seleccionados. No representa a todos los seguidores ni a la población boliviana. El número de comentarios capturados, descartados y analizados aparece junto a cada resultado.

## Resultado inicial y límite

La corrida del 4 de octubre de 2026 produjo un conjunto de 300 fichas de investigación. Hay 94 fichas con pistas de cuenta social y un piloto publicable de tres canales corroborados: Albertina Sacaca, Daniel Dueñas y Elías Ayaviri. En esos tres canales se capturaron 854 comentarios visibles y se clasificaron 610 en español. Las demás fichas carecen todavía de una cuenta corroborada con muestra suficiente. Por ello, el tablero no presenta un Top 300 definitivo ni ordena a las personas por los porcentajes de sentimiento.

Los datos agregados del piloto están en `scripts/social/people/pilot-3.json`. El padrón y las fuentes están en `scripts/social/people/research-300.json`. La interfaz solo muestra el número de pistas sin publicar sus enlaces como cuentas personales confirmadas.
