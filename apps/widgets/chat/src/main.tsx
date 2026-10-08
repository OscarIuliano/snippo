import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { WidgetConfig } from "@snippo/shared/widget-api";
import { createApi, type Api } from "./api";
import { Chat } from "./Chat";
import styles from "./styles.css?inline";

const DEFAULT_API = "https://api.snippo.io";

type Listener = (event: { id: string }) => void;

/** Public JS API: window.Snippo.open() / .close() / .on("submitted", fn) */
interface SnippoApi {
  open(): void;
  close(): void;
  on(event: "submitted", fn: Listener): void;
}

declare global {
  interface Window {
    Snippo?: SnippoApi;
  }
}

// currentScript is only set while a classic script runs; the dev page loads a module, so fall back to the attribute.
const script = (document.currentScript ?? document.querySelector("script[data-key]")) as HTMLScriptElement | null;

function App({ api, controls }: { api: Api; controls: { setOpen?: (open: boolean) => void; listeners: Listener[] } }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    controls.setOpen = setOpen;
    api.getConfig().then(setConfig, (e) => console.warn("[snippo]", e));
  }, []);

  // Nothing is shown until the configuration has loaded: a broken widget must not break the host page.
  if (!config) return null;

  return (
    <div class={`root ${config.theme.position}`} style={{ "--snippo-primary": config.theme.primaryColor }}>
      {open && (
        <Chat
          api={api}
          config={config}
          onClose={() => setOpen(false)}
          onSubmitted={(id) => controls.listeners.forEach((fn) => fn({ id }))}
        />
      )}
      <button class="launcher" aria-label={open ? "Chiudi chat" : "Apri chat"} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}

function mount() {
  const key = script?.dataset.key;
  if (!key) return console.warn("[snippo] attributo data-key mancante sullo script");
  if (window.Snippo) return; // already loaded once on this page

  const host = document.createElement("div");
  host.id = "snippo-widget";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);

  const controls: { setOpen?: (open: boolean) => void; listeners: Listener[] } = { listeners: [] };
  window.Snippo = {
    open: () => controls.setOpen?.(true),
    close: () => controls.setOpen?.(false),
    on: (_event, fn) => void controls.listeners.push(fn),
  };

  render(<App api={createApi(script?.dataset.api ?? DEFAULT_API, key)} controls={controls} />, shadow);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
