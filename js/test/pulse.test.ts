import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pulse } from "../src/pulse";
import type { ServerMessage } from "../src/protocol";
import { FakeWebSocket } from "./support/fake_websocket";
import { recordNavigations } from "./support/jsdom";

describe("Pulse", () => {
  let pulse: Pulse;
  let socket: FakeWebSocket;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    history.replaceState(null, "", "/posts?page=2");
    document.body.innerHTML = "";

    pulse = new Pulse();
    socket = FakeWebSocket.last;
    socket.open();
  });

  afterEach(() => {
    pulse.connection.close();
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
  });

  describe("connecting", () => {
    it("connects on construction", () => {
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(pulse.connection.isOpen).toBe(true);
    });

    it("hydrates the current page once connected", () => {
      expect(socket.messages).toEqual([{ type: "navigate", url: "/posts", query: "page=2", hash: "" }]);
    });

    it("re-hydrates the page it is on after reconnecting", () => {
      vi.useFakeTimers();
      try {
        history.pushState(null, "", "/comments");
        socket.drop();
        vi.advanceTimersByTime(1000);
        FakeWebSocket.last.open();
      } finally {
        vi.useRealTimers();
      }

      expect(FakeWebSocket.last.messages).toEqual([{ type: "navigate", url: "/comments", query: "", hash: "" }]);
    });

    it("applies messages from the server", () => {
      document.body.innerHTML = `<div id="post_1"></div>`;
      socket.receive({ action: "remove", id: "post_1" });

      expect(document.getElementById("post_1")).toBeNull();
    });
  });

  describe("applyAction", () => {
    describe("update", () => {
      const html = `<!DOCTYPE html><html><head><title>Comments</title></head><body><h1>Comments</h1></body></html>`;

      it("morphs the page", () => {
        pulse.applyAction({ action: "update", html });

        expect(document.title).toBe("Comments");
        expect(document.body.innerHTML).toBe(`<h1>Comments</h1>`);
      });

      it("pushes the new URL into history", () => {
        const length = history.length;

        pulse.applyAction({ action: "update", html, url: "/comments?page=1" });

        expect(window.location.pathname + window.location.search).toBe("/comments?page=1");
        expect(history.length).toBe(length + 1);
      });

      it("does not push when the URL is unchanged", () => {
        const length = history.length;

        pulse.applyAction({ action: "update", html, url: "/posts?page=2" });

        expect(history.length).toBe(length);
      });

      it("does not push without a URL", () => {
        const length = history.length;

        pulse.applyAction({ action: "update", html });

        expect(window.location.pathname + window.location.search).toBe("/posts?page=2");
        expect(history.length).toBe(length);
      });
    });

    it("replaces an element", () => {
      document.body.innerHTML = `<div id="post_1">Old</div>`;

      pulse.applyAction({ action: "replace", html: `<div id="post_1">New</div>` });

      expect(document.getElementById("post_1")!.textContent).toBe("New");
    });

    it("appends to a target", () => {
      document.body.innerHTML = `<ul id="list"><li>a</li></ul>`;

      pulse.applyAction({ action: "append", target: "list", html: `<li>b</li>` });

      expect(document.getElementById("list")!.innerHTML).toBe(`<li>a</li><li>b</li>`);
    });

    it("prepends to a target", () => {
      document.body.innerHTML = `<ul id="list"><li>b</li></ul>`;

      pulse.applyAction({ action: "prepend", target: "list", html: `<li>a</li>` });

      expect(document.getElementById("list")!.innerHTML).toBe(`<li>a</li><li>b</li>`);
    });

    it("removes an element", () => {
      document.body.innerHTML = `<div id="post_1"></div><div id="post_2"></div>`;

      pulse.applyAction({ action: "remove", id: "post_1" });

      expect(document.body.innerHTML).toBe(`<div id="post_2"></div>`);
    });

    it("follows a navigate (redirect) like a link", () => {
      pulse.applyAction({ action: "navigate", url: "/posts/1" });

      expect(window.location.pathname).toBe("/posts/1");
      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/posts/1", query: "", hash: "" });
    });

    it("warns about unknown actions", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      pulse.applyAction({ action: "explode" } as unknown as ServerMessage);

      expect(warn).toHaveBeenCalledWith("[pulse] Ignoring unknown action", "explode");
    });
  });

  describe("navigate", () => {
    it("asks the server to render the URL", () => {
      pulse.navigate("/comments");

      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/comments", query: "page=2", hash: "" });
    });

    it("includes form submit options", () => {
      pulse.navigate("/posts", {
        method: "POST",
        body: "title=Hi",
        contentType: "application/x-www-form-urlencoded;charset=UTF-8",
        query: "page=2",
        hash: "#top",
      });

      expect(socket.messages.at(-1)).toEqual({
        type: "navigate",
        url: "/posts",
        method: "POST",
        body: "title=Hi",
        contentType: "application/x-www-form-urlencoded;charset=UTF-8",
        query: "page=2",
        hash: "#top",
      });
    });

    it("does not touch history", () => {
      const length = history.length;

      pulse.navigate("/comments");

      expect(window.location.pathname).toBe("/posts");
      expect(history.length).toBe(length);
    });
  });

  describe("visit", () => {
    it("pushes the URL and renders it over the socket", () => {
      const length = history.length;

      pulse.visit("/comments?page=3");

      expect(window.location.pathname + window.location.search).toBe("/comments?page=3");
      expect(history.length).toBe(length + 1);
      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/comments", query: "page=3", hash: "" });
    });

    it("resolves relative URLs against the current page", () => {
      history.replaceState(null, "", "/posts/1");

      pulse.visit("edit");

      expect(window.location.pathname).toBe("/posts/edit");
      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/posts/edit", query: "", hash: "" });
    });

    it("accepts absolute same-origin URLs", () => {
      pulse.visit(`${window.location.origin}/comments`);

      expect(window.location.pathname).toBe("/comments");
      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/comments", query: "", hash: "" });
    });

    it("keeps the hash in history and sends it separately", () => {
      pulse.visit("/comments#latest");

      expect(window.location.hash).toBe("#latest");
      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/comments", query: "", hash: "#latest" });
    });

    it("does not push a duplicate entry for the current URL", () => {
      const length = history.length;

      pulse.visit("/posts?page=2");

      expect(history.length).toBe(length);
      expect(socket.messages.at(-1)).toEqual({ type: "navigate", url: "/posts", query: "page=2", hash: "" });
    });

    it("falls back to a full page load for other origins", () => {
      const recorder = recordNavigations();
      const sent = socket.sent.length;

      try {
        pulse.visit("https://example.com/elsewhere");
      } finally {
        recorder.stop();
      }

      expect(recorder.navigations).toHaveLength(1);
      expect(window.location.pathname).toBe("/posts");
      expect(socket.sent).toHaveLength(sent);
    });
  });

  describe("sendEvent", () => {
    it("dispatches the event to the component", () => {
      const payload = JSON.stringify({ by: 2 })

      pulse.sendEvent("counter_1", "increment", payload);

      expect(socket.messages.at(-1)).toEqual({ type: "event", id: "counter_1", event: "increment", payload });
    });

    it("omits params when there are none", () => {
      pulse.sendEvent("counter_1", "increment");

      expect(socket.sent.at(-1)).toBe(`{"type":"event","id":"counter_1","event":"increment"}`);
    });
  });

  it("drops messages while disconnected", () => {
    socket.drop();

    expect(() => pulse.sendEvent("counter_1", "increment")).not.toThrow();
    expect(socket.messages).toHaveLength(1);
  });
});
