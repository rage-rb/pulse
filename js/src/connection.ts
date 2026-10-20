import { cableUrl } from "./location";
import type { ClientMessage, ServerMessage } from "./protocol";

interface ConnectionOptions {
  onOpen: () => void;
  onMessage: (message: ServerMessage) => void;
}

const DEFAULT_RECONNECT_DELAY = 1000;
const DEFAULT_CABLE_PATH = "/__pulse/channel";

/**
 * A WebSocket that exchanges JSON messages and reconnects when the connection drops.
 * `onOpen` fires on every (re)connect, so callers can re-hydrate state there.
 */
export class Connection {
  private readonly options: ConnectionOptions;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(options: ConnectionOptions) {
    this.options = options;
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    this.stopped = false;

    const socket = new WebSocket(cableUrl(DEFAULT_CABLE_PATH));
    this.socket = socket;

    socket.addEventListener("open", () => this.options.onOpen());
    socket.addEventListener("message", (event) => this.receive(event.data));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleReconnect();
    });
  }

  // Messages sent while disconnected are dropped; the server re-hydrates on reconnect.
  send(message: ClientMessage) {
    if (!this.socket || !this.isOpen) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  // Close the socket for good (no reconnect).
  close() {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private scheduleReconnect() {
    if (this.stopped) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, DEFAULT_RECONNECT_DELAY);
  }

  private receive(data: unknown) {
    let message: ServerMessage;

    try {
      message = JSON.parse(String(data));
    } catch {
      console.error("[pulse] Ignoring malformed message", data);
      return;
    }

    this.options.onMessage(message);
  }
}
