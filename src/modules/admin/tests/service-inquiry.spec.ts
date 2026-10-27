import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Sequelize } from 'sequelize';
import type { Actor } from '../../../common/auth/actor';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { NotFoundError, RequestValidationError } from '../../../common/errors/application.error';
import type { ReadQueryExecutor } from '../../../common/persistence/read-query.executor';
import { decodeCursor, encodeCursor } from '../admin-cursor';
import { AdminInquiriesController } from '../admin-inquiries.controller';
import type { DeploymentIdentity } from '../deployment-identity';
import type { InquiryRow } from '../inquiry-row';
import { InquiryViewRepository } from '../inquiry-view.repository';
import { InquiryWriteRepository } from '../inquiry-write.repository';
import {
  inquiryListQuerySchema,
  inquirySubmissionSchema,
  inquiryUpdateSchema,
  type InquirySubmission,
} from '../inquiry.schemas';

type Handler = (...args: never[]) => unknown;

const prototype = AdminInquiriesController.prototype as unknown as Record<string, Handler>;
const guard = new RolesGuard(new Reflector());

function contextFor(handler: Handler, actor: Actor | undefined) {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as Parameters<RolesGuard['canActivate']>[0];
}

function actorWith(role: Actor['roles'][number]): Actor {
  return { subject: `subject-${role}`, roles: [role] };
}

const VALID = {
  requestId: '3f2b8c1e-5d4a-4b6f-9e2d-7a1c0b9e8f61',
  fullName: '  Ana Quispe  ',
  email: ' ana@example.org ',
  organization: 'Cámara de Comercio',
  phone: '',
  planCode: 'profesional',
  message: 'Necesitamos series de precios semanales para el comité.',
  sourceRoute: '/servicios',
} as const;

function row(overrides: Partial<InquiryRow> = {}): InquiryRow {
  return {
    service_inquiry_id: '9a7c2f10-1b2c-4d3e-8f40-5a6b7c8d9e0f',
    full_name: 'Ana Quispe',
    email: 'ana@example.org',
    organization: null,
    phone: null,
    plan_code: 'profesional',
    message: 'Necesitamos series de precios semanales.',
    source_route: '/servicios',
    status: 'NEW',
    operator_note: null,
    created_at: new Date('2026-10-27T14:00:00.123Z'),
    created_at_key: '2026-10-27T14:00:00.123456Z',
    updated_at: null,
    updated_by: null,
    ...overrides,
  };
}

describe('service inquiries: who may call what', () => {
  it('lets the inquiry identity submit', () => {
    expect(guard.canActivate(contextFor(prototype['submit']!, actorWith('SITE_INQUIRY')))).toBe(
      true,
    );
  });

  it('refuses the telemetry identity on submission', () => {
    expect(() =>
      guard.canActivate(contextFor(prototype['submit']!, actorWith('SITE_TELEMETRY'))),
    ).toThrow(ForbiddenException);
  });

  it('refuses the inquiry identity on reading and updating the inbox', () => {
    for (const name of ['list', 'update']) {
      expect(() =>
        guard.canActivate(contextFor(prototype[name]!, actorWith('SITE_INQUIRY'))),
      ).toThrow(ForbiddenException);
    }
  });

  it('lets the subscription operator read and update', () => {
    for (const name of ['list', 'update']) {
      expect(guard.canActivate(contextFor(prototype[name]!, actorWith('SUBSCRIPTION_ADMIN')))).toBe(
        true,
      );
    }
  });

  it('lets an analyst read but not update', () => {
    expect(guard.canActivate(contextFor(prototype['list']!, actorWith('ANALYST')))).toBe(true);
    expect(() => guard.canActivate(contextFor(prototype['update']!, actorWith('ANALYST')))).toThrow(
      ForbiddenException,
    );
  });

  it('does not let a human operator submit as if they were the site', () => {
    expect(() =>
      guard.canActivate(contextFor(prototype['submit']!, actorWith('SUBSCRIPTION_ADMIN'))),
    ).toThrow(ForbiddenException);
  });
});

