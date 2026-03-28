const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/diagrams`;

/**
 * Get the Supabase Storage URL for a diagram figure.
 * - figRef "3.1" → "fig_3_1.png" (Theory/ATP papers with Fig. X.Y captions)
 * - figRef "15" → "q15.png" (MC papers with per-question inline diagrams)
 *
 * @param paperId - e.g. "0620_s23_41" or "0620_s23_21" (MC)
 * @param figRef - e.g. "3.1" or "15"
 * @returns Full public URL to the PNG
 */
export function getDiagramUrl(paperId: string, figRef: string): string {
  if (/^\d+$/.test(figRef)) {
    return `${STORAGE_BASE}/${paperId}/q${figRef}.png`;
  }
  const slug = figRef.replace(/\./g, "_");
  return `${STORAGE_BASE}/${paperId}/fig_${slug}.png`;
}

/**
 * Get the table diagram URL (for table_refs).
 * Converts tableRef "2.1" → "table_2_1.png".
 */
export function getTableDiagramUrl(paperId: string, tableRef: string): string {
  const slug = tableRef.replace(/\./g, "_");
  return `${STORAGE_BASE}/${paperId}/table_${slug}.png`;
}

/**
 * Get all diagram URLs for a question's fig_refs.
 * Deduplicates refs (some questions have duplicates like ["3.1", "3.1"]).
 */
export function getQuestionDiagramUrls(
  paperId: string,
  figRefs: string[],
  tableRefs: string[] = []
): string[] {
  const uniqueFigs = [...new Set(figRefs)];
  const uniqueTables = [...new Set(tableRefs)];

  return [
    ...uniqueFigs.map((ref) => getDiagramUrl(paperId, ref)),
    ...uniqueTables.map((ref) => getTableDiagramUrl(paperId, ref)),
  ];
}
