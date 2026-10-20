import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "./support/fake_websocket";

// Importing the entry point boots Pulse, so each test gets a fresh module graph.
async function loadEntry() {
  const entry = await import("../src/index");
  const { Pulse } = await import("../src/pulse");
  return { ...entry, Pulse };
}

describe("boot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    delete window.__pulse;
  });

  afterEach(() => {
    window.__pulse?.connection.close();
    delete window.__pulse;
    vi.unstubAllGlobals();
  });

  it("starts a client when the bundle loads", async () => {
    const { Pulse } = await loadEntry();

    expect(window.__pulse).toBeInstanceOf(Pulse);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("starts only one client per page", async () => {
    const { boot } = await loadEntry();
    const first = window.__pulse;

    expect(boot()).toBeUndefined();
    expect(window.__pulse).toBe(first);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does not start when the bundle is loaded twice", async () => {
    await loadEntry();
    const first = window.__pulse;

    vi.resetModules();
    await loadEntry();

    expect(window.__pulse).toBe(first);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("returns the client it starts", async () => {
    const { boot } = await loadEntry();
    window.__pulse!.connection.close();
    delete window.__pulse;

    const pulse = boot();

    expect(pulse).toBeDefined();
    expect(window.__pulse).toBe(pulse);
  });

  // Listeners from earlier boots in this file are still attached to `document`, so check
  // the registration itself rather than dispatching events.
  it("installs the event handlers", async () => {
    const onDocument = vi.spyOn(document, "addEventListener");
    const onWindow = vi.spyOn(window, "addEventListener");

    await loadEntry();

    expect(onDocument).toHaveBeenCalledWith("click", expect.any(Function));
    expect(onDocument).toHaveBeenCalledWith("submit", expect.any(Function));
    expect(onWindow).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});
