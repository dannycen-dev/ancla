import { useEffect, useState } from "react";
import { isPlan, normalizePlan, type Plan } from "../shared/plan.ts";
import { AuthError, checkSession, loadPlan, logout, savePlan } from "./api.ts";
import { Editor } from "./Editor.tsx";
import { Hub } from "./Hub.tsx";
import { Login } from "./Login.tsx";
import { PlanView } from "./PlanView.tsx";
import { TrainingEditor } from "./TrainingEditor.tsx";
import { TrainingView } from "./TrainingView.tsx";
import { readCachedPlan } from "./offline.ts";

type Screen = "boot" | "login" | "hub" | "food" | "food-edit" | "gym" | "gym-edit";

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function hydrate() {
    setError("");
    try {
      const online = await checkSession();
      if (!online) {
        const cached = await readCachedPlan();
        if (isPlan(cached) && !navigator.onLine) {
          setPlan(normalizePlan(cached));
          setFromCache(true);
          setScreen("hub");
          return;
        }
        setScreen("login");
        return;
      }
      const result = await loadPlan();
      setPlan(result.plan);
      setFromCache(result.fromCache);
      setScreen("hub");
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
        setFromCache(false);
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
    void logout().finally(() => {
      setPlan(null);
      setDraft(null);
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
    return <Login onLoggedIn={() => void hydrate()} />;
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
        onHome={() => setScreen("hub")}
        onEdit={() => {
          setDraft(structuredClone(plan));
          setError("");
          setScreen("food-edit");
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === "gym") {
    return (
      <TrainingView
        plan={plan}
        fromCache={fromCache}
        onHome={() => setScreen("hub")}
        onEdit={() => {
          setDraft(structuredClone(plan));
          setError("");
          setScreen("gym-edit");
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Hub
      title={plan.title}
      fromCache={fromCache}
      onFood={() => setScreen("food")}
      onGym={() => setScreen("gym")}
      onLogout={handleLogout}
    />
  );
}
