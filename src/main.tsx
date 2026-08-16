import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { flushPending } from "./api.ts";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function kickSync() {
  void flushPending();
}

window.addEventListener("online", kickSync);
window.addEventListener("pageshow", kickSync);
window.addEventListener("pagehide", () => {
  window.dispatchEvent(new Event("ancla-flush-drafts"));
  void flushPending();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    window.dispatchEvent(new Event("ancla-flush-drafts"));
    return;
  }
  kickSync();
});

function keyboardInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
}

function syncKeyboardInset() {
  document.documentElement.style.setProperty("--keyboard-inset", `${Math.round(keyboardInset())}px`);
}

function scrollFocusedIntoKeyboardView(el: HTMLElement) {
  syncKeyboardInset();
  const viewport = window.visualViewport;
  const viewHeight = viewport?.height ?? window.innerHeight;
  const rect = el.getBoundingClientRect();
  const top = viewport?.offsetTop ?? 0;
  const viewBottom = top + viewHeight - 16;
  if (rect.bottom <= viewBottom && rect.top >= top) return;
  const delta = rect.top - top - viewHeight * 0.28;
  window.scrollBy({ top: delta, behavior: "auto" });
}

document.addEventListener("focusin", (event) => {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") return;
  window.setTimeout(() => scrollFocusedIntoKeyboardView(el), 50);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    syncKeyboardInset();
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      scrollFocusedIntoKeyboardView(active);
    }
  });
  window.visualViewport.addEventListener("scroll", syncKeyboardInset);
  window.addEventListener("orientationchange", syncKeyboardInset);
  syncKeyboardInset();
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
    const update = () => void registration.update();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") update();
    });
    window.addEventListener("online", update);
    update();
  });
}
