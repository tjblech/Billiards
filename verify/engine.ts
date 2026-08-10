import "./setup";
import {
  applyTournamentToClubStats,
  buildLeaderboard,
  clampTableCount,
  createTournament,
  finishMatch,
  getOpenTable,
  getTournamentChampionIdFromMatches,
  getTournamentRunnerUpIdFromMatches,
  isByeMatch,
  isTournamentFinished,
  loadTournamentLocal,
  playerName,
  saveTournamentLocal,
  startMatch,
  addLatePlayerToBracket,
  renamePlayer,
  type BracketType,
  type ClubStatsMap,
  type Tournament,
} from "../src/lib/tournament";

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fails++;
};
const head = (m: string) => console.log(`\n▸ ${m}`);

const names = (n: number) => Array.from({ length: n }, (_, i) => `Player${i + 1}`).join("\n");

/** Runs a whole tournament: fill every table, always let player1 win. */
function playOut(t: Tournament, maxSteps = 4000) {
  let cur = t;
  let steps = 0;
  while (steps++ < maxSteps) {
    const openT = getOpenTable(cur.matches, cur.settings.tableCount);
    const ready = cur.matches.find((m) => m.status === "nextUp" || m.status === "onDeck");
    if (openT && ready) {
      cur = startMatch(cur, ready.id);
      continue;
    }
    const live = cur.matches.find((m) => m.status === "inProgress");
    if (live) {
      cur = finishMatch(cur, live.id, (live.player1Id ?? live.player2Id)!);
      continue;
    }
    break;
  }
  return { t: cur, steps };
}

for (const [size, bracketType] of [
  [8, "single-elim"],
  [16, "single-elim"],
  [30, "single-elim"],
  [8, "double-elim"],
  [11, "double-elim"],
  [16, "double-elim"],
] as [number, BracketType][]) {
  head(`${size} entrants · ${bracketType}`);
  const t0 = createTournament("Test", names(size), {
    gameType: "8-ball",
    teamMode: "singles",
    bracketType,
    tableCount: 2,
  });
  ok(t0.players.length === size, `bracket built with ${size} players`);
  ok(t0.matches.length > 0, "matches generated");

  const { t, steps } = playOut(t0);
  ok(steps < 4000, `tournament terminates (${steps} steps)`);
  ok(isTournamentFinished(t.matches, bracketType), "engine reports finished");
  ok(t.status === "finished", "tournament status is finished");

  const champId = getTournamentChampionIdFromMatches(t.matches, bracketType);
  ok(Boolean(champId), `champion decided: ${playerName(t.players, champId)}`);
  const runnerId = getTournamentRunnerUpIdFromMatches(t.matches, bracketType);
  ok(Boolean(runnerId) && runnerId !== champId, "runner-up decided and distinct");

  const unresolved = t.matches.filter(
    (m) => !isByeMatch(m) && m.status !== "finished" && m.player1Id && m.player2Id
  );
  ok(unresolved.length === 0, "no playable match left unresolved");

  const board = buildLeaderboard(t);
  ok(board.length === size, "leaderboard covers every entrant");
  ok(board[0].playerId === champId, "champion tops the leaderboard");
  ok(board.filter((r) => r.active).length <= 1, "at most one player still active at the end");

  // Every finished non-bye match must have a winner drawn from its two slots
  const badWinner = t.matches.find(
    (m) => m.status === "finished" && m.winnerId && ![m.player1Id, m.player2Id].includes(m.winnerId)
  );
  ok(!badWinner, "no match awarded to a player who wasn't in it");
}

head("Table count is configurable end to end");
for (const n of [1, 3, 6]) {
  const t = createTournament("T", names(16), {
    gameType: "9-ball",
    teamMode: "singles",
    bracketType: "single-elim",
    tableCount: n,
  });
  let cur = t;
  for (let i = 0; i < n + 2; i++) {
    const openT = getOpenTable(cur.matches, cur.settings.tableCount);
    const ready = cur.matches.find((m) => m.status === "nextUp" || m.status === "onDeck");
    if (openT && ready) cur = startMatch(cur, ready.id);
  }
  const liveCount = cur.matches.filter((m) => m.status === "inProgress").length;
  ok(liveCount === n, `${n} tables → engine fills all ${n} concurrently`);
  ok(getOpenTable(cur.matches, n) === null, `${n} tables → no table left open`);
}
ok(clampTableCount(0) === 2 && clampTableCount(99) === 6 && clampTableCount(undefined) === 2, "table count clamped to a sane range");

