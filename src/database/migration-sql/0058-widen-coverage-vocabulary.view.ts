/**
 * The article view exactly as migration 0058 wrote it.
 *
 * A snapshot, never edited: a later change to how coverage is filed is a later
 * migration with its own copy, so rolling forward and back always replays the
 * definition that step actually applied.
 */

export const articleView = `
CREATE OR REPLACE VIEW read_models.press_article AS
WITH published AS (
  SELECT
    fc.fact_claim_id,
    ro.raw_observation_id,
    fc.event_date,
    fc.published_at,
    ro.received_at,
    ro.payload_json ->> 'outlet'          AS outlet,
    ro.payload_json ->> 'domain'          AS domain,
    ro.payload_json ->> 'section'         AS section,
    ro.payload_json ->> 'headline'        AS headline,
    ro.payload_json ->> 'summary'         AS summary,
    ro.payload_json ->> 'statedInstant'   AS stated_instant,
    ro.payload_json ->> 'url'             AS article_url,
    ro.payload_json ->> 'listingUrl'      AS listing_url,
    artifact.sha256                       AS evidence_sha256,
    ro.payload_json ->> 'retrievalMethod' AS retrieval_method,
    fc.confidence_level,
    fc.status,
    (fc.superseded_by_claim_id IS NOT NULL) AS superseded,
    fc.assertion,
    evidence.excerpt
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro
    ON ro.raw_observation_id = fc.raw_observation_id
  JOIN provenance.source_artifact artifact
    ON artifact.source_artifact_id = ro.source_artifact_id
  LEFT JOIN LATERAL (
    SELECT ce.excerpt
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
    ORDER BY ce.claim_evidence_id
    LIMIT 1
  ) AS evidence ON true
  WHERE ro.payload_json ->> 'dataCategory' = 'PRESS_COVERAGE'
    AND ro.payload_json ->> 'headline' IS NOT NULL
)
SELECT
  published.*,
  CASE
    WHEN subject ~ ANY (ARRAY[
        '\\mdiesel', '\\mgasolina', '\\mcombustible', '\\mcarburante', '\\mypfb\\M',
        '\\mhidrocarburo', '\\msurtidor', '\\mgas\\M', '\\mgasod', '\\manh\\M',
        '\\mrefineri', '\\mglp\\M', '\\mgarrafa', '\\mpetrole', '\\mcrudo\\M',
        '\\mestacion(es)? de servicio', '\\mpozo', '\\mreservorio', '\\mducto',
        '\\mcisterna', '\\mmegacampo', '\\mgas natural', '\\mgnv\\M', '\\mbutano',
        '\\mtaladro', '\\mperforacion', '\\mcaipipendi\\M', '\\mmargarita\\M',
        '\\mincahuasi\\M', '\\msabalo\\M', '\\mtcf\\M', '\\mgnl\\M', '\\mfracking',
        '\\mplanta de gas', '\\mvolumen(es)? de gas', '\\mbrent\\M', '\\mwti\\M',
        '\\mopep\\M', '\\mbarril', '\\mnafta\\M', '\\mjet fuel', '\\moctanaje', '\\midh\\M',
        '\\mpetrobras\\M', '\\mtariquia\\M', '\\mbiocombustible', '\\mareas reservadas',
        '\\mextractiv'
    ]) THEN 'HIDROCARBUROS'
    WHEN subject ~ ANY (ARRAY[
        '\\mtipo de cambio', '\\mdolar', '\\mbrecha cambiaria', '\\mdivisa', '\\mparalelo',
        '\\mbolivianos por', '\\mremesa', '\\meuro\\M', '\\mcripto', '\\musdt\\M',
        '\\mstablecoin', '\\mcasa(s)? de cambio', '\\mcambista', '\\mdevaluacion',
        '\\mtipo cambiario', '\\myuan', '\\mmoneda extranjera', '\\mescenario cambiario',
        '\\mgiro(s)? al exterior', '\\mbitcoin', '\\mcotizacion', '\\mcotiza\\M',
        '\\mmoneda\\M', '\\mmonedas\\M'
    ]) THEN 'CAMBIARIO'
    WHEN subject ~ ANY (ARRAY[
        '\\minflacion', '\\mcanasta', '\\mcarestia', '\\mprecio', '\\mencarec', '\\mipc\\M',
        '\\mcosto de vida', '\\mtarifa', '\\mabarrote', '\\mmercado(s)? de abasto',
        '\\msobreprecio', '\\mespeculacion', '\\macaparamiento', '\\magio\\M', '\\mcosto\\M',
        '\\mcostos\\M', '\\mcaro\\M', '\\mcara\\M', '\\mbarato', '\\mabaratar',
        '\\mreajuste de precio'
    ]) THEN 'PRECIOS'
    WHEN subject ~ ANY (ARRAY[
        '\\mbanco central', '\\mbcb\\M', '\\mreservas internacionales', '\\mrin\\M',
        '\\mcredito', '\\mtasa(s)? de interes', '\\masfi\\M', '\\mbolsa de valores',
        '\\mbbv\\M', '\\msistema financiero', '\\mbanc', '\\mfmi\\M', '\\mfondo monetario',
        '\\mbanco mundial', '\\mcaf\\M', '\\mbid\\M', '\\mcalificadora', '\\mdeposito',
        '\\mmicrofinan', '\\mcooperativa(s)? de ahorro', '\\mliquidez', '\\mencaje',
        '\\mmicrocredito', '\\mcajero', '\\mtarjeta de credito', '\\mtarjeta de debito',
        '\\mseguro(s)?\\M', '\\msoat\\M', '\\mprestamo', '\\mprestatario', '\\mmora\\M',
        '\\mdpf\\M', '\\mbillete', '\\mfassil\\M', '\\mtitulariz', '\\mfintech',
        '\\minclusion financiera', '\\mdesembolso', '\\mfideicomiso', '\\mmutual',
        '\\mcartera de credito', '\\mahorrista', '\\mrefinanciac', '\\mdiferimiento',
        '\\musura', '\\mlavado de dinero', '\\mriesgo pais', '\\mrating', '\\mreservas\\M',
        '\\mifd\\M', '\\mburo\\M', '\\mutilidad', '\\msubasta', '\\mboleta\\M', '\\mavaluo',
        '\\mfinanciac', '\\mfinanciamiento', '\\masoban\\M', '\\mmercantil',
        '\\mtransaccion', '\\mfitch\\M', '\\mmoody', '\\mstandard\\M',
        '\\mentidad(es)? financiera', '\\muif\\M', '\\mdinero', '\\mefectivo\\M',
        '\\mahorro', '\\mgiro(s)?\\M', '\\mbursatil', '\\memision de bono', '\\minteres\\M',
        '\\mintereses\\M', '\\mfondo(s)? de inversion', '\\msafi\\M',
        '\\mcuenta(s)? bancaria', '\\mfinanzas', '\\mpatrimonio autonomo',
        '\\magencia de bolsa', '\\mecofuturo\\M', '\\mprocredit\\M', '\\mindemnizacion',
        '\\mrentab', '\\mfinanciera', '\\mmillonari', '\\mbidesa\\M', '\\mliquidacion',
        '\\mcuota(s)?\\M', '\\mplan(es)? de pago', '\\mreprogram', '\\mvencimiento',
        '\\mnegociacion de valores', '\\mcartera\\M', '\\megreso', '\\maseguradora',
        '\\mcobertura', '\\mdow jones', '\\mnasdaq\\M', '\\msalvataje', '\\mquiebra',
        '\\mesquema(s)? piramidal', '\\mqr\\M', '\\mretroactivo', '\\mestado financiero',
        '\\mbalance\\M'
    ]) THEN 'MONETARIO'
    WHEN subject ~ ANY (ARRAY[
        '\\mdeficit', '\\mpresupuest', '\\mdeuda', '\\mendeud', '\\mbono(s)? soberano',
        '\\mimpuesto', '\\msubvencion', '\\msubsidio', '\\mtesoro general', '\\mtgn\\M',
        '\\mregalia', '\\mrecaudac', '\\mtributar', '\\mcontralor', '\\mgasto publico',
        '\\mgasto corriente', '\\mausteridad', '\\mlicitacion', '\\mcontrato estatal',
        '\\maduana', '\\mimpuestos nacionales', '\\mmalversac', '\\mpge\\M', '\\miue\\M',
        '\\miva\\M', '\\mrc-iva\\M', '\\mit\\M', '\\mpatente', '\\mcontribuyente',
        '\\mexencion', '\\mformulario', '\\mfactura', '\\mfacturac', '\\mcoparticipac',
        '\\mauditoria', '\\mpacto fiscal', '\\mfiscal\\M', '\\mfiscales\\M',
        '\\mtransparencia presupuestaria', '\\mrecursos publicos', '\\mdano economico',
        '\\mdesfalco', '\\mperjuicio al estado', '\\mcredito(s)? externo',
        '\\mfondos publicos', '\\mrentas\\M', '\\mnit\\M', '\\mrecaud', '\\mimpositiv',
        '\\mpanama papers', '\\mfacilidades de pago', '\\marbitraje', '\\mlaudo',
        '\\mnacionalizac', '\\mdonacion', '\\mcontrato\\M', '\\mcontratos\\M', '\\madjudic',
        '\\mconcesion', '\\mevasion', '\\melusion', '\\migf\\M', '\\mempresa(s)? estatal',
        '\\mestatiz', '\\mprecintad', '\\mdesprecint', '\\mplanilla', '\\merario',
        '\\mfondo(s)? publico', '\\msegip\\M', '\\munidad de inversion', '\\mupre\\M',
        '\\mfisco', '\\msuperavit', '\\mproyecto(s)? fantasma', '\\mirregularidades',
        '\\mperdonazo', '\\mmalvers', '\\mitem(s)? fantasma', '\\minstitucionalidad',
        '\\mdesvio de fondos', '\\mametex\\M', '\\mcotas\\M', '\\mrendir cuentas',
        '\\mreasignacion', '\\mestado de excepcion', '\\mcalamidad'
    ]) THEN 'FISCAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mexport', '\\mimport', '\\marancel', '\\mbalanza comercial', '\\mcontrabando',
        '\\mmercado externo', '\\mmercado internacional', '\\mcomercio exterior',
        '\\mcomercio internacional', '\\mmercosur\\M', '\\mtratado comercial',
        '\\mlibre comercio', '\\macuerdo comercial', '\\mnuevos mercados', '\\mbioceanic',
        '\\mhidrovia', '\\mzona franca', '\\mcan\\M', '\\mchuto', '\\mreexport',
        '\\mpuerto(s)? de\\M', '\\mtransito aduanero', '\\mfrontera',
        '\\mrelacion(es)? comercial', '\\mcomercio bilateral', '\\mpuerto(s)? chileno',
        '\\marica\\M', '\\miquique\\M', '\\mpaso fronterizo', '\\mferia internacional',
        '\\mmercado chino', '\\maduanero', '\\mtratado', '\\minternacionaliz',
        '\\mcomercializa(r|cion) (al|en el) exterior'
    ]) THEN 'COMERCIO_EXTERIOR'
    WHEN subject ~ ANY (ARRAY[
        '\\mempleo', '\\mempleab', '\\mempleado', '\\mempleador', '\\msalari',
        '\\mdesempleo', '\\maguinaldo', '\\mtrabajador', '\\mgremial', '\\msindicat',
        '\\mjubila', '\\mpension', '\\mgestora\\M', '\\mtransportista', '\\mobrero',
        '\\mfabril', '\\mcob\\M', '\\mmano de obra', '\\minformalidad', '\\mformalidad',
        '\\mchofer', '\\mconflicto laboral', '\\mrenta dignidad', '\\mdespido',
        '\\maporte(s)?\\M', '\\mafp\\M', '\\mhaberes', '\\mcotizante', '\\mteletrabajo',
        '\\mcontratac', '\\mcondiciones laborales', '\\msalario minimo',
        '\\mfuente(s)? de trabajo', '\\mcesantia', '\\mmercado laboral', '\\mvacacion',
        '\\mlaboral', '\\mdesocupacion', '\\minsercion laboral', '\\mtrabajo\\M',
        '\\mtransporte pesado', '\\mcuentapropi', '\\mreincorporac', '\\mdespedid',
        '\\mplanilla salarial', '\\mcepb\\M', '\\mconamype\\M', '\\mmype', '\\mmicroempresa',
        '\\mprofesional', '\\mcapacitacion laboral', '\\mhorario de atencion',
        '\\mfuncionario', '\\mpersonal\\M', '\\mnaabol\\M', '\\mexaasana\\M', '\\mrecontrat',
        '\\mextrabajador', '\\mitem(s)?\\M'
    ]) THEN 'LABORAL'
    WHEN subject ~ ANY (ARRAY[
        '\\melectricidad', '\\melectric', '\\mende\\M', '\\mendes\\M', '\\melfec\\M',
        '\\mhidroelectric', '\\menergia', '\\menergetic', '\\mapagon', '\\mtermoelectric',
        '\\mlitio\\M', '\\mylb\\M', '\\menergias renovables', '\\mpanel(es)? solar',
        '\\mmegavatio', '\\mgeneracion electrica', '\\mtendido electrico', '\\mnuclear',
        '\\mbiodiesel', '\\metanol', '\\mcarbonato de litio', '\\msalar de uyuni',
        '\\mhidrogeno verde', '\\mcotel\\M', '\\mgeneradora', '\\mcloruro de potasio',
        '\\mbateria', '\\mlithco\\M', '\\msalar\\M', '\\msalmuera', '\\maerogenerador',
        '\\mparque eolico', '\\meolic', '\\melectrificacion', '\\mchepete', '\\mel bala\\M',
        '\\mrositas\\M', '\\msiniestro', '\\mgeneracion distribuida', '\\mmiguillas\\M',
        '\\mmegahidroelectric', '\\mtendido\\M', '\\mlinea blanca'
    ]) THEN 'ENERGIA'
    WHEN subject ~ ANY (ARRAY[
        '\\mincendio', '\\msequia', '\\minundac', '\\mriada', '\\mgranizad', '\\mgranizo',
        '\\mhelada', '\\mdesastre natural', '\\mdesastre ambiental', '\\mel nino\\M',
        '\\mla nina\\M', '\\mdeshielo', '\\mchaqueo', '\\mquema', '\\mdeforestac',
        '\\memergencia climat', '\\mnevada', '\\mnieve', '\\mlluvia', '\\mtormenta',
        '\\msenamhi\\M', '\\malerta roja', '\\malerta naranja', '\\mfrente frio',
        '\\msurazo', '\\mola de calor', '\\maltas temperaturas',
        '\\mdescenso de temperatura', '\\mpronostico del tiempo', '\\mcambio climatico',
        '\\mfuego\\M', '\\mhectareas quemadas', '\\mdesborde', '\\mreforest',
        '\\mmedio ambiente', '\\mambiental', '\\mcontaminac', '\\mmercurio\\M',
        '\\mescasez de agua', '\\mcrisis del agua', '\\mestres hidrico', '\\mclima\\M',
        '\\mbosque', '\\mabt\\M', '\\marea(s)? protegida', '\\mbiodiversidad', '\\mforestal',
        '\\mecolog', '\\msostenib', '\\mglasgow\\M', '\\mcop\\d'
    ]) THEN 'CLIMA'
    WHEN subject ~ ANY (ARRAY[
        '\\masesin', '\\mhomicid', '\\mfeminicid', '\\mcrimen', '\\mdelincuen', '\\matraco',
        '\\msecuestr', '\\mviolacion\\M', '\\mnarcotraf', '\\msicari', '\\mbalacera',
        '\\mallanamiento', '\\mantisocial', '\\macribill', '\\mapunal', '\\mcadaver',
        '\\mlinchamiento', '\\mestafa', '\\mextorsion', '\\mrobo\\M', '\\mroban\\M',
        '\\mdroga', '\\mcocaina', '\\mtrata de personas', '\\mcontrabandista',
        '\\mavasallamiento violento', '\\mjuku', '\\mforense', '\\mdelito', '\\mhurto',
        '\\mantidroga', '\\mfelcn\\M', '\\mfelcc\\M'
    ]) THEN 'CRONICA_ROJA'
    WHEN subject ~ ANY (ARRAY[
        '\\mfutbol', '\\mclub\\M', '\\mcampeonato', '\\mtorneo', '\\mseleccion nacional',
        '\\matleta', '\\molimpi', '\\mmundial de futbol', '\\mstrongest\\M', '\\mbolivar\\M',
        '\\mwilstermann\\M', '\\moriente petrolero', '\\mblooming\\M', '\\mjugador',
        '\\mpartido de\\M', '\\mgol(es)?\\M', '\\mdeportiv', '\\mdeporte',
        '\\mcopa libertadores', '\\msudamericana\\M', '\\mfifa\\M', '\\mconmebol\\M',
        '\\mentrenador', '\\mdakar\\M', '\\mmaraton', '\\mciclis', '\\mskyrunning\\M',
        '\\mautomovilis', '\\mtenis\\M', '\\mbasquet', '\\mvoleibol', '\\majedrez'
    ]) THEN 'DEPORTES'
    WHEN subject ~ ANY (ARRAY[
        '\\mfestival', '\\mmuseo', '\\mteatro', '\\mcine\\M', '\\mpelicula', '\\mcineasta',
        '\\mmusica', '\\mmusical', '\\mcancion', '\\mconcierto', '\\mlibro', '\\mescritor',
        '\\mpoeta', '\\mpintor', '\\mexposicion artistica', '\\mpatrimonio', '\\mcarnaval',
        '\\mentrada folklorica', '\\mmorenada', '\\mcaporal', '\\mdanza', '\\martista',
        '\\marte\\M', '\\mcultural', '\\mgastronom', '\\msingani', '\\mwhisky',
        '\\mcerveza artesanal', '\\mvendimia', '\\mchef\\M', '\\mreceta', '\\mtradicion',
        '\\mancestral', '\\mvideoclip', '\\mbicentenario', '\\mtelenovela', '\\mfotografia',
        '\\malunizaje', '\\mespacial', '\\mnasa\\M', '\\mperseverance\\M', '\\mfolklor',
        '\\mceremonia', '\\mhomenaje', '\\maniversario patrio', '\\mchef', '\\mrestaurant',
        '\\mcueca\\M', '\\msan juan\\M', '\\mindependencia', '\\mprotocolar',
        '\\mcosquin\\M', '\\mrocker', '\\mmusico'
    ]) THEN 'CULTURA'
    WHEN subject ~ ANY (ARRAY[
        '\\mcarretera', '\\mobra(s)?\\M', '\\mtren\\M', '\\mtrenes\\M', '\\mferroviari',
        '\\maeropuerto', '\\mpuente', '\\mdoble via', '\\masfalt', '\\mvivienda',
        '\\mterminal', '\\mpasajero', '\\mviajero', '\\mpeaje', '\\minfraestructura',
        '\\mconstruccion', '\\mabc\\M', '\\mvia\\M', '\\mvias\\M', '\\mcamino', '\\mruta\\M',
        '\\mrutas\\M', '\\mtramo', '\\mpavimen', '\\mtelefer', '\\malcantarillado',
        '\\magua potable', '\\mrepresa', '\\mmetropolitano', '\\mtransporte\\M',
        '\\mcarga\\M', '\\mlogistic', '\\mlocomotora', '\\mpuerto', '\\mdgac\\M',
        '\\msabsa\\M', '\\mviru viru', '\\maeronaut', '\\mamaszonas\\M', '\\mecojet\\M',
        '\\mparqueo', '\\mpaso peatonal', '\\malcantari', '\\mderrumbe', '\\mtam\\M',
        '\\menfe\\M', '\\mnaviera', '\\mbarcaza', '\\msillar\\M', '\\mvuelo', '\\maerolinea',
        '\\mboa\\M', '\\maasana\\M', '\\mcondominio', '\\murbaniz', '\\mciudadela',
        '\\mdesliza', '\\mcadecocruz\\M', '\\mconstructor', '\\minmobiliari',
        '\\mlote(s)?\\M', '\\mterreno', '\\mpasaje', '\\mtupac katari\\M', '\\msatelite',
        '\\medificio', '\\mparque industrial', '\\mestanque', '\\mferrocarril',
        '\\mportuario', '\\mdescongestion', '\\mamerican airlines', '\\mboeing\\M',
        '\\mairbus\\M', '\\minterdepartamental', '\\maevivienda\\M', '\\mepizana\\M',
        '\\mcorredor', '\\mpolarizad', '\\mdoble via', '\\mcierre\\M'
    ]) THEN 'INFRAESTRUCTURA'
    WHEN subject ~ ANY (ARRAY[
        '\\mpobreza', '\\mdesigualdad', '\\msalud\\M', '\\mhospital', '\\meducacion',
        '\\mbono juana', '\\mbono\\M', '\\mbonos\\M', '\\mbeca', '\\muniversidad',
        '\\mestudiante', '\\mcapacitac', '\\minfantil', '\\mseguridad alimentaria',
        '\\mdesnutric', '\\mmigrac', '\\mcovid', '\\mpandemia', '\\mcoronavirus',
        '\\mcuarentena', '\\mvacuna', '\\mdosis\\M', '\\mbarbijo', '\\mine\\M',
        '\\mcenso\\M', '\\mpoblacion\\M', '\\madulto mayor', '\\mdiscapacid',
        '\\mclase media', '\\mtercera edad', '\\mrenta\\M', '\\mmujer', '\\mmujeres\\M',
        '\\mgenero\\M', '\\mnino', '\\mninez', '\\madolescente', '\\mjoven', '\\mjuventud',
        '\\mfamilia', '\\mvulnerab', '\\mderechos humanos', '\\mddhh\\M', '\\municef\\M',
        '\\monu\\M', '\\mfundacion', '\\mong\\M', '\\msolidari', '\\mdonaci', '\\mvoluntari',
        '\\mteleton', '\\mmedic', '\\mfarmac', '\\menfermed', '\\mcedla\\M', '\\minquilino',
        '\\mdesalojo', '\\mreligion', '\\miglesia', '\\mciego', '\\mupea\\M', '\\mumsa\\M',
        '\\muagrm\\M', '\\muniversitari', '\\mindemnizac', '\\mbeneficios sociales',
        '\\madulto(s)? mayor', '\\mnochebuena', '\\mnavidad', '\\mhogar', '\\maccidente',
        '\\mmatrimonio', '\\mconsumidor', '\\mdefensoria', '\\mclases medias',
        '\\mciudadano', '\\msocial', '\\mcomunidad', '\\mbarrio', '\\mvecino', '\\mcatolic',
        '\\mateo(s)?\\M', '\\mtapaton', '\\minteruniversitari', '\\mucb\\M', '\\mumss\\M',
        '\\mbioseguridad'
    ]) THEN 'SOCIAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mbloqueo', '\\mbloquea', '\\mtipnis\\M', '\\mindigena', '\\mavasalla',
        '\\mconflicto', '\\mparo\\M', '\\mhuelga', '\\mmovilizac', '\\mtranca',
        '\\mterritorio indigena', '\\mprotesta', '\\mmarcha\\M', '\\mmarchan\\M',
        '\\menfrentamiento', '\\mvigilia', '\\mmanifestante', '\\mpiquete', '\\mcerco\\M',
        '\\mgasificac', '\\mrepresion', '\\mconvulsion', '\\mcivico', '\\mcomite civico',
        '\\mamenaza de paro', '\\mcod\\M', '\\mtoma de oficina', '\\mparar\\M',
        '\\mpolemica'
    ]) THEN 'CONFLICTO'
    WHEN subject ~ ANY (ARRAY[
        '\\mproduccion', '\\mproductor', '\\mproductiv', '\\mindustria', '\\magro',
        '\\magricol', '\\magropecuari', '\\msoya\\M', '\\mminer', '\\mmina\\M',
        '\\mminas\\M', '\\mmaiz\\M', '\\msorgo\\M', '\\marroz\\M', '\\mhectarea',
        '\\mempresari', '\\mganader', '\\mganado\\M', '\\mcacao\\M', '\\mazucar',
        '\\mquintal', '\\mfertilizante', '\\mcosecha', '\\msiembra', '\\moleagin',
        '\\mgirasol', '\\mcarne\\M', '\\mleche\\M', '\\mavicol', '\\mavicultor',
        '\\mcemento', '\\mtextil', '\\mmanufactura', '\\moro\\M', '\\mzinc\\M',
        '\\mestano\\M', '\\mpyme', '\\memprendimiento', '\\mturismo', '\\mturistic',
        '\\mplanta\\M', '\\mplantas\\M', '\\minternet\\M', '\\mtelefon', '\\mcelular',
        '\\mventa\\M', '\\mventas\\M', '\\mcomerciante', '\\mmercado interno',
        '\\mexploracion', '\\mvehicul', '\\mautomotor', '\\mautopart', '\\mentel\\M',
        '\\mhuawei\\M', '\\mtecnolog', '\\mdigital', '\\mtelecomunicac', '\\maviacion',
        '\\mstartup', '\\mcastana', '\\mquinua', '\\mcafe\\M', '\\mmadera', '\\mcainco\\M',
        '\\manapo\\M', '\\mcao\\M', '\\mibce\\M', '\\mfepc\\M', '\\mcamara de comercio',
        '\\mcamara boliviano', '\\mempresa', '\\mfabrica', '\\minra\\M', '\\mtierras\\M',
        '\\mpredio', '\\msemilla', '\\mtransgenic', '\\msenasag\\M', '\\mlab\\M',
        '\\miniaf\\M', '\\mrestaurante', '\\msupermercado', '\\mferia', '\\mexpocruz\\M',
        '\\mfexpocruz\\M', '\\mfeicobol\\M', '\\mrueda de negocios', '\\mtejido', '\\mplaga',
        '\\mriego\\M', '\\mcultivo', '\\mtrigo\\M', '\\mpapa\\M', '\\mpollo',
        '\\mhidrocarburifer', '\\mconstructora', '\\mcerveceria', '\\mcbn\\M',
        '\\mcomercio\\M', '\\mcomercial', '\\mmercado', '\\mmercados\\M', '\\malimento',
        '\\msiderurg', '\\mmateria prima', '\\mcomibol\\M', '\\mhuanuni\\M',
        '\\mkarachipampa\\M', '\\msan cristobal', '\\mvinto\\M', '\\mcolquiri\\M',
        '\\mglencore\\M', '\\mcerro rico', '\\maurifer', '\\mcementera', '\\mconcentrado',
        '\\mmutun\\M', '\\mchatarra', '\\mfundic', '\\mapp\\M', '\\maplicacion', '\\mciber',
        '\\matt\\M', '\\mgloria\\M', '\\mdelizia\\M', '\\mtienda', '\\mcentro(s)? comercial',
        '\\magricultor', '\\magrari', '\\mbovin', '\\mvaca\\M', '\\mvacas\\M',
        '\\mres(es)?\\M', '\\mlangosta', '\\mfumigac', '\\memapa\\M', '\\mconsumo',
        '\\mbiotecnolog', '\\mogm\\M', '\\mvagoneta', '\\mquipus\\M', '\\mmaicer',
        '\\mchocolate', '\\mconfeccion', '\\mproduc', '\\mplastic', '\\mfegasacruz\\M',
        '\\mingenio', '\\mforestal', '\\mmadera', '\\mtabaco', '\\mcosmetic',
        '\\mfusion(es)?\\M', '\\madquisicion', '\\mmarca\\M', '\\mmarcas\\M',
        '\\msamsung\\M', '\\mgalaxy\\M', '\\mmotorola\\M', '\\mnokia\\M', '\\mtoyota\\M',
        '\\mnissan\\M', '\\mchevrolet\\M', '\\misuzu\\M', '\\mhyundai\\M', '\\msuzuki\\M',
        '\\minnovac', '\\mcadepia\\M', '\\mfipaz\\M', '\\mtoneladas', '\\mverdura',
        '\\mfruta', '\\mhortaliza', '\\mabastec', '\\mfundempresa', '\\mseprec\\M',
        '\\mregistro de comercio', '\\mporcino', '\\mcamelido', '\\mpez\\M', '\\mpeces\\M',
        '\\mpiscicultura', '\\mcafes\\M', '\\mcertamen', '\\msello\\M',
        '\\mgarantia de calidad', '\\mcomteco\\M', '\\msiemens\\M', '\\moracle\\M',
        '\\mmicrosoft\\M', '\\msmartphone', '\\mteclado', '\\mvideojuego', '\\mhyperx\\M',
        '\\mcamon\\M', '\\msoftware', '\\mhardware', '\\minformatic', '\\mrepsol\\M',
        '\\mbulo bulo', '\\mlamia\\M', '\\misolux\\M', '\\mcorsan\\M', '\\mlaboratorio',
        '\\mbago\\M', '\\mcni\\M', '\\meaglecrest\\M', '\\majam\\M', '\\mcuadricula',
        '\\mreventa', '\\mrentabilidad', '\\mfirma(s)? comercial', '\\mproveedor',
        '\\mgranel', '\\maceite', '\\mchicha', '\\mtaquina\\M', '\\mguabira\\M',
        '\\mstreaming', '\\mplataforma', '\\mnutricosmetic', '\\mvendedor', '\\memprend',
        '\\mturist', '\\mautomovil', '\\mmaquinaria', '\\maftosa', '\\moie\\M',
        '\\msanidad animal', '\\mpapel\\M', '\\mreciclad', '\\macopio', '\\mpil\\M',
        '\\mfancesa\\M', '\\mbridgestone\\M', '\\mvolkswagen\\M', '\\mchrysler\\M',
        '\\mchangan\\M', '\\mprototipo', '\\mvino\\M', '\\mvinos\\M', '\\mbodega',
        '\\minternauta', '\\manuncio(s)? publicitario', '\\mgamer', '\\mrepartidor',
        '\\mcamion', '\\mstand\\M', '\\mlicencia de operacion', '\\mcooperativa',
        '\\mecobol\\M', '\\mbisa\\M', '\\mviva\\M', '\\mamazonia', '\\mcooperativista',
        '\\mgranja', '\\minsumo', '\\mfardo', '\\marroba', '\\mgalpon',
        '\\mcamara empresarial', '\\mrubro', '\\mcanero', '\\malpaca', '\\mllama\\M',
        '\\mlana\\M', '\\mlanas\\M', '\\mprocesadora', '\\mautoferia', '\\mautomotriz',
        '\\mautomotrices\\M', '\\mrebaja', '\\mhipermaxi\\M', '\\mcinemark\\M',
        '\\mhooters\\M', '\\mradisson\\M', '\\muber\\M', '\\mpedidosya\\M', '\\mstarlink\\M',
        '\\mprotel\\M', '\\mbenetton\\M', '\\munder armour', '\\mlamborghini\\M',
        '\\mfaboce\\M', '\\mstarphone\\M', '\\mplaystation\\M', '\\mmarvel\\M',
        '\\mshowroom', '\\mshoowroom', '\\mrespirador', '\\mporcicultor', '\\mgripe porcina',
        '\\mcorreos\\M', '\\mcourier', '\\mavianca\\M', '\\mcarguero',
        '\\mocupacion hotelera', '\\minteligencia artificial', '\\mecocentro\\M',
        '\\meconomia naranja', '\\mvalor agregado', '\\mcatelbo\\M', '\\measba\\M',
        '\\munibol\\M'
    ]) THEN 'SECTOR_REAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mgerente', '\\mceo\\M', '\\mdirectorio', '\\maccionista', '\\mjunta general',
        '\\mgalardon', '\\mpremio', '\\msucursal', '\\mfranquicia', '\\maniversario',
        '\\mla marca', '\\msu marca', '\\mla compania', '\\mla firma', '\\mdirector',
        '\\mbcp\\M', '\\mbnb\\M', '\\mbdp\\M', '\\mbanco ganadero', '\\mtigo\\M',
        '\\mmillicom\\M', '\\mhotel', '\\mcadena\\M', '\\mholding\\M', '\\mcorporacion',
        '\\ms\\.a\\.', '\\msrl\\M', '\\mdesigna', '\\mnombramiento', '\\mcertificac',
        '\\miso\\M', '\\mresponsabilidad social', '\\mlanza al mercado', '\\mnueva tienda',
        '\\minaugura su', '\\mimcruz\\M', '\\msoboce\\M', '\\malianza', '\\mcliente',
        '\\moferta', '\\mpromocion', '\\mmatricula de comercio', '\\mrelanz',
        '\\mcompromiso', '\\mportafolio', '\\mexpo', '\\mherbalife\\M', '\\mtoyosa\\M',
        '\\mfortaleza\\M', '\\munivida\\M', '\\meba\\M', '\\mgravetal\\M', '\\mexomad\\M',
        '\\msocios\\M', '\\mpublicidad', '\\mcampana\\M', '\\msponsor', '\\mauspici',
        '\\mpatrocin', '\\mrexona\\M', '\\mbayer\\M', '\\mcoca cola', '\\mkimberly\\M',
        '\\mnestle\\M', '\\munilever\\M', '\\mforbes\\M', '\\mranking', '\\mejecutiv',
        '\\mposesion', '\\mrenuncia', '\\mmarketing', '\\minfluencer', '\\mreputacion',
        '\\mconvenio\\M', '\\msuscriben', '\\mimagen\\M'
    ]) THEN 'EMPRESARIAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mcrecimiento economico', '\\mpib\\M', '\\mactividad economica',
        '\\mproductividad', '\\mcompetitividad', '\\meconomia', '\\meconomic', '\\mrecesion',
        '\\mclima de negocios', '\\mnegocio', '\\mingresos\\M', '\\minversion',
        '\\mreactivac', '\\mreactiva', '\\mcrecimiento', '\\mdesarrollo economico',
        '\\mcrisis economica', '\\meconomista', '\\mdesacelerac', '\\mestanflacion',
        '\\mmodelo economico', '\\minvierte', '\\minvertir', '\\minvierten', '\\minversor',
        '\\mcrisis\\M', '\\mdesarrollo\\M', '\\mplanificacion', '\\mcepal\\M',
        '\\mplan de desarrollo'
    ]) THEN 'ACTIVIDAD'
    WHEN subject ~ ANY (ARRAY[
        '\\mjuicio', '\\mtribunal', '\\mjuez\\M', '\\mjueza\\M', '\\mjuzgado', '\\mfiscalia',
        '\\mfiscal general', '\\msentencia', '\\mimputad', '\\mdetenid', '\\maprehend',
        '\\mcarcel', '\\mprision', '\\mdenuncia penal', '\\mquerella', '\\mproceso penal',
        '\\mabogado', '\\mprocurador', '\\mcidh\\M', '\\mtcp\\M', '\\mtsj\\M',
        '\\mamparo\\M', '\\mreforma judicial', '\\mcaso terrorismo', '\\mjusticia\\M',
        '\\mmedida(s)? cautelar', '\\maudiencia', '\\mabsuelt', '\\mcondena', '\\mapelacion',
        '\\maccion popular', '\\morgano judicial', '\\mmagistrad', '\\mcoima',
        '\\mallanan\\M', '\\mdetencion', '\\mlogia', '\\minterpone', '\\mrecurso legal',
        '\\mcomision investigadora', '\\mdenuncia', '\\mdenuncian', '\\mclonador',
        '\\mplaca(s)?\\M', '\\msancion', '\\mdecomis'
    ]) THEN 'JUDICIAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mgobierno', '\\mministr', '\\mministerio', '\\mviceministr', '\\mpresiden',
        '\\mdecreto', '\\mds\\M', '\\mley\\M', '\\mleyes\\M', '\\masamblea', '\\mdiputad',
        '\\msenador', '\\msenado\\M', '\\melecc', '\\mevo morales', '\\mevo\\M',
        '\\marce\\M', '\\manez\\M', '\\mmesa\\M', '\\mcamacho\\M', '\\mquiroga\\M',
        '\\mdoria medina', '\\mrodrigo paz', '\\malcald', '\\mgobernador', '\\mgobernacion',
        '\\mreferendo', '\\mreferendum', '\\moposicion', '\\mmas\\M',
        '\\mestado plurinacional', '\\mconstituc', '\\mmunicipio', '\\mpolitic',
        '\\mcandidat', '\\mvoto\\M', '\\mvotos\\M', '\\mbinomio', '\\mpartido politico',
        '\\mtse\\M', '\\mparlamento', '\\mchoquehuanca\\M', '\\mcorrupcion', '\\mestatal',
        '\\mgobiernos\\M', '\\mautoridad', '\\mnepotismo', '\\mgabinete', '\\malp\\M',
        '\\msufrag', '\\mmorales\\M', '\\minterventor', '\\mcanciller', '\\membajad',
        '\\mdiplomat', '\\mmilitar', '\\mpolicia', '\\mfuerzas armadas', '\\mreglament',
        '\\mnorma\\M', '\\mnormativa', '\\melector', '\\msilencio electoral',
        '\\mburocracia', '\\mprocuraduri', '\\mbilateral', '\\mintercultural',
        '\\mdemocracia', '\\mpopulis', '\\mdesarrollis', '\\mprogresis', '\\mnorma',
        '\\macatar', '\\mautoriza'
    ]) THEN 'POLITICA'
    WHEN subject ~ ANY (ARRAY[
        '\\meeuu\\M', '\\mestados unidos', '\\margentina', '\\mbrasil', '\\mchile\\M',
        '\\mperu\\M', '\\mchina\\M', '\\mrusia', '\\mvenezuela', '\\mcolombia',
        '\\mparaguay', '\\muruguay', '\\mmexico', '\\mespana\\M', '\\meuropa',
        '\\munion europea', '\\mue\\M', '\\mfmi\\M', '\\mlatinoamerica', '\\mamerica latina',
        '\\mregion\\M', '\\mmundial\\M', '\\mmundo\\M', '\\minternacional', '\\mglobal',
        '\\mextranjer', '\\mbrics\\M', '\\miran\\M', '\\misrael', '\\mucrania',
        '\\mtrump\\M', '\\mbiden\\M', '\\mputin\\M'
    ]) THEN 'INTERNACIONAL'
    ELSE 'OTROS'
  END AS topic,
  CASE
    WHEN subject ~ ANY (ARRAY[
        '\\mfalso', '\\mfalsa\\M', '\\menganoso', '\\mmanipulad', '\\mdesmiente',
        '\\mdesinformacion', '\\msacado de contexto', '\\mverificac', '\\mno es cierto',
        '\\mfake', '\\mbulo\\M', '\\maclara que no', '\\mes falsa', '\\mengana'
    ]) THEN 'DESINFORMACION'
    WHEN subject ~ ANY (ARRAY[
        '\\mdesabastec', '\\mescasez', '\\mescasea', '\\mcolaps', '\\mcrisis', '\\mtemor',
        '\\mteme', '\\mtemen', '\\mpanico', '\\malerta', '\\memergencia', '\\mfalta de',
        '\\macaparamiento', '\\mracionamiento', '\\magotad', '\\mdesesperac', '\\murgente',
        '\\mgrave', '\\mcritic', '\\mriesgo', '\\madvierte', '\\mpeligro', '\\msin stock',
        '\\msin combustible', '\\malarma', '\\mpreocupa', '\\mamenaz', '\\minsuficiente',
        '\\mfila(s)?\\M', '\\mcola(s)?\\M', '\\mrestring', '\\mrestriccion', '\\mprohib',
        '\\mveta\\M', '\\mvetan\\M', '\\mcarencia', '\\mvulnerab', '\\mfragil', '\\minestab'
    ]) THEN 'ALARMA'
    WHEN subject ~ ANY (ARRAY[
        '\\mbloqueo', '\\mbloquea', '\\mparo\\M', '\\mprotesta', '\\mmovilizac',
        '\\mmarcha\\M', '\\mconflicto', '\\menfrentamiento', '\\mdenuncia', '\\mexige',
        '\\mexigen', '\\mrechaza', '\\minterpelac', '\\mhuelga', '\\mtranca', '\\mvigilia',
        '\\mdisputa', '\\macusa', '\\mquerella', '\\mpugna', '\\mpresion social',
        '\\mavasalla', '\\mcuestiona', '\\mtilda\\M', '\\mreclama', '\\mobjeta',
        '\\mobserva\\M', '\\mobservan\\M', '\\mcritica', '\\mlamenta', '\\mcensura',
        '\\mdesacuerdo', '\\mrepudi', '\\mcondena\\M', '\\mniega\\M', '\\mniegan\\M',
        '\\mdesmarca', '\\mconfronta', '\\mresponde', '\\mresponsabiliza', '\\minterpon',
        '\\mreivindic', '\\mpolemic', '\\mdisput', '\\macusan\\M', '\\macusa\\M',
        '\\mcritica', '\\mtripartito', '\\mdesacato', '\\mtoman\\M', '\\mreivindica',
        '\\mdiscrepa', '\\madvierten que no'
    ]) THEN 'CONFLICTO'
    WHEN subject ~ ANY (ARRAY[
        '\\mrumor', '\\mpresunt', '\\mversion\\M', '\\mincertidumbre', '\\mpodria',
        '\\mevalua', '\\manaliza', '\\mno confirm', '\\mpreve', '\\mproyecta', '\\mestima',
        '\\mplantea', '\\mpropone', '\\mestudia', '\\mnegocia', '\\mdefinira',
        '\\mpendiente', '\\men duda', '\\mexpectativa', '\\mindaga', '\\minvestiga',
        '\\mconsulta', '\\mdebate', '\\mdialogo', '\\mreunion', '\\mse reune',
        '\\mquiere\\M', '\\mbusca\\M', '\\mbuscan\\M', '\\maguarda', '\\mespera\\M',
        '\\mesperan\\M', '\\mpedira', '\\mintenta', '\\mexplora', '\\msugiere',
        '\\mrecomend', '\\mconsidera', '\\mdependera', '\\msi\\M', '\\mduda\\M',
        '\\mdudan\\M', '\\mdiscute', '\\mdesconfianza', '\\msupuesto', '\\mdesmitific',
        '\\mpuede\\M', '\\mpueden\\M', '\\mno hay senales', '\\mapunta', '\\mve con',
        '\\mven que', '\\mreveland', '\\mpretend', '\\maspira', '\\mavizor', '\\mcoyuntura',
        '\\mdependen', '\\mbuscara', '\\mtratara', '\\mveremos'
    ]) THEN 'INCERTIDUMBRE'
    WHEN subject ~ ANY (ARRAY[
        '\\mcaida', '\\mcae', '\\mcayo', '\\mcayeron', '\\mbaja\\M', '\\mbajan\\M',
        '\\mbajaron', '\\mdeficit', '\\mperdida', '\\mpierde', '\\mperdio', '\\mperdieron',
        '\\mcontraccion', '\\mfracaso', '\\mfracasa', '\\mincumplimiento', '\\mmora\\M',
        '\\ma la baja', '\\mretroces', '\\mafectad', '\\mafecta\\M', '\\mgolpead',
        '\\mdesplom', '\\mreduc', '\\mdisminu', '\\mrecort', '\\msuspend', '\\mparaliz',
        '\\mcierr', '\\mquiebra', '\\matraso', '\\mretras', '\\mendeud', '\\minsostenible',
        '\\manula', '\\mvictima', '\\magrav', '\\mempeor', '\\mestanca', '\\mdesacelera',
        '\\mdano\\M', '\\mdesvio', '\\manomalia', '\\mirregularidad', '\\mdeniega',
        '\\mrechaz', '\\mfrena\\M', '\\mfreno\\M', '\\mdemora', '\\mcancela', '\\mvence\\M',
        '\\mvencid', '\\mdeteriora', '\\mdeuda impaga', '\\mimpago', '\\mmuere', '\\mmueren',
        '\\mmuerte', '\\mfallec', '\\mimpide', '\\mimpiden', '\\mfalencia', '\\mcomplica',
        '\\mhurto', '\\mdeforest', '\\milegal', '\\mfisura', '\\mparalizad', '\\mdesaparece',
        '\\mexcluir', '\\mexcluye', '\\matentado', '\\mtrauma', '\\mdespilfarro',
        '\\mpesadilla', '\\msufri', '\\mcese\\M', '\\mretira\\M', '\\mretiran\\M',
        '\\mdesmedido', '\\minunda', '\\mdisminu', '\\maplaza', '\\mestancad', '\\mdesligan',
        '\\mdependencia', '\\mnegativa\\M', '\\mincautad', '\\matraso', '\\maccidente',
        '\\mlimit', '\\mpadec', '\\mdiscrimin', '\\mcarece', '\\mniegan acceso',
        '\\mdeja de\\M', '\\mabandon', '\\mvulnera', '\\mincumple', '\\mescasea'
    ]) THEN 'DETERIORO'
    WHEN subject ~ ANY (ARRAY[
        '\\macuerdo', '\\minversion', '\\mcrece', '\\mcrecen', '\\mcrecio', '\\mcreceran',
        '\\maumento', '\\maument', '\\mrecuperac', '\\mrecord\\M', '\\malza\\M', '\\mimpuls',
        '\\mamplia', '\\mhabilit', '\\minaugur', '\\msube', '\\msuben', '\\msubio',
        '\\mincrement', '\\mmejora', '\\mconvenio', '\\mduplica', '\\mavanz', '\\mlogr',
        '\\maprob', '\\maprueba', '\\mreactiv', '\\mnuevo mercado', '\\mbeneficia',
        '\\mfortalec', '\\mboom\\M', '\\mgana\\M', '\\mganan\\M', '\\mgano\\M', '\\mexitos',
        '\\mexito\\M', '\\msupera', '\\mrepunt', '\\mdestaca', '\\mresalta', '\\mcapitaliz',
        '\\moptimiz', '\\mfavorec', '\\mconsolid', '\\mpotencia', '\\mrenov', '\\mmoderniz',
        '\\mprogres', '\\mratifica', '\\mreafirma', '\\mcelebra', '\\mpremia', '\\mrecuper',
        '\\msubir', '\\msubira', '\\msuban\\M', '\\mdispara', '\\mcircul', '\\mcomplet',
        '\\malist', '\\maprovech', '\\msanea', '\\mdiversific', '\\mexpandir', '\\mexpande',
        '\\mestrategic', '\\mfluye'
    ]) THEN 'MEJORA'
    WHEN subject ~ ANY (ARRAY[
        '\\manunci', '\\mimplementa', '\\mcrea', '\\mlanza', '\\mpromulg', '\\mdecret',
        '\\mautoriz', '\\madjudic', '\\mregula', '\\mdispone', '\\mestablec', '\\mpresenta',
        '\\minicia', '\\marranca', '\\mpone en marcha', '\\mpide', '\\mpiden', '\\msolicita',
        '\\mrecomienda', '\\mconvoca', '\\minstruye', '\\mdetermina', '\\moficializa',
        '\\mreglamenta', '\\mmodific', '\\mdefine', '\\mactiva\\M', '\\mpromueve',
        '\\midentifica', '\\mprepara', '\\mproyecto de ley', '\\mfirma', '\\macuerda',
        '\\mentrega', '\\mcompra\\M', '\\madquier', '\\mdestina', '\\minvierte',
        '\\mgarantiza', '\\msuscribe', '\\mfija\\M', '\\mfijan\\M', '\\motorga',
        '\\mposesiona', '\\mdesigna', '\\mnombra', '\\minterviene', '\\mdetecta',
        '\\mrevela', '\\minforma', '\\mreporta', '\\mregistra', '\\mconfirma', '\\masegura',
        '\\mafirma', '\\mdice\\M', '\\msenala', '\\mexplica', '\\mdeclara', '\\msostiene',
        '\\madmite', '\\mreconoce', '\\mverifica', '\\mcontrola', '\\msanciona',
        '\\mmultiplica', '\\mtiene\\M', '\\mllega\\M', '\\mllegan\\M', '\\mabre\\M',
        '\\mabren\\M', '\\msuma\\M', '\\mcalcula', '\\mrevisa', '\\mconcluye',
        '\\mincorpora', '\\mrecibe\\M', '\\mreciben\\M', '\\mrecibira', '\\mapoya',
        '\\mpaga\\M', '\\mpago\\M', '\\mpagan\\M', '\\mpagara', '\\mtrae\\M', '\\mrealiza',
        '\\mrealizo', '\\mpacta', '\\mincluye', '\\meduca', '\\mbrinda', '\\mofrece',
        '\\mopera\\M', '\\moperan\\M', '\\mgenera', '\\mmantiene', '\\mcontinua',
        '\\msigue\\M', '\\msiguen\\M', '\\mvende', '\\mcuesta', '\\malcanza', '\\mpermite',
        '\\mrequiere', '\\mnecesita', '\\mreporta', '\\mprocesa', '\\mimplementa',
        '\\madelanta', '\\mcumple\\M', '\\mdebe\\M', '\\mdeben\\M', '\\mcontara',
        '\\mtendra', '\\mhabra\\M', '\\mestrena', '\\mreanuda', '\\mreinicia', '\\melige\\M',
        '\\meligen\\M', '\\mdistingue', '\\mtramit', '\\mregistr', '\\mconoce\\M',
        '\\mconozca\\M', '\\minician\\M', '\\minicia\\M', '\\mratifica', '\\msuscribe',
        '\\mposterga', '\\multima', '\\mpresentan\\M', '\\mvisita', '\\mreemplaza',
        '\\mingresa', '\\mtramitar', '\\mcontrola', '\\mconcientiz', '\\mpromover',
        '\\mpromueve', '\\macuden', '\\mdara\\M', '\\mdaran\\M', '\\mconocera', '\\mreune',
        '\\mllevara', '\\mllegar', '\\mllegaron', '\\mllegara', '\\mjura\\M', '\\mreleva',
        '\\mdepone', '\\mposee', '\\msocializ', '\\mcomercializ', '\\mcaptur', '\\mcomisa',
        '\\mdecomisa', '\\mformaliz', '\\mviaja', '\\mtoma\\M', '\\mtoman\\M', '\\mlevanta',
        '\\morienta', '\\mrenueva', '\\mincid', '\\mfoment', '\\masiste', '\\mconvers',
        '\\mparticipa', '\\mvisita', '\\madmite', '\\mreduce el plazo'
    ]) THEN 'MEDIDA'
    ELSE 'NEUTRO'
  END AS tone,
  CASE
    WHEN subject ~ ANY (ARRAY[
        '\\msanta cruz', '\\mmontero\\M'
    ]) THEN 'SANTA_CRUZ'
    WHEN subject ~ ANY (ARRAY[
        '\\mla paz\\M', '\\mel alto\\M'
    ]) THEN 'LA_PAZ'
    WHEN subject ~ ANY (ARRAY[
        '\\mcochabamba', '\\mchapare\\M'
    ]) THEN 'COCHABAMBA'
    WHEN subject ~ ANY (ARRAY[
        '\\moruro\\M'
    ]) THEN 'ORURO'
    WHEN subject ~ ANY (ARRAY[
        '\\mpotosi\\M'
    ]) THEN 'POTOSI'
    WHEN subject ~ ANY (ARRAY[
        '\\mtarija\\M', '\\myacuiba\\M'
    ]) THEN 'TARIJA'
    WHEN subject ~ ANY (ARRAY[
        '\\mchuquisaca\\M', '\\msucre\\M'
    ]) THEN 'CHUQUISACA'
    WHEN subject ~ ANY (ARRAY[
        '\\mbeni\\M', '\\mtrinidad\\M'
    ]) THEN 'BENI'
    WHEN subject ~ ANY (ARRAY[
        '\\mpando\\M', '\\mcobija\\M'
    ]) THEN 'PANDO'
    ELSE 'NACIONAL'
  END AS region
FROM published,
  LATERAL (
    SELECT translate(
      lower(coalesce(headline, '') || ' ' || coalesce(summary, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    )
  ) AS terms(subject);
`;
