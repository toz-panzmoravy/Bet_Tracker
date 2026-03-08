(function () {
  const API_URL_KEY = "sofascore_fav_api_url";
  const API_URL_DEFAULT = "http://127.0.0.1:15555/api";

  const apiUrlInput = document.getElementById("api-url");
  if (!apiUrlInput) return;

  chrome.storage.local.get([API_URL_KEY], function (result) {
    apiUrlInput.value = result[API_URL_KEY] || API_URL_DEFAULT;
  });

  apiUrlInput.addEventListener("change", saveApiUrl);
  apiUrlInput.addEventListener("blur", saveApiUrl);

  function saveApiUrl() {
    let v = (apiUrlInput.value || "").trim();
    if (!v) v = API_URL_DEFAULT;
    if (!v.startsWith("http")) v = "http://" + v;
    v = v.replace(/\/+$/, "");
    if (v.endsWith("/api")) v = v;
    else if (!v.endsWith("/api")) v = v + "/api";
    apiUrlInput.value = v;
    chrome.storage.local.set({ [API_URL_KEY]: v });
  }
})();
