// Google Analytics 4. Entirely inert unless VITE_GA_MEASUREMENT_ID is set —
// create a GA4 property at analytics.google.com, grab its Measurement ID
// (looks like G-XXXXXXXXXX), and set it as an env var on the frontend
// deploy to turn this on. Page-view events after the initial load are sent
// by AnalyticsBeacon on every route change, since this is a single-page app.
export function initGoogleAnalytics() {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!id) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);

  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag(...args: unknown[]) {
    w.dataLayer!.push(args);
  };
  w.gtag("js", new Date());
  // Manual page_view control — AnalyticsBeacon sends these on route change,
  // since GA's default auto page-view only fires once on script load and
  // won't see subsequent client-side navigations.
  w.gtag("config", id, { send_page_view: false });
}
