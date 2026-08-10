import "./setup";
import {
  applyTournamentToClubStats, buildLeaderboard, createTournament, finishMatch, getOpenTable,
  getTournamentChampionIdFromMatches, isPhantomMatch, isVoidMatch, isByeMatch, playerName,
  startMatch, isTournamentFinished, type BracketType, type ClubStatsMap, type Tournament,
} from "../src/lib/tournament";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log(`  FAIL  ${m}`); } };
const names = (n: number) => Array.from({length:n},(_,i)=>`P${i+1}`).join("\n");

function playOut(t: Tournament, pickSecond = false) {
  let c = t;
  for (let i = 0; i < 6000; i++) {
    const open = getOpenTable(c.matches, c.settings.tableCount);
    const ready = c.matches.find(m => m.status === "nextUp" || m.status === "onDeck");
    if (open && ready) { c = startMatch(c, ready.id); continue; }
    const live = c.matches.find(m => m.status === "inProgress");
    if (live) {
      const w = pickSecond ? (live.player2Id ?? live.player1Id) : (live.player1Id ?? live.player2Id);
      c = finishMatch(c, live.id, w!); continue;
    }
    break;
  }
  return c;
}

console.log("▸ Sweep: entrant counts 2–24 × both formats × 1–4 tables × two winner strategies");
for (const bracketType of ["single-elim","double-elim"] as BracketType[]) {
  for (let n = 2; n <= 24; n++) {
    for (const tables of [1, 2, 3, 4]) {
      for (const pickSecond of [false, true]) {
        const label = `${n}p ${bracketType} ${tables}t ${pickSecond ? "p2" : "p1"}`;
        const t0 = createTournament("S", names(n), {
          gameType: "8-ball", teamMode: "singles", bracketType, tableCount: tables,
        });
        const t = playOut(t0, pickSecond);

        ok(isTournamentFinished(t.matches, bracketType), `${label}: reaches a finished state`);
        const champ = getTournamentChampionIdFromMatches(t.matches, bracketType);
        ok(Boolean(champ), `${label}: champion decided`);

        // The reset final is correctly never played when the winners-bracket
        // player takes GF-1, so an empty gf-2 is expected, not stuck.
        const stuck = t.matches.filter(
          m => m.status !== "finished" && !(m.id === "gf-2" && !m.player1Id && !m.player2Id)
        );
        ok(stuck.length === 0, `${label}: no match left unfinished (${stuck.map(m=>m.id).join(",")})`);
        const resetFinal = t.matches.find(m => m.id === "gf-2");
        if (resetFinal && resetFinal.status !== "finished") {
          ok(!resetFinal.player1Id && !resetFinal.player2Id, `${label}: unplayed reset final holds no players`);
        }

        const board = buildLeaderboard(t);
        ok(board.length === n, `${label}: leaderboard covers all entrants`);
        ok(board[0].playerId === champ, `${label}: champion ranked first`);
        ok(board[0].placementLabel === "1st", `${label}: champion labelled 1st`);

        // Byes must never be credited as wins.
        const totalRealWins = t.matches.filter(m => !isPhantomMatch(m) && m.winnerId).length;
        const boardWins = board.reduce((a, r) => a + r.wins, 0);
        ok(boardWins === totalRealWins, `${label}: standings wins (${boardWins}) match real games (${totalRealWins})`);

        // Nobody can have more losses than the format allows.
        const maxLosses = bracketType === "double-elim" ? 2 : 1;
        const overLost = board.filter(r => r.losses > maxLosses);
        ok(overLost.length === 0, `${label}: nobody exceeds ${maxLosses} loss(es) — ${overLost.map(r=>`${r.name}:${r.losses}`).join(",")}`);

        // Champion must not have been eliminated.
        ok((board[0].losses ?? 0) <= maxLosses - 1 || bracketType === "double-elim",
           `${label}: champion loss count sane`);

        // Club stats must agree with the board.
        const stats = applyTournamentToClubStats(t, {} as ClubStatsMap);
        const statWins = Object.values(stats).reduce((a, s) => a + s.totalMatchWins, 0);
        ok(statWins === totalRealWins, `${label}: club stat wins match real games`);
        ok(Object.values(stats).filter(s => s.tournamentWins === 1).length === 1,
           `${label}: exactly one title awarded`);
      }
    }
  }
}
console.log(fails === 0 ? "  all sweep assertions passed" : `  ${fails} assertion(s) failed`);

console.log("\n▸ Deadlock invariant (the double-elimination bug)");
{
  // The bug: a losers-bracket match whose upstream results are all settled but
  // which never received two players sat "waiting" forever, freezing the event.
  const settled = (t: Tournament, id?: string) =>
    !id || (t.matches.find(m => m.id === id)?.status === "finished");

  const deadlocked = (t: Tournament) =>
    t.matches.filter(m => {
      if (m.status === "finished" || m.status === "inProgress") return false;
      if (m.id === "gf-2") return false; // conditional by design
      const hasSources = Boolean(m.source1 || m.source2);
      if (!hasSources) return false;
      const upstreamDone = settled(t, m.source1?.matchId) && settled(t, m.source2?.matchId);
      const bothPresent = Boolean(m.player1Id && m.player2Id);
      return upstreamDone && !bothPresent;
    });

  for (const n of [3, 5, 6, 7, 9, 11, 13, 17, 23]) {
    const fresh = createTournament("B", names(n), {
      gameType: "8-ball", teamMode: "singles", bracketType: "double-elim", tableCount: 2,
    });
    ok(deadlocked(fresh).length === 0, `${n}p double-elim: no deadlocked match at build time`);
    const finished = playOut(fresh);
    ok(deadlocked(finished).length === 0, `${n}p double-elim: no deadlocked match after play`);

    const wByes = fresh.matches.filter(m => m.bracket === "W" && m.round === 1 && isByeMatch(m)).length;
    const expected = (1 << Math.ceil(Math.log2(n))) - n;
    ok(wByes === expected, `${n}p: ${expected} first-round byes (got ${wByes})`);
    ok(fresh.matches.filter(m => m.bracket === "W" && m.round === 1 && isByeMatch(m))
        .every(m => m.status === "finished"), `${n}p: first-round byes auto-advanced`);
  }

  // Voids only ever appear where nobody could arrive.
  const t11 = createTournament("V", names(11), {
    gameType: "8-ball", teamMode: "singles", bracketType: "double-elim", tableCount: 2 });
  ok(t11.matches.filter(isVoidMatch).every(m => m.bracket === "L"),
     "void matches only occur in the losers bracket");
  ok(t11.matches.filter(m => isPhantomMatch(m) && m.status === "finished").length > 0,
     "phantom matches are settled rather than left hanging");
}

console.log(`\n${fails === 0 ? "ALL SWEEP CHECKS PASSED" : `${fails} SWEEP CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
