import { Injectable } from '@nestjs/common';
import {
  SubscriberSessionRepository,
  type Credentials,
  type Principal,
  type PrincipalRef,
} from './subscriber-session.repository';
import { AccountLockedError, InvalidCredentialsError } from './subscription-errors';
import { verifyPassword } from './subscription-secrets';

/**
 * Checks a password against the lock that guards it: at sign-in, and again
 * before a password change, under the same rules.
 *
 * The password is always checked first, with the same scrypt work whether the
 * e-mail is known, unknown or locked. Only someone who gives the right
 * password learns that a lock is in force (423): a wrong password answers the
 * same 401 as an unknown e-mail, locked or not — even the attempt that sets
 * the lock — so the lock cannot reveal which e-mails have an account. While
 * locked, failures are not counted and do not extend the lock; outside it, a
 * failure counts towards it and a success resets the count, unless concurrent
 * failures locked it meanwhile, in which case the right password gets the 423.
 *
 * Neither the e-mail nor the password is ever logged.
 */
@Injectable()
export class SubscriberSignInService {
  constructor(private readonly sessions: SubscriberSessionRepository) {}

  async signIn(email: string, password: string): Promise<Principal> {
    const principal = await this.sessions.findPrincipal(email);
    await this.check(principal, password);
    // check() throws for a missing principal, so it is present here.
    return principal!;
  }

  /**
   * Confirms the current password before a change, counting a wrong one
   * towards the same lock as sign-in. Returns false when the owner, or the
   * ACTIVE member, does not exist; throws 401 or 423 as sign-in does.
   */
  async confirmPassword(target: PrincipalRef, password: string): Promise<boolean> {
    const credentials = await this.sessions.findCredentials(target);
    if (!credentials) return false;
    await this.check(credentials, password);
    return true;
  }

  /** Throws unless `password` opens `credentials` and no lock is in force. */
  private async check(credentials: Credentials | null, password: string): Promise<void> {
    // verifyPassword runs scrypt against a decoy when there is no hash, so an
    // unknown e-mail costs the same time as a wrong password.
    const valid = await verifyPassword(password, credentials?.passwordHash ?? null);
    if (!credentials || !valid) {
      if (credentials && !credentials.retryAfterSeconds) {
        await this.sessions.recordFailure(credentials.kind, credentials.id);
      }
      throw new InvalidCredentialsError();
    }
    if (credentials.retryAfterSeconds) throw new AccountLockedError(credentials.retryAfterSeconds);
    const lock = await this.sessions.recordSuccess(credentials.kind, credentials.id);
    if (lock) throw new AccountLockedError(lock);
  }
}
