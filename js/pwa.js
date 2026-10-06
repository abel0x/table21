/* PWA bootstrap. The game itself also works directly from file://. */
(function () {
  "use strict";

  var isWeb = location.protocol === "http:" || location.protocol === "https:";
  if (!("serviceWorker" in navigator) || !isWeb) return;

  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;
  var updatePending = false;
  var registration = null;

  function reloadWhenSafe() {
    var body = document.body;
    if (reloading || !body || body.getAttribute("data-phase") !== "betting" ||
        body.getAttribute("data-busy") === "true" || Number(body.getAttribute("data-wager")) > 0) return;
    if (updatePending) {
      reloading = true;
      location.reload();
    } else if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: "TABLE21_ACTIVATE" });
    }
  }
  window.addEventListener("focus", reloadWhenSafe);

  // When an older cached version is already controlling the page, move to the
  // newly installed shell only after the current hand and its animations finish.
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    updatePending = true;
    reloadWhenSafe();
  });

  if (typeof MutationObserver === "function" && document.body) {
    new MutationObserver(reloadWhenSafe).observe(document.body, {
      attributes: true, attributeFilter: ["data-phase", "data-busy", "data-wager"]
    });
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").then(function (value) {
      registration = value;
      function watchInstalling() {
        if (registration.installing) registration.installing.addEventListener("statechange", reloadWhenSafe);
      }
      registration.addEventListener("updatefound", watchInstalling);
      watchInstalling();
      reloadWhenSafe();
    }).catch(function () {
      // file:// remains the zero-setup offline fallback; a failed optional PWA
      // registration must never prevent the table from running.
    });
  });
})();
