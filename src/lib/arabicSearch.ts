const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g
const WHITESPACE = /\s+/g

/**
 * Canonical text used by client-side Arabic search.
 * Keep this aligned with public.normalize_arabic_name in Supabase.
 */
export function normalizeArabicSearch(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/ء/g, '')
    .toLocaleLowerCase('ar')
    .trim()
    .replace(WHITESPACE, ' ')
}

export function arabicSearchIncludes(value: string | null | undefined, query: string | null | undefined): boolean {
  const term = normalizeArabicSearch(query)
  return !term || normalizeArabicSearch(value).includes(term)
}

export function arabicSearchStartsWith(value: string | null | undefined, query: string | null | undefined): boolean {
  const term = normalizeArabicSearch(query)
  return !term || normalizeArabicSearch(value).startsWith(term)
}
