export interface RoadContextVisualStyle {
  width: number;
  alpha: number;
  color: string;
}

const CONTEXT_COLOR = '#cbd5e1';

export function roadContextStyle(objectType: string): RoadContextVisualStyle {
  const normalized = objectType.trim().toLocaleLowerCase();
  if (normalized === 'huella') {
    return { width: 0.75, alpha: 0.12, color: CONTEXT_COLOR };
  }
  return { width: 1, alpha: 0.18, color: CONTEXT_COLOR };
}
