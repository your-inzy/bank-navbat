/* ==========================================================================
   QR poster — fetches the server-generated QR that points at /kiosk
   ========================================================================== */

(function () {
  'use strict';

  var img = document.getElementById('qrImg');
  var loading = document.getElementById('qrLoading');
  var urlEl = document.getElementById('qrUrl');
  var tries = 0;

  async function load() {
    tries += 1;
    try {
      var res = await fetch('/api/qr');
      var data = await res.json();
      if (data && data.url) urlEl.textContent = data.url;
      if (data && data.dataUrl) {
        img.src = data.dataUrl;
        img.hidden = false;
        if (loading) loading.hidden = true;
        return;
      }
    } catch (e) {
      /* retry below */
    }
    if (tries < 10) setTimeout(load, 1000);
    else if (loading) loading.textContent = 'QR kodni yuklab boʻlmadi. Sahifani yangilang.';
  }

  load();
})();
