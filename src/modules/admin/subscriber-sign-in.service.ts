import { Injectable } from '@nestjs/common';
import { SubscriberSessionRepository, type Principal } from './subscriber-session.repository';
import { AccountLockedError, InvalidCredentialsError } from './subscription-errors';
import { verifyPassword } from './subscription-secrets';

/**
 * Checks a customer sign-in against the lock that guards it.
 *
 * The order is the rule: a locked principal is refused with 423 before the
 * password is looked at, so a right guess during the lock is indistinguishable
 * from a wrong one; a wrong password counts towards the lock; a right one
 * resets the count — unless concurrent failures locked it meanwhile.
 *
 * An unknown e-mail and a wrong password give the same 401 after the same
 * scrypt work. Neither the e-mail nor the password is ever logged.
 */
@Injectable()
export class SubscriberSignInService {
  constructor(private readonly sessions: SubscriberSessionRepository) {}

  async signIn(email: string, password: string): Promise<Principal> {
    const principal = await this.sessions.findPrincipal(email);
    if (principal?.retryAfterSeconds) throw new AccountLockedError(principal.retryAfterSeconds);
    // verifyPassword runs scrypt against a decoy when there is no hash, so an
    // unknown e-mail costs the same time as a wrong password.
    const valid = await verifyPassword(password, principal?.passwordHash ?? null);
    if (!principal) throw new InvalidCredentialsError();
    if (!valid) {
      const lock = await this.sessions.recordFailure(principal.kind, principal.id);
      if (lock) throw new AccountLockedError(lock);
      throw new InvalidCredentialsError();
    }
    const lock = await this.sessions.recordSuccess(principal.kind, principal.id);
    if (lock) throw new AccountLockedError(lock);
    return principal;
  }
}