describe('inquirySubmissionSchema', () => {
  it('trims text and folds a blank optional field into null', () => {
    const parsed = inquirySubmissionSchema.parse(VALID);
    expect(parsed.fullName).toBe('Ana Quispe');
    expect(parsed.email).toBe('ana@example.org');
    expect(parsed.phone).toBeNull();
    expect(parsed.organization).toBe('Cámara de Comercio');
  });

  it('accepts the optional fields when they are absent', () => {
    const required = Object.fromEntries(
      Object.entries(VALID).filter(([key]) => key !== 'organization' && key !== 'phone'),
    );
    const parsed = inquirySubmissionSchema.parse(required);
    expect(parsed.organization).toBeNull();
    expect(parsed.phone).toBeNull();
  });

  it.each([
    ['a bad e-mail', { email: 'ana-at-example' }],
    ['an unknown plan', { planCode: 'premium' }],
    ['a message that is too short', { message: 'hola' }],
    ['a message of blanks', { message: '            ' }],
    ['an extra field', { budget: '1000' }],
    ['a request id that is not a UUID', { requestId: 'abc' }],
    ['a name of one letter', { fullName: ' A ' }],
    ['an e-mail longer than 200', { email: `${'a'.repeat(195)}@example.org` }],
    ['an empty source route', { sourceRoute: ' ' }],
  ])('rejects %s', (_label, change) => {
    expect(inquirySubmissionSchema.safeParse({ ...VALID, ...change }).success).toBe(false);
  });
});

