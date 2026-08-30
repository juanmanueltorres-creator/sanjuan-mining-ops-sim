import type { EvidenceRef } from './contracts';

export function evidenceById(refs: EvidenceRef[]): Map<string, EvidenceRef> {
  return new Map(refs.map((ref) => [ref.id, ref]));
}

export function assertEvidenceRefsExist(ids: string[], refs: EvidenceRef[]): void {
  const known = evidenceById(refs);
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(`Missing evidence refs: ${missing.join(', ')}`);
  }
}
