const picker = document.getElementById("document-language");
const articles = [...document.querySelectorAll("#document-content > article")];

function showLanguage() {
  const requested = location.hash.slice(1);
  const selected = articles.find((article) => article.id === requested) ?? articles[0];

  for (const article of articles) {
    article.hidden = article !== selected;
  }
  picker.value = selected.id;
  document.documentElement.lang = selected.lang;
}

picker.addEventListener("change", () => {
  const fragment = "#" + picker.value;
  if (location.hash !== fragment) {
    history.pushState(null, "", fragment);
  }
  showLanguage();
});

window.addEventListener("hashchange", showLanguage);
showLanguage();
picker.closest(".language-picker").hidden = false;
