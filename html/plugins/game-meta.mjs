// Shared game.json validation, used by the Vite plugin (build) and by
// tools/check-games.mjs (CI). Plain JS so both can import it without a build
// step. Mirrors schemas/game.schema.json; keep the two in sync.

/** @typedef {{ emoji: string }} EmojiIcon */
/**
 * @typedef {object} GameMeta
 * @property {string} id
 * @property {string} title
 * @property {string | EmojiIcon} icon
 * @property {1 | 2} players
 * @property {"any" | "portrait" | "landscape"} orientation
 * @property {string} [ages]
 * @property {string} addedOn
 * @property {string[]} [authors]
 * @property {string} description
 * @property {"index.html"} [entry]
 * @property {boolean} [hidden]
 */

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ICON_FILE_RE = /^[A-Za-z0-9._-]+\.(png|webp|svg)$/;
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const AGES_RE = /^[0-9]{1,2}(-[0-9]{1,2}|\+)?$/;
const KNOWN_KEYS = new Set([
  "$schema",
  "id",
  "title",
  "icon",
  "players",
  "orientation",
  "ages",
  "addedOn",
  "authors",
  "description",
  "entry",
  "hidden",
]);

/**
 * Validate a parsed game.json. Returns a list of human-readable problems;
 * an empty list means valid.
 * @param {unknown} json
 * @param {string} folderName the directory name under html/games/
 * @returns {string[]}
 */
export function validateGameMeta(json, folderName) {
  /** @type {string[]} */
  const errors = [];
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return ["game.json must be a JSON object"];
  }
  const g = /** @type {Record<string, unknown>} */ (json);

  for (const key of Object.keys(g)) {
    if (!KNOWN_KEYS.has(key)) errors.push(`unknown key "${key}"`);
  }

  if (typeof g.id !== "string" || !ID_RE.test(g.id) || g.id.length > 40) {
    errors.push('"id" must be lowercase letters, digits and single hyphens (max 40 chars)');
  } else if (g.id !== folderName) {
    errors.push(`"id" (${g.id}) must equal the folder name (${folderName})`);
  }

  if (typeof g.title !== "string" || g.title.trim().length === 0 || g.title.length > 32) {
    errors.push('"title" must be 1 to 32 characters');
  }

  if (typeof g.icon === "string") {
    if (!ICON_FILE_RE.test(g.icon)) errors.push('"icon" file must be a .png, .webp or .svg name inside the game folder');
  } else if (g.icon && typeof g.icon === "object" && !Array.isArray(g.icon)) {
    const e = /** @type {Record<string, unknown>} */ (g.icon).emoji;
    if (typeof e !== "string" || e.length === 0 || e.length > 8) errors.push('"icon.emoji" must be a short emoji string');
    if (Object.keys(g.icon).length !== 1) errors.push('"icon" object may only contain "emoji"');
  } else {
    errors.push('"icon" is required: a file name or { "emoji": "..." }');
  }

  if (g.players !== 1 && g.players !== 2) errors.push('"players" must be 1 or 2');

  if (g.orientation !== "any" && g.orientation !== "portrait" && g.orientation !== "landscape") {
    errors.push('"orientation" must be "any", "portrait" or "landscape"');
  }

  if (g.ages !== undefined && (typeof g.ages !== "string" || !AGES_RE.test(g.ages))) {
    errors.push('"ages" must look like "4-8" or "6+"');
  }

  if (typeof g.addedOn !== "string" || !DATE_RE.test(g.addedOn) || Number.isNaN(Date.parse(g.addedOn))) {
    errors.push('"addedOn" must be a valid YYYY-MM-DD date');
  }

  if (g.authors !== undefined) {
    if (!Array.isArray(g.authors) || g.authors.length > 10 || g.authors.some((a) => typeof a !== "string" || a.length === 0)) {
      errors.push('"authors" must be a list of up to 10 non-empty strings');
    }
  }

  if (typeof g.description !== "string" || g.description.trim().length === 0 || g.description.length > 140) {
    errors.push('"description" must be 1 to 140 characters');
  }

  if (g.entry !== undefined && g.entry !== "index.html") errors.push('"entry" may only be "index.html"');
  if (g.hidden !== undefined && typeof g.hidden !== "boolean") errors.push('"hidden" must be true or false');

  return errors;
}

/** HTML-escape a string for safe injection into the hub page. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
