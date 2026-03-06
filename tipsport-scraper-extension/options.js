(function () {
  const KEY = "upcomingButtonVisibility";
  const DEFAULT = "tipsport_betano_only";

  const select = document.getElementById("upcoming-visibility");
  if (!select) return;

  chrome.storage.sync.get([KEY], function (result) {
    const value = result[KEY] || DEFAULT;
    select.value = value;
  });

  select.addEventListener("change", function () {
    chrome.storage.sync.set({ [KEY]: select.value });
  });
})();
