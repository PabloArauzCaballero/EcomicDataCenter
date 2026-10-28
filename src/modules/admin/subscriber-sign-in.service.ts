import { Injectable } from '@nestjs/common';
import {
  SubscriberSessionRepository,
  type Credentials,
  type Principal,
  type PrincipalRef,
} from './subscriber-session.repository';
import { InvalidCredentialsError } from './subscription-errors';
import { verifyPassword } from './subscription-secrets';

/**
 * Checks a password against the lock that guards it: at sign-in, and again
 * before a password change, under the same rules.
 *
 * Every refusal is the same 401 with the same body: an unknown e-mail, a wrong
 * password, and any password at all — right or wrong — while a lock is in
 * force. The response therefore never tells a guesser whether an e-mail has an
 * account, whether it is locked, or whether a guess made during the lock was
 * right, so the lock cannot be turned into an oracle for unlimited guessing.
 * scrypt runs on every attempt, so the timing does not tell either.
 *
 * Outside a lock, a wrong password counts towards it (the tenth in a row locks
 * for fifteen minutes, and still answers 401) and a right one resets the
 * count. Attempts during a lock are not counted and do not extend it. The way
 * out is a reset or activation token, or the operator's unlock.
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
   * ACTIVE member, does not exist; throws the same 401 as sign-in otherwise.
   */
  async confirmPassword(target: PrincipalRef, password: string): Promise<boolean> {
    const credentials = await this.sessions.findCredentials(target);
    if (!credentials) return false;
    await this.check(credentials, password);
    return true;
  }

  /** Throws the generic 401 unless `password` opens `credentials` and no lock is in force. */
  private async check(credentials: Credentials | null, password: string): Promise<void> {
    // verifyPassword runs scrypt against a decoy when there is no hash, so an
    // unknown e-mail costs the same time as a wrong password.
    const valid = await verifyPassword(password, credentials?.passwordHash ?? null);
    if (!credentials || credentials.locked) throw new InvalidCredentialsError();
    if (!valid) {
      await this.sessions.recordFailure(credentials.kind, credentials.id);
      throw new InvalidCredentialsError();
    }
    // A lock set meanwhile by concurrent failures wins over the right password.
    const cleared = await this.sessions.recordSuccess(credentials.kind, credentials.id);
    if (!cleared) throw new InvalidCredentialsError();
  }
}
