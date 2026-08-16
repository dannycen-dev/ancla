import { useState } from "react";
import { reloadAppFromNetwork } from "./appCache.ts";

export function RefreshAppButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="ghost"
      disabled={busy}
      onClick={() => {
        if (
          !window.confirm(
            "Se baja la versión nueva y se recarga. Las marcas y los pesos se quedan.",
          )
        ) {
          return;
        }
        setBusy(true);
        void reloadAppFromNetwork();
      }}
    >
      {busy ? "Recargando…" : "Recargar app"}
    </button>
  );
}
