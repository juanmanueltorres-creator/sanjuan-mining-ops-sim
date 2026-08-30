import type { VehicleSnapshot } from '../domain/contracts';

export interface VehiclePanelProps {
  vehicle: VehicleSnapshot | null;
  corridorName?: string;
}

export function VehiclePanel(_props: VehiclePanelProps) {
  return <aside />;
}
