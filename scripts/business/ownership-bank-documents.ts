/**
 * Los prospectos de los bancos cuyo cuadro de accionistas se lee, uno por
 * renglón.
 *
 * Columnas: emisor | ruta del PDF bajo `sites/default/files/` de ASFI | páginas
 * | fecha de corte que el documento imprime | filas con porcentaje | empresa del
 * cuadro cuando no es el emisor (un eslabón de la cadena) | texto que precede al
 * cuadro cuando la página trae más de uno | `sin-acciones` cuando las acciones
 * impresas no cuadran con el porcentaje y esa comprobación no sirve.
 *
 * Un renglón por documento y no un objeto por documento: son setenta y pico y,
 * escritos como objetos, el archivo pasaría las trescientas líneas sin decir
 * nada más. Cada uno se eligió leyendo el prospecto: es el de corte más tardío
 * de su año, y las páginas son las del cuadro y no las de los estados
 * financieros, que también nombran a los accionistas.
 */
export const BANK_DOCUMENTS = `
BEC|2025-08/Bonos%20subordinados%20BEC%20II%20-%20Emisi%C3%B3n%201.pdf|47,48|2013-08-31|11
BEC|2025-08/Bonos%20subordinados%20BEC%20II%20-%20Emisi%C3%B3n%202.pdf|69,70|2014-08-31|15
BEC|2025-08/Bonos%20Subordinados%20BEC%20II%20-%20Emisi%C3%B3n%203.pdf|69,70|2015-06-30|16
BEC|2025-08/Bonos%20Subordinados%20BEC%20III%20-%20Emisi%C3%B3n%202.pdf|76,77|2016-06-30|19
BEC|2025-08/Bonos%20Subordinados%20BEC%20III%20%E2%80%93%20Emisi%C3%B3n%203.pdf|85,86|2017-12-31|24
BEC|2025-08/Bonos%20Banco%20Econ%C3%B3mico%20I%20-%20Emisi%C3%B3n%201%20%28ACTUALIZADO%29.pdf|63,64|2019-09-30|26
BEC|2025-08/BONOS%20SUBORDINADOS%20BEC%20IV%20-%20EMISI%C3%93N%201.pdf|57,58|2021-06-30|26|||sin-acciones
BEC|2025-08/Bonos%20Subordinados%20BEC%20V%20-%20Emisi%C3%B3n%201.pdf|51,52|2022-12-31|25
BEC|2025-08/Bonos%20Subordinados%20BEC%20V%20-%20Emisi%C3%B3n%202.pdf|60,61|2024-05-31|25
BGA|2025-07/Bonos%20subordinados%20BANCO%20GANADERO%20-%20Emisi%C3%B3n%203_0.pdf|38,39|2009-09-30|11
BGA|2025-08/Bonos%20ACCIONES%20BGA.pdf|46,47|2011-07-31|11
BGA|2025-08/Bonos%20subordinados%20BANCO%20GANADERO%20II.pdf|67,68|2013-06-30|11
BGA|2025-08/Bonos%20Subordinados%20BANCO%20GANADERO%20IV.pdf|71,72|2015-07-31|11
BGA|2025-08/Bonos%20Subordinados%20Banco%20Ganadero%20V.pdf|87,88|2016-09-30|16
BGA|2025-08/Bonos%20Banco%20Ganadero%20-%20Emisi%C3%B3n%201.pdf|87,88|2018-08-31|11
BGA|2025-08/Bonos%20Subordinados%20Banco%20Ganadero%20VI.pdf|101,102|2019-06-30|11
BGA|2025-08/Bonos%20Banco%20Ganadero%20-%20Emisi%C3%B3n%202.pdf|95,96|2020-04-30|11
BGA|2025-08/Bonos%20Banco%20Ganadero%20I.pdf|75,76|2022-12-31|11
BGA|2025-08/Bonos%20Subordinados%20Banco%20Ganadero%20IX.pdf|78,79|2024-09-30|10
BGA|2026-03/Bonos%20Banco%20Ganadero%20II.pdf|73,74|2025-11-30|10
BIS|2025-08/Bonos%20Subordinados%20Banco%20BISA%20-%20Emisi%C3%B3n%202.pdf|63,64|2016-06-30|10
BIS|2025-08/Bonos%20Subordinados%20Banco%20Bisa%20%E2%80%93%20Emisi%C3%B3n%203.pdf|56,57|2018-06-30|11
BIS|2025-08/Bonos%20Subordinados%20Banco%20BISA%20II%20-%20EMISI%C3%93N%201.pdf|50,51|2022-12-31|6|Grupo Financiero BISA S.A.
BIS|2025-09/Bonos%20Subordinados%20Banco%20BISA%20III%20-%20Emisi%C3%B3n%201.pdf|52,53|2025-06-30|11
BME|2025-08/Bonos%20BANCO%20MERCANTIL%20SANTA%20CRUZ%20-%20Emisi%C3%B3n%201.pdf|44,45|2014-12-31|12
BME|2025-08/Bonos%20BANCO%20MERCANTIL%20SANTA%20CRUZ%20-%20Emisi%C3%B3n%201.pdf|59,60|2014-06-06|3|Inversiones Zubat S.A.|composici.n accionaria de Inversiones Zubat
BME|2025-08/Bonos%20BANCO%20MERCANTIL%20SANTA%20CRUZ%20-%20Emisi%C3%B3n%201.pdf|59,60|2014-06-06|3|Compañía Inversora Easton S.A.|composici.n accionaria de Compa..a Inversora Easton
BME|2025-08/Bonos%20BANCO%20MERCANTIL%20SANTA%20CRUZ%20-%20Emisi%C3%B3n%201.pdf|59,60|2014-06-06|3|Compañía de Inversiones Los Álamos S.A.|composici.n accionaria de Compa..a de Inversi.n .Los
BME|2025-08/Bonos%20Mercantil%20Santa%20Cruz%20-%20Emisi%C3%B3n%204%20%28Serie%20A%2CB%2CC%2Cy%20D%29%20%28Actualizado%29.pdf|45,46|2016-03-31|12
BME|2025-08/Bonos%20BANCO%20MERCANTIL%20SANTA%20CRUZ%20-%20Emisi%C3%B3n%205%20%28Actualizado%29.pdf|47,48|2017-06-30|12
BME|2025-08/Bonos%20BMSC%20II%20-%20EMISI%C3%93N%201%20%28ACTUALIZADO%29.pdf|49,50|2019-06-30|8
BME|2025-08/Bonos%20BMSC%20II%20-%20Emisi%C3%B3n%202%20%28Actualizado%29.pdf|47,48|2019-12-31|8
BME|2025-08/BONOS%20BMSC%20II%20-%20EMISI%C3%93N%204%20%28ACTUALIZADO%29.pdf|30,31|2020-12-31|8
BME|2025-08/Bonos%20BMSC%20III%20-%20Emisi%C3%B3n%201.pdf|32,33|2022-06-30|11|||sin-acciones
BME|2025-08/Bonos%20BMSC%20III%20-%20EMISI%C3%93N%204.pdf|33,34|2023-09-30|5|Sociedad Controladora Mercantil Santa Cruz S.A.
BME|2025-08/Bonos%20BMSC%20III%20-%20Emisi%C3%B3n%205.pdf|33,34|2024-06-30|12
BME|2025-10/BONOS_BMSC_IV-EMISION_1.pdf|38,39|2025-05-31|12
BNB|2025-08/Bonos%20subordinados%20BNB%20II%20-%20Emisi%C3%B3n%201.pdf|54,55|2014-08-31|11
BNB|2025-08/Bonos%20BNB%20I%20-%20Emisi%C3%B3n%203.pdf|80,81|2016-02-29|11
BNB|2025-08/Bonos%20Subordinados%20BNB%20III.pdf|96,97|2016-12-31|11
BNB|2025-08/Bonos%20Subordinados%20BNB%20IV%20%28ACTUALIZADO%29.pdf|107,108|2019-08-31|11
BNB|2025-08/Bonos%20BNB%20II%20-%20Emisi%C3%B3n%201%20%28Actualizado%29.pdf|81,82|2019-12-31|11
BNB|2025-10/Bonos_BNB_III-Emision_1.pdf|87,88|2025-05-31|11
BSO|2025-07/Bonos%20Subordinados%20BancoSol-%20Emisi%C3%B3n%202_0.pdf|38,39|2009-12-31|9
BSO|2025-08/Bonos%20BANCOSOL%20-%20Emisi%C3%B3n%201.pdf|48,49|2011-06-30|9
BSO|2025-08/Bonos%20BANCOSOL%20%20-%20Emisi%C3%B3n%203.pdf|49,50|2012-12-31|9
BSO|2025-08/Bonos%20Subordinados%20Banco%20Sol%20III%20-%20Emisi%C3%B3n%202.pdf|50,51|2022-09-30|11
BTB|2025-08/Bonos%20subordinados%20BANCO%20DE%20CR%C3%89DITO%20DE%20BOLIVIA%20S.A.%20-%20Emisi%C3%B3n%201.pdf|52,53|2013-09-30|5
BTB|2025-08/Bonos%20Subordinados%20BCP%20-%20Emisi%C3%B3n%20II.pdf|52,53|2015-06-30|5
BTB|2025-08/Bonos%20Subordinados%20BCP%20-%20Emisi%C3%B3n%20III.pdf|39,40|2020-06-30|5
BUN|2025-08/Bonos%20Banco%20Uni%C3%B3n%20-%20Emisi%C3%B3n%201.pdf|43,44|2022-01-31|11
BUN|2025-08/Bonos%20Subordinados%20Banco%20Uni%C3%B3n%20II.pdf|57,58|2023-03-31|11
BUN|2025-08/Bonos%20Banco%20Uni%C3%B3n%20-%20Emisi%C3%B3n%202.pdf|46,47|2024-07-31|11
FCO|2025-08/Bonos%20Subordinados%20BANCO%20PYME%20DE%20LA%20COMUNIDAD.pdf|66,67|2015-11-30|17
FEF|2025-07/Bonos%20Subordinados%20ECO%20FUTURO_0.pdf|66,67|2010-09-30|12
FEF|2025-08/Bonos%20ECOFUTURO%20-%20Emisi%C3%B3n%201.pdf|34,35|2011-05-31|12
FEF|2025-08/Bonos%20subordinados%20ECOFUTURO%202%20-%20Emisi%C3%B3n%201.pdf|51,52|2014-09-30|18
FEF|2025-08/Bonos%20Subordinados%20ECOFUTURO%203.pdf|69,70|2016-11-30|12
FEF|2025-08/BONOS%20ECOFUTURO%202%20-%20EMISI%C3%93N%201.pdf|39,40|2021-06-30|28
FFO|2025-08/Bonos%20BANCO%20FORTALEZA.pdf|45,46|2015-12-31|8
FFO|2025-08/Bonos%20Subordinados%20Banco%20Fortaleza%202021.pdf|272,273|2021-09-30|9
FIE|2025-08/Bonos%20BANCO%20FIE%201%20-%20Emisi%C3%B3n%201.pdf|37,38|2011-08-31|17
FIE|2025-08/Bonos%20subordinados%20BANCO%20FIE%203.pdf|73,74|2014-09-30|17
FIE|2025-08/Bonos%20BANCO%20FIE%202%20-%20Emisi%C3%B3n%201.pdf|40,41|2015-12-31|17
FIE|2025-08/Bonos%20Subordinados%20BANCO%20FIE%205.pdf|51,52|2018-12-31|18
FIE|2025-08/Bonos%20Banco%20FIE%203%20-%20Emisi%C3%B3n%206.pdf|44,45|2022-12-31|2|CONFIE Latinoamérica S.R.L.|Socios de CONFIE
FIE|2025-08/Bonos%20Banco%20FIE%204%20-%20Emisi%C3%B3n%201.pdf|42,43|2024-03-31|3|CONFIE Latinoamérica S.R.L.|Socios de CONFIE
FIE|2025-07/Bonos%20Banco%20FIE%204%20-%20Emisi%C3%B3n%203.pdf|40,41|2024-12-31|20
FSL|2025-07/Bonos%20subordinados%20Fassil_0.pdf|47,48|2009-09-30|4
FSL|2025-07/Bonos%20subordinados%20Fassil_0.pdf|48,49|2009-09-30|11|Nacional Vida Seguros de Personas S.A.
FSL|2025-08/Bonos%20Subordinados%20Banco%20Fassil%20-%20Emisi%C3%B3n%201.pdf|55,56|2020-01-31|5
LAP|2025-07/Bonos%20LOS%20ANDES%20PROCREDIT%20-%20Emisi%C3%B3n1_0.pdf|105,106|2009-12-31|2
`;
