import { useEffect, useRef, useState } from "react";
import type { SlotTimer } from "../shared/setCoach.ts";

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function createAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

function playBeep(ctx: AudioContext | null) {
  navigator.vibrate?.(200);
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    /* Safari puede silenciar si el contexto sigue suspendido. */
  }
}

export function SetTimer({ timer }: { timer: SlotTimer }) {
  const [step, setStep] = useState(0);
  const seconds = timer.steps?.[step] ?? timer.seconds;
  const [leftMs, setLeftMs] = useState(seconds * 1000);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const endAt = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const finishedRef = useRef(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setLeftMs(seconds * 1000);
    setRunning(false);
    setDone(false);
    endAt.current = null;
    finishedRef.current = false;
    void wakeRef.current?.release();
    wakeRef.current = null;
  }, [seconds]);

  async function lockScreen() {
    try {
      wakeRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      /* Safari antiguo no tiene Wake Lock. */
    }
  }

  function unlockScreen() {
    void wakeRef.current?.release();
    wakeRef.current = null;
  }

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setRunning(false);
    setDone(true);
    endAt.current = null;
    unlockScreen();
    playBeep(audioRef.current);
  }

  function tick() {
    if (!endAt.current) return;
    const left = Math.max(0, endAt.current - Date.now());
    setLeftMs(left);
    if (left <= 0) finish();
  }

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    function onVisible() {
      tick();
      if (document.visibilityState === "visible" && endAt.current) void lockScreen();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  function start() {
    audioRef.current ??= createAudioContext();
    void audioRef.current?.resume();
    finishedRef.current = false;
    void lockScreen();
    const remaining = leftMs > 0 && !done ? leftMs : seconds * 1000;
    endAt.current = Date.now() + remaining;
    setLeftMs(remaining);
    setDone(false);
    setRunning(true);
  }

  function reset() {
    finishedRef.current = false;
    endAt.current = null;
    unlockScreen();
    setRunning(false);
    setDone(false);
    setLeftMs(seconds * 1000);
  }

  function nextHold() {
    if (!timer.steps || step >= timer.steps.length - 1) return;
    setStep((value) => value + 1);
  }

  function pause() {
    if (endAt.current) setLeftMs(Math.max(0, endAt.current - Date.now()));
    endAt.current = null;
    unlockScreen();
    setRunning(false);
  }

  const holdLabel =
    timer.steps != null
      ? `${step + 1} reps · sostén ${seconds} s`
      : timer.mode === "rest"
        ? "Pausa"
        : "Tiempo";

  return (
    <div className={`set-timer ${running ? "is-running" : ""} ${done ? "is-done" : ""}`}>
      <p className="set-timer-label">
        {timer.label} · {holdLabel}
      </p>
      <p className="set-timer-clock" aria-live="polite">
        {done ? "Listo" : formatClock(leftMs)}
      </p>
      <p className="meta">Si bloqueas el teléfono, el tiempo sigue; el aviso suena al desbloquear.</p>
      <div className="set-timer-actions">
        <button type="button" onClick={running ? pause : start}>
          {running ? "Pausa" : done ? "Otra vez" : "Iniciar"}
        </button>
        <button type="button" className="ghost" onClick={reset}>
          Reiniciar
        </button>
        {timer.steps && step < timer.steps.length - 1 ? (
          <button type="button" className="ghost" onClick={nextHold}>
            Siguiente {timer.steps[step + 1]} s
          </button>
        ) : null}
      </div>
    </div>
  );
}
