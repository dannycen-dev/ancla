import { useState } from "react";
import { AuthError, changePassword } from "./api.ts";
import { RefreshAppButton } from "./RefreshAppButton.tsx";
import { SyncBanner } from "./SyncBanner.tsx";

type HubProps = {
  title: string;
  fromCache: boolean;
  pending: boolean;
  onFood: () => void;
  onGym: () => void;
  onLogout: () => void;
  onAuthLost: () => void;
};

export function Hub({ title, fromCache, pending, onFood, onGym, onLogout, onAuthLost }: HubProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="page hub">
      <header className="topbar">
        <div>
          <p className="eyebrow">Ancla</p>
          <h1>{title}</h1>
          <p className="meta">Elige qué plan quieres ver hoy.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost" onClick={() => setShowPassword((value) => !value)}>
            Contraseña
          </button>
          <RefreshAppButton />
          <button type="button" className="ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <SyncBanner fromCache={fromCache} pending={pending} />

      {showPassword ? <PasswordForm onCancel={() => setShowPassword(false)} onAuthLost={onAuthLost} /> : null}

      <button type="button" className="hub-card" onClick={onFood}>
        <span className="eyebrow">Comida</span>
        <strong>Plan alimenticio</strong>
        <em>Menú del día, agua, despensa y progreso.</em>
      </button>

      <button type="button" className="hub-card is-gym" onClick={onGym}>
        <span className="eyebrow">Gym</span>
        <strong>Plan de entrenamiento</strong>
        <em>Rutina de agosto, pesos por semana y accesorios.</em>
      </button>
    </main>
  );
}

function PasswordForm({ onCancel, onAuthLost }: { onCancel: () => void; onAuthLost: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  return (
    <form
      className="habit"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const next = String(data.get("next") ?? "");
        const confirm = String(data.get("confirm") ?? "");
        setError("");
        setOk(false);
        if (next !== confirm) {
          setError("La confirmación no coincide.");
          return;
        }
        setBusy(true);
        void changePassword(next)
          .then(() => {
            setOk(true);
            form.reset();
          })
          .catch((err: unknown) => {
            if (err instanceof AuthError) {
              onAuthLost();
              return;
            }
            setError(err instanceof Error ? err.message : "No se pudo cambiar.");
          })
          .finally(() => setBusy(false));
      }}
    >
      <h2>Nueva contraseña</h2>
      <label>
        Nueva contraseña
        <input name="next" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label>
        Confirmar nueva
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      {ok ? <p className="meta">Listo. Ya puedes entrar con la nueva contraseña.</p> : null}
      <div className="save-bar">
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cerrar
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </form>
  );
}
