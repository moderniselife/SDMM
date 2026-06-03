/**
 * SchroDrive Media Manager — Scanner Types
 *
 * Internal types used by the scanner services.
 *
 * @module services/scanner/types
 */

import type { SourceType } from '@/types';

/** Scan result summary returned by each scanner. */
export interface ScanResult {
  sourceType: SourceType;
  filesFound: number;
  filesNew: number;
  filesUpdated: number;
  errors: string[];
  durationMs: number;
}
