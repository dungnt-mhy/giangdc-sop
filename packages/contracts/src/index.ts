/**
 * Wire-contract version shared by API and web (SRS v1.6 §12: OpenAPI/schema is the
 * source of truth; this package is its placeholder until G2 locks the contract).
 */
export const API_CONTRACT_VERSION = '0.1.0';
export * from './process.js';

export interface HealthResponse {
  status: 'ok';
  version: string;
  contract: string;
}
