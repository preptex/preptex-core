export interface LayoutNode {
  type: string;
  x: number;
  y: number;
  /** Primary label to display inside the node (e.g. section/env name). */
  label?: string;
  /** Secondary label line (optional). */
  sublabel?: string;
  id?: number;
  strokeWidth: number;
  strokeColor?: string;
  children?: LayoutNode[];
}
