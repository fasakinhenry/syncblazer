const SESSION_ID_KEY = "syncblaze.analyticsSessionId";

/** Anonymous, per-browser id used only to approximate unique visitors —
 * not tied to any account, generated once and kept for the life of the
 * browser storage (not per-tab, so multiple tabs count as one visitor). */
export function getAnalyticsSessionId(): string {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}
