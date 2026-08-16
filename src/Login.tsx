import { useState, type FormEvent } from "react";
import { login } from "./api.ts";

type LoginProps = {
  onLoggedIn: () => void;
};

export function Login({ onLoggedIn }: LoginProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setError("");
    setBusy(true);
    try {
      await login(password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <p className="eyebrow">Ancla</p>
        <h1>Tu plan, a la mano</h1>
        <p className="lede">
          Entra con tu contraseña para ver comida y gym. Después de la primera visita, también funciona
          sin internet.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            autoFocus
          />
          <p className="form-error">{error}</p>
          <button type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
