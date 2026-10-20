import { afterEach, describe, expect, it } from "vitest";
import { cableUrl, currentPath } from "../src/location";

afterEach(() => {
  history.replaceState(null, "", "/");
});

describe("currentPath", () => {
  it("returns the pathname", () => {
    history.replaceState(null, "", "/posts");
    expect(currentPath()).toBe("/posts");
  });

  it("includes the query string", () => {
    history.replaceState(null, "", "/posts?page=2&sort=asc");
    expect(currentPath()).toBe("/posts?page=2&sort=asc");
  });

  it("excludes the hash", () => {
    history.replaceState(null, "", "/posts?page=2#comments");
    expect(currentPath()).toBe("/posts?page=2");
  });
});

describe("cableUrl", () => {
  it("switches http to ws", () => {
    expect(cableUrl("/cable", "http://example.com/posts")).toBe("ws://example.com/cable");
  });

  it("switches https to wss", () => {
    expect(cableUrl("/cable", "https://example.com/posts")).toBe("wss://example.com/cable");
  });

  it("keeps the port", () => {
    expect(cableUrl("/cable", "http://localhost:3000/")).toBe("ws://localhost:3000/cable");
  });

  it("resolves relative paths against the base", () => {
    expect(cableUrl("cable", "https://example.com/app/posts")).toBe("wss://example.com/app/cable");
  });

  it("keeps the query string", () => {
    expect(cableUrl("/cable?token=abc", "https://example.com/")).toBe("wss://example.com/cable?token=abc");
  });

  it("leaves absolute ws(s) URLs untouched", () => {
    expect(cableUrl("wss://cable.example.com/socket", "http://example.com/")).toBe("wss://cable.example.com/socket");
    expect(cableUrl("ws://cable.example.com/socket", "https://example.com/")).toBe("ws://cable.example.com/socket");
  });

  it("converts absolute http(s) URLs", () => {
    expect(cableUrl("https://cable.example.com/socket", "http://example.com/")).toBe("wss://cable.example.com/socket");
  });

  it("defaults the base to the current page", () => {
    history.replaceState(null, "", "/posts/1");
    expect(cableUrl("/cable")).toBe(`ws://${window.location.host}/cable`);
  });
});
