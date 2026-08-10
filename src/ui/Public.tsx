import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTableNumbers,
  getTournamentChampionIdFromMatches,
  playerName,
  type ClubStatsMap,
  type Match,
  type PublicTab,
  type Tournament,
} from "../lib/tournament";
import { BracketBoard } from "./Bracket";
import { Leaderboard } from "./Leaderboard";
import { QueueStrip, TableCard } from "./Console";
import { Btn, CopyBtn, EightBall, Empty, Panel, PanelHead, Segmented, Tag } from "./primitives";

/* ==========================================================================
   Public display.
   One component, two jobs:
     • On a TV it must be readable from across a pool hall — so type is set in
       vw-clamped units and the "call to table" panel gets the whole screen.
     • On a phone the first question is always "am I up?" — so that answer is
       pinned to the top before anything else.
   ========================================================================== */

function useFullscreen() {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const on = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  return { isFs, toggle };
}

/* --- Call to table (the TV screen) ----------------------------------------- */
function CallToTable({
  tournament,
  tv,
}: {
  tournament: Tournament;
  tv: boolean;
}) {
  const tables = getTableNumbers(tournament.settings);
  const live = tournament.matches.filter((m) => m.status === "inProgress");
  const nextUp = tournament.matches.find((m) => m.status === "nextUp");
  const onDeck = tournament.matches.find((m) => m.status === "onDeck");

  return (
    <div className="space-y-3">
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${tv ? 420 : 260}px, 1fr))` }}
      >
        {tables.map((n) => (
          <TableCard
            key={n}
            tournament={tournament}
            tableNumber={n}
            live={live.find((m) => m.tableNumber === n)}
            admin={false}
            size={tv ? "tv" : "md"}
          />
        ))}
      </div>
      <QueueStrip tournament={tournament} nextUp={nextUp} onDeck={onDeck} size={tv ? "tv" : "md"} />
    </div>
  );
}

/* --- Phone-first "are you up?" banner --------------------------------------- */
function YouAreUpBanner({ tournament }: { tournament: Tournament }) {
  const nextUp = tournament.matches.find((m) => m.status === "nextUp");
  const live = tournament.matches.filter((m) => m.status === "inProgress");

  if (live.length === 0 && !nextUp) return null;

  return (
    <div className="lg:hidden">
      {live.map((m) => (
        <div
          key={m.id}
          className="accent-l mb-2 rounded-[3px] border border-live/35 bg-panel px-3 py-2.5"
          style={{ ["--bar" as string]: "var(--color-live)" }}
        >
          <div className="flex items-center gap-2">
            <span className="dot-live inline-block h-[6px] w-[6px] rounded-full bg-live" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-live">
              Now on Table {m.tableNumber}
            </span>
          </div>
          <div className="mt-1.5 font-display text-[26px] leading-none">
            {playerName(tournament.players, m.player1Id)} vs {playerName(tournament.players, m.player2Id)}
          </div>
        </div>
      ))}
      {nextUp ? (
        <div
          className="accent-l relative mb-2 overflow-hidden rounded-[3px] border border-go/35 bg-panel px-3 py-2.5"
          style={{ ["--bar" as string]: "var(--color-go)" }}
        >
          <span className="sweep pointer-events-none absolute inset-0" />
          <div className="eyebrow !text-go/70">You're up next</div>
          <div className="mt-1.5 font-display text-[26px] leading-none text-go">
            {playerName(tournament.players, nextUp.player1Id)} vs{" "}
            {playerName(tournament.players, nextUp.player2Id)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* --- Public shell ----------------------------------------------------------- */
export function PublicView({
  tournament,
  clubStats = {},
  animatedMatchIds = [],
  publicUrl,
  onExit,
  canExit,
}: {
  tournament: Tournament;
  clubStats?: ClubStatsMap;
  animatedMatchIds?: string[];
  publicUrl: string;
  onExit?: () => void;
  canExit: boolean;
}) {
  const [tab, setTab] = useState<PublicTab>("call");
  const [tv, setTv] = useState(false);
  const [rotate, setRotate] = useState(false);
  const { isFs, toggle } = useFullscreen();

  // TV mode auto-rotates the panels so a wall screen stays useful unattended.
  useEffect(() => {
    if (!rotate) return;
    const order: PublicTab[] = ["call", "board", "leaderboard"];
    const id = window.setInterval(() => {
      setTab((cur) => order[(order.indexOf(cur) + 1) % order.length]);
    }, 15000);
    return () => window.clearInterval(id);
  }, [rotate]);

  const championId = getTournamentChampionIdFromMatches(
    tournament.matches,
    tournament.settings.bracketType
  );
  const champion = championId ? playerName(tournament.players, championId) : "";
  const remaining = useMemo(
    () => tournament.matches.filter((m: Match) => m.status !== "finished" && !m.winnerId).length,
    [tournament]
  );

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=08080a&color=ececed&qzone=1&data=${encodeURIComponent(
    publicUrl
  )}`;

  return (
    <div className={`kiosk mx-auto w-full ${tv ? "max-w-[2200px] px-3" : "max-w-[1400px] px-3"} py-3`}>
      {/* Slim public header */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <EightBall size={tv ? 30 : 22} />
          <div className="min-w-0">
            <h1
              className={`truncate font-display leading-none ${tv ? "text-[30px]" : "text-[21px]"}`}
            >
              {tournament.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Tag tone="outline">{tournament.settings.gameType}</Tag>
              <Tag tone="outline">{tournament.settings.teamMode}</Tag>
              <Tag tone="outline">
                {tournament.settings.bracketType === "double-elim" ? "double elim" : "single elim"}
              </Tag>
              {champion ? <Tag tone="go">Champion · {champion}</Tag> : <Tag tone="muted">{remaining} left</Tag>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "call", label: "Tables" },
              { value: "board", label: "Bracket" },
              { value: "leaderboard", label: "Standings" },
            ]}
          />
          <Btn size="sm" variant={tv ? "primary" : "outline"} onClick={() => setTv((v) => !v)}>
            TV
          </Btn>
          {tv ? (
            <Btn size="sm" variant={rotate ? "primary" : "outline"} onClick={() => setRotate((r) => !r)}>
              Auto
            </Btn>
          ) : null}
          <Btn size="sm" variant="outline" onClick={toggle}>
            {isFs ? "Exit" : "Full"}
          </Btn>
          {canExit && onExit ? (
            <Btn size="sm" variant="bare" onClick={onExit}>
              Admin
            </Btn>
          ) : null}
        </div>
      </header>

      {champion ? (
        <div
          className="accent-l mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[3px] border border-go/30 bg-panel px-4 py-3"
          style={{ ["--bar" as string]: "var(--color-go)" }}
        >
          <span className="eyebrow !text-go/70">Champion</span>
          <span className={`font-display leading-none text-go ${tv ? "text-[64px]" : "text-[34px]"}`}>
            {champion}
          </span>
        </div>
      ) : null}

      <YouAreUpBanner tournament={tournament} />

      {tab === "call" ? (
        <CallToTable tournament={tournament} tv={tv} />
      ) : tab === "board" ? (
        <Panel flush>
          <BracketBoard
            tournament={tournament}
            animatedMatchIds={animatedMatchIds}
            minHeight={tv ? 620 : 380}
            maxHeight={tv ? undefined : 760}
          />
        </Panel>
      ) : (
        <Panel flush>
          <PanelHead label="Standings" hint={`${tournament.players.length} entrants`} />
          <Leaderboard tournament={tournament} clubStats={clubStats} />
        </Panel>
      )}

      {/* Share strip — hidden on TV, it's for people holding phones */}
      {!tv ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-line bg-panel px-3.5 py-3">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Share this board</div>
            <div className="truncate font-mono text-[11px] text-fg-3">{publicUrl}</div>
            <div className="mt-2">
              <CopyBtn value={publicUrl} label="Copy link" size="xs" variant="outline" />
            </div>
          </div>
          <img
            src={qr}
            alt="QR code linking to this public board"
            width={84}
            height={84}
            className="shrink-0 rounded-[3px] border border-line"
          />
        </div>
      ) : null}
    </div>
  );
}

/* --- Nothing loaded yet ------------------------------------------------------ */
export function PublicEmpty() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <EightBall size={40} />
      <h1 className="mt-4 font-display text-[30px] leading-none">No live tournament</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-fg-3">
        Nothing is running on this device yet. The board fills in as soon as the tournament director
        builds a bracket.
      </p>
      <Empty className="mt-5 w-full">Waiting for the director</Empty>
    </div>
  );
}
