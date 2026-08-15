/*
 * The home statistics strip now relies on the browser's native horizontal
 * scrolling. The previous touchmove handler manually changed scrollLeft and
 * called preventDefault(), which fought the browser's RTL momentum scrolling
 * on mobile and made the strip feel sticky/jumpy.
 *
 * Keep this module imported for backwards compatibility; scrolling behaviour
 * is intentionally controlled only by CSS in home-stats-rtl-fix.css.
 */
export {}