head("startedAt stamps the live clock");
{
  const t = createTournament("T", names(8), {
    gameType: "8-ball", teamMode: "singles", bracketType: "single-elim", tableCount: 2,
  });
  const ready = t.matches.find((m) => m.status === "nextUp")!;
  const started = startMatch(t, ready.id);
  const live = started.matches.find((m) => m.id === ready.id)!;
  ok(Boolean(live.startedAt) && !Number.isNaN(Date.parse(live.startedAt!)), "startedAt is a valid ISO timestamp");
  ok(live.tableNumber === 1, "assigned to table 1");
}

head("BUGFIX: club stats save is no longer blocked");
{
  const t = createTournament("Club night", names(8), {
    gameType: "8-ball", teamMode: "singles", bracketType: "single-elim", tableCount: 2,
  }, true);
  const done = playOut(t).t;

  // Simulate a tournament restored from an OLD save, where statsSaved is absent.
  const legacy = JSON.parse(JSON.stringify(done)) as Tournament;
  delete (legacy as Partial<Tournament>).statsSaved;

  const oldGate = (x: Tournament) => !(!x || !x.includeInClubStats || x.statsSaved !== false || x.status !== "finished");
  const newGate = (x: Tournament) => !(!x || !x.includeInClubStats || x.statsSaved === true || x.status !== "finished");

  ok(oldGate(legacy) === false, "old condition silently refused to save a restored tournament (the bug)");
  ok(newGate(legacy) === true, "fixed condition allows the save");
  ok(newGate({ ...legacy, statsSaved: true }) === false, "fixed condition still blocks a double-save");

  const stats = applyTournamentToClubStats(legacy, {} as ClubStatsMap);
  const champ = playerName(legacy.players, getTournamentChampionIdFromMatches(legacy.matches, "single-elim"));
  const entries = Object.values(stats);
  ok(entries.length === 8, "every entrant recorded in club stats");
  ok(entries.some((e) => e.name === champ && e.tournamentWins === 1), `champion credited a title (${champ})`);
  ok(entries.every((e) => e.tournamentsPlayed === 1), "attendance recorded for everyone");
}

head("BUGFIX: old saves are migrated on load");
{
  const legacy = {
    id: "x", name: "Old night", status: "live",
    players: [{ id: "a", name: "A", seed: 1 }, { id: "b", name: "B", seed: 2 }],
    matches: [{ id: "m", round: 1, slot: 0, player1Id: "a", player2Id: "b", winnerId: null,
      status: "nextUp", tableNumber: null, raceTo: 1, bracket: "W" }],
    settings: { gameType: "8-ball", teamMode: "singles", bracketType: "single-elim" }, // no tableCount
    createdAt: new Date().toISOString(),
  };
  globalThis.localStorage.setItem("billiards-github-pages-supabase-ready", JSON.stringify(legacy));
  const loaded = loadTournamentLocal();
  ok(Boolean(loaded), "legacy save still loads");
  ok(loaded!.settings.tableCount === 2, "missing tableCount backfilled to 2");
  ok(loaded!.statsSaved === false, "missing statsSaved backfilled to false");
  ok(getOpenTable(loaded!.matches, loaded!.settings.tableCount) === 1, "open table resolves after migration");
}

head("Round trip through storage");
{
  const t = createTournament("RT", names(8), {
    gameType: "8-ball", teamMode: "singles", bracketType: "double-elim", tableCount: 3,
  });
  saveTournamentLocal(t);
  const back = loadTournamentLocal()!;
  ok(back.matches.length === t.matches.length, "matches survive a save/load round trip");
  ok(back.settings.tableCount === 3, "table count persists");
}

head("Late entry and rename still work");
{
  const t = createTournament("T", names(6), {
    gameType: "8-ball", teamMode: "singles", bracketType: "single-elim", tableCount: 2,
  });
  const late = addLatePlayerToBracket(t, "Latecomer", "bye");
  ok(late.tournament.players.some((p) => p.name === "Latecomer"), `late entry added (${late.message})`);

  const rn = renamePlayer(t, "Player1", "Renamed");
  ok(rn.tournament.players.some((p) => p.name === "Renamed"), "rename applied");
  ok(!rn.tournament.players.some((p) => p.name === "Player1"), "old name gone");
}

console.log(`\n${fails === 0 ? "ALL ENGINE CHECKS PASSED" : `${fails} ENGINE CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
