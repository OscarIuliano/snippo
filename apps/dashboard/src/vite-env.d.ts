/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Widget script URL shown in the install snippet. */
  readonly VITE_WIDGET_URL?: string;
  /** Public API URL the widget calls, shown in the install snippet. */
  readonly VITE_PUBLIC_API_URL?: string;
}
