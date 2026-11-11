export class ProviderError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

export class ProviderAuthError extends ProviderError {
  constructor(message: string) {
    super(401, 'provider_auth_failed', message);
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(message: string) {
    super(502, 'provider_unavailable', message);
  }
}

export class ProviderBadResponseError extends ProviderError {
  constructor(message: string) {
    super(502, 'provider_bad_response', message);
  }
}
