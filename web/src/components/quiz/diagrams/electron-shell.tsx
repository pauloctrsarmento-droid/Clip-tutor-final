"use client";

export interface ElectronShellSpec {
  type: "electron_shell";
  element: string;
  shells: number[];
  show_label?: boolean;
}

interface ElectronShellDiagramProps {
  spec: ElectronShellSpec;
}

export function ElectronShellDiagram({ spec }: ElectronShellDiagramProps) {
  const { element, shells, show_label = true } = spec;
  const nucleusR = 24;
  const shellSpacing = 40;
  // Canvas grows with shell count so 4-shell atoms (K, Ca) aren't cramped.
  const canvas = shells.length <= 3 ? 400 : 500;
  const cx = canvas / 2;
  const cy = canvas / 2;
  // Electrons start at 12 o'clock (top) — Cambridge convention.
  const angleOffset = -Math.PI / 2;

  return (
    <svg viewBox={`0 0 ${canvas} ${canvas}`} className="max-w-md w-full mx-auto block bg-white rounded-md p-2">
      <circle cx={cx} cy={cy} r={nucleusR} fill="#fef3c7" stroke="#92400e" strokeWidth={2} />
      {show_label && element && (
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          fontFamily="Cambria, Georgia, serif"
          fontSize={24}
          fontWeight={700}
          fill="#111"
        >
          {element}
        </text>
      )}
      {shells.map((count, shellIdx) => {
        const radius = nucleusR + (shellIdx + 1) * shellSpacing;
        return (
          <g key={shellIdx}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#888" strokeWidth={1} />
            {Array.from({ length: count }, (_, e) => {
              const angle = (2 * Math.PI * e) / Math.max(count, 1) + angleOffset;
              const ex = cx + radius * Math.cos(angle);
              const ey = cy + radius * Math.sin(angle);
              return <circle key={e} cx={ex} cy={ey} r={4} fill="#2563eb" />;
            })}
          </g>
        );
      })}
    </svg>
  );
}
