(function () {
  const KEY = "upcomingButtonVisibility";
  const DEFAULT = "tipsport_betano_only";

  const select = document.getElementById("visibility");
  const optionsLink = document.getElementById("options-link");

  if (select) {
    chrome.storage.sync.get([KEY], function (result) {
      select.value = result[KEY] || DEFAULT;
    });
    select.addEventListener("change", function () {
      chrome.storage.sync.set({ [KEY]: select.value });
    });
  }

  if (optionsLink) {
    optionsLink.addEventListener("click", function (e) {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
})();
