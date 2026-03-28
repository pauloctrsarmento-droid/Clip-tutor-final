const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/papers`;

/**
 * Get QP and MS URLs for a paper.
 * @param paperId - e.g. "0620_s23_41"
 */
export function getPaperUrls(paperId: string): { qp: string; ms: string } {
  return {
    qp: `${STORAGE_BASE}/${paperId}/qp.pdf`,
    ms: `${STORAGE_BASE}/${paperId}/ms.pdf`,
  };
}
