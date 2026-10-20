/**
 * DOM patching primitives.
 * Everything that mutates the page in response to the server goes through here.
 */
import { morph, morphDocument, type Options } from "morphlex";

// Keep user-modified form fields (typed text, toggled checkboxes) across morphs.
const MORPH_OPTIONS: Options = { preserveChanges: true };

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

  morph(current, next, MORPH_OPTIONS);
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
