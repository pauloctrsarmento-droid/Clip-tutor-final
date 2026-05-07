"use client";

export interface PeriodicTableSpec {
  type: "periodic_table";
  view?: "full";
  highlight?: string[];
  highlight_color?: string;
  /** Server-side rendered SVG (trusted source: scripts/generation/periodic_table_renderer.py). */
  rendered_svg?: string;
}

interface PeriodicTableDiagramProps {
  spec: PeriodicTableSpec;
}

export function PeriodicTableDiagram({ spec }: PeriodicTableDiagramProps) {
  if (spec.rendered_svg) {
    return (
      <div
        className="max-w-2xl w-full mx-auto bg-white rounded-md p-4 overflow-x-auto [&>svg]:w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: spec.rendered_svg }}
      />
    );
  }
  return (
    <div className="text-sm text-muted-foreground p-4 border border-dashed rounded">
      Periodic table not rendered.
    </div>
  );
}
