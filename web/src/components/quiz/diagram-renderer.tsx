"use client";

import { ElectronShellDiagram, type ElectronShellSpec } from "./diagrams/electron-shell";
import {
  OrganicStructureDiagram,
  type OrganicStructureSpec,
} from "./diagrams/organic-structure";
import { CircuitDiagram, type CircuitSpec } from "./diagrams/circuit";
import { PeriodicTableDiagram, type PeriodicTableSpec } from "./diagrams/periodic-table";
import { GraphDiagram, type GraphSpec } from "./diagrams/graph";
import { BioDiagram, type BioDiagramSpec } from "./diagrams/bio-diagram";

interface DiagramRendererProps {
  figures: unknown;
}

interface FigureSpec {
  type: string;
  [key: string]: unknown;
}

function isFigureArray(value: unknown): value is FigureSpec[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v !== null &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).type === "string",
    )
  );
}

export function DiagramRenderer({ figures }: DiagramRendererProps) {
  if (!isFigureArray(figures) || figures.length === 0) return null;

  return (
    <div className="space-y-4">
      {figures.map((fig, i) => {
        switch (fig.type) {
          case "electron_shell":
            return (
              <ElectronShellDiagram
                key={i}
                spec={fig as unknown as ElectronShellSpec}
              />
            );
          case "organic_structure":
            return (
              <OrganicStructureDiagram
                key={i}
                spec={fig as unknown as OrganicStructureSpec}
              />
            );
          case "circuit":
            return (
              <CircuitDiagram
                key={i}
                spec={fig as unknown as CircuitSpec}
              />
            );
          case "periodic_table":
            return (
              <PeriodicTableDiagram
                key={i}
                spec={fig as unknown as PeriodicTableSpec}
              />
            );
          case "graph":
            return (
              <GraphDiagram
                key={i}
                spec={fig as unknown as GraphSpec}
              />
            );
          case "bio_diagram":
            return (
              <BioDiagram
                key={i}
                spec={fig as unknown as BioDiagramSpec}
              />
            );
          default:
            // Other diagram types (periodic_excerpt, graph, apparatus, table) deferred to V1.1
            return null;
        }
      })}
    </div>
  );
}
