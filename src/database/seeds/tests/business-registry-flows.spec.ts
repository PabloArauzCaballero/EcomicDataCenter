import type { PdfRow } from '../../../../scripts/business/pdf-rows';
import { seprecCancelled } from '../../../../scripts/business/registry-flow-seprec';

const row = (text: string, page = 1, y = 100): PdfRow => ({
  page,
  y,
  text,
  glyphs: [{ text, x: 0, right: text.length, y }],
});

const departments2022 = ['La Paz 1.066', 'Santa Cruz 852', 'Cochabamba 787', 'Tarija 179', 'Oruro 163', 'Chuquisaca 135', 'Potosí 94', 'Beni 52', 'Pando 11'].map((text, index) =>
  row(text, 61, 400 - index * 20),
);

const departments2023 = ['La Paz 1.299', 'Santa Cruz 1.084', 'Cochabamba 872', 'Tarija 201', 'Oruro 164', 'Potosí 144', 'Chuquisaca 85', 'Beni 80', 'Pando 16'].map((text, index) =>
  row(text, 41, 600 - index * 20),
);

describe('cancelaciones oficiales del SEPREC', () => {
  it('prefiere el total 2022 que concuerda con los nueve departamentos', () => {
    const figures = seprecCancelled(
      [
        row('De enero a diciembre de gestión 2022 cancelaron su Matrícula de Comercio 2.491 unidades económicas.', 60),
        row('3.339', 60, 220),
        row('Bolivia: Cancelación de matrícula de comercio según departamento, enero a diciembre de 2022', 61, 500),
        ...departments2022,
      ],
      '2022',
    );

    expect(figures.find((figure) => figure.key === 'BOLIVIA')?.value).toBe('3339');
    expect(figures.find((figure) => figure.key === 'LA_PAZ')?.value).toBe('1066');
    expect(figures).toHaveLength(10);
  });

  it('lee el total y los nueve departamentos de 2023', () => {
    const figures = seprecCancelled(
      [
        row('De enero a diciembre de 2023 cancelaron su matrícula de comercio 3.945 unidades económicas.', 40),
        row('Bolivia: Cancelación de matrículas de comercio según departamento, enero a diciembre 2023', 41, 650),
        ...departments2023,
      ],
      '2023',
    );

    expect(figures.find((figure) => figure.key === 'BOLIVIA')?.value).toBe('3945');
    expect(figures.find((figure) => figure.key === 'LA_PAZ')?.value).toBe('1299');
    expect(figures).toHaveLength(10);
  });

  it('rechaza un desglose departamental que no suma el total', () => {
    expect(() =>
      seprecCancelled(
        [
          row('De enero a diciembre de 2023 cancelaron su matrícula de comercio 3.945 unidades económicas.', 40),
          row('Bolivia: Cancelación de matrículas de comercio según departamento, enero a diciembre 2023', 41, 650),
          ...departments2023.slice(0, -1),
          row('Pando 15', 41, 440),
        ],
        '2023',
      ),
    ).toThrow(/suman 3944, no 3945/u);
  });
});
