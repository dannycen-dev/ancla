import { useState, type FormEvent } from 'react'
import { apiLogin } from '../api'

type Props = {
  onSuccess: (username: string) => void
}

export function Login({ onSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiLogin(username.trim(), password)
      onSuccess(res.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="onboarding fade-in">
        <p className="eyebrow">Acceso privado</p>
        <h1>
          Ancla<span>.</span>
        </h1>
        <p className="lede">
          Coach personal de dieta y gym. Inicia sesion para cargar tu plan desde el servidor.
        </p>

        <form className="panel" onSubmit={submit}>
          <label className="field">
            <span className="eyebrow">Usuario</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="eyebrow">Contrasena</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
