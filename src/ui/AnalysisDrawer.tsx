import type { StaticOperationData, StaticRunArtifacts, StaticTrafficCalibration } from '../data/loadOperation';

export interface AnalysisDrawerProps {
  open: boolean;
  onClose: () => void;
  operation: StaticOperationData | null;
  runArtifacts: StaticRunArtifacts | null;
  traffic: StaticTrafficCalibration | null;
}

export function AnalysisDrawer(_props: AnalysisDrawerProps) {
  return null;
}
