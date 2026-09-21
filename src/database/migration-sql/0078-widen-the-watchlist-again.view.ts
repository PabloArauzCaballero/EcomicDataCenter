import { watchlist } from './0078-widen-the-watchlist-again.vocabulary';

/**
 * El modelo de menciones, con la lista de temas ensanchada.
 *
 * Copia de la vista que escribio la 0066 — mismas columnas, mismo orden, mismo
 * origen — con una sola diferencia: el vocabulario que trae. La lectura mensual
 * (`press_term_month`) no cambia y por eso no se vuelve a escribir aqui: cuelga
 * de la instantanea de esta vista y hereda lo que esta empiece a encontrar.
 *
 * Se reemplaza en el sitio y no se borra: la copia materializada que creo la
 * 0053 cuelga de ella, y un DROP dejaria el informe sin seccion hasta el
 * siguiente refresco.
 */
export const termView = `
CREATE OR REPLACE VIEW read_models.press_term_mention AS
WITH vocabulary(term, label, family, pattern) AS (
  VALUES
${watchlist}
),
-- Se lee de la copia guardada del archivo, no de la vista que lo arma: son las
-- mismas notas, ya ensambladas. El CTE va MATERIALIZED para que quitar los
-- acentos se haga una vez por nota y no una vez por par (nota, tema).
article AS MATERIALIZED (
  SELECT
    fact_claim_id,
    event_date,
    outlet,
    topic,
    tone,
    region,
    translate(
      lower(coalesce(headline, '') || ' ' || coalesce(summary, '')),
      'áéíóúüñ',
      'aeiouun'
    ) AS searchable
  FROM read_models.press_article_snapshot
  WHERE status = 'PUBLISHED' AND NOT superseded
)
SELECT
  vocabulary.term,
  vocabulary.label,
  vocabulary.family,
  article.fact_claim_id,
  article.event_date,
  article.outlet,
  article.topic,
  article.tone,
  article.region
FROM article
JOIN vocabulary ON article.searchable ~ ANY (vocabulary.pattern);
`;