describe('inquiryUpdateSchema and inquiryListQuerySchema', () => {
  it('keeps «absent», «clear» and «replace» apart for the note', () => {
    expect(inquiryUpdateSchema.parse({ status: 'CONTACTED' }).operatorNote).toBeUndefined();
    expect(inquiryUpdateSchema.parse({ status: 'LOST', operatorNote: null }).operatorNote).toBe(
      null,
    );
    expect(inquiryUpdateSchema.parse({ status: 'LOST', operatorNote: '   ' }).operatorNote).toBe(
      null,
    );
    expect(inquiryUpdateSchema.parse({ status: 'WON', operatorNote: ' firmó ' }).operatorNote).toBe(
      'firmó',
    );
  });

  it('rejects an unknown status, a long note and an extra field', () => {
    expect(inquiryUpdateSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
    expect(
      inquiryUpdateSchema.safeParse({ status: 'NEW', operatorNote: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(inquiryUpdateSchema.safeParse({ status: 'NEW', email: 'x@y.z' }).success).toBe(false);
  });

  it('pages 25 by default and never more than 100', () => {
    expect(inquiryListQuerySchema.parse({}).pageSize).toBe(25);
    expect(inquiryListQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
    expect(inquiryListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(inquiryListQuerySchema.safeParse({ status: 'OPEN' }).success).toBe(false);
  });
});

describe('InquiryWriteRepository', () => {
  const submission: InquirySubmission = inquirySubmissionSchema.parse(VALID);

  function writerReturning(...results: unknown[][]) {
    const query = jest.fn();
    for (const result of results) query.mockResolvedValueOnce(result);
    return { query, repository: new InquiryWriteRepository({ query } as unknown as Sequelize) };
  }

  it('stores a new request once and says it is not a duplicate', async () => {
    const { query, repository } = writerReturning([{ service_inquiry_id: 'new-id' }]);
    await expect(repository.submit(submission)).resolves.toEqual({
      serviceInquiryId: 'new-id',
      duplicate: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain('ON CONFLICT (request_id) DO NOTHING');
  });

  it('answers a repeated request with the row it already holds', async () => {
    const { query, repository } = writerReturning([], [{ service_inquiry_id: 'first-id' }]);
    await expect(repository.submit(submission)).resolves.toEqual({
      serviceInquiryId: 'first-id',
      duplicate: true,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).not.toMatch(/INSERT/u);
  });

  it('keeps the stored note when the change does not mention it', async () => {
    const { query, repository } = writerReturning([row({ status: 'CONTACTED' })]);
    await repository.update(row().service_inquiry_id, { status: 'CONTACTED' }, 'operator-1');
    const options = query.mock.calls[0]?.[1] as { replacements: Record<string, unknown> };
    expect(options.replacements).toMatchObject({
      keepNote: true,
      operatorNote: null,
      actorSubject: 'operator-1',
    });
  });

  it('returns null when the identifier names no inquiry', async () => {
    const { repository } = writerReturning([]);
    await expect(
      repository.update(row().service_inquiry_id, { status: 'WON' }, 'op'),
    ).resolves.toBe(null);
  });
});

describe('AdminInquiriesController', () => {
  const identity = { environmentId: 'test' } as DeploymentIdentity;

  function controllerWith(writes: Partial<InquiryWriteRepository>, view = {}) {
    return new AdminInquiriesController(
      identity,
      view as InquiryViewRepository,
      writes as InquiryWriteRepository,
    );
  }

  it('reports a duplicate submission as NEW with the original identifier', async () => {
    const controller = controllerWith({
      submit: jest.fn().mockResolvedValue({ serviceInquiryId: 'first-id', duplicate: true }),
    });
    const response = await controller.submit(inquirySubmissionSchema.parse(VALID), 'req-1');
    expect(response.data).toEqual({ serviceInquiryId: 'first-id', status: 'NEW', duplicate: true });
  });

  it('answers 404 when the inquiry does not exist', async () => {
    const controller = controllerWith({ update: jest.fn().mockResolvedValue(null) });
    await expect(
      controller.update(
        { serviceInquiryId: row().service_inquiry_id },
        { status: 'WON' },
        actorWith('SUBSCRIPTION_ADMIN'),
        'req-2',
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('pages newest first and builds the cursor from the microsecond key', async () => {
    const rows = [
      row({ service_inquiry_id: '00000000-0000-4000-8000-000000000003' }),
      row({ service_inquiry_id: '00000000-0000-4000-8000-000000000002' }),
    ];
    const view = {
      list: jest.fn().mockResolvedValue(rows),
      summary: jest.fn().mockResolvedValue([{ status: 'NEW', count: 2 }]),
    };
    const controller = controllerWith({}, view);
    const response = (await controller.list({ pageSize: 1 }, 'req-3')) as {
      data: { items: Array<{ serviceInquiryId: string; createdAt: string }>; nextCursor: string };
    };
    expect(response.data.items).toHaveLength(1);
    expect(response.data.items[0]?.createdAt).toBe('2026-10-27T14:00:00.123Z');
    expect(decodeCursor(response.data.nextCursor)).toEqual({
      occurredAt: '2026-10-27T14:00:00.123456Z',
      identifier: '00000000-0000-4000-8000-000000000003',
    });
  });
});

describe('InquiryViewRepository', () => {
  it('refuses a cursor whose identifier is not a UUID before it reaches SQL', async () => {
    const run = jest.fn();
    const repository = new InquiryViewRepository({ run } as unknown as ReadQueryExecutor);
    const cursor = encodeCursor({ occurredAt: '2026-10-27T14:00:00Z', identifier: '42' });
    await expect(repository.list({ pageSize: 25, cursor })).rejects.toBeInstanceOf(
      RequestValidationError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('reports every state, with zero where there are none', async () => {
    const run = jest.fn().mockResolvedValue([{ status: 'WON', count: '3' }]);
    const repository = new InquiryViewRepository({ run } as unknown as ReadQueryExecutor);
    await expect(repository.summary()).resolves.toEqual([
      { status: 'NEW', count: 0 },
      { status: 'CONTACTED', count: 0 },
      { status: 'WON', count: 3 },
      { status: 'LOST', count: 0 },
    ]);
  });
});
