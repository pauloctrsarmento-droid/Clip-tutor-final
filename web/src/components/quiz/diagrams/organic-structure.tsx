"use client";

export interface OrganicStructureSpec {
  type: "organic_structure";
  smiles: string;
  label?: string;
  /** Server-side rendered RDKit SVG (preferred). Trusted source. */
  rendered_svg?: string;
}

interface OrganicStructureDiagramProps {
  spec: OrganicStructureSpec;
}

export function OrganicStructureDiagram({ spec }: OrganicStructureDiagramProps) {
  if (spec.rendered_svg) {
    // The SVG is generated server-side by RDKit (trusted source).
    return (
      <div
        className="max-w-lg w-full mx-auto bg-white rounded-md p-4 [&>svg]:w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: spec.rendered_svg }}
      />
    );
  }
  return (
    <div className="text-sm text-muted-foreground p-4 border border-dashed rounded">
      Structure (SMILES: {spec.smiles})
      {spec.label && <span className="block font-medium">{spec.label}</span>}
    </div>
  );
}
