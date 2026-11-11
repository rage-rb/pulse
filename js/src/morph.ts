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
  const next = parseElement(html);
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

function parseElement(html: string) {
  const source = html.trim();

  // The fragment parser discards a top-level body tag and its attributes.
  // Layout components re-render as body elements, so parse those as documents.
  if (/^<body(?:\s|>)/i.test(source)) {
    return new DOMParser().parseFromString(source, "text/html").body;
  }

  const template = document.createElement("template");
  template.innerHTML = source;
  return template.content.firstElementChild;
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

    const live = findLiveStubTarget(currentRoot, preparedRoot, candidate);
    if (live && !candidate.id) candidate.id = live.id;

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

/**
 * Resolve keyed stubs by id and anonymous yield stubs by their element position.
 * Positional targets must still have an id so Morphlex can pair the two nodes.
 */
function findLiveStubTarget(currentRoot: Element, nextRoot: Element, stub: Element) {
  if (stub.id) return findLiveElement(currentRoot, stub.id);

  const element = findLiveElementAtPosition(currentRoot, nextRoot, stub);
  return element?.id ? element : null;
}

/**
 * Find the live element occupying the same slot in the current tree. An id-bearing
 * ancestor is used as an anchor when available; otherwise the lookup follows
 * element-child positions from the component root, ignoring whitespace nodes.
 */
function findLiveElementAtPosition(
  currentRoot: Element,
  nextRoot: Element,
  nextElement: Element,
): Element | null {
  if (nextElement === nextRoot) return currentRoot;

  const nextParent = nextElement.parentElement;
  if (!nextParent) return null;

  const currentParent = nextParent.id
    ? findLiveElement(currentRoot, nextParent.id)
    : findLiveElementAtPosition(currentRoot, nextRoot, nextParent);
  if (!currentParent) return null;

  const position = [...nextParent.children].indexOf(nextElement);
  return position < 0 ? null : currentParent.children.item(position);
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
