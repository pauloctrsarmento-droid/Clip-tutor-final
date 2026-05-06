"use client";

export interface GraphSpec {
  type: "graph";
  x_label?: string;
  y_label?: string;
  x_min?: number;
  x_max: number;
  y_min?: number;
  y_max: number;
  x_ticks?: number[];
  y_ticks?: number[];
  show_grid?: boolean;
  lines: Array<{
    label?: string;
    points: Array<[number, number]>;
  }>;
  /** Server-side rendered SVG (trusted source: scripts/generation/graph_renderer.py). */
  rendered_svg?: string;
}

interface GraphDiagramProps {
  spec: GraphSpec;
}

export function GraphDiagram({ spec }: GraphDiagramProps) {
  if (spec.rendered_svg) {
    return (
      <div
        className="max-w-xl w-full"
        dangerouslySetInnerHTML={{ __html: spec.rendered_svg }}
      />
    );
  }
  return (
    <div className="text-sm text-muted-foreground p-4 border border-dashed rounded">
      Graph not rendered.
    </div>
  );
}
