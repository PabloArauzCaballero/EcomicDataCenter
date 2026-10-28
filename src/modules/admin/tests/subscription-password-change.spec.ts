import { NotFoundError } from '../../../common/errors/application.error';
import { SiteSubscriberCredentialsController } from '../site-subscriber-credentials.controller';
import { SiteSubscriberMembersController } from '../site-subscriber-members.controller';
import type { SubscriberAccountRepository } from '../subscriber-account.repository';
import type { SubscriberMemberRepository } from '../subscriber-member.repository';
import {
  SubscriberSessionRepository,
  type Credentials,
  type PrincipalKind,
} from '../subscriber-session.repository';
import { SubscriberSignInService } from '../subscriber-sign-in.service';
import { AccountLockedError, InvalidCredentialsError } from '../subscription-errors';
import { hashPassword } from '../subscription-secrets';
import { ACCOUNT, MEMBER, fakeWriter, identity } from './subscription-fixtures';

const CURRENT = 'la-clave-actual';
const CHANGE = { currentPassword: CURRENT, newPassword: 'la-clave-nueva-larga' };
const ID = ACCOUNT.subscriber_account_id;
const MEMBER_ID = MEMBER.subscriber_member_id;

/** A session register whose principal has `retryAfterSeconds` of lock left. */
async function sessionsWith(kind: PrincipalKind, id: string, retryAfterSeconds: number | null) {
  const credentials: Credentials = {
    kind,
    id,
    passwordHash: await hashPassword(CURRENT),
    retryAfterSeconds,
  };
  return {
    findCredentials: jest.fn().mockResolvedValue(credentials),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn().mockResolvedValue(null),
  };
}

type Sessions = Awaited<ReturnType<typeof sessionsWith>>;

function service(sessions: Partial<Sessions>): SubscriberSignInService {
  return new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
}

describe("an owner's password change goes through the sign-in lock", () => {
  function owner(sessions: Partial<Sessions>, setPassword: jest.Mock) {
    return new SiteSubscriberCredentialsController(
      identity,
      { setPassword } as unknown as SubscriberAccountRepository,
      {} as SubscriberSessionRepository,
      service(sessions),
    );
  }
  const params = { subscriberAccountId: ID };

  it('counts a wrong current password and answers 401 without changing it', async () => {
    const sessions = await sessionsWith('OWNER', ID, null);
    const setPassword = jest.fn();
    const change = owner(sessions, setPassword).changePassword(params, {
      ...CHANGE,
      currentPassword: 'otra-clave-xx',
    });
    await expect(change).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.findCredentials).toHaveBeenCalledWith({
      kind: 'OWNER',
      subscriberAccountId: ID,
      memberId: null,
    });
    expect(sessions.recordFailure).toHaveBeenCalledWith('OWNER', ID);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('answers 423 to the right password while locked, and changes nothing', async () => {
    const sessions = await sessionsWith('OWNER', ID, 600);
    const setPassword = jest.fn();
    const change = owner(sessions, setPassword).changePassword(params, CHANGE);
    await expect(change).rejects.toBeInstanceOf(AccountLockedError);
    await expect(change).rejects.toMatchObject({ details: { retryAfterSeconds: 600 } });
    expect(sessions.recordSuccess).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('resets the count on the right password and sets the new one; 404 when unknown', async () => {
    const sessions = await sessionsWith('OWNER', ID, null);
    const setPassword = jest.fn().mockResolvedValue(true);
    await owner(sessions, setPassword).changePassword(params, CHANGE);
    expect(sessions.recordSuccess).toHaveBeenCalledWith('OWNER', ID);
    expect(setPassword).toHaveBeenCalledWith(ID, expect.stringMatching(/^scrypt\$/u));
    const unknown = owner({ findCredentials: jest.fn().mockResolvedValue(null) }, setPassword);
    await expect(unknown.changePassword(params, CHANGE)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("a member's password change goes through its own sign-in lock", () => {
  function member(sessions: Partial<Sessions>, setPassword: jest.Mock) {
    return new SiteSubscriberMembersController(
      identity,
      { setPassword } as unknown as SubscriberMemberRepository,
      service(sessions),
    );
  }
  const params = { subscriberAccountId: ID, memberId: MEMBER_ID };

  it('counts a wrong current password against the member and answers 401', async () => {
    const sessions = await sessionsWith('MEMBER', MEMBER_ID, null);
    const setPassword = jest.fn();
    const change = member(sessions, setPassword).changePassword(params, {
      ...CHANGE,
      currentPassword: 'otra-clave-xx',
    });
    await expect(change).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.findCredentials).toHaveBeenCalledWith({
      kind: 'MEMBER',
      subscriberAccountId: ID,
      memberId: MEMBER_ID,
    });
    expect(sessions.recordFailure).toHaveBeenCalledWith('MEMBER', MEMBER_ID);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('answers 423 while locked, and changes it once the right password is accepted', async () => {
    const locked = await sessionsWith('MEMBER', MEMBER_ID, 300);
    const setPassword = jest.fn().mockResolvedValue(true);
    await expect(member(locked, setPassword).changePassword(params, CHANGE)).rejects.toBeInstanceOf(
      AccountLockedError,
    );
    expect(setPassword).not.toHaveBeenCalled();
    const open = await sessionsWith('MEMBER', MEMBER_ID, null);
    await member(open, setPassword).changePassword(params, CHANGE);
    expect(open.recordSuccess).toHaveBeenCalledWith('MEMBER', MEMBER_ID);
    expect(setPassword).toHaveBeenCalledWith(ID, MEMBER_ID, expect.stringMatching(/^scrypt\$/u));
  });

  it('reads only an ACTIVE member of that account', async () => {
    const { writer, calls } = fakeWriter(() => []);
    const found = await new SubscriberSessionRepository(writer).findCredentials({
      kind: 'MEMBER',
      subscriberAccountId: ID,
      memberId: MEMBER_ID,
    });
    expect(found).toBeNull();
    expect(calls[0]?.sql).toContain('FROM operations.subscriber_member');
    expect(calls[0]?.sql).toContain("status = 'ACTIVE'");
    expect(calls[0]?.sql).toContain('subscriber_account_id = CAST(:subscriberAccountId AS uuid)');
  });
});
