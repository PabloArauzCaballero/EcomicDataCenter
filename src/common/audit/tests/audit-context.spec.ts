import { of, tap, type Observable } from 'rxjs';
import {
  createAuditState,
  currentAuditState,
  markAuditedTransactionally,
  runWithAuditState,
} from '../audit-context';

const SEED = { actor: undefined, correlationId: 'corr-1', clientContext: null };

describe('audit context', () => {
  it('exposes the ambient state to code running inside the scope', () => {
    runWithAuditState(createAuditState(SEED), () => {
      expect(currentAuditState()?.correlationId).toBe('corr-1');
    });
  });

  it('reports no state outside a request, so CLI paths invent no actor', () => {
    expect(currentAuditState()).toBeUndefined();
  });

  it('marks the ambient state when a service audits transactionally', () => {
    const state = createAuditState(SEED);
    runWithAuditState(state, () => {
      markAuditedTransactionally();
    });
    expect(state.transactional).toBe(true);
  });

  it('does not throw when marking outside a request scope', () => {
    expect(() => markAuditedTransactionally()).not.toThrow();
  });

  /**
   * Guards the defect that shipped a duplicate audit row per request.
   *
   * `runWithAuditState` returns as soon as the observable is built, so a
   * context lookup performed when the observable is later subscribed misses.
   * The interceptor therefore keeps a direct reference to the state object,
   * and this test fails if anyone reverts to a lookup.
   */
  it('keeps the flag readable through the returned reference after the scope exits', () => {
    const state = createAuditState(SEED);
    const observed: { insideScope?: boolean; viaReference?: boolean } = {};

    const stream: Observable<unknown> = runWithAuditState(state, () =>
      of(null).pipe(
        tap(() => {
          observed.insideScope = currentAuditState() !== undefined;
          observed.viaReference = state.transactional;
        }),
      ),
    );

    // Simulates the service writing its audit row before Nest subscribes.
    runWithAuditState(state, () => markAuditedTransactionally());
    stream.subscribe();

    expect(observed.insideScope).toBe(false);
    expect(observed.viaReference).toBe(true);
  });
});
