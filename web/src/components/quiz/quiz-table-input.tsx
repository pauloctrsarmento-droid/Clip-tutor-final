"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { parseTableWithBlanks } from "@/lib/parse-table-blanks";
import type { ParsedTable } from "@/lib/parse-table-blanks";

interface QuizTableInputProps {
  questionText: string;
  onSubmit: (answer: string) => void;
  submitting: boolean;
  disabled: boolean;
}

export function QuizTableInput({
  questionText,
  onSubmit,
  submitting,
  disabled,
}: QuizTableInputProps) {
  const parsed = parseTableWithBlanks(questionText);
  const [values, setValues] = useState<Record<string, string>>({});

  const handleChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  if (!parsed) return null;

  const blankCount = parsed.rows.reduce(
    (sum, row) => sum + row.cells.filter((c) => c.isBlank).length,
    0
  );
  const filledCount = Object.values(values).filter((v) => v.trim()).length;

  const handleSubmit = () => {
    const lines = serializeAnswers(parsed, values);
    onSubmit(lines);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm border-collapse">
          {/* Header row */}
          {parsed.headers.some((h) => h) && (
            <thead>
              <tr className="border-b border-white/20">
                {parsed.headers.map((header, c) => (
                  <th
                    key={c}
                    className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
          )}

          <tbody>
            {parsed.rows.map((row, r) => (
              <tr
                key={r}
                className={
                  r % 2 === 0
                    ? "border-b border-white/5"
                    : "border-b border-white/5 bg-white/[0.02]"
                }
              >
                {row.cells.map((cell, c) => {
                  const key = `r${r}_c${c}`;
                  const isFirstCol = c === 0;

                  if (cell.isBlank) {
                    return (
                      <td key={c} className="py-1.5 px-2">
                        <input
                          type="text"
                          value={values[key] ?? ""}
                          onChange={(e) => handleChange(key, e.target.value)}
                          disabled={disabled}
                          placeholder="..."
                          className="w-full min-w-[80px] bg-transparent border-b-2 border-primary/30 text-sm px-1 py-1.5 focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40 disabled:opacity-40"
                        />
                      </td>
                    );
                  }

                  return (
                    <td
                      key={c}
                      className={
                        isFirstCol
                          ? "py-2 px-3 font-semibold text-primary"
                          : "py-2 px-3"
                      }
                    >
                      {cell.value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={disabled || submitting || filledCount === 0}
          className="cursor-pointer gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit Answer
        </Button>
        <span className="text-xs text-muted-foreground">
          {filledCount}/{blankCount} filled
        </span>
      </div>
    </div>
  );
}

/** Serialize filled blanks into a structured string for LLM evaluation */
function serializeAnswers(parsed: ParsedTable, values: Record<string, string>): string {
  const lines: string[] = [];

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    // Use first column as row identifier
    const rowLabel = row.cells[0]?.value || `Row ${r + 1}`;

    for (let c = 0; c < row.cells.length; c++) {
      if (!row.cells[c].isBlank) continue;
      const key = `r${r}_c${c}`;
      const answer = values[key]?.trim() ?? "";
      if (!answer) continue;
      const colHeader = parsed.headers[c] || `Column ${c + 1}`;
      lines.push(`${rowLabel} | ${colHeader}: ${answer}`);
    }
  }

  return lines.length > 0 ? "TABLE ANSWERS:\n" + lines.join("\n") : "";
}
