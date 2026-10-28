import { ApplicationError } from '../../common/errors/application.error';

/** One answer for every failed sign-in, so it never tells which part was wrong. */
export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super('UNAUTHORIZED', 'Invalid e-mail or password', 401);
  }
}

/**
 * Too many consecutive failed sign-ins: 423 until the lock passes.
 *
 * It is answered only to a caller who gave the right password, so the lock
 * tells nothing to someone who does not have it — a wrong password gets the
 * same 401 as an unknown e-mail. The body says only how long to wait, under
 * `details.retryAfterSeconds`.
 */
export class AccountLockedError extends ApplicationError {
  constructor(retryAfterSeconds: number) {
    super('LOCKED', 'Too many failed sign-ins; try again later', 423, {
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    });
  }
}
