/**
 * DOM patching primitives.
 * Everything that mutates the page in response to the server goes through here.
 */
import { morph, morphDocument, type Options } from "morphlex";

const PULSE_STUB_ATTRIBUTE = "data-pulse-stub";

// Keep user-modified form fields (typed text, toggled checkboxes) across morphs.
const MORPH_OPTIONS: Options = { preserveChanges: true };

const ELEMENT_MORPH_OPTIONS: Options = {
  ...MORPH_OPTIONS,

  // Morphlex has already matched and moved the live element into the stub's
  // position. Do not update its attributes or visit its children.
  beforeNodeVisited: (_current, next) => !isPulseStub(next),

  // A stub without a live match is stale. Never insert the placeholder itself,
  // including when it is nested inside a larger node Morphlex inserts wholesale.
  beforeNodeAdded: (_parent, node) => {
    if (isPulseStub(node)) return false;

    if (node instanceof Element) {
      for (const stub of node.querySelectorAll(`[${PULSE_STUB_ATTRIBUTE}]`)) {
        stub.remove();
      }
    }

    return true;
  },
};

type InsertPosition = "afterbegin" | "beforeend";

/**
* Morph the whole document into a freshly rendered page.
*/
export function morphPage(html: string) {
  morphDocument(document, html, MORPH_OPTIONS);
}

/**
 * Morph an existing element into a re-rendered version of itself. The element is
 * located by the id of the root element in `html`. Returns false if nothing matched.
 */
export function morphElement(html: string) {
  const next = parseFragment(html).firstElementChild;
  if (!next?.id) return false;

  const current = document.getElementById(next.id);
  if (!current) return false;

  morph(current, preparePulseStubs(current, next), ELEMENT_MORPH_OPTIONS);
  return true;
}

/**
 * Insert `html` at the start or end of the element with id `targetId`.
 */
export function insertHTML(targetId: string, position: InsertPosition, html: string) {
  const target = document.getElementById(targetId);
  if (!target) return false;

  target.insertAdjacentHTML(position, html);
  return true;
}

export function removeElement(id: string) {
  const element = document.getElementById(id);
  if (!element) return false;

  element.remove();
  return true;
}

function parseFragment(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content;
}

/**
 * Make each stub look like its live counterpart so Morphlex can pair them by id.
 * Pulse always renders stubs as divs, while component roots may use any tag.
 */
function preparePulseStubs(currentRoot: Element, nextRoot: Element) {
  let preparedRoot = nextRoot;
  const candidates = [
    nextRoot,
    ...nextRoot.querySelectorAll(`[${PULSE_STUB_ATTRIBUTE}]`),
  ];

  for (const candidate of candidates) {
    if (!candidate.hasAttribute(PULSE_STUB_ATTRIBUTE)) continue;

    const live = findLiveElement(currentRoot, candidate.id);
    const stub = live ? retag(candidate, live) : candidate;
    if (candidate === preparedRoot) preparedRoot = stub;

    // Empty stubs retain the marker so the morph callbacks leave them untouched.
    if (!hasContent(stub)) continue;

    // A content-bearing stub is morphable, but its skipped component wrapper
    // retains the attributes already present on the page.
    stub.removeAttribute(PULSE_STUB_ATTRIBUTE);
    if (live) {
      for (const { name, value } of live.attributes) {
        stub.setAttribute(name, value);
      }
    }
  }

  return preparedRoot;
}

function retag(stub: Element, live: Element) {
  if (stub.localName === live.localName && stub.namespaceURI === live.namespaceURI) {
    return stub;
  }

  const replacement = stub.ownerDocument.createElementNS(live.namespaceURI, live.localName);
  for (const { name, value } of stub.attributes) {
    replacement.setAttribute(name, value);
  }
  replacement.append(...stub.childNodes);
  stub.replaceWith(replacement);
  return replacement;
}

function findLiveElement(root: Element, id: string) {
  if (!id) return null;

  const element = document.getElementById(id);
  return element && root.contains(element) ? element : null;
}

function isPulseStub(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
    && (node as Element).hasAttribute(PULSE_STUB_ATTRIBUTE);
}

function hasContent(element: Element) {
  return [...element.childNodes].some(node => (
    node.nodeType !== Node.TEXT_NODE || (node.nodeValue ?? "").trim() !== ""
  ));
}
