import type { CorridorDefinition, EvidenceRef, ProjectDefinition } from '../domain/contracts';

export interface StaticOperationData {
  projects: ProjectDefinition[];
  corridors: CorridorDefinition[];
  evidence: EvidenceRef[];
}

export type JsonFetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function loadStaticOperationData(_fetcher: JsonFetcher): Promise<StaticOperationData> {
  return { projects: [], corridors: [], evidence: [] };
}
