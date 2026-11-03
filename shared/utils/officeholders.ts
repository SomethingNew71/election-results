/**
 * Party of officeholders whose seats are NOT on the 2026 ballot, from the public
 * record as of the 2026 general election. Senate: senators of the class not up
 * (two entries where neither seat is up). Governors: the 14 not up in 2026.
 * Totals match civicAPI's national summaries (Senate 34 D+I / 31 R, governors 6 D / 8 R).
 */
const D = 'Democratic'
const R = 'Republican'
const I = 'Independent'

export const SENATE_NOT_UP: Record<string, string[]> = {
  AL: [R], AK: [R], AZ: [D, D], AR: [R], CA: [D, D], CO: [D], CT: [D, D], DE: [D],
  FL: [R], GA: [D], HI: [D, D], ID: [R], IL: [D], IN: [R, R], IA: [R], KS: [R],
  KY: [R], LA: [R], ME: [I], MD: [D, D], MA: [D], MI: [D], MN: [D], MS: [R],
  MO: [R, R], MT: [R], NE: [R], NV: [D, D], NH: [D], NJ: [D], NM: [D], NY: [D, D],
  NC: [R], ND: [R, R], OH: [R], OK: [R], OR: [D], PA: [D, R], RI: [D], SC: [R],
  SD: [R], TN: [R], TX: [R], UT: [R, R], VT: [D, I], VA: [D], WA: [D, D], WV: [R],
  WI: [R, D], WY: [R],
}

export const GOVERNOR_NOT_UP: Record<string, string[]> = {
  DE: [D], KY: [D], NC: [D], NJ: [D], VA: [D], WA: [D],
  IN: [R], LA: [R], MO: [R], MS: [R], MT: [R], ND: [R], UT: [R], WV: [R],
}

export function countParties(table: Record<string, string[]>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const parties of Object.values(table)) for (const p of parties) out[p] = (out[p] ?? 0) + 1
  return out
}
