import DOMPurify from "dompurify";

// Everything shown in the preview or written to an exported file goes through here. Raw HTML in a
// document is allowed (CommonMark and GitHub both allow it) but stripped of anything active:
// scripts, event handlers, styles (so a document cannot paint over the app), forms and embeds.
const FORBID_TAGS = [
  "style", "form", "button", "textarea", "select", "option", "iframe", "frame", "frameset",
  "object", "embed", "dialog", "link", "meta", "base", "script", "svg", "math", "template",
];
const FORBID_ATTR = ["style", "formaction", "srcdoc"];

let hooked = false;
function installHooks(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof HTMLInputElement) {
      // Task list checkboxes only: any other input would be a form field inside the preview.
      if (node.getAttribute("type") !== "checkbox") {
        node.remove();
        return;
      }
      node.setAttribute("disabled", "");
    }
    if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) {
      const href = node.getAttribute("href") ?? "";
      if (!href.startsWith("#")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
}

export function sanitize(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$)|data:image\/(?:png|gif|jpe?g|webp|svg\+xml);)/i,
  });
}
