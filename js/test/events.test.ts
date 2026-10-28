import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { installEventHandlers } from "../src/events";
import type { Pulse } from "../src/pulse";

let pulse: { navigate: Mock; visit: Mock; sendEvent: Mock };
let uninstall: () => void;

beforeEach(() => {
  pulse = { navigate: vi.fn(), visit: vi.fn(), sendEvent: vi.fn() };
  uninstall = installEventHandlers(pulse as unknown as Pulse);
  history.replaceState(null, "", "/posts?page=2");
});

afterEach(() => {
  uninstall();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

function render(html: string) {
  document.body.innerHTML = html;
}

function find<T extends Element = HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`No element matches ${selector}`);
  return element;
}

// Returns whether the click was cancelled (i.e. Pulse handled it).
function click(element: Element, init: MouseEventInit = {}) {
  let prevented = false;
  const record = (event: Event) => {
    prevented = event.defaultPrevented;
    // jsdom can't follow links anyway; stop it from trying.
    event.preventDefault();
  };

  window.addEventListener("click", record, { once: true });
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  return prevented;
}

// Submits through the browser's submission algorithm and returns whether the submit
// event was cancelled (i.e. Pulse handled it).
function submit(form: HTMLFormElement, submitter?: HTMLElement) {
  let prevented = false;
  const record = (event: Event) => {
    prevented = event.defaultPrevented;
    // jsdom can't navigate anyway; stop it from trying.
    event.preventDefault();
  };

  window.addEventListener("submit", record, { once: true });
  form.requestSubmit(submitter);
  return prevented;
}

describe("data-pulse-click", () => {
  it("dispatches the event to the component", () => {
    render(`<button data-pulse-click="increment" data-pulse-component-id="counter_1">+</button>`);

    expect(click(find("button"))).toBe(true);
    expect(pulse.sendEvent).toHaveBeenCalledExactlyOnceWith("counter_1", "increment", undefined);
  });

  it("handles clicks on descendants of the trigger", () => {
    render(`<button data-pulse-click="increment" data-pulse-component-id="counter_1"><span>+</span></button>`);

    expect(click(find("span"))).toBe(true);
    expect(pulse.sendEvent).toHaveBeenCalledExactlyOnceWith("counter_1", "increment", undefined);
  });

  it("passes params through", () => {
    render(`<button data-pulse-click="tag" data-pulse-component-id="post_1" data-pulse-payload='{"language":"ruby"}'>#</button>`);

    click(find("button"));

    expect(pulse.sendEvent).toHaveBeenCalledWith("post_1", "tag", '{"language":"ruby"}');
  });

  it("ignores triggers without a component id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(`<button data-pulse-click="increment">+</button>`);
    const button = find("button");

    expect(click(button)).toBe(true);
    expect(pulse.sendEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[pulse] Ignoring data-pulse-click without data-pulse-component-id", button);
  });

  it("takes precedence over an enclosing link", () => {
    render(`<a href="/posts/1"><button data-pulse-click="like" data-pulse-component-id="post_1">♥</button></a>`);

    expect(click(find("button"))).toBe(true);
    expect(pulse.sendEvent).toHaveBeenCalledOnce();
    expect(pulse.visit).not.toHaveBeenCalled();
  });

  it("uses the closest trigger when nested", () => {
    render(`
      <div data-pulse-click="select" data-pulse-component-id="list">
        <button data-pulse-click="delete" data-pulse-component-id="item_1">x</button>
      </div>
    `);

    click(find("button"));

    expect(pulse.sendEvent).toHaveBeenCalledExactlyOnceWith("item_1", "delete", undefined);
  });

  it("ignores clicks already handled by someone else", () => {
    render(`<button data-pulse-click="increment" data-pulse-component-id="counter_1">+</button>`);
    const button = find("button");
    button.addEventListener("click", (event) => event.preventDefault());

    click(button);

    expect(pulse.sendEvent).not.toHaveBeenCalled();
  });
});

