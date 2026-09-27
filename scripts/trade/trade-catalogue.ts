/**
 * Los nombres y las clasificaciones de lo que aparece en los registros.
 *
 * Cada fila de la base del INE repite la descripción de su partida, su país y
 * cinco clasificaciones (CUCI, GCE, CIIU, actividad económica y tradicional /
 * no tradicional en exportaciones; CUODE en importaciones). Guardarlas en cada
 * fila del cubo multiplicaría su tamaño por diez; se guardan una vez aquí y el
 * cubo lleva sólo los códigos.
 *
 * Se leen los años en orden y gana la última descripción vista: la NANDINA se
 * enmienda (2007, 2012, 2017, 2022) y el rótulo que el lector necesita es el
 * vigente, no el de 1992.
 */

import { preferredName, repaired } from './trade-text-repair';

export type Flow = 'X' | 'M';

export interface ProductEntry {
  name: string;
  chapter: string;
  cuci?: string;
  gce?: string;
  ciiu?: string;
  activity?: string;
  tnt?: string;
  use?: string;
}

export interface CatalogueOutput {
  readonly products: Record<string, ProductEntry>;
  readonly chapters: Record<string, { name: string | null; section: string | null }>;
  readonly sections: Record<string, string>;
  readonly activities: Record<string, { name: string; group: string }>;
  readonly traditional: Record<string, { name: string; group: string }>;
  readonly uses: Record<string, string>;
  readonly gce: Record<string, string>;
  readonly cuci: Record<string, string>;
  readonly ciiu: Record<string, string>;
  readonly countries: Record<string, { name: string; zone: string | null; bloc: string | null }>;
  readonly departments: Record<string, string>;
}

type Read = (field: string) => string;

const sorted = <T>(source: Map<string, T>): Record<string, T> =>
  Object.fromEntries([...source.entries()].sort(([left], [right]) => left.localeCompare(right)));

/** Quita el número con que el INE antepone algunos grupos: «1AGRICULTURA» → «AGRICULTURA». */
const bare = (label: string): string => label.replace(/^\s*\d+\s*/u, '').trim();

export class TradeCatalogue {
  private readonly products = new Map<string, ProductEntry>();
  private readonly chapters = new Map<string, { name: string | null; section: string | null }>();
  private readonly sections = new Map<string, string>();
  private readonly activities = new Map<string, { name: string; group: string }>();
  private readonly traditional = new Map<string, { name: string; group: string }>();
  private readonly uses = new Map<string, string>();
  private readonly gce = new Map<string, string>();
  private readonly cuci = new Map<string, string>();
  private readonly ciiu = new Map<string, string>();
  private readonly countries = new Map<
    string,
    { name: string; zone: string | null; bloc: string | null }
  >();
  private readonly departments = new Map<string, string>();

  /** Parte del catálogo ya publicado, para que refrescar un año no olvide los demás. */
  absorb(previous: CatalogueOutput): void {
    // Lo absorbido pasa por la misma reparación que lo leído: un catálogo escrito
    // antes de que existiera no debe arrastrar sus nombres rotos para siempre.
    const fix = (value: unknown): unknown => {
      if (typeof value === 'string') return repaired(value);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, fix(inner)]));
      }
      return value;
    };
    const load = <T>(into: Map<string, T>, from: Record<string, T> | undefined): void => {
      for (const [code, entry] of Object.entries(from ?? {})) into.set(code, fix(entry) as T);
    };
    load(this.products, previous.products);
    load(this.chapters, previous.chapters);
    load(this.sections, previous.sections);
    load(this.activities, previous.activities);
    load(this.traditional, previous.traditional);
    load(this.uses, previous.uses);
    load(this.gce, previous.gce);
    load(this.cuci, previous.cuci);
    load(this.ciiu, previous.ciiu);
    load(this.countries, previous.countries);
    load(this.departments, previous.departments);
  }

  learn(flow: Flow, read: Read): void {
    const nandina = read('nandina');
    const chapter = nandina.slice(0, 2);
    const product: ProductEntry = {
      ...this.products.get(nandina),
      name: preferredName(this.products.get(nandina)?.name, read('nandinaName')) || nandina,
      chapter,
    };
    const coded = (field: string, nameField: string, into: Map<string, string>): string => {
      const code = read(field);
      const name = read(nameField);
      if (code && name) into.set(code, preferredName(into.get(code), name));
      return code;
    };
    const cuci = coded('cuci', 'cuciName', this.cuci);
    const gce = coded('gce', 'gceName', this.gce);
    const ciiu = coded('ciiu', 'ciiuName', this.ciiu);
    if (cuci) product.cuci = cuci;
    if (gce) product.gce = gce;
    if (ciiu) product.ciiu = ciiu;

    if (flow === 'X') {
      const activity = read('activity');
      if (activity) {
        product.activity = activity;
        const known = this.activities.get(activity);
        this.activities.set(activity, {
          name: preferredName(known?.name, read('activityName')),
          group: preferredName(known?.group, bare(read('activityGroup'))),
        });
      }
      const tnt = read('tnt');
      if (tnt) {
        product.tnt = tnt;
        const known = this.traditional.get(tnt);
        this.traditional.set(tnt, {
          name: preferredName(known?.name, read('tntName')),
          group: preferredName(known?.group, bare(read('tntClass'))),
        });
      }
      const section = read('section');
      if (section)
        this.sections.set(section, preferredName(this.sections.get(section), read('sectionName')));
      this.chapters.set(chapter, {
        name:
          preferredName(this.chapters.get(chapter)?.name ?? undefined, read('chapterName')) || null,
        section: section || this.chapters.get(chapter)?.section || null,
      });
    } else {
      const use = coded('use', 'useName', this.uses);
      if (use) product.use = use;
      if (!this.chapters.has(chapter)) this.chapters.set(chapter, { name: null, section: null });
    }
    this.products.set(nandina, product);

    const country = read('country');
    if (country) {
      this.countries.set(country, {
        name: preferredName(this.countries.get(country)?.name, read('countryName')) || country,
        zone: preferredName(this.countries.get(country)?.zone ?? undefined, read('zone')) || null,
        bloc: preferredName(this.countries.get(country)?.bloc ?? undefined, read('bloc')) || null,
      });
    }
    const department = read('department');
    const departmentName = read('departmentName');
    if (department && departmentName) {
      this.departments.set(
        department,
        preferredName(this.departments.get(department), departmentName),
      );
    }
  }

  output(): CatalogueOutput {
    return {
      products: sorted(this.products),
      chapters: sorted(this.chapters),
      sections: sorted(this.sections),
      activities: sorted(this.activities),
      traditional: sorted(this.traditional),
      uses: sorted(this.uses),
      gce: sorted(this.gce),
      cuci: sorted(this.cuci),
      ciiu: sorted(this.ciiu),
      countries: sorted(this.countries),
      departments: sorted(this.departments),
    };
  }
}
