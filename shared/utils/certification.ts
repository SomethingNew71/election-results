/**
 * States that have certified their 2026 general election results. Edit this
 * by hand as each state certifies (date and the official source). Until a
 * state is listed, its results are shown as unofficial.
 */
export const CERTIFIED: Record<string, { date: string; source: string }> = {}

export function certificationOf(state: string): { date: string; source: string } | null {
  return CERTIFIED[state] ?? null
}
