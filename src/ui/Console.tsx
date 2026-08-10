import {
  getMatchDisplayLabel,
  getOpenTable,
  getRoundTitle,
  isPhantomMatch,
  playerName,
  playerNameForSlot,
  type Match,
  type Tournament,
} from "../lib/tournament";
import { Btn, Empty, StatusChip, Tag, formatElapsed, useNow } from "./primitives";

/* ==========================================================================
   The operations console.
   Design goal: a director can run the whole night from one screen — see every
   table, report a winner, and send the next match out — without changing tab.
   ========================================================================== */

function matchLine(t: Tournament, m: Match) {
  return `${playerNameForSlot(t.players, m, 1)} vs ${playerNameForSlot(t.players, m, 2)}`;
}

function roundCaption(m: Match) {
  if (m.bracket === "GF") return getRoundTitle(m.round, 1, "GF");
  return `${m.bracket === "L" ? "Losers" : "Winners"} R${m.round}`;
}

/* --- A physical table ------------------------------------------------------ */
export function TableCard({
  tournament,
  tableNumber,
  live,
  candidate,
  admin,
  onStart,
  onFinish,
  size = "md",
}: {
  tournament: Tournament;
  tableNumber: number;
  live?: Match;
  candidate?: Match;
  admin: boolean;
  onStart?: (id: string) => void;
  onFinish?: (id: string, winnerId: string) => void;
  size?: "md" | "tv";
}) {
  const now = useNow(Boolean(live));
  const tv = size === "tv";
  const nameSize = tv ? "text-[clamp(28px,4.4vw,68px)]" : "text-[26px]";

  return (
    <div
      className="accent-l overflow-hidden rounded-[3px] border bg-panel"
      style={{
        borderColor: live ? "rgba(255,77,61,0.35)" : "var(--color-line)",
        ["--bar" as string]: live ? "var(--color-live)" : "rgba(255,255,255,0.10)",
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`font-display uppercase leading-none text-fg ${tv ? "text-[22px]" : "text-[15px]"}`}
          >
            Table {tableNumber}
          </span>
          {live ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-live">
              <i className="dot-live inline-block h-[5px] w-[5px] rounded-full bg-live" />
              Live
            </span>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg-4">Open</span>
          )}
        </div>
        {live ? (
          <span className={`tnum font-mono text-fg-2 ${tv ? "text-[18px]" : "text-[12px]"}`}>
            {formatElapsed(live.startedAt, now)}
          </span>
        ) : null}
      </div>

      {live ? (
        <div className="divide-y divide-line">
          {([1, 2] as const).map((slot) => {
            const id = slot === 1 ? live.player1Id : live.player2Id;
            const label = playerNameForSlot(tournament.players, live, slot);
            return (
              <div key={slot} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  className={`min-w-0 flex-1 truncate font-display leading-none ${nameSize}`}
                  title={label}
                >
                  {label}
                </span>
                {admin && id && onFinish ? (
                  <Btn size={tv ? "md" : "sm"} variant="outline" onClick={() => onFinish(live.id, id)}>
                    Win
                  </Btn>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="font-mono text-[9px] tracking-[0.08em] text-fg-4">
              {getMatchDisplayLabel(live)} · {roundCaption(live)}
            </span>
          </div>
        </div>
      ) : candidate ? (
        <div className="px-3 py-3">
          <div className="eyebrow mb-1.5">Ready to send</div>
          <div className={`truncate font-display leading-none text-fg-2 ${tv ? "text-[34px]" : "text-[20px]"}`}>
            {matchLine(tournament, candidate)}
          </div>
          {admin && onStart ? (
            <Btn
              size={tv ? "lg" : "md"}
              variant="primary"
              className="mt-3 w-full"
              onClick={() => onStart(candidate.id)}
            >
              Send to Table {tableNumber}
            </Btn>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-5">
          <Empty className="!border-0 !py-0">Waiting on results</Empty>
        </div>
      )}
    </div>
  );
}

/* --- Queue ----------------------------------------------------------------- */
export function QueueStrip({
  tournament,
  nextUp,
  onDeck,
  size = "md",
}: {
  tournament: Tournament;
  nextUp?: Match;
  onDeck?: Match;
  size?: "md" | "tv";
}) {
  const tv = size === "tv";
  const cell = (label: string, match: Match | undefined, primary: boolean) => (
    <div
      className="accent-l relative overflow-hidden rounded-[3px] border bg-panel px-3 py-2.5"
      style={{
        borderColor: primary && match ? "rgba(198,255,61,0.32)" : "var(--color-line)",
        ["--bar" as string]: match
          ? primary
            ? "var(--color-go)"
            : "var(--color-deck)"
          : "rgba(255,255,255,0.08)",
      }}
    >
      {primary && match ? <span className="sweep pointer-events-none absolute inset-0" /> : null}
      <div className="eyebrow mb-1.5">{label}</div>
      <div
        className={`truncate font-display leading-none ${
          match ? (primary ? "text-go" : "text-fg") : "text-fg-4"
        } ${tv ? "text-[clamp(22px,3vw,46px)]" : "text-[21px]"}`}
      >
        {match ? matchLine(tournament, match) : "Waiting"}
      </div>
      {match ? (
        <div className="mt-1.5 font-mono text-[9px] tracking-[0.08em] text-fg-4">
          {getMatchDisplayLabel(match)} · {roundCaption(match)}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {cell("Next Up", nextUp, true)}
      {cell("On Deck", onDeck, false)}
    </div>
  );
}

/* --- Upcoming order -------------------------------------------------------- */
export function UpNextList({
  tournament,
  matches,
  limit = 8,
}: {
  tournament: Tournament;
  matches: Match[];
  limit?: number;
}) {
  const upcoming = matches
    .filter((m) => m.status === "waiting" && !isPhantomMatch(m) && m.player1Id && m.player2Id)
    .slice(0, limit);

  if (upcoming.length === 0) return <Empty className="m-3">Nothing queued behind the current matches</Empty>;

  return (
    <ol className="divide-y divide-line">
      {upcoming.map((m, i) => (
        <li key={m.id} className="flex items-center gap-3 px-3.5 py-2">
          <span className="tnum w-5 shrink-0 font-mono text-[10px] text-fg-4">
            {String(i + 3).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate font-display text-[16px] leading-none text-fg-2">
            {matchLine(tournament, m)}
          </span>
          <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-fg-4">
            {getMatchDisplayLabel(m)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* --- Full match control list (Matches tab) --------------------------------- */
export function MatchControlList({
  tournament,
  matches,
  onStart,
  onFinish,
}: {
  tournament: Tournament;
  matches: Match[];
  onStart: (id: string) => void;
  onFinish: (id: string, winnerId: string) => void;
}) {
  const openTable = getOpenTable(tournament.matches, tournament.settings.tableCount);
  const groups: { key: string; label: string; items: Match[] }[] = [
    { key: "live", label: "On the tables", items: matches.filter((m) => m.status === "inProgress") },
    {
      key: "ready",
      label: "Ready to send",
      items: matches.filter((m) => m.status === "nextUp" || m.status === "onDeck"),
    },
    { key: "wait", label: "Waiting on results", items: matches.filter((m) => m.status === "waiting") },
    { key: "done", label: "Completed", items: matches.filter((m) => m.status === "finished") },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) return <Empty className="m-3.5">No matches</Empty>;

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key}>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-line bg-ink-2/95 px-3.5 py-1.5 backdrop-blur-none">
            <span className="eyebrow">{group.label}</span>
            <span className="tnum font-mono text-[10px] text-fg-4">{group.items.length}</span>
          </div>
          <ul className="divide-y divide-line">
            {group.items.map((m) => {
              const done = m.status === "finished";
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 transition-colors hover:bg-panel-2/60"
                >
                  <span className="w-14 shrink-0 font-mono text-[10px] tracking-[0.06em] text-fg-4">
                    {getMatchDisplayLabel(m)}
                  </span>

                  <span className="flex min-w-[190px] flex-1 items-center gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-right font-display text-[17px] leading-none ${
                        done && m.winnerId === m.player1Id ? "text-go" : done ? "text-fg-4" : "text-fg"
                      }`}
                    >
                      {playerNameForSlot(tournament.players, m, 1)}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-fg-4">vs</span>
                    <span
                      className={`min-w-0 flex-1 truncate font-display text-[17px] leading-none ${
                        done && m.winnerId === m.player2Id ? "text-go" : done ? "text-fg-4" : "text-fg"
                      }`}
                    >
                      {playerNameForSlot(tournament.players, m, 2)}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {m.tableNumber ? <Tag tone="live">T{m.tableNumber}</Tag> : null}
                    <StatusChip status={m.status} />
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5">
                    {(m.status === "nextUp" || m.status === "onDeck") && openTable ? (
                      <Btn size="sm" variant="primary" onClick={() => onStart(m.id)}>
                        Send · T{openTable}
                      </Btn>
                    ) : null}
                    {m.status === "inProgress" && m.player1Id ? (
                      <Btn size="sm" variant="outline" onClick={() => onFinish(m.id, m.player1Id!)}>
                        {playerName(tournament.players, m.player1Id)}
                      </Btn>
                    ) : null}
                    {m.status === "inProgress" && m.player2Id ? (
                      <Btn size="sm" variant="outline" onClick={() => onFinish(m.id, m.player2Id!)}>
                        {playerName(tournament.players, m.player2Id)}
                      </Btn>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
