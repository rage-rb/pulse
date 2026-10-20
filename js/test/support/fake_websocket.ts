/**
 * In-memory stand-in for the browser WebSocket. Install with
 * `vi.stubGlobal("WebSocket", FakeWebSocket)` and drive it from the test.
 */
export class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  static get last() {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("No WebSocket has been created");
    return socket;
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  closeCalled = false;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("InvalidStateError: WebSocket is not open");
    }
    this.sent.push(data);
  }

  // Like the real thing, the "close" event arrives later; call `drop()` to deliver it.
  close() {
    this.closeCalled = true;
    if (this.readyState !== FakeWebSocket.CLOSED) this.readyState = FakeWebSocket.CLOSING;
  }

  // --- Test helpers ---

  get messages(): unknown[] {
    return this.sent.map((data) => JSON.parse(data));
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data: unknown) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.dispatchEvent(new MessageEvent("message", { data: payload }));
  }

  drop() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}
