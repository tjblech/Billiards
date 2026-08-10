import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLUB_PLAYER_RATINGS,
  DEFAULT_PLAYER_LIST,
  DEFAULT_TABLE_COUNT,
  DEFAULT_TOURNAMENT_NAME,
  MAX_TABLE_COUNT,
  STORAGE_KEY,
  addLatePlayerToBracket,
  applyTournamentToClubStats,
  buildBalancedRandomTeams,
  clampTableCount,
  createTournament,
  finishMatch,
  getOpenTable,
  getTableNumbers,
  getTournamentChampionIdFromMatches,
  isPhantomMatch,
  loadClubStats,
  loadTournamentLocal,
  nextPowerOfTwo,
  playerName,
  renamePlayer,
  saveClubStats,
  saveTournamentLocal,
  startMatch,
  tournamentSummaryText,
  type AdminTab,
  type BracketType,
  type ClubStatsMap,
  type GameType,
  type LateEntryMode,
  type TeamMode,
  type Tournament,
  type TournamentSettings,
  type ViewMode,
} from "./lib/tournament";

import { BracketBoard } from "./ui/Bracket";
import { MatchControlList, QueueStrip, TableCard, UpNextList } from "./ui/Console";
import { Leaderboard } from "./ui/Leaderboard";
import { PublicEmpty, PublicView } from "./ui/Public";
import {
  Btn,
  CopyBtn,
  EightBall,
  Empty,
  Field,
  IconBtn,
  Modal,
  Note,
  Panel,
  PanelHead,
  Segmented,
  Stat,
  Stepper,
  Tag,
} from "./ui/primitives";

/* ==========================================================================
   Tournament Control — admin shell.
   ========================================================================== */

function publicUrlFor() {
  if (typeof window === "undefined") return "?public=1";
  return `${window.location.origin}${window.location.pathname}?public=1`;
}

function countEntrants(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).length;
}

