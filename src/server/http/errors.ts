export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    // Fixes the prototype chain when extending built-ins in older targets.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static notFound(message: string): AppError {
    return new AppError(404, 'not_found', message);
  }

  static unauthorized(message = 'unauthenticated'): AppError {
    return new AppError(401, 'unauthenticated', message);
  }

  static forbidden(message = 'forbidden'): AppError {
    return new AppError(403, 'forbidden', message);
  }

  static badRequest(message: string): AppError {
    return new AppError(400, 'invalid_request', message);
  }
}
