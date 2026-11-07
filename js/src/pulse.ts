import { Connection } from "./connection";
import { currentLocationOptions, currentPath } from "./location";
import { insertHTML, morphElement, morphPage, removeElement } from "./morph";
import type { EventData, FormSubmitOptions, ServerMessage } from "./protocol";

type ServerPayload = ServerMessage | ServerMessage[];

const LOCAL_STORAGE_KEY = "pulseStorage";

declare global {
  interface Window {
    __pulse?: Pulse;
  }
}

/**
 * Wires the socket, the DOM and the event handlers together.
 */
export class Pulse {
  readonly connection: Connection;

  constructor() {
    this.connection = new Connection({
      // Hydrate: render the current page on the server into this connection. Runs on
      // every reconnect too, since server-side component state dies with the socket.
      onOpen: () => {
        const pulseStorage = localStorageSnapshot();
        if (pulseStorage !== undefined) {
          this.connection.send({ type: "page", local_storage: pulseStorage });
        }
        this.navigate(window.location.pathname);
      },
      onMessage: (message) => this.applyAction(message as ServerPayload),
    });

    this.connection.connect();
  }

  /**
   * Apply a server -> client message to the page.
   */
  applyAction(message: ServerPayload) {
    if (Array.isArray(message)) {
      const navigation = message.find(item => item.action === "page" && item.url !== undefined);

      if (navigation) {
        this.applyAction(navigation);
      } else {
        message.forEach(item => this.applyAction(item));
      }
      return;
    }

    switch (message.action) {
      case "update":
        morphPage(message.html);
        if (message.url && message.url !== currentPath()) {
          history.pushState(null, "", message.url);
        }
        break;
      case "replace":
        if (Array.isArray(message.html)) {
          message.html.forEach(html => morphElement(html));
        } else {
          morphElement(message.html);
        }
        break;
      case "append":
        insertHTML(message.target, "beforeend", message.html);
        break;
      case "prepend":
        insertHTML(message.target, "afterbegin", message.html);
        break;
      case "remove":
        removeElement(message.id);
        break;
      case "navigate":
        // A server-side redirect: follow it like a link.
        this.visit(message.url);
        break;
      case "page":
        if (message.local_storage !== undefined) {
          replaceLocalStorage(message.local_storage);
        }

        if (message.url !== undefined) {
          this.visit(message.url, message.history ?? "push");
        } else if (message.query !== undefined) {
          const target = new URL(window.location.href);
          target.search = message.query;
          updateHistory(target.href, message.history ?? "replace");
        }
        break;
      default:
        console.warn("[pulse] Ignoring unknown action", (message as { action?: unknown }).action);
    }
  }

  /**
   * Ask the server to render `url` into this connection, without touching history.
   */
  navigate(url: string, options: FormSubmitOptions = currentLocationOptions()) {
    this.connection.send({ type: "navigate", url, ...options });
  }

  /**
   * Go to `url` as if following a link: update history and render it over the
   * socket. Cross-origin URLs fall back to a full page load.
   */
  visit(url: string, historyAction: "push" | "replace" = "push") {
    const target = new URL(url, window.location.href);

    if (target.origin !== window.location.origin) {
      if (historyAction === "replace") {
        window.location.replace(target.href);
      } else {
        window.location.assign(target.href);
      }
      return;
    }

    updateHistory(target.href, historyAction);
    this.navigate(target.pathname, {
      query: target.search.slice(1),
      hash: target.hash,
    });
  }

  /**
   * Dispatch a server-side event handler on the component with the given id.
   */
  sendEvent(id: string, event: string, data?: EventData) {
    this.connection.send({ type: "event", id, event, data });
  }
}

function localStorageSnapshot() {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored === null) return undefined;

  return stored;
}

function replaceLocalStorage(snapshot: string) {
  localStorage.setItem(LOCAL_STORAGE_KEY, snapshot);
}

function updateHistory(url: string, action: "push" | "replace") {
  if (url === window.location.href) return;

  if (action === "push") {
    history.pushState(null, "", url);
  } else {
    history.replaceState(null, "", url);
  }
}
