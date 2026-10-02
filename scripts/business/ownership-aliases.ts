/**
 * El mismo titular escrito de otra manera, y el nombre con que entra al corpus.
 *
 * Un renglón por variante: `variante => nombre canónico`. Sólo variantes que se
 * vieron en estos documentos y sólo dentro de la misma empresa o de una cadena
 * que el documento declara: la ficha de la Bolsa recorta los nombres de pila
 * («Elvio Perrogon Toledo»), los prospectos ponen el apellido primero
 * («PERROGON TOLEDO ELVIO LUÍS») o la sigla entre paréntesis, y hay erratas
 * («Orwana», «Agropcuaria»). Nada se une por parecido de apellidos: unir a dos
 * personas distintas sumaría la fortuna de una a la de la otra.
 *
 * Sin esta tabla, una misma participación se parte en series que empiezan y
 * terminan donde cambió el documento, y la suma por persona del tablero cuenta
 * a la misma persona dos veces o la pierde.
 */
const TABLE = `
PERROGON TOLEDO ELVIO LUÍS => Elvio Luis Perrogón Toledo
PERROGON TOLEDO ELVIO LUIS => Elvio Luis Perrogón Toledo
ELVIO LUIS PERROGON TOLEDO => Elvio Luis Perrogón Toledo
Elvio Perrogon Toledo => Elvio Luis Perrogón Toledo
Elvio Luis Perrogón Toledo => Elvio Luis Perrogón Toledo
KULJIS FUCHTNER IVO MATEO => Ivo Mateo Kuljis Fuchtner
IVO MATEO KULJIS FUCHTNER => Ivo Mateo Kuljis Fuchtner
Ivo Kuljis Fuchtner => Ivo Mateo Kuljis Fuchtner
KULJIS FUCHTNER TOMISLAV CARLOS => Tomislav Carlos Kuljis Fuchtner
EMPACAR S.A.-ENVASES PAPELES Y => Empresa de Envases Papeles y Cartones S.A.
EMPACAR S.A.-ENVASES PAPELES Y CARTONES => Empresa de Envases Papeles y Cartones S.A.
Envases Papeles y Cartones S.A. (EMPACAR S.A.) => Empresa de Envases Papeles y Cartones S.A.
MONASTERIO NIEME FERNANDO => Fernando Monasterio Nieme
MONASTERIO NIEME OSVALDO => Osvaldo Monasterio Nieme
Roberto Krutzfeldt => Roberto Krutzfeldt Monasterio
Guillermos Krutzfeldt Monasterio => Guillermo Krutzfeldt Monasterio
INVERSIONES JAEM & CIA INJECIA S.A. => Inversiones JAEM & CIA S.A. INJECIA S.A.
INVERSORA ZUBAT S.A. => Inversiones Zubat S.A.
INZUBAT S.A. => Inversiones Zubat S.A.
Compañía de Inversiones Los Álamos S.A. (CODINAL S.A.) => Compañía de Inversiones Los Álamos S.A.
COMPANIA DE INVERSIONES LOS ALAMOS S.A. => Compañía de Inversiones Los Álamos S.A.
INVERSIONES OVENDAL S.A. INVOSA => Inversiones Ovendal S.A. (INVOSA)
Vanessa Zuazo Batchelder => Yascara Vanessa Zuazo Batchelder
SCFG Sociedad Controladora S.A. => Santa Cruz FG Sociedad Controladora S.A.
Santa Cruz FG Sociedad Controladora S.A. (Ex SOCIEDAD CONTROLADORA) => Santa Cruz FG Sociedad Controladora S.A.
Corporación de Fomento a Iniciativas Económicas SL. (CONFIE S.L.) => Corporación de Fomento a Iniciativas Económicas S.L. (CONFIE)
Corporación de Fomento a Iniciativas Económicas SL. (CONFIE) => Corporación de Fomento a Iniciativas Económicas S.L. (CONFIE)
Corporación para el Fomento a Iniciativas Económicas SL. (CONFIE) => Corporación de Fomento a Iniciativas Económicas S.L. (CONFIE)
DWM Founds S.C.A. – SICAV SIF => DWM Funds S.C.A. SICAV-SIF
DWM Funds S.C.A.-SICAV SIF => DWM Funds S.C.A. SICAV-SIF
OIKOCREDIT => Oikocredit Ecumenical Development Cooperative Society U.A.
OIKOCREDIT Ecumenical Development => Oikocredit Ecumenical Development Cooperative Society U.A.
OIKOCREDIT Ecumenical Development Cooperative Society U.A => Oikocredit Ecumenical Development Cooperative Society U.A.
Oikocredit, Ecumenical Development Cooperative Society U.A => Oikocredit Ecumenical Development Cooperative Society U.A.
Incofin CVSO => CPP Incofin c.v.s.o.
ASN - NOVIB MICROKREDIETFONDS => ASN-Novib Microkredietfonds
ASN-NOVIB MICROKREDIETFONDS => ASN-Novib Microkredietfonds
CAP Fondo de Inversión Cerrado CAP FIC => CAP Fondo de Inversión Cerrado (CAP FIC)
Marca Verde SAFI S.A. - CAP FIC => CAP Fondo de Inversión Cerrado (CAP FIC)
MARCA VERDE SOCIEDAD ADMINISTRADORA DE FONDOS DE INVERSIÓN S.A. -CAP. FONDO DE INVERSIÓN CERRADO CAP FIC. => CAP Fondo de Inversión Cerrado (CAP FIC)
ACCION Gateway Fund LLC => ACCION Gateway Fund L.L.C.
ACCION GATEWAY FUND L.L.C => ACCION Gateway Fund L.L.C.
ACCION GATEWAY FUND L.L.C. => ACCION Gateway Fund L.L.C.
ACCION Internacional => ACCION International
ACCION INTERNACIONAL => ACCION International
ACCION INTERNATIONAL => ACCION International
ACCION INTERNATIONAL S.A. => ACCION International
Nederlandse Financierings - Maatschappij Voor Ontwikkelingslanden N.V. => Nederlandse Financierings-Maatschappij voor Ontwikkelingslanden N.V. (FMO)
Nederlandse Financierings-Maatschappij Voor Ontwikkelingslanden N.V. (FMO) => Nederlandse Financierings-Maatschappij voor Ontwikkelingslanden N.V. (FMO)
Tesoro General de la Nación (TGN) => Tesoro General de la Nación
Rodrigo Pedrazas Arce => Rodrigo Alonzo Pedrazas Arce
Abdallah Daher Bulus => Abdallah Edmond Daher Bulus
CRECIMIENTO FONDO DE INVERSIÓN CERRADO administrado por SAFI S.A. => Crecimiento Fondo de Inversión Cerrado
CRECIMIENTO FONDO DE INVERSIÓN CERRADO => Crecimiento Fondo de Inversión Cerrado
Jorge Claros Fuentes => Jorge Rodolfo Claros Fuentes
Orwana Sweden International AB => Orvana Sweden International AB
Pedro Paz Soldan Unzueta => Pedro Francisco Miguel Paz Soldán Unzueta
Pedro Francisco Miguel Paz Soldan Unzueta => Pedro Francisco Miguel Paz Soldán Unzueta
Daniel Paz Soldan Urriolagoitia => Daniel Joaquín Paz Soldán Urriolagoitia
Daniel Joaquín Paz Soldan Urriolagoitia => Daniel Joaquín Paz Soldán Urriolagoitia
Diego Paz Soldan Urriolagoitia => Diego Emilio Paz Soldán Urriolagoitia
Diego Emilio Paz Soldan Urriolagoitia => Diego Emilio Paz Soldán Urriolagoitia
Teresiña Paz Soldan Urriolagoitia => Teresiña Bernarda Paz Soldán Urriolagoitia
Teresiña Bernarda Paz Soldan Urriolagoitia => Teresiña Bernarda Paz Soldán Urriolagoitia
Patricia Terceros Bedoya => Patricia Josefina Terceros Bedoya
Barry Salvatierra Chávez => Barry Leonardo Salvatierra Chávez
Ana Salvatierra Chávez => Ana María Salvatierra Chávez de Henicke
José Salvatierra Chávez => José Eduardo Salvatierra Chávez
Alianza SAFI S.A. => Alianza Sociedad Administradora de Fondos de Inversión S.A.
Alianza SAFI S.A. Sociedad Administradora de Fondos de Inversión => Alianza Sociedad Administradora de Fondos de Inversión S.A.
RADSIL CORP. (RadmilaJovicevic de Marinkovic) => Radsil Corp. (Radmila Jovicevic de Marinkovic)
RADSIL CORP. (Radmila Jovicevic de Marinkovic) => Radsil Corp. (Radmila Jovicevic de Marinkovic)
Tatiana Marinkovic => Tatiana Marinkovic de Pedrotti
Alfonso Bautista Yana => Alfonso Policarpio Bautista Yana
Miguel Rada Sanchez => Miguel Ángel Rada Sánchez
Gabriel Pabón G. => Gabriel Pabón Gutiérrez
Gabriel Pabon Gutierrez => Gabriel Pabón Gutiérrez
K12 FIC => K12 Fondo de Inversión Cerrado
LA FONTE S.A. => Lafonte Inversiones Industriales S.A.
La Fonte S.A. => Lafonte Inversiones Industriales S.A.
Integral Agropcuaria S.A. => Integral Agropecuaria S.A.
Integral Agropecuaria S.A.- INTAGRO S.A. => Integral Agropecuaria S.A.
Empresa Oriental de Emprendimientos S.A. (EMOEM S.A.) => Empresa Oriental de Emprendimientos S.A.
Edwin Saavedra Toledo => Edwin Santos Saavedra Toledo
Nancy Griselda de Rasmusen de Garnero => Nancy Griselda Rasmusen de Garnero
Stefania Garnero => Stefanía Garnero
Fundación para Alternativas de Desarrollo - FADES => Fundación para Alternativas de Desarrollo (FADES)
Fundación para Alternativas de Desarrollo => Fundación para Alternativas de Desarrollo (FADES)
FADES => Fundación para Alternativas de Desarrollo (FADES)
`;

