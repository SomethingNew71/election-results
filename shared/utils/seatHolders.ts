/**
 * Party holding each seat on the 2026 ballot going into the election, for the flip
 * tag. From the incumbent tables on Wikipedia's 2026 Senate, gubernatorial and House
 * election pages, read 2026-11-04. A vacant seat counts as its last holder's party.
 * Totals match officeholders.ts: Senate 13 D / 22 R, governors
 * 18 D / 18 R.
 */
export const SENATE_HOLDERS: Record<string, string> = {
  AK: 'R', AL: 'R', AR: 'R', CO: 'D', DE: 'D', FL: 'R', GA: 'D', IA: 'R', ID: 'R',
  IL: 'D', KS: 'R', KY: 'R', LA: 'R', MA: 'D', ME: 'R', MI: 'D', MN: 'D', MS: 'R',
  MT: 'R', NC: 'R', NE: 'R', NH: 'D', NJ: 'D', NM: 'D', OH: 'R', OK: 'R', OR: 'D',
  RI: 'D', SC: 'R', SD: 'R', TN: 'R', TX: 'R', VA: 'D', WV: 'R', WY: 'R',
}

export const GOVERNOR_HOLDERS: Record<string, string> = {
  AK: 'R', AL: 'R', AR: 'R', AZ: 'D', CA: 'D', CO: 'D', CT: 'D', FL: 'R', GA: 'R',
  HI: 'D', IA: 'R', ID: 'R', IL: 'D', KS: 'D', MA: 'D', MD: 'D', ME: 'D', MI: 'D',
  MN: 'D', NE: 'R', NH: 'R', NM: 'D', NV: 'R', NY: 'D', OH: 'R', OK: 'R', OR: 'D',
  PA: 'D', RI: 'D', SC: 'R', SD: 'R', TN: 'R', TX: 'R', VT: 'R', WI: 'D', WY: 'R',
}

/** One letter per district, in district order. An at-large state has one letter. */
export const HOUSE_HOLDERS: Record<string, string> = {
  AK: 'R', AR: 'RRRR', AZ: 'RRDDRRDRR',
  CO: 'DDRRRDDR', CT: 'DDDDD', DE: 'D',
  GA: 'RDRDDDRRRRRRDR', HI: 'DD', IA: 'RRRR',
  ID: 'RR', IL: 'DDDDDDDDDDDRDDRRD', IN: 'DRRRRRDRR',
  KS: 'RRDR', KY: 'RRDRRR', MA: 'DDDDDDDDD',
  MD: 'RDDDDDDD', ME: 'DD', MI: 'RRDRRDRDRRDDD',
  MN: 'RDDDDRRR', MO: 'DRRRDRRR', MS: 'RDRR',
  MT: 'RR', ND: 'R', NE: 'RRR',
  NH: 'DD', NJ: 'DRDRDDRDDDDD', NM: 'DDD',
  NV: 'DRDD', NY: 'RRDDDDDDDDRDDDDDRDDDRDRRDD', OK: 'RRRRR',
  OR: 'DRDDDD', PA: 'RDDDDDRRRRRDRRRRD', RI: 'DD',
  SC: 'RRRRRDR', SD: 'R', VA: 'RRDDRRDDRDD',
  VT: 'D', WA: 'DDDRRDDDDD', WI: 'RDRDRRRR',
  WV: 'RR', WY: 'R',
}

/**
 * States voting on a new House map in 2026 are left out above: a district number there
 * can be a different seat, so "flip" has no clear meaning. Virginia's and Missouri's new
 * maps were blocked for 2026, so both use the old map and stay in the table.
 */
export const NEW_HOUSE_MAP = [
  'AL',
  'CA',
  'FL',
  'LA',
  'NC',
  'OH',
  'TN',
  'TX',
  'UT',
]
