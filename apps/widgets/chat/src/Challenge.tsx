import { useEffect, useState } from "preact/hooks";

interface Props {
  url: string;
  siteKey: string;
  /** A fresh token, or null when it expired or the check failed. */
  onToken: (token: string | null) => void;
}

/**
 * Turnstile, run on our domain inside an iframe (see public/challenge.html). Hidden unless
 * Cloudflare asks the visitor to interact.
 */
export function Challenge({ url, siteKey, onToken }: Props) {
  const [interactive, setInteractive] = useState(false);
  const [failed, setFailed] = useState(false);
  const origin = new URL(url).origin;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.data?.source !== "snippo-challenge") return;
      const { type, token } = event.data as { type: string; token?: string };
      if (type === "token" && token) {
        setInteractive(false);
        setFailed(false);
        onToken(token);
      } else if (type === "interactive") setInteractive(true);
      else if (type === "expired") onToken(null);
      else if (type === "error") {
        setFailed(true);
        onToken(null);
      }
    }
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [origin]);

  const src = `${url}?sitekey=${encodeURIComponent(siteKey)}&origin=${encodeURIComponent(location.origin)}`;
  return (
    <>
      <iframe src={src} title="Verifica anti-spam" class={interactive ? "challenge show" : "challenge"} />
      {failed && <p class="error">Verifica anti-spam non riuscita: ricarica la pagina e riprova.</p>}
    </>
  );
}
