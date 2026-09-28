/** A database row id as the app hands them out: a UUID. Actions check ids
 * that arrive from the browser against this before touching the database. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