/** Una clave por variante, normalizada como el colector normaliza los titulares. */
export function aliasTable(normalize: (published: string) => string): ReadonlyMap<string, string> {
  return new Map(
    TABLE.trim()
      .split('\n')
      .map((line) => line.split(' => ').map((part) => part.trim()))
      .map(([variant = '', canonical = '']) => [normalize(variant), canonical] as const),
  );
}

/** Titulares que la regla de palabras clasifica mal. */
export const HOLDER_KINDS: Readonly<Record<string, 'persona' | 'sociedad'>> = {
  'CPP Incofin c.v.s.o.': 'sociedad',
  'Oikocredit Ecumenical Development Cooperative Society U.A.': 'sociedad',
  'ASN-Novib Microkredietfonds': 'sociedad',
  'ASN - MICROKREDIETPOOL': 'sociedad',
  'Gestora Pública de la Seguridad Social de Largo Plazo': 'sociedad',
  'Yacimientos Petrolíferos Fiscales Bolivianos': 'sociedad',
  'Radsil Corp. (Radmila Jovicevic de Marinkovic)': 'sociedad',
  'Nederlandse Financierings-Maatschappij voor Ontwikkelingslanden N.V. (FMO)': 'sociedad',
  'Empresa de Envases Papeles y Cartones S.A.': 'sociedad',
  COMTECO: 'sociedad',
};
