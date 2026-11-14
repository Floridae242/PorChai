// Money is integer satang (1 baht = 100 satang) everywhere; never floats.
export type Satang = number;

export const baht = (n: number): Satang => Math.round(n * 100);

// Round down to whole baht, so the daily budget never promises money that is not there.
export const floorToBaht = (s: Satang): Satang => Math.floor(s / 100) * 100;

// R3-quarter (QA, team agreed 13 Nov): the daily budget rounds down to 25 satang (233.33 → 233.25),
// so it shows the real figure more closely and still never promises money that is not there.
export const floorToQuarter = (s: Satang): Satang => Math.floor(s / 25) * 25;
