(function () {
  const KEY = "upcomingButtonVisibility";
  const DEFAULT = "tipsport_betano_only";
  const API_URL_KEY = "bettracker_api_url";
  const API_URL_DEFAULT = "http://127.0.0.1:15555/api";

  const select = document.getElementById("upcoming-visibility");
  const apiUrlInput = document.getElementById("api-url");

  if (apiUrlInput) {
    chrome.storage.local.get([API_URL_KEY], function (result) {
      apiUrlInput.value = result[API_URL_KEY] || API_URL_DEFAULT;
    });
    apiUrlInput.addEventListener("change", function () {
      let v = (apiUrlInput.value || "").trim();
      if (!v) v = API_URL_DEFAULT;
      if (!v.startsWith("http")) v = "http://" + v;
      if (/:3000(\/|$)/.test(v) || /:3001(\/|$)/.test(v)) {
        v = v.replace(/:3000(\/|$)/, ":15555$1").replace(/:3001(\/|$)/, ":15555$1");
        apiUrlInput.value = v;
      }
      chrome.storage.local.set({ [API_URL_KEY]: v });
    });
    apiUrlInput.addEventListener("blur", function () {
      let v = (apiUrlInput.value || "").trim();
      if (!v) v = API_URL_DEFAULT;
      if (!v.startsWith("http")) v = "http://" + v;
      if (/:3000(\/|$)/.test(v) || /:3001(\/|$)/.test(v)) {
        v = v.replace(/:3000(\/|$)/, ":15555$1").replace(/:3001(\/|$)/, ":15555$1");
        apiUrlInput.value = v;
      }
      chrome.storage.local.set({ [API_URL_KEY]: v });
    });
  }

  if (!select) return;

  chrome.storage.sync.get([KEY], function (result) {
    const value = result[KEY] || DEFAULT;
    select.value = value;
  });

  select.addEventListener("change", function () {
    chrome.storage.sync.set({ [KEY]: select.value });
  });
})();
