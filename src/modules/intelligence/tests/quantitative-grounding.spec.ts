import { ungroundedNumbers } from '../quantitative-grounding';

describe('ungroundedNumbers', () => {
  it('accepts decimal comma/dot variants and reports invented figures', () => {
    const source = 'El índice bajó de 38,7 a 31,3 puntos durante 2026.';

    expect(ungroundedNumbers('El índice bajó de 38.7 a 31.3 puntos en 2026.', source)).toEqual([]);
    expect(ungroundedNumbers('El índice bajó a 29.5 puntos.', source)).toEqual(['29.5']);
  });

  it('does not confuse a percentage with the same number in a date', () => {
    const source = 'El informe fue publicado el 18 de agosto de 2026.';

    expect(ungroundedNumbers('La inflación llegó a 18%.', source)).toEqual(['18']);
  });

  it('distinguishes percentage points from percentages', () => {
    const source = 'La tasa disminuyó 7,4 por ciento.';

    expect(ungroundedNumbers('El indicador disminuyó 7.4 puntos porcentuales.', source)).toEqual([
      '7.4',
    ]);
  });

  it('requires compatible currency and physical units', () => {
    const source = 'El precio autorizado es de 18 bolivianos por litro.';

    expect(ungroundedNumbers('El precio autorizado es de Bs 18 por litro.', source)).toEqual([]);
    expect(ungroundedNumbers('El precio autorizado es de Bs 18/litro.', source)).toEqual([]);
    expect(ungroundedNumbers('El precio autorizado es de USD 18 por litro.', source)).toEqual([
      '18',
    ]);
  });

  it('normalizes common thousands separators', () => {
    expect(
      ungroundedNumbers('Se registraron 1.000 operaciones.', 'Se registraron 1000 operaciones.'),
    ).toEqual([]);
  });
});
