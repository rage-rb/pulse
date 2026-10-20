/**
 * The part of the current URL the server routes on.
 */
export function currentPath() {
  return window.location.pathname + window.location.search;
}

/**
 * Resolve a cable path (or absolute URL) against the page URL, switching to ws(s)://.
 */
export function cableUrl(path: string, base: string = window.location.href) {
  const url = new URL(path, base);
  if (url.protocol === "http:")
    url.protocol = "ws:";
  else if (url.protocol === "https:")
    url.protocol = "wss:";

  return url.href;
}

/**
 * Extract query and hash from the current URL.
 */
export function currentLocationOptions() {
  return {
    query: window.location.search.slice(1),
    hash: window.location.hash,
  };
}
