/**
 * PitakaKO adapter
 * Lets the existing app code keep calling google.script.run.xxx(...) while it is
 * hosted on Vercel. Every call is sent to the Apps Script web app (doPost in Code.gs).
 */
(function () {
  // 1) Paste your Apps Script Web app URL (must end in /exec)
  const API_URL = 'https://script.google.com/macros/s/AKfycbx6HtFckoM2nRaIC1T-avdm5DqwFJITNcJR4RTEc6ZLWVjohq4U7S3XMfxQYbK91Rdc/exec';

  const PIN_KEY = 'pitakako_api_pin';
  const getPin = () => { try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } };
  const setPin = (v) => { try { localStorage.setItem(PIN_KEY, v); } catch (e) {} };

  async function callApi(fn, args, retried) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        // text/plain avoids a CORS preflight, which Apps Script cannot answer
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: args, pin: getPin() })
      });
    } catch (e) {
      throw new Error('Cannot reach the server. Check your internet connection.');
    }

    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error('Invalid server reply. Check the Apps Script deployment and URL.');
    }

    if (json.ok) return json.data;

    if (json.code === 'AUTH') {
      setPin('');
      if (retried) throw new Error('Wrong PIN.');
      const pin = prompt('Enter your PitakaKO PIN:');
      if (pin === null || !pin.trim()) throw new Error('PIN required.');
      setPin(pin.trim());
      return callApi(fn, args, true);
    }
    throw new Error(json.error || 'Server error.');
  }

  // google.script.run.withSuccessHandler(ok).withFailureHandler(fail).anyFunction(...args)
  function makeRunner(onSuccess, onFailure) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (fn) { return makeRunner(fn, onFailure); };
        if (name === 'withFailureHandler') return function (fn) { return makeRunner(onSuccess, fn); };
        if (typeof name !== 'string') return undefined;
        return function () {
          const args = Array.prototype.slice.call(arguments);
          callApi(name, args, false)
            .then(function (data) { if (onSuccess) onSuccess(data); })
            .catch(function (err) {
              if (onFailure) onFailure(err);
              else console.error('[PitakaKO API] ' + name + ':', err);
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner(null, null);
})();
