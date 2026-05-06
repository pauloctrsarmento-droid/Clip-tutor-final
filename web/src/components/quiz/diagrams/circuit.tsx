"use client";

export interface CircuitSpec {
  type: "circuit";
  layout: "series";
  components: Array<{
    kind: "battery" | "cell" | "resistor" | "lamp" | "ammeter" | "voltmeter" | "switch" | "fuse";
    value?: string;
    label?: string;
    state?: "open" | "closed";
  }>;
  voltmeter_across?: string;
  /** Server-side rendered SVG (trusted source: scripts/generation/circuit_renderer.py). */
  rendered_svg?: string;
}

interface CircuitDiagramProps {
  spec: CircuitSpec;
}

export function CircuitDiagram({ spec }: CircuitDiagramProps) {
  if (spec.rendered_svg) {
    return (
      <div
        className="max-w-md w-full"
        dangerouslySetInnerHTML={{ __html: spec.rendered_svg }}
      />
    );
  }
  return (
    <div className="text-sm text-muted-foreground p-4 border border-dashed rounded">
      Circuit diagram not rendered.
    </div>
  );
}
