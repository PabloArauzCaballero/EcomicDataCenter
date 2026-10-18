/*
 * Lectura de comentarios de INSTAGRAM de los creadores del ranking, para pegar en la CONSOLA de Chrome
 * (F12 → Consola) con una pestaña de instagram.com ya iniciada. Lo ejecuta la persona dueña de la cuenta.
 *
 * - Lee 3 publicaciones por perfil (hasta 60 comentarios cada una), saltando las fijadas.
 * - Pausas de 6 a 25 s; se detiene solo ante aviso de límite, desafío o cierre de sesión.
 * - Guarda cada perfil en localStorage (`__ig_results`) por si se recarga la pestaña.
 * - No cierres ni uses esa pestaña mientras corre (1 a 2 horas). Estado: `__job` en la consola.
 * - Al terminar: `copy(localStorage.__ig2_results)` y avisar; el resto lo hace Claude.
 *
 * Primero abre https://www.instagram.com/ (con sesión iniciada) y luego pega TODO este archivo.
 */
(() => {
  if (window.__job && window.__job.running) return 'ya corre';
  const TODO = [["P_EVO_MORALES","/evomoralesayma/"],["P_MARCELO_MARTINS_MORENO","/marcelo_moreno/"],["P_JEANINE_ANEZ","/jeanineanez/"],["P_JORGE_QUIROGA_RAMIREZ","/tutoquiroga/"],["P_MICHELLE_ANDRADE","/mishvirmish/"],["P_GUILLERMO_VISCARRA_BRUCKNER","/billyvis13/"],["P_RAMIRO_VACA","/ramirovaca8/"],["P_DAVID_CHOQUEHUANCA","/laramadavid/"],["P_MOISES_PANIAGUA","/moises._.paniagua/"],["P_LUZMILA_CARPIO","/luzmilacarpio/"],["P_MARCO_BULACIA","/marquitobulacia/"],["P_CHI_HYUN_CHUNG","/chihyunchung7/"],["P_LUIS_HAQUIN","/luishaquin4/"],["P_MARCO_ETCHEVERRY","/marcoetcheverry10/"],["P_RODRIGO_RAMALLO","/r18ramallo/"],["P_VANESSA_ALFARO","/vanessaalfaro_official/"],["P_ELOISA_GUTIERREZ","/holasoyeloisa/"],["P_OSCAR_ORTIZ","/oscarortizantelo/"],["P_MARVIN_BEJARANO","/marvinbejarano17/"],["P_ADRIANA_SALVATIERRA","/adrianasalvatierraoficial/"],["P_BRUNO_FERRANTE","/brferrante/"],["P_CARLOS_DEL_CASTILLO","/edelcastillodc/"],["P_RECETAS_SALUDABLES_LUCIANA","/lu_fitfoodie/"],["P_REYNALDO_PACHECO","/reynaldo_pacheco/"],["P_KEILA_PEREZ","/_keilaperez_/"],["P_ANDRES_SALVATIERRA_J","/andres.salvatierraj/"],["P_ALESSANDRA_ANEZ","/facil_de_preparar/"],["P_GUISBERT_KALI","/guisbert_kali/"],["P_MARCO_ANTELO","/yeyoantelo/"],["P_MARTIN_SMEDBERG_DALENCE","/smedbergdalence/"],["P_ICIAR_DIAZ","/iciardiaz/"],["P_MARIA_RENE_POMACUSI_ANEZ","/mariarenepomacusi_/"],["P_CAROLINA_RODAS_CORTEZ","/carotvoficial/"],["P_LUIS_VEGA_OFICIAL","/luisvega_oficial/"],["P_SERGIO_ABEL_MENDEZ_TITZE","/baby_mendez_/"],["P_VALENTINA_SALAS","/valen.notes/"],["P_GABRIEL_APATA","/soy.nabriel/"],["P_LILIANA_CASTELLANOS","/lilianacastellanos_oficial/"],["P_LUISFER_SARABIA","/luisfer.sarabia/"],["P_PEDRO_AZOGUE","/pedroazogue22/"],["P_FRANCISCO_DA_COSTA","/_franciscodacosta/"],["P_ALANA_FERNANDEZ","/alanafernandezh/"],["P_VICTOR_ALONSO_ABREGO","/victoralonsoabrego/"],["P_BELEN_MENDEZ","/belenmendez_oficial/"],["P_EDIVALDO_ROJAS_HERMOZA","/edivaldo_rojas/"],["P_WENDY_CALLAU_DURAN","/wendycallauduran/"],["P_HENRY_VACA_U","/henryvaca10/"],["P_JULIETA_PAREDES_CARVAJAL","/julietaparedescarvajal/"],["P_KATHRIN_BARBOZA_MARQUEZ","/kat_murci_pilatera/"],["P_MARIANO_AGUILERA","/marianoaguilera/"],["P_CAMILA_BANZER_PARDO","/camilabanzer/"],["P_CARLA_MARIANA_BRAVO","/carla_mariana99/"],["P_LEONEL_FRANSEZZE","/leonelfransezze/"],["P_RODRIGO_PAZ_PEREIRA","/rodrigopazpereira/"],["P_ALBERTINA_SACACA","/albertinasacaca/"],["P_XIMENA_HERRERA","/ximenaherrera7/"],["P_ANABEL_ANGUS","/anabelangus/"],["P_LUIS_ARCE","/luchoxbolivia/"],["P_MANFRED_REYES_VILLA","/manfred_oficial/"],["P_CARLOS_MESA","/carlosdmesag/"],["P_JOSE_AUGUSTO_TORRES_GIL","/malignobmx/"],["P_CLAUDIA_ARCE","/claudiaarcelemaitre/"],["P_DANIEL_DUENAS","/daniel.duenas.z/"],["P_ALE_PINEDO","/alepinedotv/"],["P_FABRICIO_BLACUTT","/fabru_blacutt/"],["P_ELIAS_AYAVIRI","/eliasayavirioficial/"],["P_CANDRES_PEREDO","/candresperedo/"],["P_ALEXIUS","/soyalexius/"],["P_CRIS_EMPRENDE","/crissemprende/"],["P_CRISTIAN_APAZA","/cristianapazacoro/"],["P_MILY_GONZALES","/Mily_Gonzales_Equilea/"],["P_GABRIELA_ZEGARRA","/gabyzegarra_gz/"],["P_YOSSU_VALERIO","/yossuvalerio/"]];
  let prev = []; try { prev = JSON.parse(localStorage.getItem('__ig2_results') || '[]'); } catch (e) {}   // si se recargó la pestaña, retoma
  const J = window.__job = { running: true, results: prev, stopped: null, current: null, done: prev.length, total: TODO.length };
  const finished = new Set(prev.map((r) => r.slug));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const head = () => document.body.innerText.slice(0, 900);
  const blocked = () => /accounts\/login|\/challenge/.test(location.pathname) || /Espera unos minutos|Inténtalo de nuevo más tarde|Vuelve a intentarlo más tarde|Please wait a few minutes|Try again later/i.test(head()) || !!document.querySelector('input[name="username"]');
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(400); } return null; };
  const nav = (path) => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); };
  const save = () => { try { localStorage.setItem('__ig2_results', JSON.stringify(J.results)); } catch (e) {} };
  const posts = (handle) => [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].filter((a) => a.getAttribute('href').toLowerCase().includes('/' + handle + '/'));
  const headerIs = (handle) => { const h = document.querySelector('header'); return h && h.innerText.split('\n')[0].trim().toLowerCase() === handle; };
  const loadProfile = async (path) => {
    const handle = path.replace(/\//g, '').toLowerCase();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 0) { if (location.pathname.toLowerCase() !== path.toLowerCase()) nav(path); }
      else { nav('/'); await sleep(2500); nav(path); }
      await waitFor(() => headerIs(handle) || /no está disponible|no se encuentra|no existe/i.test(head()), 20000);
      if (blocked()) return { blocked: true };
      if (/no está disponible|no se encuentra|no existe/i.test(head()) && !headerIs(handle)) return { note: 'perfil no encontrado' };
      if (/Esta cuenta es privada/i.test(head())) return { note: 'cuenta privada' };
      const ok = await waitFor(() => posts(handle).length > 0, 15000);
      if (ok) return { items: posts(handle) };
    }
    return { note: 'sin publicaciones visibles tras 3 intentos' };
  };
  const parse = (li) => {
    const lines = li.innerText.split('\n').map((x) => x.trim()).filter(Boolean);
    const author = (lines.shift() || '').toLowerCase();
    const body = [];
    for (const l of lines) { if (/Responder$|^Editado|^Verificado|^Ver respuestas|^Ocultar respuestas/i.test(l)) break; body.push(l); }
    return [author, body.join(' ').trim()];
  };
  const closePost = async (path, handle) => {
    const x = document.querySelector('svg[aria-label="Cerrar"]');
    if (x) (x.closest('button, [role="button"]') || x.parentElement).click();
    await sleep(1200);
    if (!posts(handle).length || !headerIs(handle)) { nav(path); await waitFor(() => headerIs(handle) && posts(handle).length > 0, 15000); }
  };
  (async () => {
    try {
      for (let i = 0; i < TODO.length; i++) {
        const [slug, path] = TODO[i];
        if (finished.has(slug)) continue;
        const handle = path.replace(/\//g, '').toLowerCase();
        J.current = slug;
        const row = { slug, platform: 'instagram', channel: 'https://www.instagram.com' + path, videos: [], note: null };
        const res = await loadProfile(path);
        if (res.blocked) { J.stopped = 'bloqueo en perfil ' + slug; break; }
        if (!res.items) { row.note = res.note; J.results.push(row); J.done++; save(); await sleep(rnd(8000, 14000)); continue; }
        const wanted = res.items.filter((a) => !a.querySelector('svg[aria-label*="ijad"]')).slice(0, 3).map((a) => ({ href: a.getAttribute('href'), id: (a.getAttribute('href').match(/\/(?:p|reel)\/([^/]+)/) || [])[1], title: ((a.querySelector('img') || {}).alt || '').slice(0, 200) }));
        for (const v of wanted) {
          const a = [...document.querySelectorAll('a[href]')].find((x) => x.getAttribute('href') === v.href);
          if (!a) continue;
          a.click();
          // Espera la ventana de la publicación con al menos un comentario: el perfil de fondo ya tiene `ul li`.
          await waitFor(() => { const d = document.querySelector('div[role="dialog"]'); return d && /\/(p|reel)\//.test(location.pathname) && [...d.querySelectorAll('ul li')].some((li, i) => i > 0 && li.innerText.trim().length > 1); }, 15000);
          await sleep(1500);
          if (blocked()) { J.stopped = 'bloqueo en publicacion de ' + slug; break; }
          const comments = [];
          const root = () => document.querySelector('div[role="dialog"]') || document.createElement('div');
          for (let r = 0; r < 8 && root().querySelectorAll('ul li').length < 70; r++) {
            const s = root().querySelector('svg[aria-label="Cargar más comentarios"]');
            if (!s) break;
            (s.closest('button, [role="button"]') || s.parentElement).click();
            await sleep(rnd(1500, 2400));
          }
          const seen = new Set();
          [...root().querySelectorAll('ul li')].slice(1).forEach((li) => {
            const [author, text] = parse(li);
            const t = text.slice(0, 500);
            if (author && author !== handle && t && !seen.has(t) && comments.length < 60) { seen.add(t); comments.push(t); }
          });
          row.videos.push({ videoId: v.id, title: v.title, published: null, url: 'https://www.instagram.com' + v.href.replace(/^.*?\/(p|reel)\//, '/$1/'), comments });
          await closePost(path, handle);
          await sleep(rnd(6000, 11000));
        }
        J.results.push(row); J.done++; save();
        if (J.stopped) break;
        console.log(`[${J.done}/${J.total}] ${slug}`);
        await sleep(rnd(15000, 25000));
      }
    } catch (e) { J.stopped = 'error: ' + String(e).slice(0, 200); }
    J.running = false; save();
    console.log('TERMINADO. Ahora ejecuta: copy(localStorage.__ig2_results)', J.stopped || '');
  })();
  return 'iniciado ' + TODO.length;
})()
