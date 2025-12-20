export interface LayoutNode {
  type: string;
  x: number;
  y: number;
  id?: number;
  children?: LayoutNode[];
}