describe("links", () => {
  it("visits same-origin links over the socket", () => {
    render(`<a href="/comments?page=1">Comments</a>`);

    expect(click(find("a"))).toBe(true);
    expect(pulse.visit).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/comments?page=1`);
  });

  it("handles clicks on descendants of the link", () => {
    render(`<a href="/comments"><span>Comments</span></a>`);

    expect(click(find("span"))).toBe(true);
    expect(pulse.visit).toHaveBeenCalledOnce();
  });

  it("visits links with an explicit _self target", () => {
    render(`<a href="/comments" target="_self">Comments</a>`);

    expect(click(find("a"))).toBe(true);
  });

  it("visits links to an anchor on another page", () => {
    render(`<a href="/comments#latest">Comments</a>`);

    expect(click(find("a"))).toBe(true);
    expect(pulse.visit).toHaveBeenCalledWith(`${window.location.origin}/comments#latest`);
  });

  it("visits links to the current page", () => {
    render(`<a href="/posts?page=2">Reload</a>`);

    expect(click(find("a"))).toBe(true);
  });

  it.each([
    ["cross-origin links", `<a href="https://example.com/posts">x</a>`],
    ["anchors on the current page", `<a href="#comments">x</a>`],
    ["anchors on the current page (full URL)", `<a href="/posts?page=2#comments">x</a>`],
    ["links opening a new window", `<a href="/comments" target="_blank">x</a>`],
    ["links targeting a frame", `<a href="/comments" target="sidebar">x</a>`],
    ["downloads", `<a href="/export.csv" download>x</a>`],
    ["anchors without href", `<a name="top">x</a>`],
  ])("leaves %s to the browser", (_, html) => {
    render(html);

    expect(click(find("a"))).toBe(false);
    expect(pulse.visit).not.toHaveBeenCalled();
  });

  it.each([
    ["meta", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
  ])("leaves %s-clicks to the browser", (_, init) => {
    render(`<a href="/comments">x</a>`);

    expect(click(find("a"), init)).toBe(false);
    expect(pulse.visit).not.toHaveBeenCalled();
  });

  it("leaves non-primary button clicks to the browser", () => {
    render(`<a href="/comments">x</a>`);

    expect(click(find("a"), { button: 1 })).toBe(false);
    expect(pulse.visit).not.toHaveBeenCalled();
  });

  it("ignores clicks already handled by someone else", () => {
    render(`<a href="/comments">x</a>`);
    const link = find("a");
    link.addEventListener("click", (event) => event.preventDefault());

    click(link);

    expect(pulse.visit).not.toHaveBeenCalled();
  });

  it("ignores clicks outside links and triggers", () => {
    render(`<p>Just text</p>`);

    expect(click(find("p"))).toBe(false);
    expect(pulse.visit).not.toHaveBeenCalled();
    expect(pulse.sendEvent).not.toHaveBeenCalled();
  });

  it("ignores clicks dispatched on the document itself", () => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("forms", () => {
  it("submits same-origin forms over the socket", () => {
    history.replaceState(null, "", "/posts/new?draft=1#form");
    render(`
      <form action="/posts" method="post">
        <input name="title" value="Hello">
        <textarea name="body">World</textarea>
      </form>
    `);

    expect(submit(find<HTMLFormElement>("form"))).toBe(true);
    expect(pulse.navigate).toHaveBeenCalledExactlyOnceWith("/posts", {
      method: "POST",
      body: "title=Hello&body=World",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
      query: "",
      hash: "",
    });
  });

  it("sends an empty query and hash when the page has none", () => {
    history.replaceState(null, "", "/posts/new");
    render(`<form action="/posts" method="post"></form>`);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({ query: "", hash: "", body: "" }));
  });

  it("uses the form's method", () => {
    render(`<form action="/search" method="get"><input name="q" value="pulse"></form>`);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledExactlyOnceWith("/search", {
      method: "GET",
      query: "q=pulse",
      hash: "",
    });
  });

  it("defaults to GET like the browser does", () => {
    render(`<form action="/search"></form>`);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledExactlyOnceWith("/search", {
      method: "GET",
      query: "",
      hash: "",
    });
  });

  it("lets a _method field override the method", () => {
    render(`
      <form action="/posts/1" method="post">
        <input type="hidden" name="_method" value="patch">
        <input name="title" value="Edited">
      </form>
    `);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts/1", {
      method: "PATCH",
      body: "_method=patch&title=Edited",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
      query: "",
      hash: "",
    });
  });

  it("posts to the current path when the form has no action", () => {
    history.replaceState(null, "", "/posts/new?draft=1");
    render(`<form method="post"><input name="title" value="Hello"></form>`);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts/new", expect.objectContaining({ query: "draft=1" }));
  });

  it("resolves relative actions against the current page", () => {
    history.replaceState(null, "", "/posts/1/edit");
    render(`<form action="update" method="post"></form>`);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts/1/update", expect.anything());
  });

  it("sends the action's query string separately", () => {
    render(`<form action="/posts?ref=nav" method="post"></form>`);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({ query: "ref=nav" }));
  });

  it("is not confused by a field named action", () => {
    render(`
      <form action="/posts" method="post">
        <input name="action" value="publish">
      </form>
    `);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({
      body: "action=publish",
    }));
  });

  it("includes the value of the submit button", () => {
    render(`
      <form action="/posts" method="post">
        <input name="title" value="Hello">
        <button name="commit" value="draft">Save draft</button>
        <button name="commit" value="publish">Publish</button>
      </form>
    `);

    submit(find<HTMLFormElement>("form"), find<HTMLElement>("button[value=publish]"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({
      body: "title=Hello&commit=publish",
    }));
  });

  it("preserves repeated field names", () => {
    render(`
      <form action="/posts" method="post">
        <input type="checkbox" name="tags" value="ruby" checked>
        <input type="checkbox" name="tags" value="js" checked>
      </form>
    `);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({
      body: "tags=ruby&tags=js",
    }));
  });

  it("preserves array-style field names for the server to parse", () => {
    render(`
      <form action="/posts" method="post">
        <input type="checkbox" name="tags[]" value="ruby" checked>
        <input type="checkbox" name="tags[]" value="js" checked>
      </form>
    `);

    submit(find<HTMLFormElement>("form"));

    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({
      body: "tags%5B%5D=ruby&tags%5B%5D=js",
    }));
  });

  it("leaves forms with file inputs to the browser", () => {
    render(`<form action="/uploads" method="post"><input type="file" name="attachment"></form>`);

    expect(submit(find<HTMLFormElement>("form"))).toBe(false);
    expect(pulse.navigate).not.toHaveBeenCalled();
  });

  it("leaves non-URL-encoded forms to the browser", () => {
    render(`<form action="/posts" method="post" enctype="text/plain"><input name="title" value="Hello"></form>`);

    expect(submit(find<HTMLFormElement>("form"))).toBe(false);
    expect(pulse.navigate).not.toHaveBeenCalled();
  });

  it("uses the submitter's non-URL-encoded formenctype", () => {
    render(`
      <form action="/posts" method="post">
        <input name="title" value="Hello">
        <button formenctype="text/plain">Save</button>
      </form>
    `);

    expect(submit(find<HTMLFormElement>("form"), find<HTMLElement>("button"))).toBe(false);
    expect(pulse.navigate).not.toHaveBeenCalled();
  });

  it("uses the submitter's URL-encoded formenctype", () => {
    render(`
      <form action="/posts" method="post" enctype="text/plain">
        <input name="title" value="Hello">
        <button formenctype="application/x-www-form-urlencoded">Save</button>
      </form>
    `);

    expect(submit(find<HTMLFormElement>("form"), find<HTMLElement>("button"))).toBe(true);
    expect(pulse.navigate).toHaveBeenCalledWith("/posts", expect.objectContaining({
      body: "title=Hello",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    }));
  });

  it("leaves cross-origin forms to the browser", () => {
    render(`<form action="https://example.com/posts" method="post"></form>`);

    expect(submit(find<HTMLFormElement>("form"))).toBe(false);
    expect(pulse.navigate).not.toHaveBeenCalled();
  });

  it("ignores submits already handled by someone else", () => {
    render(`<form action="/posts" method="post"></form>`);
    const form = find<HTMLFormElement>("form");
    form.addEventListener("submit", (event) => event.preventDefault());

    submit(form);

    expect(pulse.navigate).not.toHaveBeenCalled();
  });
});

describe("history", () => {
  it("renders the current URL on back/forward", () => {
    history.replaceState(null, "", "/comments?page=3#latest");

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(pulse.navigate).toHaveBeenCalledExactlyOnceWith("/comments");
  });
});

describe("uninstalling", () => {
  it("stops handling clicks, submits and back/forward", () => {
    uninstall();
    render(`
      <a href="/comments">Comments</a>
      <button data-pulse-click="increment" data-pulse-component-id="counter_1">+</button>
      <form action="/posts" method="post"></form>
    `);

    expect(click(find("a"))).toBe(false);
    expect(click(find("button"))).toBe(false);
    expect(submit(find<HTMLFormElement>("form"))).toBe(false);
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(pulse.visit).not.toHaveBeenCalled();
    expect(pulse.sendEvent).not.toHaveBeenCalled();
    expect(pulse.navigate).not.toHaveBeenCalled();
  });

  it("is safe to call twice", () => {
    uninstall();
    expect(() => uninstall()).not.toThrow();
  });
});
