// Money is integer satang (1 baht = 100 satang) everywhere; never floats.
export type Satang = number;

export const baht = (n: number): Satang => Math.round(n * 100);

// Round down to whole baht, so the daily budget never promises money that is not there.
export const floorToBaht = (s: Satang): Satang => Math.floor(s / 100) * 100;

// Round down to a 25-satang step (0.25 baht, a "สลึง"): the daily budget, never promising money that is not there.
export const floorToQuarter = (s: Satang): Satang => Math.floor(s / 25) * 25;
