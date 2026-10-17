/**
 * Persistence / object-storage adapter boundaries (SRS v1.6 §13.1, §13.3).
 * The same contract tests must run against the demo adapters (D1/R2) and the
 * production adapters (PostgreSQL/S3-compatible). Concrete adapters land in T1.2+.
 */
export interface DatabaseAdapter {
  readonly kind: 'd1' | 'postgres';
  /** Runs work atomically: state change + audit + outbox in one transaction. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

export interface ObjectStorageAdapter {
  readonly kind: 'r2' | 's3';
  /** Returns a short-lived, authorized download URL for a private object. */
  presignedGetUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
