import { currentPath } from "./location";
import type { Pulse } from "./pulse";

const URL_ENCODED_ENCTYPE = "application/x-www-form-urlencoded";
const URL_ENCODED_CONTENT_TYPE = `${URL_ENCODED_ENCTYPE};charset=UTF-8`;

/**
 * Install document-level event delegation. Returns a function that removes it.
 */
export function installEventHandlers(pulse: Pulse) {
  const onEventClick = (event: MouseEvent) => handleEventClick(event, pulse);
  const onLinkClick = (event: MouseEvent) => handleLinkClick(event, pulse);
  const onSubmit = (event: SubmitEvent) => handleSubmit(event, pulse);
  const onPopState = () => pulse.navigate(window.location.pathname);

  document.addEventListener("click", onEventClick);
  document.addEventListener("click", onLinkClick);
  document.addEventListener("submit", onSubmit);
  window.addEventListener("popstate", onPopState);

  return () => {
    document.removeEventListener("click", onEventClick);
    document.removeEventListener("click", onLinkClick);
    document.removeEventListener("submit", onSubmit);
    window.removeEventListener("popstate", onPopState);
  };
}

/**
 * A `data-pulse-click` element dispatches a server-side event.
 */
function handleEventClick(event: MouseEvent, pulse: Pulse) {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;

  const trigger = event.target.closest<HTMLElement>("[data-pulse-click]");
  if (!trigger) return;

  event.preventDefault();

  const { pulseClick, pulseComponentId, pulsePayload } = trigger.dataset;
  if (!pulseComponentId) {
    console.warn("[pulse] Ignoring data-pulse-click without data-pulse-component-id", trigger);
    return;
  }

  pulse.sendEvent(pulseComponentId, pulseClick!, pulsePayload);
}

/**
 * Same-origin links navigate over the socket instead of triggering a full page load.
 */
function handleLinkClick(event: MouseEvent, pulse: Pulse) {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;

  const link = event.target.closest("a[href]");
  if (link instanceof HTMLAnchorElement && shouldInterceptLink(link, event)) {
    event.preventDefault();
    pulse.visit(link.href);
  }
}

/**
 * Forms submit over the socket; the server performs the mutation and replies with the
 * page to land on (or a redirect).
 */
function handleSubmit(event: SubmitEvent, pulse: Pulse) {
  if (event.defaultPrevented) return;

  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  // Read the attribute: `form.action` is shadowed by a field named "action".
  const url = new URL(form.getAttribute("action") ?? "", window.location.href);
  if (url.origin !== window.location.origin) return;
  if (form.querySelector('input[type="file"]')) return;

  // Pass the submitter so the clicked button's name/value is included, as in a native submit.
  const data = new FormData(form, event.submitter);
  const methodOverride = data.get("_method");
  const method = (typeof methodOverride === "string" && methodOverride ? methodOverride : form.method).toUpperCase();
  const enctype = event.submitter?.getAttribute("formenctype") || form.enctype;
  if (method !== "GET" && enctype !== URL_ENCODED_ENCTYPE) return;

  const encoded = encodeFormData(data);

  event.preventDefault();

  if (method === "GET") {
    pulse.navigate(url.pathname, { method, query: encoded, hash: url.hash });
  } else {
    pulse.navigate(url.pathname, {
      method,
      body: encoded,
      contentType: URL_ENCODED_CONTENT_TYPE,
      query: url.search.slice(1),
      hash: url.hash,
    });
  }
}

function shouldInterceptLink(link: HTMLAnchorElement, event: MouseEvent) {
  // Let the browser handle "open in new tab/window" and downloads.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download")) return false;

  if (link.origin !== window.location.origin) return false;

  // In-page anchors only need the browser to scroll.
  if (link.hash && link.pathname + link.search === currentPath()) return false;

  return true;
}

function encodeFormData(formData: FormData) {
  const encoded = new URLSearchParams();

  for (const [name, value] of formData) {
    if (typeof value === "string") encoded.append(name, value);
  }

  return encoded.toString();
}
