export interface TableCell {
  value: string;
  isBlank: boolean;
}

export interface ParsedTableRow {
  cells: TableCell[];
}

export interface ParsedTable {
  headers: string[];
  rows: ParsedTableRow[];
  beforeText: string;
  afterText: string;
}

// Matches cells that are entirely blanks, e.g. ".........." or ".......... and .........."
const BLANK_PATTERN = /^[\s.]*\.{3,}[\s.]*$/;
const COMPOUND_BLANK_PATTERN = /^[\s.]*\.{3,}(?:\s+(?:and|or|to)\s+\.{3,})*[\s.]*$/;

function isBlankCell(cell: string): boolean {
  return BLANK_PATTERN.test(cell) || COMPOUND_BLANK_PATTERN.test(cell);
}

/**
 * Parse a pipe-delimited table from question text, identifying blank cells.
 * Returns null if no table with blanks is found.
 */
export function parseTableWithBlanks(text: string): ParsedTable | null {
  if (!text) return null;

  const lines = text.split("\n");

  // Find contiguous block of lines with 2+ pipes
  let tableStart = -1;
  let tableEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const pipeCount = (lines[i].match(/\|/g) || []).length;
    if (pipeCount >= 2) {
      if (tableStart === -1) tableStart = i;
      tableEnd = i;
    } else if (tableStart !== -1) {
      break;
    }
  }

  if (tableStart === -1 || tableEnd - tableStart < 1) return null;

  const tableLines = lines.slice(tableStart, tableEnd + 1);

  // Parse rows by splitting on pipe
  const rawRows = tableLines.map((line) => {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
  });

  // Check if any cell is blank — if not, no interactive table needed
  const hasBlank = rawRows.some((row) =>
    row.some((cell) => isBlankCell(cell))
  );
  if (!hasBlank) return null;

  // First row with empty first cell is a header
  // The header format is: "  | col1 | col2 | ..." → ["", "col1", "col2", ...]
  // Data rows format:      "val0 | val1 | val2 | ..." → ["val0", "val1", "val2", ...]
  // The empty header[0] corresponds to data[0] (the row label column).
  // So header[1] ("type of structure") actually labels data[0] ("ionic").
  // We fix this by removing the leading empty header cell.
  const firstRowIsHeader = rawRows.length > 1 && rawRows[0][0] === "";

  let headerRow = firstRowIsHeader ? rawRows[0] : [];
  const dataRows = firstRowIsHeader ? rawRows.slice(1) : rawRows;

  // Drop the leading empty cell from the header so headers align with data columns
  if (firstRowIsHeader && headerRow[0] === "") {
    headerRow = headerRow.slice(1);
  }

  const colCount = Math.max(headerRow.length, ...dataRows.map((r) => r.length));

  // Build headers array
  const headers: string[] = [];
  for (let c = 0; c < colCount; c++) {
    headers.push(headerRow[c] ?? "");
  }

  const rows: ParsedTableRow[] = dataRows.map((raw) => ({
    cells: Array.from({ length: colCount }, (_, c) => {
      const val = raw[c] ?? "";
      return { value: val, isBlank: isBlankCell(val) };
    }),
  }));

  // Trim trailing empty columns (padding artifacts)
  let effectiveCols = colCount;
  while (effectiveCols > 0) {
    const col = effectiveCols - 1;
    const headerEmpty = !headers[col];
    const allDataEmpty = rows.every((r) => !r.cells[col].value && !r.cells[col].isBlank);
    if (headerEmpty && allDataEmpty) {
      effectiveCols--;
    } else {
      break;
    }
  }
  if (effectiveCols < colCount) {
    headers.length = effectiveCols;
    for (const row of rows) {
      row.cells.length = effectiveCols;
    }
  }

  const beforeText = lines.slice(0, tableStart).join("\n").trim();
  const afterText = lines.slice(tableEnd + 1).join("\n").trim();

  return { headers, rows, beforeText, afterText };
}

/** Quick check: does this text contain a pipe-table with blanks? */
export function hasTableWithBlanks(text: string | undefined | null): boolean {
  if (!text) return false;
  return parseTableWithBlanks(text) !== null;
}
