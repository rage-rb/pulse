import { beforeEach, describe, expect, it } from "vitest";
import { insertHTML, morphElement, morphPage, removeElement } from "../src/morph";

function page(body: string, title = "Pulse") {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

beforeEach(() => {
  document.title = "";
  document.body.innerHTML = "";
});

describe("morphPage", () => {
  it("replaces the body with the new page", () => {
    document.body.innerHTML = `<main><h1>Posts</h1></main>`;

    morphPage(page(`<main><h1>Comments</h1><p>None yet</p></main>`));

    expect(document.body.innerHTML).toBe(`<main><h1>Comments</h1><p>None yet</p></main>`);
  });

  it("updates the head", () => {
    document.title = "Posts";

    morphPage(page(`<main></main>`, "Comments"));

    expect(document.title).toBe("Comments");
  });

  it("keeps matching elements in place", () => {
    document.body.innerHTML = `<main id="main"><h1>Posts</h1></main>`;
    const main = document.getElementById("main");

    morphPage(page(`<main id="main"><h1>Comments</h1></main>`));

    expect(document.getElementById("main")).toBe(main);
    expect(main!.textContent).toBe("Comments");
  });

  it("preserves values the user has typed", () => {
    document.body.innerHTML = `<input id="name" value="">`;
    const input = document.getElementById("name") as HTMLInputElement;
    input.value = "typed";

    morphPage(page(`<input id="name" value="server">`));

    expect(document.getElementById("name")).toBe(input);
    expect(input.value).toBe("typed");
  });
});

describe("morphElement", () => {
  it("morphs the element with the id of the new root element", () => {
    document.body.innerHTML = `<div id="post_1"><h2>Old</h2></div><div id="post_2"><h2>Other</h2></div>`;
    const post = document.getElementById("post_1");

    expect(morphElement(`<div id="post_1" class="edited"><h2>New</h2></div>`)).toBe(true);

    expect(document.getElementById("post_1")).toBe(post);
    expect(post!.outerHTML).toBe(`<div id="post_1" class="edited"><h2>New</h2></div>`);
    expect(document.getElementById("post_2")!.textContent).toBe("Other");
  });

  it("ignores surrounding whitespace", () => {
    document.body.innerHTML = `<div id="post_1">Old</div>`;

    expect(morphElement(`\n  <div id="post_1">New</div>\n`)).toBe(true);
    expect(document.getElementById("post_1")!.textContent).toBe("New");
  });

  it("parses elements that are only valid in a specific context", () => {
    document.body.innerHTML = `<table><tbody><tr id="row_1"><td>Old</td></tr></tbody></table>`;

    expect(morphElement(`<tr id="row_1"><td>New</td></tr>`)).toBe(true);
    expect(document.getElementById("row_1")!.textContent).toBe("New");
  });

  it("preserves values the user has typed", () => {
    document.body.innerHTML = `<form id="form"><input name="title" value=""></form>`;
    const input = document.querySelector("input")!;
    input.value = "typed";

    morphElement(`<form id="form"><input name="title" value="server"></form>`);

    expect(input.value).toBe("typed");
  });

  it("returns false when the new root element has no id", () => {
    document.body.innerHTML = `<div>Old</div>`;

    expect(morphElement(`<div>New</div>`)).toBe(false);
    expect(document.body.innerHTML).toBe(`<div>Old</div>`);
  });

  it("returns false when there is no root element", () => {
    expect(morphElement(``)).toBe(false);
    expect(morphElement(`just text`)).toBe(false);
  });

  it("returns false when no element on the page has the id", () => {
    document.body.innerHTML = `<div id="post_1">Old</div>`;

    expect(morphElement(`<div id="post_2">New</div>`)).toBe(false);
    expect(document.body.innerHTML).toBe(`<div id="post_1">Old</div>`);
  });
});

describe("insertHTML", () => {
  beforeEach(() => {
    document.body.innerHTML = `<ul id="list"><li>b</li></ul>`;
  });

  it("appends to the target", () => {
    expect(insertHTML("list", "beforeend", `<li>c</li>`)).toBe(true);
    expect(document.getElementById("list")!.innerHTML).toBe(`<li>b</li><li>c</li>`);
  });

  it("prepends to the target", () => {
    expect(insertHTML("list", "afterbegin", `<li>a</li>`)).toBe(true);
    expect(document.getElementById("list")!.innerHTML).toBe(`<li>a</li><li>b</li>`);
  });

  it("inserts multiple elements", () => {
    insertHTML("list", "beforeend", `<li>c</li><li>d</li>`);
    expect(document.getElementById("list")!.children).toHaveLength(3);
  });

  it("returns false when the target is missing", () => {
    expect(insertHTML("missing", "beforeend", `<li>c</li>`)).toBe(false);
    expect(document.body.innerHTML).toBe(`<ul id="list"><li>b</li></ul>`);
  });
});

describe("removeElement", () => {
  it("removes the element", () => {
    document.body.innerHTML = `<div id="post_1"></div><div id="post_2"></div>`;

    expect(removeElement("post_1")).toBe(true);
    expect(document.body.innerHTML).toBe(`<div id="post_2"></div>`);
  });

  it("returns false when the element is missing", () => {
    document.body.innerHTML = `<div id="post_2"></div>`;

    expect(removeElement("post_1")).toBe(false);
    expect(document.body.innerHTML).toBe(`<div id="post_2"></div>`);
  });
});
