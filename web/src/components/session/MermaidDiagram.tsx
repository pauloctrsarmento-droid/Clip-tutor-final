"use client";

import { useEffect, useState } from "react";
import mermaid from "mermaid";

// Initialize mermaid with dark theme once
let initialized = false;
function initMermaid() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    themeVariables: {
      darkMode: true,
      background: "#1a1a2e",
      primaryColor: "#7c3aed",
      primaryTextColor: "#e2e8f0",
      primaryBorderColor: "#4c1d95",
      secondaryColor: "#1e293b",
      tertiaryColor: "#0f172a",
      lineColor: "#64748b",
      textColor: "#e2e8f0",
      mainBkg: "#1e293b",
      nodeBorder: "#4c1d95",
      clusterBkg: "#0f172a",
      titleColor: "#e2e8f0",
      edgeLabelBackground: "#1e293b",
    },
    fontFamily: "inherit",
    fontSize: 14,
  });
}

interface MermaidDiagramProps {
  code: string;
  title?: string;
}

export function MermaidDiagram({ code, title }: MermaidDiagramProps) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    if (!code) return;

    initMermaid();
    setError(null);
    setRendering(true);
    setSvgHtml(null);

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Ensure real newlines
    let cleanCode = code
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "  ")
      .trim();

    // If code is mostly on one line, split into proper Mermaid statements
    const lineCount = cleanCode.split("\n").filter((l) => l.trim()).length;
    if (lineCount < 4) {
      // Insert newline before each node that starts a new statement
      // Pattern: after a closing bracket ] or ) followed by space and a capital letter
      cleanCode = cleanCode
        .replace(/\]\s+([A-Z])/g, "]\n    $1")           // ]  A → ]\n    A
        .replace(/\)\s+([A-Z])/g, ")\n    $1")           // )  A → )\n    A
        .replace(/(graph\s+(?:TD|LR|TB|BT|RL))\s+/i, "$1\n    ") // graph TD A → graph TD\n    A
        .replace(/\s+(subgraph)/gi, "\n    $1")
        .replace(/\s+(end)\b/gi, "\n    $1")
        .trim();
    }

    mermaid
      .render(id, cleanCode)
      .then(({ svg }) => {
        // Make SVG responsive by injecting style
        const responsiveSvg = svg.replace(
          /<svg /,
          '<svg style="max-width:100%;height:auto;" ',
        );
        setSvgHtml(responsiveSvg);
        setRendering(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to render diagram");
        setRendering(false);
      });
  }, [code]);

  if (error) {
    return (
      <div className="p-4">
        {title && (
          <h3 className="text-lg font-heading font-semibold text-foreground mb-3">
            {title}
          </h3>
        )}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs text-amber-400 mb-2">Diagram rendering failed</p>
          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto">
            {code}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {title && (
        <h3 className="text-lg font-heading font-semibold text-foreground mb-3">
          {title}
        </h3>
      )}
      <div className="flex items-center justify-center min-h-[100px] rounded-xl bg-card/50 border border-border/30 p-4">
        {rendering && !svgHtml && (
          <div className="text-sm text-muted-foreground animate-pulse">
            Rendering diagram...
          </div>
        )}
        {svgHtml && (
          <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
        )}
      </div>
    </div>
  );
}
