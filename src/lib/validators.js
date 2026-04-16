export function normalizeModelKey(s) {
  return String(s || '')
    .trim()
    .normalize('NFKC')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}
