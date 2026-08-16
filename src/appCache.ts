function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    work.catch(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    }),
  ]);
}

export async function reloadAppFromNetwork(): Promise<void> {
  try {
    await withTimeout(
      (async () => {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((registration) => registration.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      })(),
      1500,
    );
  } finally {
    window.location.href = `/index.html?fresh=${Date.now()}`;
  }
}
