import type { WidgetEvent } from "@snippo/shared/stats";
import type { Api } from "./api";

export type Track = (event: WidgetEvent) => void;

/** Sends each event at most once per visitor session (browser tab), for the statistics. */
export function createTracker(api: Api, widgetId: string): Track {
  return (event) => {
    const id = `snippo:${widgetId}:${event.type === "step" ? `step:${event.stepKey}` : event.type}`;
    try {
      if (sessionStorage.getItem(id)) return;
      sessionStorage.setItem(id, "1");
    } catch {
      // Storage blocked (private mode, sandbox): count anyway.
    }
    api.sendEvents([event]);
  };
}
