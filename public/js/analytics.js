(function () {
  var startTime = Date.now();
  var path = window.location.pathname + window.location.search;

  function getCookie(name) {
    var v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    return v ? v[2] : null;
  }

  function sendTime() {
    var duration = Math.round((Date.now() - startTime) / 1000);
    if (duration < 2) return;
    var sessionId = getCookie('erikred_analytics');
    if (!sessionId) return;
    var payload = JSON.stringify({ sessionId: sessionId, path: path, duration: duration });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/event', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/analytics/event', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendTime();
  });
  window.addEventListener('pagehide', sendTime, { capture: true });
})();
