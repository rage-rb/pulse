/**
 * jsdom can't navigate to another document, so `location.assign()` and un-prevented
 * link clicks / form submits only report a "not implemented" error to its virtual
 * console, which Vitest prints. `recordNavigations()` collects those reports instead,
 * so a test can assert that a full page load was attempted without the noise. Other
 * jsdom errors are still passed on to Vitest.
 */
type JsdomError = Error & { type?: string };
type Listener = (error: JsdomError) => void;

interface VirtualConsole {
  on(event: "jsdomError", listener: Listener): void;
  off(event: "jsdomError", listener: Listener): void;
  listeners(event: "jsdomError"): Listener[];
}

export function recordNavigations() {
  const virtualConsole = (globalThis as { jsdom?: { virtualConsole: VirtualConsole } }).jsdom?.virtualConsole;
  if (!virtualConsole) throw new Error("Expected the jsdom test environment");

  // Detach the existing listeners (Vitest's printer) and forward everything else to them.
  const previous = virtualConsole.listeners("jsdomError");
  previous.forEach((listener) => virtualConsole.off("jsdomError", listener));

  const navigations: string[] = [];
  const listener = (error: JsdomError) => {
    if (error.type === "not-implemented" && error.message.includes("navigation")) {
      navigations.push(error.message);
    } else {
      previous.forEach((forward) => forward(error));
    }
  };

  virtualConsole.on("jsdomError", listener);

  return {
    navigations,
    stop: () => {
      virtualConsole.off("jsdomError", listener);
      previous.forEach((forward) => virtualConsole.on("jsdomError", forward));
    },
  };
}
