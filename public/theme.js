// The theme picked on this device (useTheme), set before the first paint so it never flashes. A
// file of its own, not inline: the app's CSP runs no inline script (src/worker/index.ts)
try {
  const theme = localStorage.getItem("chirashitabi:theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
  // storage refused: the device's theme
}
