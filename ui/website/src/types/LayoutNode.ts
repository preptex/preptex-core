export interface LayoutNode {
  type: string;
  x: number;
  y: number;
  /** Primary label to display inside the node (e.g. section/env name). */
  label?: string;
  /** Secondary label line (optional). */
  sublabel?: string;
  /** Section nesting level (0=document, 1=section, 2=subsection, ...). */
  sectionLevel?: number;
  id?: number;
  children?: LayoutNode[];
}
