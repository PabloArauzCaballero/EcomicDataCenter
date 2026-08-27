/**
 * The subject vocabulary exactly as migration 0056 wrote it.
 *
 * Kept beside the view rather than inside it because it is the half that
 * gets argued over: which words name hydrocarbons, which name the fiscal
 * debate. The view around it is machinery that has barely changed in six
 * migrations, while this list changes every time the residual is counted.
 * A snapshot either way, never edited: a later change to how coverage is
 * filed is a later migration with its own copy.
 */

export const topicCase = `  CASE
    WHEN subject ~ ANY (ARRAY[
        '\\mdiesel', '\\mgasolina', '\\mcombustible', '\\mcarburante', '\\mypfb\\M',
        '\\mhidrocarburo', '\\msurtidor', '\\mgas\\M', '\\mgasod', '\\manh\\M',
        '\\mrefineri', '\\mglp\\M', '\\mgarrafa', '\\mpetrole', '\\mcrudo\\M',
        '\\mestacion(es)? de servicio', '\\mpozo', '\\mreservorio', '\\mducto',
        '\\mcisterna', '\\mmegacampo', '\\mgas natural', '\\mgnv\\M', '\\mbutano',
        '\\mtaladro', '\\mperforacion (de|del) pozo', '\\mcaipipendi\\M', '\\mmargarita\\M',
        '\\mincahuasi\\M', '\\msabalo\\M', '\\mtcf\\M', '\\mgnl\\M', '\\mfracking',
        '\\mplanta de gas', '\\mvolumen(es)? de gas'
    ]) THEN 'HIDROCARBUROS'
    WHEN subject ~ ANY (ARRAY[
        '\\mtipo de cambio', '\\mdolar', '\\mbrecha cambiaria', '\\mdivisa', '\\mparalelo',
        '\\mbolivianos por', '\\mremesa', '\\meuro\\M', '\\mcripto', '\\musdt\\M',
        '\\mstablecoin', '\\mcasa(s)? de cambio', '\\mcambista', '\\mdevaluacion',
        '\\mtipo cambiario', '\\myuan', '\\mmoneda extranjera'
    ]) THEN 'CAMBIARIO'
    WHEN subject ~ ANY (ARRAY[
        '\\minflacion', '\\mcanasta', '\\mcarestia', '\\mprecio', '\\mencarec', '\\mipc\\M',
        '\\mcosto de vida', '\\mtarifa', '\\mabarrote', '\\mmercado(s)? de abasto',
        '\\msobreprecio', '\\mespeculacion', '\\macaparamiento', '\\magio\\M', '\\mcosto\\M',
        '\\mcostos\\M'
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
        '\\mtransaccion'
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
        '\\mfondos publicos', '\\mrentas\\M', '\\mnit\\M', '\\marbitraje', '\\mlaudo',
        '\\mnacionalizac', '\\mdonacion', '\\mcontrato\\M', '\\mcontratos\\M', '\\madjudic',
        '\\mconcesion', '\\mrecaud', '\\mimpositiv', '\\mpanama papers',
        '\\mfacilidades de pago'
    ]) THEN 'FISCAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mexport', '\\mimport', '\\marancel', '\\mbalanza comercial', '\\mcontrabando',
        '\\mmercado externo', '\\mmercado internacional', '\\mcomercio exterior',
        '\\mcomercio internacional', '\\mmercosur\\M', '\\mtratado comercial',
        '\\mlibre comercio', '\\macuerdo comercial', '\\mnuevos mercados', '\\mbioceanic',
        '\\mhidrovia', '\\mzona franca', '\\mcan\\M', '\\mdeclaracion (de|unica de) import',
        '\\mchuto', '\\mreexport', '\\mpuerto(s)? de\\M', '\\mtransito aduanero',
        '\\mfrontera', '\\mrelacion(es)? comercial', '\\mcomercio bilateral',
        '\\mpuerto(s)? chileno', '\\marica\\M', '\\miquique\\M', '\\mpaso fronterizo',
        '\\mferia internacional', '\\mmercado chino', '\\maduanero', '\\mtratado'
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
        '\\mtransporte pesado', '\\mcuentapropi'
    ]) THEN 'LABORAL'
    WHEN subject ~ ANY (ARRAY[
        '\\melectricidad', '\\melectric', '\\mende\\M', '\\mendes\\M', '\\melfec\\M',
        '\\mhidroelectric', '\\menergia', '\\menergetic', '\\mapagon', '\\mtermoelectric',
        '\\mlitio\\M', '\\mylb\\M', '\\menergias renovables', '\\mpanel(es)? solar',
        '\\mmegavatio', '\\mgeneracion electrica', '\\mtendido electrico', '\\mnuclear',
        '\\mbiodiesel', '\\metanol', '\\mcarbonato de litio', '\\msalar de uyuni',
        '\\mhidrogeno verde', '\\mcotel\\M', '\\mgeneradora', '\\meolic'
    ]) THEN 'ENERGIA'
    WHEN subject ~ ANY (ARRAY[
        '\\mincendio', '\\msequia', '\\minundac', '\\mriada', '\\mgranizad', '\\mgranizo',
        '\\mhelada', '\\mdesastre natural', '\\mdesastre ambiental', '\\mel nino\\M',
        '\\mla nina\\M', '\\mdeshielo', '\\mchaqueo', '\\mquema', '\\mdeforestac',
        '\\memergencia climat', '\\mnevada', '\\mnieve', '\\mlluvia', '\\mtormenta',
        '\\msenamhi\\M', '\\malerta roja', '\\malerta naranja', '\\mfrente frio',
        '\\msurazo', '\\mola de calor', '\\maltas temperaturas',
        '\\mdescenso de temperatura', '\\mpronostico del tiempo', '\\mcambio climatico',
        '\\mfuego\\M', '\\mhectareas quemadas', '\\mdesborde', '\\mmedio ambiente',
        '\\mambiental', '\\mcontaminac', '\\mmercurio\\M', '\\mreforest',
        '\\mescasez de agua', '\\mcrisis del agua', '\\mestres hidrico'
    ]) THEN 'CLIMA'
    WHEN subject ~ ANY (ARRAY[
        '\\masesin', '\\mhomicid', '\\mfeminicid', '\\mcrimen', '\\mdelincuen', '\\matraco',
        '\\msecuestr', '\\mviolacion\\M', '\\mnarcotraf', '\\msicari', '\\mbalacera',
        '\\mallanamiento', '\\mantisocial', '\\macribill', '\\mapunal', '\\mcadaver',
        '\\maprehend', '\\mlinchamiento', '\\mestafa', '\\mextorsion', '\\mrobo\\M',
        '\\mroban\\M', '\\mdroga', '\\mcocaina', '\\mtrata de personas', '\\mcarcel',
        '\\mimputad', '\\mcontrabandista', '\\mavasallamiento violento'
    ]) THEN 'CRONICA_ROJA'
    WHEN subject ~ ANY (ARRAY[
        '\\mcarretera', '\\mobra(s)?\\M', '\\mtren\\M', '\\mtrenes\\M', '\\mferroviari',
        '\\maeropuerto', '\\mpuente', '\\mdoble via', '\\masfalt', '\\mvivienda',
        '\\mterminal', '\\mpasajero', '\\mviajero', '\\mpeaje', '\\minfraestructura',
        '\\mconstruccion', '\\mabc\\M', '\\mvia\\M', '\\mvias\\M', '\\mcamino', '\\mruta\\M',
        '\\mrutas\\M', '\\mtramo', '\\mpavimen', '\\mtelefer', '\\malcantarillado',
        '\\magua potable', '\\mrepresa', '\\mmetropolitano', '\\mtransporte\\M',
        '\\mcarga\\M', '\\mlogistic', '\\mlocomotora', '\\mpuerto', '\\mdgac\\M',
        '\\msabsa\\M', '\\mviru viru', '\\maeronaut', '\\mamaszonas\\M', '\\mecojet\\M',
        '\\mparqueo', '\\mpaso peatonal', '\\mderrumbe', '\\mtam\\M', '\\menfe\\M',
        '\\mnaviera', '\\mbarcaza', '\\malcantari'
    ]) THEN 'INFRAESTRUCTURA'
    WHEN subject ~ ANY (ARRAY[
        '\\mpobreza', '\\mdesigualdad', '\\msalud\\M', '\\mhospital', '\\meducacion',
        '\\mbono juana', '\\mbono\\M', '\\mbonos\\M', '\\mbeca', '\\muniversidad',
        '\\mestudiante', '\\mcapacitac', '\\minfantil', '\\mseguridad alimentaria',
        '\\mdesnutric', '\\mmigrac', '\\mcovid', '\\mpandemia', '\\mcoronavirus',
        '\\mcuarentena', '\\mvacuna', '\\mdosis\\M', '\\mbarbijo', '\\mine\\M',
        '\\mcenso\\M', '\\mpoblacion\\M', '\\madulto mayor', '\\mdiscapacid',
        '\\mclase media', '\\mtercera edad', '\\mrenta\\M'
    ]) THEN 'SOCIAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mbloqueo', '\\mbloquea', '\\mtipnis\\M', '\\mindigena', '\\mavasalla',
        '\\mconflicto', '\\mparo\\M', '\\mhuelga', '\\mmovilizac', '\\mtranca',
        '\\mterritorio indigena', '\\mprotesta', '\\mmarcha\\M', '\\mmarchan\\M',
        '\\menfrentamiento', '\\mvigilia', '\\mmanifestante', '\\mpiquete', '\\mcerco\\M',
        '\\mgasificac', '\\mrepresion', '\\mconvulsion'
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
        '\\mhuawei\\M', '\\mtecnolog', '\\mdigital', '\\mtelecomunicac', '\\mvuelo',
        '\\maviacion', '\\mstartup', '\\mcastana', '\\mquinua', '\\mcafe\\M', '\\mmadera',
        '\\mcainco\\M', '\\manapo\\M', '\\mcao\\M', '\\mibce\\M', '\\mfepc\\M',
        '\\mcamara de comercio', '\\mcamara boliviano', '\\mempresa', '\\mfabrica',
        '\\minra\\M', '\\mtierras\\M', '\\mpredio', '\\msemilla', '\\mtransgenic',
        '\\msenasag\\M', '\\maerolinea', '\\mboa\\M', '\\mlab\\M', '\\miniaf\\M',
        '\\mrestaurante', '\\msupermercado', '\\mferia', '\\mexpocruz\\M', '\\mfeicobol\\M',
        '\\mrueda de negocios', '\\mtejido', '\\mplaga', '\\mriego\\M', '\\mcultivo',
        '\\mtrigo\\M', '\\mpapa\\M', '\\mpollo\\M', '\\mhidrocarburifer', '\\mconstructora',
        '\\mcerveceria', '\\mcbn\\M', '\\mcomercio\\M', '\\mcomercial', '\\mmercado',
        '\\mmercados\\M', '\\malimento', '\\msiderurg', '\\mmateria prima', '\\mcomibol\\M',
        '\\mhuanuni\\M', '\\mkarachipampa\\M', '\\msan cristobal', '\\mvinto\\M',
        '\\mcolquiri\\M', '\\mglencore\\M', '\\mcerro rico', '\\maurifer', '\\mcementera',
        '\\mconcentrado', '\\mmutun\\M', '\\mchatarra', '\\mfundic', '\\mapp\\M',
        '\\maplicacion', '\\mciber', '\\matt\\M', '\\mgloria\\M', '\\mdelizia\\M',
        '\\mtienda', '\\mcentro(s)? comercial', '\\magricultor', '\\magrari', '\\mbovin',
        '\\mvaca\\M', '\\mvacas\\M', '\\mlangosta', '\\mfumigac', '\\memapa\\M',
        '\\mconsumo', '\\mbiotecnolog', '\\mogm\\M', '\\mvagoneta', '\\mquipus\\M',
        '\\mmaicer', '\\mchocolate', '\\mconfeccion', '\\mproduc', '\\mplastic'
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
        '\\mcompromiso', '\\mportafolio', '\\mmarca\\M', '\\mmarcas\\M', '\\mexpo',
        '\\mherbalife\\M', '\\mtoyosa\\M', '\\mfortaleza\\M', '\\munivida\\M', '\\meba\\M',
        '\\mgravetal\\M', '\\mexomad\\M', '\\msocios\\M'
    ]) THEN 'EMPRESARIAL'
    WHEN subject ~ ANY (ARRAY[
        '\\mcrecimiento economico', '\\mpib\\M', '\\mactividad economica',
        '\\mproductividad', '\\mcompetitividad', '\\meconomia', '\\meconomic', '\\mrecesion',
        '\\mclima de negocios', '\\mnegocio', '\\mingresos\\M', '\\minversion',
        '\\mreactivac', '\\mreactiva', '\\mcrecimiento', '\\mdesarrollo economico',
        '\\mcrisis economica', '\\meconomista', '\\mdesacelerac', '\\mestanflacion',
        '\\mmodelo economico', '\\minvierte', '\\minvertir', '\\minvierten'
    ]) THEN 'ACTIVIDAD'
    WHEN subject ~ ANY (ARRAY[
        '\\mgobierno', '\\mministro', '\\mministerio', '\\mviceministr', '\\mpresidente',
        '\\mpresidencial', '\\mdecreto', '\\mds\\M', '\\mley\\M', '\\mleyes\\M',
        '\\masamblea', '\\mdiputad', '\\msenador', '\\msenado\\M', '\\melecc',
        '\\mevo morales', '\\mevo\\M', '\\marce\\M', '\\manez\\M', '\\mmesa\\M',
        '\\mcamacho\\M', '\\mquiroga\\M', '\\mdoria medina', '\\mrodrigo paz', '\\malcald',
        '\\mgobernador', '\\mgobernacion', '\\mreferendo', '\\mreferendum', '\\moposicion',
        '\\mmas\\M', '\\mestado plurinacional', '\\mconstituc', '\\mmunicipio', '\\mpolitic',
        '\\mcandidat', '\\mvoto\\M', '\\mvotos\\M', '\\mbinomio', '\\mpartido politico',
        '\\mtse\\M', '\\mparlamento', '\\mchoquehuanca\\M', '\\mcorrupcion', '\\mtribunal',
        '\\mjuez\\M', '\\mprocuraduria', '\\mdefensor del pueblo', '\\mcanciller',
        '\\mministr', '\\mpresiden', '\\mvicepresiden', '\\mgabinete', '\\mtcp\\M',
        '\\malp\\M', '\\msufrag', '\\mmorales\\M', '\\mestatal', '\\mgobiernos\\M',
        '\\mfiscalia'
    ]) THEN 'POLITICA'
    ELSE 'OTROS'
  END AS topic,`;
