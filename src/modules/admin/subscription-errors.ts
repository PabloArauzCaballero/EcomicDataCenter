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
 * It is answered even when the password is right, so a guesser who lands on the
 * password during the lock learns nothing from the response. The body says
 * only how long to wait, under `details.retryAfterSeconds`.
 */
export class AccountLockedError extends ApplicationError {
  constructor(retryAfterSeconds: number) {
    super('LOCKED', 'Too many failed sign-ins; try again later', 423, {
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    });
  }
}
