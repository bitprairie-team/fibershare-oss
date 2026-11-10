// Shared Tailwind class lists, so every page has the same width, rhythm
// and type. One page width that lines up with the logo, one text measure,
// and a 4px spacing grid. Pages add their own utilities on top.

/** The page: one width, gutters, room at the end. */
export const MAIN = "mx-auto w-full max-w-page px-gutter pb-24";

/** The page title block. */
export const HEAD = "pt-12 pb-8 max-sm:pt-8 max-sm:pb-6";

/** The paragraph under a page title. */
export const LEDE = "mt-4 max-w-measure text-lg text-ink-2";

/** Row of actions under a heading or a form. */
export const ACTIONS = "mt-6 flex flex-wrap items-center gap-3";

/**
 * An editorial section: an ink rule, the title in a left column on wide
 * screens, the content to its right. Use with SECTION_TITLE and BODY.
 */
export const SECTION = "mt-14 border-t border-ink pt-5 max-sm:mt-10 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-12";
export const SECTION_TITLE = "text-xl max-lg:mb-4";
export const BODY = "min-w-0 max-w-content";

/** Prose inside a section. */
export const PROSE = "max-w-measure text-ink-2 [&>*+*]:mt-4";

/** A list of ruled rows. The section rule is the first line. */
export const ROWS = "divide-y divide-rule border-b border-rule [&>:first-child]:pt-0";

/** Small print under a block. */
export const FINE = "mt-3 text-sm text-muted";

/** A plain list of short statements, each on its own ruled line. */
export const LIST = "divide-y divide-rule border-b border-rule text-ink-2 [&>li]:py-3 [&>li:first-child]:pt-0";
