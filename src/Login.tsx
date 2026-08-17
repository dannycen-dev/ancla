import { useState, type FormEvent } from "react";
import { login, requestRecovery, resetPasswordWithToken } from "./api.ts";

type LoginProps = {
  recoverToken?: string;
  onLoggedIn: () => void;
};

export function Login({ recoverToken = "", onLoggedIn }: LoginProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setError("");
    setBusy(true);
    try {
      await login(password);
      onLoggedIn();
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Sin conexión. Entra una vez con red para usar Ancla sin internet.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRecover() {
    setError("");
    setBusy(true);
    try {
      await requestRecovery();
      setSent(true);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Sin conexión. Necesitas red para enviar el correo.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo enviar el correo.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get("next") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    setError("");
    if (next !== confirm) {
      setError("La confirmación no coincide.");
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithToken(recoverToken, next);
      onLoggedIn();
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Sin conexión. Necesitas red para guardar la contraseña.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (recoverToken) {
    return (
      <main className="login">
        <div className="login-card">
          <p className="eyebrow">Ancla</p>
          <h1>Nueva contraseña</h1>
          <p className="lede">Elige una contraseña nueva. El enlace caduca a los 20 minutos.</p>
          <form autoComplete="on" onSubmit={(event) => void handleReset(event)}>
            <label htmlFor="next">Nueva contraseña</label>
            <input
              id="next"
              name="next"
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              minLength={8}
              maxLength={128}
              required
            />
            <label htmlFor="confirm">Confirmar nueva</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              minLength={8}
              maxLength={128}
              required
            />
            <p className="form-error">{error}</p>
            <button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="login">
      <div className="login-card">
        <p className="eyebrow">Ancla</p>
        <h1>Tu plan, a la mano</h1>
        <p className="lede">
          Entra con tu contraseña para ver comida y gym. Después de la primera visita también funciona
          sin internet. Si sales sin señal, el plan no se borra; al volver la red te pedirá la
          contraseña otra vez.
        </p>
        <form autoComplete="on" onSubmit={(event) => void handleLogin(event)}>
          <label className="sr-only" htmlFor="username">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            defaultValue="ancla"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={128}
            required
          />
          <p className="form-error">{error}</p>
          <button type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        {sent ? (
          <p className="meta recover-note">
            Si el correo está bien, te llega un enlace a Gmail. Revisa también spam. Caduca en 20
            minutos.
          </p>
        ) : (
          <button type="button" className="ghost" disabled={busy} onClick={() => void handleRecover()}>
            Olvidé mi contraseña
          </button>
        )}
      </div>
    </main>
  );
}
