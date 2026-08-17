(function () {
  function withTimeout(work, ms) {
    return Promise.race([
      work.catch(function () {}),
      new Promise(function (resolve) {
        window.setTimeout(resolve, ms);
      }),
    ]);
  }

  function bust() {
    var work = Promise.resolve();
    if ("serviceWorker" in navigator) {
      work = work
        .then(function () {
          return navigator.serviceWorker.getRegistrations();
        })
        .then(function (regs) {
          return Promise.all(
            regs.map(function (registration) {
              return registration.unregister();
            }),
          );
        });
    }
    if ("caches" in window) {
      work = work
        .then(function () {
          return caches.keys();
        })
        .then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            }),
          );
        });
    }
    return work;
  }

  withTimeout(bust(), 1500).then(function () {
    if (/\/actualizar(\.html)?$/i.test(location.pathname)) {
      location.replace("/index.html?fresh=" + Date.now());
    }
  });
})();
