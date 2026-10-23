export const SUPPORT_TOTAL = 100_000_000;
export const UNITS_PER_PERCENT = 1_000_000;
export const RESIDUAL_UNITS = 510_000;
export const MODEL_VERSION = '1.0.0';
export const DATA_VERSION = 'pkw-2023-v1';
export const SCHEMA_VERSION = 1;
export const REGULARIZATION = 0.01;
export const IPF_TOLERANCE = 1e-12;
export const QUOTIENT_TOLERANCE = 1e-12;
export const ENTITY_IDS = [
  'ko',
  'nl',
  'razem',
  'pps',
  'pis',
  'konf',
  'kkp',
  'rozwoj',
  'psl',
  'pl2050',
] as const;
export const PROXY_IDS = ['ko', 'nl', 'pis', 'konf', 'td'] as const;
