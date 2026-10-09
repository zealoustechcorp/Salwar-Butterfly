// src/config/customer_story.policy.js
//
// The one definition of what a customer story may be (F-06.08).
//
// Mirrors banner.policy.js and size_chart.policy.js: this module is what
// the validator and the service refuse on, and
// 018_create_customer_stories.sql duplicates the bounds it can as CHECK
// constraints so a row nobody validated cannot reach the table through
// psql either.

/** Matches customer_name VARCHAR(120), and reviews.author_name before it. */
export const MAX_NAME_LENGTH = 120;

/**
 * How long a published quote may be.
 *
 * The column is TEXT, so this is a judgement rather than a limit the
 * database imposes. These are cards in a rail on the home page, not
 * essays: a paragraph reads, a page does not, and a card that has to
 * scroll internally is a card nobody finishes. The shop edits what it
 * publishes anyway — it is choosing an excerpt from a message, not
 * transcribing one.
 */
export const MAX_BODY_LENGTH = 600;

/**
 * The most stories the table may hold, published or not.
 *
 * A ceiling rather than pagination. Sixty is more than the shop will
 * curate onto one page and few enough that the admin screen can list
 * them all without a pager — which is the trade being made here, since
 * a pager over a screen whose whole job is drag-to-reorder is a control
 * that fights the one beside it.
 */
export const MAX_STORIES = 60;

/**
 * How many the home page is served.
 *
 * Separate from the ceiling above, and lower. The shop may keep sixty;
 * a visitor is shown the first twenty-four by the shop's own order,
 * which is the shop's ordering decision being honoured rather than a
 * truncation it did not ask for. Beyond that the rail is longer than
 * anyone scrolls and the payload is being paid for by every visitor.
 */
export const MAX_STORIES_ON_HOME = 24;

/**
 * How many images one upload may carry.
 *
 * The common gesture is dropping in a set of photographs at once, so
 * this is a batch. Matches the shared multer batch instance — see
 * middlewares/upload.middleware.js.
 */
export const MAX_STORIES_PER_UPLOAD = 8;

/** Where story images are stored in R2. */
export const STORY_FOLDER = "stories";
