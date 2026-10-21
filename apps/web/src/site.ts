// Links shared by the landing pages.
export const appUrl = import.meta.env.PUBLIC_APP_URL ?? "https://app.snippo.io";
export const signupUrl = `${appUrl}/registrati`;
export const loginUrl = `${appUrl}/accedi`;

// Demo widget: in development the widget dev server and the local API, in production the CDN
// and the demo restaurant project of the production account.
export const demo = {
  src: import.meta.env.PUBLIC_DEMO_WIDGET_SRC ?? "https://cdn.snippo.io/v1/snippo.js",
  key: import.meta.env.PUBLIC_DEMO_WIDGET_KEY ?? "pk_live_fc7c5772e99ab35544298e03",
  api: import.meta.env.PUBLIC_DEMO_API_URL,
};
