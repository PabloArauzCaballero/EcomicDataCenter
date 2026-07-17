export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INFRASTRUCTURE_ERROR';

export class ApplicationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(entity: string, identifier: string) {
    super('NOT_FOUND', `${entity} not found`, 404, { identifier });
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('CONFLICT', message, 409, details);
  }
}

export class BusinessRuleError extends ApplicationError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('BUSINESS_RULE_VIOLATION', message, 422, details);
  }
}

export class InfrastructureError extends ApplicationError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('INFRASTRUCTURE_ERROR', message, 503, details);
  }
}
