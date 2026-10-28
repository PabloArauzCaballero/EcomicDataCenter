import { ApplicationError } from '../../common/errors/application.error';

/** One answer for every failed sign-in, so it never tells which part was wrong. */
export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super('UNAUTHORIZED', 'Invalid e-mail or password', 401);
  }
}
