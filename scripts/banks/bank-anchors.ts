import { createHash } from 'node:crypto';
import type { BankPoint } from '../../src/database/seeds/schemas/bank-virtual-assets.schema';

/**
 * El día en que cada banco dijo que empezaba, con el pasaje literal que lo
 * dice. Se verificaron el 2026-09-30 leyendo la página completa en un
 * navegador; la huella es la del pasaje citado porque la página no se conservó.
 *
 * BNB es la excepción y por eso lleva otra `basis`: nunca dijo cuándo empezó.
 * Lo único fechado es su primer documento público, el PDF de la Cuenta Cripto,
 * cuya cabecera `Last-Modified` da el 15 de mayo de 2026. Una fecha de arranque
 * no puede ser posterior a ese documento, pero sí anterior: el punto dice «a
 * más tardar», no «empezó».
 */

const VERIFIED_AT = '2026-09-30T15:45:00Z';

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

const announcement = (
  date: string,
  excerpt: string,
  sourceUrl: string,
  basis: BankPoint['basis'] = 'ANNOUNCEMENT',
  upstreamSha256 = digest(excerpt),
): BankPoint => ({
  date,
  value: '1',
  basis,
  excerpt,
  sourceUrl,
  upstreamSha256,
  retrievedAt: VERIFIED_AT,
});

export const ANCHORS: Readonly<Record<string, BankPoint>> = {
  VASP_BISA_USDT_OFFERED: announcement(
    '2024-10-28',
    'Los clientes interesados en este innovador servicio pueden registrarse en nuestra plataforma para abrir su cuenta de custodia desde el 28 de octubre de 2024',
    'https://www.vision360.bo/noticias/2024/10/26/14140-banco-bisa-habilita-servicio-para-transacciones-con-stablecoin',
  ),
  VASP_BCP_USDT_OFFERED: announcement(
    '2025-05-16',
    'El Banco de Crédito de Bolivia (BCP) anunció el pasado 16 de mayo el lanzamiento de un servicio que permitirá a sus clientes realizar transferencias internacionales desde sus cuentas en bolivianos, mediante la conversión automática de sus fondos a la stablecoin USDT',
    'https://es.tradingview.com/news/cointelegraph:6edf9d3f909cd:0/',
  ),
  VASP_GANADERO_USDC_OFFERED: announcement(
    '2025-08-28',
    'agregó el ejecutivo durante la presentación ante la prensa en Santa Cruz el pasado 28 de agosto.',
    'https://eldia.com.bo/2025-09-12/economia/banco-ganadero-lanza-ganacripto-nueva-opcion-en-el-creciente-mundo-de-las-criptomonedas.html',
  ),
  VASP_FIE_USDT_OFFERED: announcement(
    '2026-04-09',
    'Este servicio, disponible desde el 9 de abril de 2026, permite la compra y venta de USDT (Tether) desde su aplicación móvil',
    'https://www.criptonoticias.com/comunidad/adopcion/banco-lanza-servicio-usdt-bolivia-crisis-dolares/',
  ),
  VASP_UNION_USDT_OFFERED: announcement(
    '2026-04-30',
    'El Banco Unión, entidad controlada por el Estado boliviano, anunció la integración de la stablecoin USDT en su ecosistema financiero a través de su wallet Yasta. El servicio entra en operación el próximo jueves 30 de abril.',
    'https://www.criptonoticias.com/comunidad/adopcion/banco-bolivia-stablecoin-gobierno-compra-usdt/',
  ),
  VASP_BNB_USDT_OFFERED: announcement(
    '2026-05-15',
    "Last-Modified: Fri, 15 May 2026 20:42:12 GMT; CreationDate D:20260514130723-04'00'",
    'https://www.bnb.com.bo/PortalBNB/Documentos/Cuenta_Cripto.pdf',
    'FIRST_PUBLIC_DOCUMENT',
    'eb8446b0c8eb829f6587e3283c374681f35d80aa2c338a6b2533b60952679bce',
  ),
};
