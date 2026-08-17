import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { flushDraftsNow, flushPending } from "./api.ts";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

{
  const url = new URL(window.location.href);
  if (url.searchParams.has("fresh")) {
    url.searchParams.delete("fresh");
    const search = url.searchParams.toString();
    window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
  }
}

function kickSync() {
  void flushPending();
}

window.addEventListener("online", kickSync);
window.addEventListener("pageshow", kickSync);
window.addEventListener("pagehide", () => {
  void flushDraftsNow().then(() => flushPending());
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void flushDraftsNow();
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
  el.scrollIntoView({ block: "center", behavior: "auto" });
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
