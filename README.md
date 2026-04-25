@import "tailwindcss";
/* Billiards visual upgrade */
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color-scheme: dark;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #030711;
}

button,
input,
textarea,
select {
  font: inherit;
}

.billiards-app {
  position: relative;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 14% 5%, rgba(20, 184, 166, 0.22), transparent 30%),
    radial-gradient(circle at 82% 9%, rgba(245, 158, 11, 0.18), transparent 25%),
    radial-gradient(circle at 50% 100%, rgba(56, 189, 248, 0.12), transparent 34%),
    linear-gradient(135deg, #041015 0%, #071b18 42%, #040814 100%);
}

.billiards-app::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.38) 100%);
  background-size: 46px 46px, 46px 46px, cover;
  mask-image: linear-gradient(to bottom, black 0%, transparent 86%);
}

.ui-panel {
  position: relative;
  overflow: hidden;
}

.ui-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255,255,255,0.06), transparent 36%, rgba(20,184,166,0.045));
}

.ui-panel > * {
  position: relative;
  z-index: 1;
}

.app-header {
  background:
    linear-gradient(115deg, transparent 0 50%, rgba(255,255,255,0.07) 50% 52%, transparent 52% 100%),
    radial-gradient(circle at 16% 10%, rgba(52, 211, 153, 0.28), transparent 28%),
    linear-gradient(135deg, rgba(2, 18, 22, 0.98), rgba(11, 33, 33, 0.88));
  border-color: rgba(110, 231, 183, 0.2) !important;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.07);
}

.app-header::after {
  content: "8";
  position: absolute;
  right: clamp(18px, 5vw, 86px);
  top: 50%;
  transform: translateY(-50%);
  width: 92px;
  height: 92px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: radial-gradient(circle at 38% 30%, #ffffff 0 16%, #111827 17% 40%, #05070b 41% 100%);
  color: #ffffff;
  font-size: 34px;
  font-weight: 900;
  opacity: 0.20;
  box-shadow: 0 24px 50px rgba(0,0,0,0.32);
}

.app-header h1 {
  letter-spacing: -0.055em;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
}

button:not(:disabled) {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
}

input,
textarea,
select {
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

input:focus,
textarea:focus,
select:focus {
  border-color: rgba(52, 211, 153, 0.44) !important;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.10);
  background: rgba(2, 6, 23, 0.62) !important;
}

.setup-layout .ui-panel:first-child {
  border-color: rgba(52, 211, 153, 0.18) !important;
}

.match-card,
.bracket-match,
.live-table-card {
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.80)) !important;
  box-shadow: 0 14px 34px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.04) !important;
}

.match-card:hover,
.bracket-match:hover,
.live-table-card:hover {
  border-color: rgba(52, 211, 153, 0.28) !important;
}

.bracket-board {
  background:
    radial-gradient(circle at 8% 4%, rgba(52,211,153,0.12), transparent 26%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.54), rgba(2, 6, 23, 0.30)) !important;
}

.live-table-card {
  border: 1px solid rgba(251, 191, 36, 0.13);
}

/* tighter mobile header */
@media (max-width: 720px) {
  .app-header::after {
    width: 64px;
    height: 64px;
    right: 14px;
    top: 22px;
    transform: none;
    opacity: 0.14;
  }
}
