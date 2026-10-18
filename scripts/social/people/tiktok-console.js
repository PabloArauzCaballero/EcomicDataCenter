/*
 * Lectura de comentarios de TikTok de los creadores del ranking, para pegar en la CONSOLA de Chrome
 * (F12 → Consola) con una pestaña de TikTok ya iniciada. Lo ejecuta la persona dueña de la cuenta.
 *
 * - Lee 3 videos por creador (hasta 80 comentarios por video), saltando los fijados.
 * - Pausas de 4 a 14 s; se detiene solo ante captcha o 403.
 * - Guarda cada creador en localStorage (`__tt_results`) por si se recarga la pestaña.
 * - No cierres ni uses esa pestaña mientras corre (unas 2 horas). Estado: `__job` en la consola.
 * - Al terminar: `copy(localStorage.__tt_results)` y avisar; el resto lo hace Claude.
 *
 * Primero abre https://www.tiktok.com/@juniormavity7 (perfil cualquiera) y luego pega TODO este archivo.
 */
(() => {
  if (window.__job && window.__job.running) return 'ya corre';
  const TODO = [["P_JUNIOR_MAVITY","/@juniormavity7"],["P_LEONEL_FRANSEZZE","/@leonelfransezze"],["P_FABRICIO_BLACUTT","/@fabrublacutt_"],["P_ALBERTINA_SACACA","/@albertinasacaca1"],["P_DANIEL_DUENAS","/@daniel_duenas_z"],["P_ALE_PINEDO","/@alepinedotv"],["P_ALEXIUS","/@soyalexius"],["P_CANDRES_PEREDO","/@candresperedo"],["P_MAMEN_SAAVEDRA","/@mamensaavedra"],["P_CRIS_EMPRENDE","/@crissemprende"],["P_MARIA_LEYDI","/@marialeydi21"],["P_MANGUERITA","/@circomanguerita"],["P_LIZETH_CALLIZAYA","/@lizethcallizaya"],["P_CHIRULIPA_CACERES","/@chirulipa8"],["P_DANIELA_POL","/@danielapolofi"],["P_MILY_GONZALES","/@mily_gonzales_equilea"],["P_JUAN_CARLOS_MEDRANO","/@juancarlosmedranooficial"],["P_CRISTIAN_APAZA","/@cristianapazacoro"],["P_LAYME","/@layme1.h"],["P_ELIAS_AYAVIRI","/@eliasayaviriofici"],["P_CARLOS_MARQUINA","/@carlosmarquina"],["P_ALFREDO_SOLARES","/@alfredosolares.oficial"],["P_DONA_CASILDA","/@casildabolivia"],["P_OY_O","/@jhon.gonzalo18"],["P_ANABEL_ANGUS","/@anabelangusa"],["P_COCINANDO_CON_ELENA","/@cocinandoconelenabo"],["P_LISBETH_PERALTA","/@lisbethperaltamakeup"],["P_NANDO_PEREZ","/@nandoperez01"],["P_EL_CAPI","/@yosoyelcapi"],["P_EL_GORDO_TV","/@elgordo.tv"],["P_HENRRY_GABRIEL","/@henrry.gabriel"],["P_LOURDES_NATHALIA","/@lourdesmiranda17"],["P_LUZ_CRUZ","/@luzcruz2117"],["P_YARIT","/@yaritmusica"],["P_PIPOCA_SHOW","/@circopipocashow"],["P_EIMI_MIDDAGH","/@eimimiddagh"],["P_LA_WARMI_ROSA","/@la_warmi_rosa"],["P_AGRUPACION_MAGIOS","/@agrupacionmagios"],["P_XIME_ALI","/@xime__ali"],["P_IISAMAR_VARGAS","/@iisamarvg3"],["P_YOSSU_VALERIO","/@yossuvalerioo"],["P_MAMA_LUCY","/@la_dulce_mama_lucy"],["P_POLLO_GUVILL","/@pollitos_guvi"],["P_SANDRA_ALCAZAR","/@sandraalcazar"],["P_MARYCITA_MARYCITA","/@marycitamarycita"],["P_GRISEL_QUIROGA_OFICIAL","/@griselquirogaoficial"],["P_PEDRITO_DAZA","/@pedrito_daza"],["P_SAUL_MARTINEZ","/@saul.martiinez"],["P_ORTIZ_LIVE","/@ortiz_live"],["P_MAURICIO_LARA_OFICIAL","/@mauriciolaraoficial"],["P_FIORELLA_ZOE_ZAMORA_FERNANDEZ","/@fiorellazoezamora"],["P_EDDER_DHA","/@edder.dha"],["P_ADRI_NAVID","/@adrinavid"],["P_MARIA_RENE_LEANOS","/@rene_0002"],["P_JAY_JAY","/@...jay...jay"],["P_SARAH_SANABRIA","/@sarahandreasanabria"],["P_IVANNA_SALDANA","/@ivannar2s"],["P_PERLA_POTOSINA","/@marcelaugaldeasillanes"],["P_LOKILLA_69","/@lokilla.noemi"],["P_YHANE_VACA","/@yhane_vaca"],["P_FLOR_LIZA1","/@floreliza944"],["P_JOEL_RODRIGUEZ","/@joelrodriguezvidal"],["P_BOBY_VOP","/@boby..vop"],["P_SOY_CRIS_07","/@soy_cris_07"],["P_SAMAEL_EL_GRAN_HECHICERO","/@elgranhechicerobo"],["P_CLAUDIA_ARCE","/@claudiaarcelemaitre"],["P_MICHELLE_ANDRADE","/@mishvirmish"],["P_RODRIGO_PAZ_PEREIRA","/@rodrigopazpereira"],["P_EDMAND_LARA","/@capitan_lara"],["P_MANFRED_REYES_VILLA","/@manfredbolivia"],["P_ANDRONICO_RODRIGUEZ","/@andronico.rl"],["P_LUIS_ARCE","/@luchoxbolivia"],["P_LUIS_FERNANDO_CAMACHO","/@luisfercamachov"],["P_EVA_COPA","/@evacopabo"],["P_XIMENA_HERRERA","/@ximenaherrera77"],["P_CARLOS_MESA","/@carlosdmesag"],["P_JOSE_AUGUSTO_TORRES_GIL","/@malignobmx"],["P_LILIANA_CASTELLANOS","/@lilianacastellano44"]];
  const J = window.__job = { running: true, results: [], stopped: null, current: null, done: 0, total: TODO.length };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const head = () => document.body.innerText.slice(0, 900);
  const blocked = () => /HTTP ERROR 403|Se ha denegado|Verifica que eres|Arrastra el control|Verify to continue|Too many requests|Demasiadas solicitudes/i.test(head()) || !!document.querySelector('#captcha-verify-container-main-page, .captcha_verify_container, [class*="captcha_verify"]');
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(400); } return null; };
  const nav = (path) => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); };
  const closeModal = async () => { const b = document.querySelector('[data-e2e="browse-close"]'); if (b) b.click(); await waitFor(() => document.querySelector('[data-e2e="user-post-item"]') && !/\/video\//.test(location.pathname), 6000); };
  const save = () => { try { localStorage.setItem('__tt_results', JSON.stringify(J.results)); } catch (e) {} };
  const mine = (path) => [...document.querySelectorAll('[data-e2e="user-post-item"]')].filter((li) => { const a = li.querySelector('a[href*="/video/"]'); return a && a.getAttribute('href').toLowerCase().includes(path.toLowerCase() + '/video/'); });
  const loadProfile = async (path) => {
    const handle = path.slice(2).toLowerCase();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 0) { if (location.pathname.toLowerCase() !== path.toLowerCase()) nav(path); }
      else { nav('/'); await sleep(2500); nav(path); }
      await waitFor(() => document.title.toLowerCase().includes('@' + handle) || /No se pudo encontrar|no se encuentra|privad/i.test(head()), 20000);
      if (blocked()) return { blocked: true };
      if (/No se pudo encontrar|no se encuentra/i.test(head())) return { note: 'perfil no encontrado' };
      const ok = await waitFor(() => mine(path).length > 0, 15000);
      if (ok) return { items: mine(path) };
      if (/privad/i.test(head())) return { note: 'cuenta privada' };
    }
    return { note: 'sin videos visibles tras 3 intentos' };
  };
  (async () => {
    try {
      for (let i = 0; i < TODO.length; i++) {
        const [slug, path] = TODO[i];
        J.current = slug;
        const row = { slug, platform: 'tiktok', channel: 'https://www.tiktok.com' + path, videos: [], note: null };
        const res = await loadProfile(path);
        if (res.blocked) { J.stopped = 'bloqueo en perfil ' + slug; break; }
        if (!res.items) { row.note = res.note; J.results.push(row); J.done++; save(); await sleep(rnd(6000, 10000)); continue; }
        const wanted = res.items.filter((li) => !/Fijado|Pinned/i.test(li.innerText)).slice(0, 3).map((li) => { const a = li.querySelector('a[href*="/video/"]'); return { id: (a.href.match(/video\/(\d+)/) || [])[1], title: ((li.querySelector('img') || {}).alt || '').slice(0, 200) }; });
        for (const v of wanted) {
          const a = [...document.querySelectorAll('a[href*="/video/"]')].find((x) => x.href.includes(v.id));
          if (!a) continue;
          a.click();
          const first = await waitFor(() => document.querySelector('p[data-e2e="comment-level-1"]'), 10000);
          if (blocked()) { J.stopped = 'bloqueo en video de ' + slug; break; }
          const seen = new Set(); const comments = [];
          if (first) {
            let box = first.parentElement;
            while (box && !(box.scrollHeight > box.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
            let still = 0;
            for (let r = 0; r < 14 && comments.length < 60 && still < 3; r++) {
              for (const el of document.querySelectorAll('p[data-e2e="comment-level-1"]')) { const t = el.innerText.trim().slice(0, 500); if (t && !seen.has(t)) { seen.add(t); comments.push(t); } }
              const before = seen.size;
              if (box) box.scrollTop = box.scrollHeight; else window.scrollBy(0, 1500);
              await sleep(rnd(1000, 1700));
              still = seen.size === before && document.querySelectorAll('p[data-e2e="comment-level-1"]').length <= before ? still + 1 : 0;
            }
            for (const el of document.querySelectorAll('p[data-e2e="comment-level-1"]')) { const t = el.innerText.trim().slice(0, 500); if (t && !seen.has(t) && comments.length < 80) { seen.add(t); comments.push(t); } }
          }
          row.videos.push({ videoId: v.id, title: v.title, published: null, url: 'https://www.tiktok.com' + path + '/video/' + v.id, comments });
          await closeModal();
          await sleep(rnd(4000, 8000));
        }
        J.results.push(row); J.done++; save();
        if (J.stopped) break;
        console.log(`[${J.done}/${J.total}] ${slug}`);
        await sleep(rnd(8000, 14000));
      }
    } catch (e) { J.stopped = 'error: ' + String(e).slice(0, 200); }
    J.running = false; save();
    console.log('TERMINADO. Ahora ejecuta: copy(localStorage.__tt_results)', J.stopped || '');
  })();
  return 'iniciado ' + TODO.length;
})()
