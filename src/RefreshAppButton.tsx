import { useState } from "react";
import { reloadAppFromNetwork } from "./appCache.ts";

function inAppBrowser(): boolean {
  return /WhatsApp|FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
}

export function RefreshAppButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      className="ghost"
      disabled={busy}
      onClick={() => {
        if (!inAppBrowser() && !window.confirm("Se baja la versión nueva y se recarga. Las marcas y los pesos se quedan.")) {
          return;
        }
        setFailed(false);
        setBusy(true);
        window.setTimeout(() => {
          setBusy(false);
          setFailed(true);
        }, 3000);
        void reloadAppFromNetwork();
      }}
    >
      {busy ? "Recargando…" : failed ? "Ábrelo en Safari" : "Recargar app"}
    </button>
  );
}
