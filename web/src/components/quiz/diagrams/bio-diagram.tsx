"use client";

export interface BioDiagramSpec {
  type: "bio_diagram";
  template: "animal_cell" | "plant_cell";
  labels?: "names" | "letters" | "none" | Record<string, string>;
  /** Server-side rendered SVG (trusted source: scripts/generation/bio_diagram_renderer.py). */
  rendered_svg?: string;
}

interface BioDiagramProps {
  spec: BioDiagramSpec;
}

export function BioDiagram({ spec }: BioDiagramProps) {
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
      Bio diagram not rendered.
    </div>
  );
}
