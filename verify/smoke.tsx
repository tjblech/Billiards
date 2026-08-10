import "./setup";
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";

const root = document.getElementById("root")!;
const log: string[] = [];
let failures = 0;

function ok(cond: boolean, msg: string) {
  log.push(`${cond ? "  PASS" : "  FAIL"}  ${msg}`);
  if (!cond) failures += 1;
}
function step(msg: string) {
  log.push(`\n▸ ${msg}`);
}
function text() {
  return root.textContent ?? "";
}
function allButtons() {
  return Array.from(root.querySelectorAll("button")) as HTMLButtonElement[];
}
function btn(match: string | RegExp) {
  const re = typeof match === "string" ? new RegExp(match, "i") : match;
  return allButtons().find((b) => re.test(b.textContent ?? ""));
}
function click(el: Element | undefined, what: string) {
  if (!el) {
    ok(false, `could not find control: ${what}`);
    return false;
  }
  act(() => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  return true;
}

async function run() {
  const r = createRoot(root);
  await act(async () => {
    r.render(<App />);
  });

  step("Setup screen");
  ok(/Tournament Control/.test(text()), "command bar renders");
  ok(/New tournament/.test(text()), "setup panel renders");
  ok(Boolean(btn(/^build bracket$/i)), "build bracket button present");
  ok(/draw of 32/.test(text()), "live draw preview computes bracket size from 30 entrants");
  ok(/2 byes/.test(text()), "byes computed correctly (32 - 30 = 2)");
  ok(Boolean(btn(/generate/i)), "team maker present");
  ok(!/Release Notes/i.test(text()), "marketing 'Release Notes' panel removed");

  step("Doubles team maker");
  click(btn(/^generate$/i), "generate teams");
  ok(/\//.test(text()), "generated team output rendered");

  step("Build the bracket");
  click(btn(/^build bracket$/i), "build bracket");
  ok(/Table 1/.test(text()), "table 1 card rendered");
  ok(/Table 2/.test(text()), "table 2 card rendered (default table count = 2)");
  ok(/Next Up/.test(text()), "queue strip rendered");
  ok(/Entrants/.test(text()), "stat strip rendered");

  step("Send a match to a table from the floor view");
  const send = btn(/send to table 1/i);
  ok(Boolean(send), "send-to-table button on the open table");
  click(send, "send to table 1");
  ok(/Live/.test(text()), "match reported as live");
  ok(/\d\d:\d\d/.test(text()), "elapsed clock rendering");
  ok(Boolean(btn(/^win$/i)), "win buttons available on the live table");

  step("Second table picks up the next match");
  ok(Boolean(btn(/send to table 2/i)), "table 2 offers the following match");
  ok(!btn(/send to table 1/i), "table 1 no longer offers a send while occupied");

  step("Report a result");
  const before = (text().match(/Live/g) ?? []).length;
  click(btn(/^win$/i), "declare winner");
  ok((text().match(/Live/g) ?? []).length <= before, "live count did not increase after a result");
  ok(/1\/\d+/.test(text()) || /Played/.test(text()), "played counter updated");

  step("Undo");
  const undo = allButtons().find((b) => b.getAttribute("aria-label")?.includes("Undo"));
  ok(Boolean(undo) && !undo!.disabled, "undo enabled after an action");
  click(undo, "undo");

  step("Matches tab");
  click(btn(/^matches$/i), "matches tab");
  ok(/Match control/i.test(text()), "match control list rendered");
  ok(/W1-M1/.test(text()), "match codes rendered");

  step("Standings tab");
  click(btn(/^standings$/i), "standings tab");
  ok(/Player/.test(text()) && /Place/.test(text()), "leaderboard header rendered");
  ok(/Summary/.test(text()), "summary panel rendered");

  step("Late entry modal");
  click(btn(/^late entry$/i), "open late entry");
  ok(/Placement/.test(text()), "late entry modal opened");
  ok(/Fill bye/.test(text()), "placement modes rendered");
  const nameInput = root.querySelector("input.input") as HTMLInputElement | null;
  ok(Boolean(nameInput), "late entry input present");

  step("Public view");
  click(btn(/^public$/i), "switch to public");
  ok(/Tables/.test(text()), "public tabs rendered");
  ok(/Share this board/.test(text()), "share strip rendered on phone/desktop");
  ok(Boolean(root.querySelector('img[alt*="QR"]')), "QR code rendered");
  click(btn(/^bracket$/i), "public bracket tab");
  ok(/Fit/.test(text()), "bracket zoom controls rendered");
  click(btn(/^standings$/i), "public standings tab");
  ok(/Place/.test(text()), "public standings rendered");
  click(btn(/^tv$/i), "TV mode");
  ok(!/Share this board/.test(text()), "share strip hidden in TV mode");
  ok(/Auto/.test(text()), "auto-rotate control appears in TV mode");

  step("Back to admin");
  click(btn(/^admin$/i), "back to admin");
  ok(/Floor/.test(text()), "admin tabs restored");

  console.log(log.join("\n"));
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.log(log.join("\n"));
  console.error("\nCRASH:", e);
  process.exit(1);
});
