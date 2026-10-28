import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connection } from "../src/connection";
import { FakeWebSocket } from "./support/fake_websocket";

describe("Connection", () => {
  let onOpen: ReturnType<typeof vi.fn<() => void>>;
  let onMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
  let connection: Connection;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();

    onOpen = vi.fn();
    onMessage = vi.fn();
    connection = new Connection({ onOpen, onMessage });
  });

  afterEach(() => {
    connection.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("connect", () => {
    it("opens a socket to the pulse channel on the current host", () => {
      connection.connect();

      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(FakeWebSocket.last.url).toBe(`ws://${window.location.host}/__pulse/view`);
    });

    it("calls onOpen once the socket opens", () => {
      connection.connect();
      expect(onOpen).not.toHaveBeenCalled();

      FakeWebSocket.last.open();
      expect(onOpen).toHaveBeenCalledOnce();
    });
  });

  describe("isOpen", () => {
    it("is false before connecting", () => {
      expect(connection.isOpen).toBe(false);
    });

    it("is false while the socket is connecting", () => {
      connection.connect();
      expect(connection.isOpen).toBe(false);
    });

    it("is true once the socket is open", () => {
      connection.connect();
      FakeWebSocket.last.open();
      expect(connection.isOpen).toBe(true);
    });

    it("is false after the socket drops", () => {
      connection.connect();
      FakeWebSocket.last.open();
      FakeWebSocket.last.drop();
      expect(connection.isOpen).toBe(false);
    });
  });

  describe("send", () => {
    it("sends the message as JSON", () => {
      connection.connect();
      FakeWebSocket.last.open();

      expect(connection.send({ type: "navigate", url: "/posts" })).toBe(true);
      expect(FakeWebSocket.last.sent).toEqual(['{"type":"navigate","url":"/posts"}']);
    });

    it("drops messages before connecting", () => {
      expect(connection.send({ type: "navigate", url: "/posts" })).toBe(false);
    });

    it("drops messages while the socket is connecting", () => {
      connection.connect();

      expect(connection.send({ type: "navigate", url: "/posts" })).toBe(false);
      expect(FakeWebSocket.last.sent).toEqual([]);
    });

    it("drops messages after the socket drops", () => {
      connection.connect();
      const socket = FakeWebSocket.last;
      socket.open();
      socket.drop();

      expect(connection.send({ type: "navigate", url: "/posts" })).toBe(false);
      expect(socket.sent).toEqual([]);
    });
  });

  describe("receiving", () => {
    it("passes parsed messages to onMessage", () => {
      connection.connect();
      FakeWebSocket.last.open();
      FakeWebSocket.last.receive({ action: "remove", id: "post_1" });

      expect(onMessage).toHaveBeenCalledExactlyOnceWith({ action: "remove", id: "post_1" });
    });

    it("ignores malformed messages", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      connection.connect();
      FakeWebSocket.last.open();
      FakeWebSocket.last.receive("not json");

      expect(onMessage).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith("[pulse] Ignoring malformed message", "not json");
    });

    it("keeps processing messages after a malformed one", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      connection.connect();
      FakeWebSocket.last.open();
      FakeWebSocket.last.receive("{");
      FakeWebSocket.last.receive({ action: "remove", id: "post_1" });

      expect(onMessage).toHaveBeenCalledExactlyOnceWith({ action: "remove", id: "post_1" });
    });
  });

  describe("reconnecting", () => {
    it("reconnects one second after the socket drops", () => {
      connection.connect();
      FakeWebSocket.last.open();
      FakeWebSocket.last.drop();

      vi.advanceTimersByTime(999);
      expect(FakeWebSocket.instances).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("reconnects when the initial connection fails", () => {
      connection.connect();
      FakeWebSocket.last.drop();

      vi.advanceTimersByTime(1000);
      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("keeps retrying while the server is unreachable", () => {
      connection.connect();

      for (let attempt = 1; attempt <= 3; attempt++) {
        FakeWebSocket.last.drop();
        vi.advanceTimersByTime(1000);
      }

      expect(FakeWebSocket.instances).toHaveLength(4);
    });

    it("calls onOpen again on reconnect so the page can re-hydrate", () => {
      connection.connect();
      FakeWebSocket.last.open();
      FakeWebSocket.last.drop();
      vi.advanceTimersByTime(1000);
      FakeWebSocket.last.open();

      expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it("sends over the new socket after reconnecting", () => {
      connection.connect();
      const first = FakeWebSocket.last;
      first.open();
      first.drop();
      vi.advanceTimersByTime(1000);
      const second = FakeWebSocket.last;
      second.open();

      expect(connection.send({ type: "navigate", url: "/" })).toBe(true);
      expect(first.sent).toEqual([]);
      expect(second.sent).toHaveLength(1);
    });
  });

  describe("close", () => {
    it("closes the socket", () => {
      connection.connect();
      const socket = FakeWebSocket.last;
      socket.open();

      connection.close();

      expect(socket.closeCalled).toBe(true);
      expect(connection.isOpen).toBe(false);
      expect(connection.send({ type: "navigate", url: "/" })).toBe(false);
    });

    it("does not reconnect once the close event arrives", () => {
      connection.connect();
      const socket = FakeWebSocket.last;
      socket.open();

      connection.close();
      socket.drop();
      vi.runAllTimers();

      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it("cancels a pending reconnect", () => {
      connection.connect();
      FakeWebSocket.last.drop();

      connection.close();
      vi.runAllTimers();

      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it("is safe to call before connecting", () => {
      expect(() => connection.close()).not.toThrow();
    });

    it("can be followed by connect() to resume", () => {
      connection.connect();
      connection.close();
      connection.connect();
      FakeWebSocket.last.open();

      expect(connection.isOpen).toBe(true);

      FakeWebSocket.last.drop();
      vi.advanceTimersByTime(1000);
      expect(FakeWebSocket.instances).toHaveLength(3);
    });

    it("ignores a late close event from the previous socket", () => {
      connection.connect();
      const stale = FakeWebSocket.last;
      stale.open();

      connection.close();
      connection.connect();
      const current = FakeWebSocket.last;
      current.open();

      // The old socket's close event only arrives now.
      stale.drop();
      vi.runAllTimers();

      expect(connection.isOpen).toBe(true);
      expect(connection.send({ type: "navigate", url: "/" })).toBe(true);
      expect(current.sent).toHaveLength(1);
      expect(FakeWebSocket.instances).toHaveLength(2);
    });
  });
});
