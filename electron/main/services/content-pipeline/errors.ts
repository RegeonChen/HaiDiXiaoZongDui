export class ContentPipelineError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'ContentPipelineError';
    this.code = code;
    this.cause = cause;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 供同步状态和持久化错误使用，保留稳定错误码便于用户反馈与日志检索。 */
export function diagnosticErrorMessage(error: unknown): string {
  if (error instanceof ContentPipelineError) return `[${error.code}] ${error.message}`;
  return errorMessage(error);
}
