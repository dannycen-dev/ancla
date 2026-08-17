import { useEffect, useRef, useState } from "react";
import { isPlan, normalizePlan, type Plan } from "../shared/plan.ts";
import { AuthError, flushPending, isLoggedOutLocally, loadPlan, logout, probeSession, registerDraftFlush, savePlan } from "./api.ts";
import { Editor } from "./Editor.tsx";
import { Hub } from "./Hub.tsx";
import { Login } from "./Login.tsx";
import { PlanView } from "./PlanView.tsx";
import { TrainingEditor } from "./TrainingEditor.tsx";
import { TrainingView } from "./TrainingView.tsx";
import { readCachedPlan, subscribePending } from "./offline.ts";

type Screen = "boot" | "login" | "hub" | "food" | "food-edit" | "gym" | "gym-edit";

function recoverTokenFromUrl(): string {
  try {
    return new URL(window.location.href).searchParams.get("token")?.trim() ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoverToken, setRecoverToken] = useState(recoverTokenFromUrl);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    return subscribePending((count) => {
      setPending(count > 0);
      if (count === 0) {
        void probeSession().then((status) => {
          if (status === "ok") setFromCache(false);
          if (status === "unauth") handleAuthLost();
        });
      }
    });
  }, []);

  useEffect(() => {
    function onSession() {
      void probeSession().then((status) => {
        if (status === "ok") setFromCache(false);
        if (status === "unauth") handleAuthLost();
      });
    }
    function onAuthLost() {
      handleAuthLost();
    }
    window.addEventListener("online", onSession);
    window.addEventListener("pageshow", onSession);
    window.addEventListener("ancla-auth-lost", onAuthLost);
    return () => {
      window.removeEventListener("online", onSession);
      window.removeEventListener("pageshow", onSession);
      window.removeEventListener("ancla-auth-lost", onAuthLost);
    };
  }, []);

  useEffect(() => {
    if (!draft) return;
    return registerDraftFlush(() =>
      savePlan(draft)
        .then(setPlan)
        .catch(() => undefined),
    );
  }, [draft]);

  async function hydrate() {
    setError("");
    try {
      if (recoverTokenFromUrl()) {
        setScreen("login");
        return;
      }
      if (isLoggedOutLocally()) {
        const status = await probeSession();
        if (status === "ok") {
          await logout();
        }
        setScreen("login");
        return;
      }
      const status = await probeSession();
      if (status === "ok") {
        await flushPending();
        const result = await loadPlan();
        setPlan(result.plan);
        setFromCache(result.fromCache);
        setScreen("hub");
        return;
      }
      if (status === "offline") {
        const cached = await readCachedPlan();
        if (isPlan(cached)) {
          setPlan(normalizePlan(cached));
          setFromCache(true);
          setScreen("hub");
          void flushPending();
          return;
        }
      }
      setScreen("login");
    } catch (err) {
      if (err instanceof AuthError) {
        setScreen("login");
        return;
      }
      const cached = await readCachedPlan();
      if (isPlan(cached)) {
        setPlan(normalizePlan(cached));
        setFromCache(true);
        setScreen("hub");
        return;
      }
      setScreen("login");
    }
  }

  useEffect(() => {
    void hydrate();
  }, []);

  function persistDraft(nextScreen: "food" | "gym") {
    if (!draft) return;
    setBusy(true);
    setError("");
    void savePlan(draft)
      .then((saved) => {
        setPlan(saved);
        setDraft(null);
        setScreen(nextScreen);
      })
      .catch((err: unknown) => {
        if (err instanceof AuthError) {
          setScreen("login");
          return;
        }
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      })
      .finally(() => setBusy(false));
  }

  function handleLogout() {
    const extra = pending
      ? " Hay cambios en este teléfono que aún no se suben."
      : fromCache
        ? " Estás sin conexión: el plan se queda en el teléfono, pero pedirás contraseña al volver la red."
        : "";
    if (!window.confirm(`¿Salir de Ancla?${extra}`)) return;
    void logout().finally(() => {
      setPlan(null);
      setDraft(null);
      setPending(false);
      setFromCache(false);
      setScreen("login");
    });
  }

  function handleAuthLost() {
    if (screenRef.current === "login" || screenRef.current === "boot") return;
    void logout().finally(() => {
      setPlan(null);
      setDraft(null);
      setPending(false);
      setFromCache(false);
      setScreen("login");
    });
  }

  if (screen === "boot") {
    return (
      <main className="login">
        <p className="lede">Cargando…</p>
      </main>
    );
  }

  if (screen === "login" || !plan) {
    return (
      <Login
        recoverToken={recoverToken}
        onLoggedIn={() => {
          setRecoverToken("");
          window.history.replaceState(null, "", "/");
          void hydrate();
        }}
      />
    );
  }

  if (screen === "food-edit" && draft) {
    return (
      <Editor
        plan={draft}
        busy={busy}
        error={error}
        onChange={setDraft}
        onCancel={() => {
          setDraft(null);
          setError("");
          setScreen("food");
        }}
        onSave={() => persistDraft("food")}
      />
    );
  }

  if (screen === "gym-edit" && draft) {
    return (
      <TrainingEditor
        plan={draft}
        busy={busy}
        error={error}
        onChange={setDraft}
        onCancel={() => {
          setDraft(null);
          setError("");
          setScreen("gym");
        }}
        onSave={() => persistDraft("gym")}
      />
    );
  }

  if (screen === "food") {
    return (
      <PlanView
        plan={plan}
        fromCache={fromCache}
        pending={pending}
        onHome={() => setScreen("hub")}
        onEdit={() => {
          setDraft(structuredClone(plan));
          setError("");
          setScreen("food-edit");
        }}
        onLogout={handleLogout}
        onAuthLost={handleAuthLost}
      />
    );
  }

  if (screen === "gym") {
    return (
      <TrainingView
        plan={plan}
        fromCache={fromCache}
        pending={pending}
        onHome={() => setScreen("hub")}
        onEdit={() => {
          setDraft(structuredClone(plan));
          setError("");
          setScreen("gym-edit");
        }}
        onLogout={handleLogout}
        onAuthLost={handleAuthLost}
      />
    );
  }

  return (
    <Hub
      title={plan.title}
      fromCache={fromCache}
      pending={pending}
      onFood={() => setScreen("food")}
      onGym={() => setScreen("gym")}
      onLogout={handleLogout}
      onAuthLost={handleAuthLost}
    />
  );
}
