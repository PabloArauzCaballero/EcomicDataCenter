import {
  articleReadingView,
  fillFunction,
  functions,
  termReadingView,
} from '../migration-sql/0093-read-each-press-note-once.view';
import { articleView } from '../migration-sql/0071-widen-the-coverage-lexicon.view';
import { termView } from '../migration-sql/0078-widen-the-watchlist-again.view';
import type { MigrationContext } from '../migration.types';

/**
 * Cada nota de prensa se lee una vez, no en cada despliegue.
 *
 * Las dos vistas de prensa reclasificaban el archivo entero (mas de 40.000 notas,
 * unos 120 ms cada una con las expresiones regulares del lexico) cada vez que se
 * refrescaba su copia, y la copia se refresca en cada despliegue que trae notas
 * nuevas. En Contabo eso eran mas de dos horas por despliegue; el tope de
 * sentencia cancelaba el refresco y la prensa se quedaba en el dia anterior
 * hasta que otro despliegue lo volvia a intentar y lo volvia a perder.
 *
 * Lo unico que cambia lo que una nota significa es el lexico, asi que se guarda
 * la lectura de cada nota junto con la huella del lexico que la produjo. Ver el
 * comentario de `0093-read-each-press-note-once.view.ts` para como se detecta un
 * lexico nuevo y que pasa mientras una nota no tiene lectura guardada.
 *
 * ## Si hay que ensanchar el lexico otra vez
 *
 * Se hace `CREATE OR REPLACE FUNCTION read_models.press_classify(...)` (o
 * `press_term_hits`) en una migracion nueva. NO se reemplaza la vista, como hacian
 * la 0060 y la 0071: la vista ya no lleva el lexico dentro. La huella cambia sola
 * y la siguiente reconstruccion relee el archivo.
 *
 * Esta migracion no rellena nada: un despliegue no se queda esperando minutos. La
 * primera reconstruccion de la copia lo hace por lotes (`fill_press_readings`),
 * y entre tanto las vistas responden calculando al vuelo, igual que antes.
 *
 * Las tablas se declaran aqui y no en `migration-sql`: la puerta del modelo fisico
 * lee los archivos de migracion, y una tabla declarada en otro sitio no existe
 * para ella.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS intelligence.press_claim_reading (
  fact_claim_id uuid NOT NULL PRIMARY KEY
    REFERENCES intelligence.fact_claim (fact_claim_id) ON DELETE CASCADE,
  class_digest varchar(32) NOT NULL,
  term_digest varchar(32) NOT NULL,
  topic text NOT NULL,
  tone text NOT NULL,
  region text NOT NULL,
  read_at timestamptz NOT NULL,
  CONSTRAINT ck_press_claim_reading_class_digest CHECK (class_digest ~ '^[a-f0-9]{32}$'),
  CONSTRAINT ck_press_claim_reading_term_digest CHECK (term_digest ~ '^[a-f0-9]{32}$')
);

CREATE TABLE IF NOT EXISTS intelligence.press_claim_term (
  fact_claim_id uuid NOT NULL
    REFERENCES intelligence.fact_claim (fact_claim_id) ON DELETE CASCADE,
  term text NOT NULL,
  label text NOT NULL,
  family text NOT NULL,
  PRIMARY KEY (fact_claim_id, term)
);
  `);

  await context.sequelize.query(functions);
  await context.sequelize.query(fillFunction);
  await context.sequelize.query(articleReadingView());
  await context.sequelize.query(termReadingView);

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT USAGE ON SCHEMA read_models TO backend_writer;
    GRANT EXECUTE ON FUNCTION read_models.fill_press_readings(integer) TO backend_writer;
  END IF;
END
$$;
  `);
}

/** Devuelve las vistas a como las dejaron la 0071 y la 0078, y quita las lecturas guardadas. */
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(articleView);
  await context.sequelize.query(termView);
  await context.sequelize.query(`
DROP FUNCTION IF EXISTS read_models.fill_press_readings(integer);
DROP TABLE IF EXISTS intelligence.press_claim_term;
DROP TABLE IF EXISTS intelligence.press_claim_reading;
DROP FUNCTION IF EXISTS read_models.press_class_digest();
DROP FUNCTION IF EXISTS read_models.press_term_digest();
DROP FUNCTION IF EXISTS read_models.press_classify(text);
DROP FUNCTION IF EXISTS read_models.press_term_hits(text);
  `);
}
