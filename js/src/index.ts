/**
 * Bundle entry point. Load as a classic script, e.g. <script>...bundle...</script>
 */
import { Pulse } from "./pulse";
import { installEventHandlers } from "./events";

/**
 * Start a single client per page.
 */
export function boot() {
  if (window.__pulse) return;

  const pulse = new Pulse();
  installEventHandlers(pulse);
  window.__pulse = pulse;

  return pulse;
}


boot();