/* --- Overflow menu ---------------------------------------------------------- */
function Menu({ children, label = "More" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconBtn label={label} onClick={() => setOpen((o) => !o)}>
        <span className="text-[15px] leading-none">⋯</span>
      </IconBtn>
      {open ? (
        <div
          className="anim-rise absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-[3px] border border-line-2 bg-panel"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors disabled:opacity-30 ${
        danger ? "text-live hover:bg-live/10" : "text-fg-2 hover:bg-panel-3 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/* ========================================================================== */

export default function TournamentControl() {
  const [publicOnlyAccess] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.location.hash.includes("public") ||
        new URLSearchParams(window.location.search).has("public"))
  );
  const [mode, setMode] = useState<ViewMode>(() => (publicOnlyAccess ? "public" : "admin"));
  const [adminTab, setAdminTab] = useState<AdminTab>("dashboard");

  // Setup form
  const [name, setName] = useState(DEFAULT_TOURNAMENT_NAME);
  const [playerText, setPlayerText] = useState(DEFAULT_PLAYER_LIST);
  const [gameType, setGameType] = useState<GameType>("8-ball");
  const [teamMode, setTeamMode] = useState<TeamMode>("singles");
  const [bracketType, setBracketType] = useState<BracketType>("single-elim");
  const [tableCount, setTableCount] = useState(DEFAULT_TABLE_COUNT);
  const [includeInClubStats, setIncludeInClubStats] = useState(false);

  // Live state
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [history, setHistory] = useState<Tournament[]>([]);
  const [clubStats, setClubStats] = useState<ClubStatsMap>({});
  const [animatedMatchIds, setAnimatedMatchIds] = useState<string[]>([]);

  // Admin actions
  const [lateOpen, setLateOpen] = useState(false);
  const [lateName, setLateName] = useState("");
  const [lateMode, setLateMode] = useState<LateEntryMode>("bye");
  const [lateMessage, setLateMessage] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState<null | "reset" | "setup">(null);

  // Team maker
  const [teamRatingsText] = useState(CLUB_PLAYER_RATINGS);
  const [generatedTeamsText, setGeneratedTeamsText] = useState("");
  const [lockedTeamsText, setLockedTeamsText] = useState("");
  const [teamMakerMessage, setTeamMakerMessage] = useState("");

  /* --- lifecycle --------------------------------------------------------- */
  useEffect(() => {
    const existing = loadTournamentLocal();
    if (existing) setTournament(existing);
    setClubStats(loadClubStats());
  }, []);

  useEffect(() => {
    if (tournament) saveTournamentLocal(tournament);
  }, [tournament]);

  useEffect(() => {
    const onHash = () => {
      if (publicOnlyAccess) return setMode("public");
      setMode(window.location.hash.includes("public") ? "public" : "admin");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [publicOnlyAccess]);

  // Highlight whatever just moved in the queue.
  useEffect(() => {
    if (!tournament) return;
    const changed = tournament.matches
      .filter((m) => m.status === "nextUp" || m.status === "onDeck" || m.status === "inProgress")
      .map((m) => m.id);
    setAnimatedMatchIds(changed);
    const timer = window.setTimeout(() => setAnimatedMatchIds([]), 1100);
    return () => window.clearTimeout(timer);
  }, [tournament]);

  /* --- derived ----------------------------------------------------------- */
  const allMatches = useMemo(() => tournament?.matches ?? [], [tournament]);
  const nextUp = allMatches.find((m) => m.status === "nextUp");
  const onDeck = allMatches.find((m) => m.status === "onDeck");
  const live = useMemo(
    () => allMatches.filter((m) => m.status === "inProgress"),
    [allMatches]
  );
  const championId = tournament
    ? getTournamentChampionIdFromMatches(tournament.matches, tournament.settings.bracketType)
    : null;
  const champion = tournament && championId ? playerName(tournament.players, championId) : "";
  const openTable = tournament ? getOpenTable(tournament.matches, tournament.settings.tableCount) : null;

  const entrantCount = countEntrants(playerText);
  const drawSize = entrantCount >= 2 ? nextPowerOfTwo(entrantCount) : 0;
  const byeCount = drawSize ? drawSize - entrantCount : 0;

  const played = allMatches.filter((m) => m.status === "finished" && !isPhantomMatch(m)).length;
  const totalReal = allMatches.filter((m) => !isPhantomMatch(m)).length;

  /* --- actions ------------------------------------------------------------ */
  const pushHistory = useCallback(() => {
    setTournament((cur) => {
      if (cur) setHistory((prev) => [...prev.slice(-49), JSON.parse(JSON.stringify(cur))]);
      return cur;
    });
  }, []);

  function handleCreate() {
    const settings: TournamentSettings = {
      gameType,
      teamMode,
      bracketType,
      tableCount: clampTableCount(tableCount),
    };
    setTournament(createTournament(name, playerText, settings, includeInClubStats));
    setHistory([]);
    setLateMessage("");
    setRenameMessage("");
    setAdminTab("dashboard");
    window.location.hash = "admin";
  }

  function handleResetBracket() {
    if (!tournament) return;
    const players = tournament.players.map((p) => p.name).join("\n");
    setTournament(
      createTournament(
        tournament.name || name || DEFAULT_TOURNAMENT_NAME,
        players,
        { ...tournament.settings },
        Boolean(tournament.includeInClubStats)
      )
    );
    setHistory([]);
    setLateMessage("");
    setRenameMessage("");
    setConfirmReset(null);
  }

  function handleBackToSetup() {
    if (tournament) {
      setName(tournament.name);
      setPlayerText(tournament.players.map((p) => p.name).join("\n"));
      setGameType(tournament.settings.gameType);
      setTeamMode(tournament.settings.teamMode);
      setBracketType(tournament.settings.bracketType);
      setTableCount(clampTableCount(tournament.settings.tableCount));
      setIncludeInClubStats(Boolean(tournament.includeInClubStats));
    }
    localStorage.removeItem(STORAGE_KEY);
    setTournament(null);
    setHistory([]);
    setLateMessage("");
    setRenameMessage("");
    setConfirmReset(null);
  }

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      setTournament(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }, []);

  // Ctrl/Cmd+Z undoes the last result — the single most common admin mistake.
  useEffect(() => {
    if (mode !== "admin") return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, handleUndo]);

  function handleExport() {
    if (!tournament) return;
    const blob = new Blob([tournamentSummaryText(tournament, clubStats)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournament.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "tournament"}_results.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleSaveClubStats() {
    // NOTE: previously gated on `statsSaved !== false`, which silently blocked
    // every tournament loaded from an older save (where the flag is undefined).
    if (!tournament) return;
    if (!tournament.includeInClubStats || tournament.statsSaved === true) return;
    if (tournament.status !== "finished") return;
    const next = applyTournamentToClubStats(tournament, clubStats);
    saveClubStats(next);
    setClubStats(next);
    setTournament({ ...tournament, statsSaved: true });
  }

  function goto(target: ViewMode) {
    if (publicOnlyAccess && target === "admin") return;
    window.location.hash = target;
    setMode(target);
  }

  function wrappedStart(matchId: string) {
    if (!tournament) return;
    pushHistory();
    setTournament(startMatch(tournament, matchId));
  }

  function wrappedFinish(matchId: string, winnerId: string) {
    if (!tournament) return;
    pushHistory();
    setTournament(finishMatch(tournament, matchId, winnerId));
  }

  function handleLateAdd() {
    if (!tournament) return;
    pushHistory();
    const result = addLatePlayerToBracket(tournament, lateName, lateMode);
    setTournament(result.tournament);
    setLateMessage(result.message);
    const failed =
      result.message.startsWith("No clean") ||
      result.message.startsWith("For doubles") ||
      result.message.startsWith("Enter ");
    if (!failed) {
      setLateName("");
      setLateOpen(false);
    }
  }

  function handleRename() {
    if (!tournament) return;
    pushHistory();
    const result = renamePlayer(tournament, renameFrom, renameTo);
    setTournament(result.tournament);
    setRenameMessage(result.message);
    const failed = result.message.startsWith("Could not") || result.message.startsWith("Enter ");
    if (!failed) {
      setRenameFrom("");
      setRenameTo("");
      setRenameOpen(false);
    }
  }

  function handleGenerateTeams() {
    const result = buildBalancedRandomTeams(playerText, teamRatingsText, lockedTeamsText);
    setGeneratedTeamsText(result.teamText);
    setTeamMakerMessage(result.message);
  }

  function handleUseGeneratedTeams() {
    if (!generatedTeamsText.trim()) {
      setTeamMakerMessage("Generate teams first.");
      return;
    }
    setPlayerText(generatedTeamsText);
    setTeamMode("doubles");
    setTeamMakerMessage("Teams loaded into the entry list. Mode switched to doubles.");
  }

  /* --- public view -------------------------------------------------------- */
  if (mode === "public") {
    return (
      <div className="app-shell min-h-screen">
        {tournament ? (
          <PublicView
            tournament={tournament}
            clubStats={clubStats}
            animatedMatchIds={animatedMatchIds}
            publicUrl={publicUrlFor()}
            onExit={() => goto("admin")}
            canExit={!publicOnlyAccess}
          />
        ) : (
          <PublicEmpty />
        )}
      </div>
    );
  }

  /* --- admin -------------------------------------------------------------- */
  return (
    <div className="app-shell min-h-screen pb-14">
      {/* ── Command bar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[52px] max-w-[1600px] items-center gap-3 px-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <EightBall size={22} />
            <div className="hidden leading-none sm:block">
              <div className="font-display text-[16px] tracking-[0.01em]">Tournament Control</div>
              <div className="eyebrow mt-[3px] !text-[9px]">Billiards</div>
            </div>
          </div>

          <div className="mx-1 hidden h-6 w-px bg-line md:block" />

          <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
            {tournament ? (
              <>
                <span className="truncate font-display text-[15px] text-fg-2">{tournament.name}</span>
                {live.length ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-live">
                    <i className="dot-live inline-block h-[5px] w-[5px] rounded-full bg-live" />
                    {live.length} live
                  </span>
                ) : null}
                <span className="tnum shrink-0 font-mono text-[10px] text-fg-4">
                  {played}/{totalReal}
                </span>
              </>
            ) : (
              <span className="font-mono text-[11px] text-fg-4">No bracket loaded</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Segmented
              size="sm"
              value={mode}
              onChange={goto}
              options={[
                { value: "admin" as ViewMode, label: "Admin" },
                { value: "public" as ViewMode, label: "Public" },
              ]}
            />
            <IconBtn label="Undo last action (Ctrl+Z)" onClick={handleUndo} disabled={history.length === 0}>
              <span className="text-[13px] leading-none">↺</span>
            </IconBtn>
            <Menu>
              <MenuItem onClick={handleExport} disabled={!tournament}>
                Export results (.txt)
              </MenuItem>
              <MenuItem onClick={() => navigator.clipboard?.writeText(publicUrlFor())} disabled={!tournament}>
                Copy public link
              </MenuItem>
              <MenuItem onClick={() => setLateOpen(true)} disabled={!tournament}>
                Add late entry
              </MenuItem>
              <MenuItem onClick={() => setRenameOpen(true)} disabled={!tournament}>
                Rename player
              </MenuItem>
              <div className="rule my-1" />
              <MenuItem onClick={() => setConfirmReset("reset")} disabled={!tournament} danger>
                Redraw bracket
              </MenuItem>
              <MenuItem onClick={() => setConfirmReset("setup")} disabled={!tournament} danger>
                Back to setup
              </MenuItem>
            </Menu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-3">
        {!tournament ? (
          /* ── Setup ──────────────────────────────────────────────────── */
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Panel ticks>
              <PanelHead
                label="New tournament"
                hint={entrantCount >= 2 ? `${entrantCount} entrants` : "add at least 2"}
              />
              <div className="space-y-4 p-3.5">
                <Field label="Name">
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Game">
                    <Segmented
                      value={gameType}
                      onChange={setGameType}
                      options={[
                        { value: "8-ball" as GameType, label: "8-Ball" },
                        { value: "9-ball" as GameType, label: "9-Ball" },
                      ]}
                      className="w-full"
                    />
                  </Field>
                  <Field label="Format">
                    <Segmented
                      value={teamMode}
                      onChange={setTeamMode}
                      options={[
                        { value: "singles" as TeamMode, label: "Singles" },
                        { value: "doubles" as TeamMode, label: "Doubles" },
                      ]}
                      className="w-full"
                    />
                  </Field>
                  <Field label="Bracket">
                    <Segmented
                      value={bracketType}
                      onChange={setBracketType}
                      options={[
                        { value: "single-elim" as BracketType, label: "Single" },
                        { value: "double-elim" as BracketType, label: "Double" },
                      ]}
                      className="w-full"
                    />
                  </Field>
                  <Field label="Tables" hint={`max ${MAX_TABLE_COUNT}`}>
                    <Stepper value={tableCount} onChange={setTableCount} max={MAX_TABLE_COUNT} />
                  </Field>
                </div>

                <Field
                  label="Entrants"
                  hint={
                    entrantCount >= 2
                      ? `${entrantCount} → draw of ${drawSize}${byeCount ? `, ${byeCount} bye${byeCount > 1 ? "s" : ""}` : ", no byes"}`
                      : "one per line"
                  }
                >
                  <textarea
                    className="input min-h-[300px] font-mono text-[12.5px]"
                    value={playerText}
                    onChange={(e) => setPlayerText(e.target.value)}
                    spellCheck={false}
                  />
                </Field>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-line bg-ink px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={includeInClubStats}
                    onChange={(e) => setIncludeInClubStats(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[#c6ff3d]"
                  />
                  <span className="text-[12.5px] leading-snug">
                    <span className="font-medium text-fg">Count toward club stats</span>
                    <span className="mt-0.5 block text-fg-3">
                      Leave off for practice nights and testing so the career leaderboard stays clean.
                    </span>
                  </span>
                </label>

                <Btn
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handleCreate}
                  disabled={entrantCount < 2}
                >
                  Build bracket
                </Btn>
                {entrantCount < 2 ? (
                  <p className="text-center font-mono text-[10px] text-fg-4">
                    Need at least two entrants
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel ticks className="self-start">
              <PanelHead label="Doubles team maker" hint="balanced + randomised" />
              <div className="space-y-4 p-3.5">
                <p className="text-[12.5px] leading-relaxed text-fg-3">
                  Pairs entrants using the club strength config, with enough randomness that the same
                  teams don't come out every week. Ratings stay private — they're never shown in the UI.
                </p>

                <Field label="Locked pairs" hint="optional">
                  <textarea
                    className="input min-h-[80px] font-mono text-[12px]"
                    value={lockedTeamsText}
                    onChange={(e) => setLockedTeamsText(e.target.value)}
                    placeholder={"One per line\nLawrence / Felipe"}
                    spellCheck={false}
                  />
                </Field>

                <div className="flex flex-wrap gap-2">
                  <Btn variant="primary" onClick={handleGenerateTeams}>
                    Generate
                  </Btn>
                  <Btn variant="outline" onClick={handleUseGeneratedTeams} disabled={!generatedTeamsText}>
                    Use these teams
                  </Btn>
                </div>

                {teamMakerMessage ? <Note tone="ok">{teamMakerMessage}</Note> : null}

                <Field label="Generated teams">
                  <textarea
                    className="input min-h-[170px] font-mono text-[12px]"
                    value={generatedTeamsText}
                    onChange={(e) => setGeneratedTeamsText(e.target.value)}
                    placeholder="Teams appear here"
                    spellCheck={false}
                  />
                </Field>
              </div>
            </Panel>
          </div>
        ) : (
          /* ── Running ────────────────────────────────────────────────── */
          <div className="space-y-3">
            {champion ? (
              <div
                className="accent-l anim-rise flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-go/30 bg-panel px-4 py-3"
                style={{ ["--bar" as string]: "var(--color-go)" }}
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="eyebrow !text-go/70">Champion</span>
                  <span className="font-display text-[38px] leading-none text-go">{champion}</span>
                </div>
                {tournament.includeInClubStats ? (
                  <Btn
                    variant={tournament.statsSaved ? "outline" : "primary"}
                    onClick={handleSaveClubStats}
                    disabled={tournament.status !== "finished" || Boolean(tournament.statsSaved)}
                  >
                    {tournament.statsSaved ? "Saved to club stats" : "Save to club stats"}
                  </Btn>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                value={adminTab}
                onChange={setAdminTab}
                options={[
                  { value: "dashboard" as AdminTab, label: "Floor" },
                  { value: "bracket" as AdminTab, label: "Matches" },
                  { value: "leaderboard" as AdminTab, label: "Standings" },
                ]}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Btn size="sm" variant="outline" onClick={() => setLateOpen(true)}>
                  Late entry
                </Btn>
                <Btn size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
                  Rename
                </Btn>
                <CopyBtn value={publicUrlFor()} label="Public link" size="sm" variant="outline" />
              </div>
            </div>

            {adminTab === "dashboard" ? (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="space-y-3">
                  <Panel flush>
                    <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
                      <Stat label="Entrants" value={tournament.players.length} />
                      <Stat label="Played" value={`${played}/${totalReal}`} />
                      <Stat
                        label="Open table"
                        value={openTable ? `T${openTable}` : "None"}
                        accent={Boolean(openTable)}
                      />
                      <Stat
                        label="Format"
                        value={tournament.settings.bracketType === "double-elim" ? "Double" : "Single"}
                      />
                    </div>
                  </Panel>

                  <div
                    className="grid gap-2.5"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
                  >
                    {getTableNumbers(tournament.settings).map((n) => {
                      const liveHere = live.find((m) => m.tableNumber === n);
                      // Only the genuinely-open table offers the send button, so
                      // two open tables can't both claim the same next match.
                      const candidate = !liveHere && openTable === n ? nextUp ?? onDeck : undefined;
                      return (
                        <TableCard
                          key={n}
                          tournament={tournament}
                          tableNumber={n}
                          live={liveHere}
                          candidate={candidate}
                          admin
                          onStart={wrappedStart}
                          onFinish={wrappedFinish}
                        />
                      );
                    })}
                  </div>

                  <QueueStrip tournament={tournament} nextUp={nextUp} onDeck={onDeck} />

                  <Panel flush>
                    <PanelHead label="Then" hint="queue order" />
                    <UpNextList tournament={tournament} matches={allMatches} />
                  </Panel>
                </div>

                <Panel flush className="self-start overflow-hidden">
                  <PanelHead label="Bracket" hint={tournament.settings.gameType} />
                  <BracketBoard
                    tournament={tournament}
                    animatedMatchIds={animatedMatchIds}
                    minHeight={300}
                    maxHeight={700}
                  />
                </Panel>
              </div>
            ) : adminTab === "bracket" ? (
              <div className="space-y-3">
                <Panel flush>
                  <PanelHead
                    label="Bracket"
                    hint={tournament.settings.bracketType === "double-elim" ? "double elimination" : "single elimination"}
                  />
                  <BracketBoard
                    tournament={tournament}
                    animatedMatchIds={animatedMatchIds}
                    minHeight={340}
                    maxHeight={860}
                  />
                </Panel>
                <Panel flush>
                  <PanelHead label="Match control" hint="report results here" />
                  <MatchControlList
                    tournament={tournament}
                    matches={allMatches.filter((m) => !isPhantomMatch(m) && (m.player1Id || m.player2Id))}
                    onStart={wrappedStart}
                    onFinish={wrappedFinish}
                  />
                </Panel>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <Panel flush>
                  <PanelHead label="Standings" hint={`${tournament.players.length} entrants`} />
                  <Leaderboard tournament={tournament} clubStats={clubStats} />
                </Panel>
                <Panel flush className="self-start">
                  <PanelHead label="Summary" />
                  <div className="divide-y divide-line">
                    {[
                      ["Tournament", tournament.name],
                      ["Champion", champion || "Undecided"],
                      ["Entrants", String(tournament.players.length)],
                      ["Matches played", `${played} of ${totalReal}`],
                      [
                        "Next up",
                        nextUp
                          ? `${playerName(tournament.players, nextUp.player1Id)} vs ${playerName(
                              tournament.players,
                              nextUp.player2Id
                            )}`
                          : "Waiting",
                      ],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                        <span className="eyebrow shrink-0">{k}</span>
                        <span className="truncate text-right font-display text-[16px] leading-none">
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-line p-3">
                    <Btn variant="outline" size="sm" className="w-full" onClick={handleExport}>
                      Export results
                    </Btn>
                  </div>
                </Panel>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <Modal open={lateOpen} onClose={() => setLateOpen(false)} title="Late entry">
        <div className="space-y-3.5">
          <Field label="Name" hint={tournament?.settings.teamMode === "doubles" ? "team or A / B" : undefined}>
            <input
              className="input"
              value={lateName}
              onChange={(e) => setLateName(e.target.value)}
              placeholder={
                tournament?.settings.teamMode === "doubles" ? "Player A / Player B" : "Late player name"
              }
              autoFocus
            />
          </Field>
          <Field label="Placement">
            <Segmented
              value={lateMode}
              onChange={setLateMode}
              options={[
                { value: "bye" as LateEntryMode, label: "Fill bye" },
                { value: "unstarted" as LateEntryMode, label: "Open slot" },
                { value: "replace-bye-player" as LateEntryMode, label: "Replace" },
              ]}
              className="w-full"
            />
          </Field>
          <p className="text-[11.5px] leading-relaxed text-fg-3">
            <b className="text-fg-2">Fill bye</b> drops them into a free bye slot ·{" "}
            <b className="text-fg-2">Open slot</b> uses any unstarted match ·{" "}
            <b className="text-fg-2">Replace</b> takes over a player who advanced on a bye.
          </p>
          {lateMessage ? (
            <Note
              tone={
                lateMessage.startsWith("No clean") ||
                lateMessage.startsWith("For doubles") ||
                lateMessage.startsWith("Enter ")
                  ? "warn"
                  : "ok"
              }
            >
              {lateMessage}
            </Note>
          ) : null}
          <Btn variant="primary" className="w-full" onClick={handleLateAdd}>
            Add entry
          </Btn>
        </div>
      </Modal>

      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename or replace">
        <div className="space-y-3.5">
          <Field label="Current name">
            <input
              className="input"
              value={renameFrom}
              onChange={(e) => setRenameFrom(e.target.value)}
              placeholder="Who is in the bracket now"
              autoFocus
            />
          </Field>
          <Field label="New name">
            <input
              className="input"
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              placeholder="Who it should be"
            />
          </Field>
          {renameMessage ? (
            <Note
              tone={
                renameMessage.startsWith("Could not") || renameMessage.startsWith("Enter ")
                  ? "warn"
                  : "ok"
              }
            >
              {renameMessage}
            </Note>
          ) : null}
          <Btn variant="primary" className="w-full" onClick={handleRename}>
            Apply
          </Btn>
        </div>
      </Modal>

      <Modal
        open={confirmReset !== null}
        onClose={() => setConfirmReset(null)}
        title={confirmReset === "setup" ? "Back to setup" : "Redraw bracket"}
        width={400}
      >
        <p className="text-[13px] leading-relaxed text-fg-2">
          {confirmReset === "setup"
            ? "This clears the saved tournament on this device and returns to the setup screen. Results that haven't been exported or saved to club stats will be lost."
            : "This rebuilds the bracket from the same entrants with a fresh random draw. Every result so far is discarded."}
        </p>
        <div className="mt-4 flex gap-2">
          <Btn variant="outline" className="flex-1" onClick={() => setConfirmReset(null)}>
            Cancel
          </Btn>
          <Btn
            variant="live"
            className="flex-1"
            onClick={confirmReset === "setup" ? handleBackToSetup : handleResetBracket}
          >
            {confirmReset === "setup" ? "Clear and exit" : "Redraw"}
          </Btn>
        </div>
      </Modal>

      {/* Status bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-ink/95 backdrop-blur-sm">
        <div className="mx-auto flex h-8 max-w-[1600px] items-center gap-4 px-3 font-mono text-[10px] text-fg-4">
          <span className="tracking-[0.08em] uppercase">
            {tournament ? "Bracket loaded" : "Idle"}
          </span>
          {tournament ? (
            <>
              <span className="hidden sm:inline">
                {tournament.settings.gameType} · {tournament.settings.teamMode} ·{" "}
                {getTableNumbers(tournament.settings).length} tables
              </span>
              <span className="ml-auto hidden items-center gap-3 md:flex">
                <span>⌘Z undo</span>
                <span>{history.length} undo steps</span>
              </span>
            </>
          ) : (
            <span className="ml-auto hidden md:inline">Saved locally in this browser</span>
          )}
        </div>
      </footer>
    </div>
  );
}
