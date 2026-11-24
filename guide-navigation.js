document.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-site-target]");
  if (!control) return;

  const target = control.dataset.siteTarget;
  if (target.startsWith("#")) {
    const section = document.getElementById(target.slice(1));
    if (!section) return;
    if (location.hash !== target) history.pushState(null, "", target);
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
    section.scrollIntoView();
  } else if (/^(app(?:-[a-z-]+)?|privacy|voice-credits)\.html(?:#[a-zA-Z-]+)?$/.test(target)) {
    location.assign(target);
  }
});
