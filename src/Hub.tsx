type HubProps = {
  title: string;
  fromCache: boolean;
  onFood: () => void;
  onGym: () => void;
  onLogout: () => void;
};

export function Hub({ title, fromCache, onFood, onGym, onLogout }: HubProps) {
  return (
    <main className="page hub">
      <header className="topbar">
        <div>
          <p className="eyebrow">Ancla</p>
          <h1>{title}</h1>
          <p className="meta">Elige qué plan quieres ver hoy.</p>
        </div>
        <button type="button" className="ghost" onClick={onLogout}>
          Salir
        </button>
      </header>

      {fromCache ? (
        <p className="banner">Sin conexión. Mostrando la última versión guardada en este teléfono.</p>
      ) : null}

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
