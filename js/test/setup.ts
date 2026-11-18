// Morphlex relies on this browser API, which jsdom does not implement.
if (!("isContentEditable" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get() {
      let element: Element | null = this;

      while (element) {
        const value = element.getAttribute("contenteditable")?.toLowerCase();
        if (value === "" || value === "true" || value === "plaintext-only") return true;
        if (value === "false") return false;
        element = element.parentElement;
      }

      return false;
    },
  });
}
