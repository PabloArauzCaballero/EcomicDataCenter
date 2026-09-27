import { termView } from '../migration-sql/0078-widen-the-watchlist-again.view';
import type { MigrationContext } from '../migration.types';

/**
 * Un tercio del archivo no entraba en la seccion de Temas, y no porque no
 * hablara de economia.
 *
 * La lista de la 0066 encuentra algun tema en 26.628 de las 40.328 notas
 * publicadas. Las otras 13.700 —el 34% del archivo— no tocan ni un tema, asi
 * que no existen para ningun panel de esa seccion: ni se cuentan, ni se pueden
 * abrir, ni aparecen en la nube. Leer ese residuo explica por que, y no es que
 * la prensa hable de otra cosa.
 *
 * Faltaban palabras corrientes. `banco` no estaba —la entrada de credito decia
 * `banca`, que con el ancla de inicio de palabra no coge *banco*— y con ella se
 * caian 185 notas. `combustible` y `petroleo` no estaban, aunque si `diesel` y
 * `gasolina`. `gobierno` no estaba: estaban `ministerio` y `gobierno nacional`.
 * `minera` no estaba, porque `mineri` y `minero` no cogen el femenino. `bono`
 * no estaba: estaban `bono juancito` y `renta dignidad`, asi que el bono contra
 * el hambre y el bono Pepe —los dos mas nombrados del periodo— no eran de
 * nadie. Y `telferico` era una errata: con los acentos quitados la palabra es
 * `teleferico`, de modo que ese patron no encontro una sola nota en toda la
 * vida de la lista.
 *
 * Faltaban asuntos enteros. Las empresas y los empresarios, que son 1.261 notas
 * y no tenian entrada. Los paises con los que el pais comercia —Argentina,
 * Brasil, China, Chile, Peru—, 940. La economia dicha en general, 871. La
 * produccion y los productos, 564. Los informes y proyecciones, los acuerdos y
 * el dialogo, la Asamblea, las empresas estatales, el dinero en efectivo, el
 * consumo, las emergencias climaticas, la generacion electrica, los pagos y
 * cobros, las mujeres, jovenes y familias. Dieciseis temas nuevos en total,
 * cada uno en la familia donde su sentido llano cae, sin mover ninguno de sus
 * sitio.
 *
 * El resultado sobre las mismas 40.328 notas: el residuo baja de 13.700 a
 * 4.210, del 34,0% al 10,4%. De lo que queda, 1.326 notas son de deportes,
 * cronica roja, cultura, internacional y judicial —futbol, obituarios,
 * aniversarios: notas que no tienen tema economico porque no lo tienen—, y las
 * 2.884 restantes estan en categorias economicas pero en su mayoria son notas
 * que el clasificador de temas archivo mal («Always golea 4-0» consta como
 * POLITICA, «murio Valentin, el puma» como SECTOR_REAL). Eso ya no lo arregla
 * una lista de palabras; es el clasificador de categoria, y es otro trabajo.
 *
 * Ningun tema se queda vacio: los 140 encuentran al menos una nota, incluido
 * `MERCADO_ABASTO`, que con la lista vieja no encontraba ninguna.
 *
 * La vista es la definicion; `press_term_mention_snapshot` es su salida
 * guardada, y sin refrescarla el informe sigue leyendo la lista vieja. Por eso
 * el refresco va aqui dentro y no en una tarea aparte: este despliegue no tiene
 * a nadie con consola detras para lanzarlo.
 */

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.press_term_mention TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

/**
 * La copia materializada, puesta al dia con la lista nueva.
 *
 * Sin `CONCURRENTLY` a proposito: esa forma no corre dentro de una transaccion,
 * y las migraciones corren dentro de una. El bloqueo dura lo que tarda el
 * recalculo —unas decenas de segundos sobre cuarenta mil notas— y ocurre
 * mientras el contenedor nuevo todavia no sirve trafico.
 */
const refresh = `
SET statement_timeout = 0;
REFRESH MATERIALIZED VIEW read_models.press_term_mention_snapshot;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(termView);
  await context.sequelize.query(grants);
  await context.sequelize.query(refresh);
}

/** Una vista reemplazada en el sitio no tiene version anterior a la que volver. */
export async function down(): Promise<void> {
  return Promise.resolve();
}
