import { currentPath } from "./location";
import type { EventData } from "./protocol";
import type { Pulse } from "./pulse";

const URL_ENCODED_ENCTYPE = "application/x-www-form-urlencoded";
const URL_ENCODED_CONTENT_TYPE = `${URL_ENCODED_ENCTYPE};charset=UTF-8`;

const COMPONENT_EVENTS = ["click", "input", "change", "submit", "keydown", "keyup"] as const;

/**
 * Install document-level event delegation. Returns a function that removes it.
 */
export function installEventHandlers(pulse: Pulse) {
  // Component handlers are registered first so they take precedence over link and form
  // navigation, which skip events that have already been handled.
  const componentListeners = COMPONENT_EVENTS.map((type) => {
    const listener = (event: Event) => handleComponentEvent(event, type, pulse);
    document.addEventListener(type, listener);
    return [type, listener] as const;
  });

  const onLinkClick = (event: MouseEvent) => handleLinkClick(event, pulse);
  const onSubmit = (event: SubmitEvent) => handleSubmit(event, pulse);
  const onPopState = () => pulse.navigate(window.location.pathname);

  document.addEventListener("click", onLinkClick);
  document.addEventListener("submit", onSubmit);
  window.addEventListener("popstate", onPopState);

  return () => {
    componentListeners.forEach(([type, listener]) => document.removeEventListener(type, listener));
    document.removeEventListener("click", onLinkClick);
    document.removeEventListener("submit", onSubmit);
    window.removeEventListener("popstate", onPopState);
  };
}

/**
 * An element with `data-pulse-<event>` dispatches the event to a server-side handler:
 *
 *   data-pulse-click="toggle"               handler name
 *   data-pulse-click-payload='{"id":"1"}'   opaque payload string
 *   data-pulse-input-debounce="300"         wait until events stop for 300ms
 *   data-pulse-input-throttle="300"         send at most once per 300ms
 *   data-pulse-keydown-key="Escape"         only fire for this key
 */
function handleComponentEvent(event: Event, type: string, pulse: Pulse) {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;

  const trigger = findTriggerElement(event, type);
  if (!trigger) return;

  if (type === "submit" || (type === "click" && cancelsClick(event.target))) {
    event.preventDefault();
  }

  const componentId = trigger.dataset.pulseComponentId;
  if (!componentId) {
    console.warn(`[pulse] Ignoring data-pulse-${type} without data-pulse-component-id`, trigger);
    return;
  }

  const handler = trigger.getAttribute(`data-pulse-${type}`)!;
  const payload = trigger.getAttribute(`data-pulse-${type}-payload`);
  // Read the event data now: by the time a debounced event fires, `event.target` and
  // `event.submitter` are gone. Input values are read when the event is sent.
  const collect = collectEventData(event, type, trigger);

  rateLimit(trigger, type, () => {
    let data = collect();

    if (payload !== null) {
      (data ??= {}).payload = payload;
    }

    pulse.sendEvent(componentId, handler, data);
  });
}

/**
 * The closest element handling `type`. Key events skip triggers filtering for another
 * key, so an input handling Enter doesn't swallow Escape for its container.
 */
function findTriggerElement(event: Event, type: string) {
  let trigger = (event.target as Element).closest<HTMLElement>(`[data-pulse-${type}]`);

  if (event instanceof KeyboardEvent) {
    while (trigger && !matchesKey(event, trigger.getAttribute(`data-pulse-${type}-key`))) {
      trigger = trigger.parentElement?.closest<HTMLElement>(`[data-pulse-${type}]`) ?? null;
    }
  }

  return trigger;
}

function matchesKey(event: KeyboardEvent, key: string | null) {
  return key === null || event.key.toLowerCase() === key.toLowerCase();
}

/**
 * Only cancel clicks whose default action would compete with the handler: following a
 * link or submitting a form. Checkboxes, details/summary, labels etc. keep working.
 */
function cancelsClick(target: EventTarget | null) {
  return target instanceof Element &&
    target.closest("a[href], button, input[type=submit], input[type=image], input[type=reset]") !== null;
}

function collectEventData(event: Event, type: string, trigger: HTMLElement): () => EventData | undefined {
  switch (type) {
    case "keydown":
    case "keyup": {
      const key = (event as KeyboardEvent).key;
      return () => ({ key });
    }
    case "submit": {
      const form = event.target;
      const submitter = (event as SubmitEvent).submitter;
      return () => ({ form: serializeForm(form, submitter) });
    }
    case "input":
    case "change": {
      // Bound on a form: send all fields. Bound on a control: send its value.
      if (trigger instanceof HTMLFormElement) {
        return () => ({ form: serializeForm(trigger) });
      }

      const control = event.target;
      return () => (isFormControl(control) ? controlValue(control) : undefined);
    }
    default:
      return () => undefined;
  }
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(element: EventTarget | null): element is FormControl {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}

function controlValue(control: FormControl): EventData {
  if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
    return { value: control.value, checked: control.checked };
  }

  if (control instanceof HTMLSelectElement && control.multiple) {
    return { value: Array.from(control.selectedOptions, (option) => option.value) };
  }

  return { value: control.value };
}

function serializeForm(form: EventTarget | null, submitter?: HTMLElement | null) {
  if (!(form instanceof HTMLFormElement)) return undefined;
  return encodeFormData(new FormData(form, submitter));
}

type Limiter = { timer?: ReturnType<typeof setTimeout>; pending?: () => void };
const limiters = new WeakMap<Element, Map<string, Limiter>>();

/**
 * Debounce: send once events stop for the given time. Throttle: send right away, then at
 * most once per period; the latest event in a period is sent when it ends, so the final
 * value is never lost.
 */
function rateLimit(trigger: Element, type: string, send: () => void) {
  const debounce = Number(trigger.getAttribute(`data-pulse-${type}-debounce`));
  const throttle = Number(trigger.getAttribute(`data-pulse-${type}-throttle`));

  if (!(debounce > 0) && !(throttle > 0)) {
    send();
    return;
  }

  let byType = limiters.get(trigger);
  if (!byType) limiters.set(trigger, (byType = new Map()));

  let limiter = byType.get(type);
  if (!limiter) byType.set(type, (limiter = {}));
  const state = limiter;

  if (debounce > 0) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = undefined;
      send();
    }, debounce);
    return;
  }

  const run = (next: () => void) => {
    next();
    state.timer = setTimeout(() => {
      state.timer = undefined;
      const pending = state.pending;
      state.pending = undefined;
      if (pending) run(pending);
    }, throttle);
  };

  if (state.timer) {
    state.pending = send;
  } else {
    run(send);
  }
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
