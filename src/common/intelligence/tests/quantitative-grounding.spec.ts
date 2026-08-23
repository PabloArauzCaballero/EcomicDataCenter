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
    expect(
      ungroundedNumbers(
        'El indicador aumentó 7.4 por ciento.',
        'El indicador aumentó 7,4 puntos porcentuales.',
      ),
    ).toEqual(['7.4']);
  });

  it('preserves the sign of increases and decreases', () => {
    expect(ungroundedNumbers('La variación fue de -3%.', 'La variación fue de 3%.')).toEqual([
      '-3',
    ]);
    expect(ungroundedNumbers('La variación fue de 3%.', 'La variación fue de -3%.')).toEqual(['3']);
    expect(ungroundedNumbers('La variación fue de +3%.', 'La variación fue de 3%.')).toEqual([]);
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

  it('normalizes exact thousand and million magnitude words', () => {
    expect(ungroundedNumbers('Se registraron 2 mil casos.', 'Se registraron 2000 casos.')).toEqual(
      [],
    );
    expect(
      ungroundedNumbers(
        'La inversión llegó a USD 1,5 millones.',
        'La inversión llegó a USD 1.500.000.',
      ),
    ).toEqual([]);
    expect(ungroundedNumbers('Se registraron 1,5 millones.', 'Se registraron 1500.')).toEqual([
      '1,5',
    ]);
  });

  it('requires distinct numeric occurrences in the same semantic order', () => {
    const source = 'El índice bajó de 38,7 a 31,3 puntos durante 2026.';

    expect(ungroundedNumbers('El índice terminó en 31.3 puntos.', source)).toEqual([]);
    expect(ungroundedNumbers('El índice subió de 31.3 a 38.7 puntos.', source)).toEqual(['38.7']);
    expect(
      ungroundedNumbers('Se registraron 3 casos y otros 3 casos.', 'Se registraron 3 casos.'),
    ).toEqual(['3']);
  });
});
