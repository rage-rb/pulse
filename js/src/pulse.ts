import { Connection } from "./connection";
import { currentLocationOptions, currentPath } from "./location";
import { insertHTML, morphElement, morphPage, removeElement } from "./morph";
import type { FormSubmitOptions, ServerMessage } from "./protocol";

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
      onOpen: () => this.navigate(window.location.pathname),
      onMessage: (message) => this.applyAction(message),
    });

    this.connection.connect();
  }

  /**
   * Apply a server -> client message to the page.
   */
  applyAction(message: ServerMessage) {
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
   * Go to `url` as if following a link: push it into history and render it over the
   * socket. Cross-origin URLs fall back to a full page load.
   */
  visit(url: string) {
    const target = new URL(url, window.location.href);

    if (target.origin !== window.location.origin) {
      window.location.assign(target.href);
      return;
    }

    if (target.href !== window.location.href) {
      history.pushState(null, "", target.href);
    }
    this.navigate(target.pathname, {
      query: target.search.slice(1),
      hash: target.hash,
    });
  }

  /**
   * Dispatch a server-side event handler on the component with the given id.
   */
  sendEvent(id: string, event: string, params?: unknown) {
    this.connection.send({ type: "event", id, event, params });
  }
}
