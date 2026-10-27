// node privacy.test.mjs — casos de la revisión de seguridad para `privacy.mjs`.
import assert from 'node:assert/strict';
import { scrub, verifyNoContacts } from './privacy.mjs';

const dirty = [
  'Llámanos al 77220006',
  'Tel: 2-2487463',
  'WhatsApp +591 712 34567',
  'cel ７７２２０００６ (ancho completo)',
  'fono 772‑200‑06', // guion no separable U+2011
  'tel 772/200/06',
  'tel 772·200·06',
  'tel (2) 248 7463',
  'tel ٧٧٢٢٠٠٠٦', // dígitos árabe-índicos
  'info@copabol.com',
  'info arroba gmail punto com',
  'ventas(arroba)empresa.com.bo',
  'ventas [arroba] empresa [punto] com',
  'contacto＠empresa．com', // arroba y punto de ancho completo
  '1.234.567 seguidores',
];
for (const text of dirty) {
  const clean = scrub(text);
  const found = verifyNoContacts([{ source_id: 't', raw: { text: clean } }], 'test');
  assert.equal(found.length, 0, `queda contacto en «${text}» → «${clean}»`);
  const before = verifyNoContacts([{ source_id: 't', raw: { text } }], 'test');
  assert.ok(before.length > 0, `el verificador no marca «${text}»`);
}

const keep = ['Av. Landaeta No. 761, La Paz', '23.806 seguidores · 126 personas', 'Calle 21 de Calacoto #8', 'Rango de precios · $$'];
for (const text of keep) assert.equal(scrub(text), text, `se borró de más en «${text}»`);

// `phone` y los campos estructurados no se revisan
assert.equal(verifyNoContacts([{ source_id: '100143199096033', phone: '+59177220006', raw: { page_id: '100143199096033' } }], 't').length, 0);
console.log(`ok: ${dirty.length} sucios limpiados y marcados, ${keep.length} limpios intactos`);
