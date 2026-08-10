// ---------------------------------------------------------------------------
// Tournament engine — pure logic, no React in here.
// Bracket construction, queue ordering, result propagation, stats, storage.
// ---------------------------------------------------------------------------


export type MatchStatus = "waiting" | "onDeck" | "nextUp" | "inProgress" | "finished";
export type ViewMode = "admin" | "public";
export type AdminTab = "dashboard" | "bracket" | "leaderboard";
export type GameType = "8-ball" | "9-ball";
export type TeamMode = "singles" | "doubles";
export type BracketType = "single-elim" | "double-elim";
export type LateEntryMode = "bye" | "unstarted" | "replace-bye-player";
export type PublicTab = "board" | "leaderboard" | "call";
export type BracketStream = "W" | "L" | "GF";
export type MatchSource = {
  matchId: string;
  outcome: "winner" | "loser";
};

export type Player = {
  id: string;
  name: string;
  seed: number;
  isLate?: boolean;
};

export type Match = {
  id: string;
  round: number;
  slot: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: MatchStatus;
  tableNumber: number | null;
  raceTo: number;
  bracket: BracketStream;
  /** ISO timestamp stamped when the match hits a table. Drives the live clock. */
  startedAt?: string | null;
  source1?: MatchSource | null;
  source2?: MatchSource | null;
};

export type TournamentSettings = {
  gameType: GameType;
  teamMode: TeamMode;
  bracketType: BracketType;
  /** How many physical tables the club is running tonight. */
  tableCount: number;
};

export const DEFAULT_TABLE_COUNT = 2;
export const MAX_TABLE_COUNT = 6;

export type Tournament = {
  id: string;
  name: string;
  status: "draft" | "live" | "finished";
  players: Player[];
  matches: Match[];
  settings: TournamentSettings;
  createdAt: string;
  includeInClubStats?: boolean;
  statsSaved?: boolean;
};

export type ClubPlayerStats = {
  name: string;
  totalMatchWins: number;
  tournamentWins: number;
  runnerUpFinishes: number;
  tournamentsPlayed: number;
};

export type ClubStatsMap = Record<string, ClubPlayerStats>;

export const STORAGE_KEY = "billiards-github-pages-supabase-ready";
export const CLUB_STATS_KEY = "billiards-club-stats-v1";

// ===== CLUB PLAYER CONFIG =====
// Edit this list to match your actual club members.
// Format: Name|Alias|Alias = Rating
// Ratings are used only for hidden team balancing and are not shown in the UI.
export const CLUB_PLAYER_RATINGS = `TJ = 8.5
Billy = 8.5
Felipe = 10
Lawrence = 10
Denilo = 8
JP = 9
Noah = 5
Ava = 5
Cole = 6.5
Ewan = 5.5
Jack = 5
Ronald = 8
Luis = 7
Nate = 6
Connor = 6.5
Steven = 6
Adam = 7
Tat = 8.4
Aymane = 7
Pat = 6.5
Zach = 7
Isabelle = 3
Rezkin = 5.5
Teddy = 5
Andrew = 5.4
Dat = 7.5
Brian = 4.5
Cristy = 6
Maddy = 5.7
Hailey = 3`;

export const DEFAULT_TOURNAMENT_NAME = "URI Billiards Club Weekly";

export function getDefaultPlayerListFromRatings(ratingsText: string) {
  const names = ratingsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const namePart = line.split(/\s*(?:=|:|,|\t)\s*/)[0] ?? "";
      return namePart
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean)[0] ?? "";
    })
    .filter(Boolean);

  return names.join("\n");
}

export const DEFAULT_PLAYER_LIST = getDefaultPlayerListFromRatings(CLUB_PLAYER_RATINGS);

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function generateSeedOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  let seeds = [1, 2];
  while (seeds.length < size) {
    const next: number[] = [];
    const total = seeds.length * 2 + 1;
    for (const s of seeds) {
      next.push(s);
      next.push(total - s);
    }
    seeds = next;
  }
  return seeds;
}

/**
 * Club night format is one game per match. Kept as a seam so a future race-to-N
 * format only has to change in here.
 */
export function getRaceTo(_round: number, _totalRounds: number, _gameType: GameType) {
  return 1;
}

export function buildPlayers(rawText: string) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: uid(),
      name,
      seed: index + 1,
    }));
}

export function playerName(players: Player[], id: string | null) {
  if (!id) return "TBD";
  return players.find((p) => p.id === id)?.name ?? "TBD";
}

export function isByeSlot(match: Match, slot: 1 | 2) {
  const currentId = slot === 1 ? match.player1Id : match.player2Id;
  const otherId = slot === 1 ? match.player2Id : match.player1Id;
  return !currentId && !!otherId;
}

/** A bye match has exactly one real player — the other slot is empty. */
export function isByeMatch(match: Match) {
  return (match.player1Id && !match.player2Id) || (!match.player1Id && match.player2Id);
}

export function playerNameForSlot(players: Player[], match: Match, slot: 1 | 2) {
  const currentId = slot === 1 ? match.player1Id : match.player2Id;
  const otherId = slot === 1 ? match.player2Id : match.player1Id;
  if (currentId) return playerName(players, currentId);
  if (otherId) return "— BYE —";
  return "TBD";
}


export function createWinnerBracketMatches(players: Player[], settings: TournamentSettings) {
  if (players.length < 2) return [] as Match[];

  const size = nextPowerOfTwo(players.length);
  const seedOrder = generateSeedOrder(size);
  const slots: (Player | null)[] = Array(size).fill(null);

  players.forEach((player, index) => {
    const seed = index + 1;
    const slotIndex = seedOrder.indexOf(seed);
    if (slotIndex >= 0) slots[slotIndex] = player;
  });

  const totalRounds = Math.log2(size);
  const matches: Match[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const matchCount = size / 2 ** round;
    for (let slot = 0; slot < matchCount; slot++) {
      const match: Match = {
        id: `w-r${round}-m${slot + 1}`,
        bracket: "W",
        round,
        slot,
        player1Id: null,
        player2Id: null,
        winnerId: null,
        status: "waiting",
        tableNumber: null,
        raceTo: getRaceTo(round, totalRounds, settings.gameType),
        source1: null,
        source2: null,
      };

      if (round === 1) {
        const p1 = slots[slot * 2];
        const p2 = slots[slot * 2 + 1];
        match.player1Id = p1?.id ?? null;
        match.player2Id = p2?.id ?? null;
        if (p1 && !p2) match.winnerId = p1.id;
        if (p2 && !p1) match.winnerId = p2.id;
      } else {
        match.source1 = { matchId: `w-r${round - 1}-m${slot * 2 + 1}`, outcome: "winner" };
        match.source2 = { matchId: `w-r${round - 1}-m${slot * 2 + 2}`, outcome: "winner" };
      }

      matches.push(match);
    }
  }

  return matches;
}

export function createSingleElimMatches(players: Player[], settings: TournamentSettings) {
  return propagateBracket(createWinnerBracketMatches(players, settings), "single-elim");
}

export function createDoubleElimMatches(players: Player[], settings: TournamentSettings) {
  const winnerMatches = createWinnerBracketMatches(players, settings);
  if (winnerMatches.length === 0) return [] as Match[];

  const totalWinnerRounds = Math.max(...winnerMatches.map((match) => match.round), 1);
  const losersMatches: Match[] = [];

  if (totalWinnerRounds > 1) {
    const losersRounds = 2 * (totalWinnerRounds - 1);

    for (let round = 1; round <= losersRounds; round++) {
      const stageIndex = Math.ceil(round / 2);
      const matchCount = 2 ** Math.max(totalWinnerRounds - stageIndex - 1, 0);

      for (let slot = 0; slot < matchCount; slot++) {
        const match: Match = {
          id: `l-r${round}-m${slot + 1}`,
          bracket: "L",
          round,
          slot,
          player1Id: null,
          player2Id: null,
          winnerId: null,
          status: "waiting",
          tableNumber: null,
          raceTo: 1,
          source1: null,
          source2: null,
        };

        if (round === 1) {
          match.source1 = { matchId: `w-r1-m${slot * 2 + 1}`, outcome: "loser" };
          match.source2 = { matchId: `w-r1-m${slot * 2 + 2}`, outcome: "loser" };
        } else if (round % 2 === 0) {
          const winnerRoundToPullFrom = round / 2 + 1;
          match.source1 = { matchId: `l-r${round - 1}-m${slot + 1}`, outcome: "winner" };
          match.source2 = { matchId: `w-r${winnerRoundToPullFrom}-m${slot + 1}`, outcome: "loser" };
        } else {
          match.source1 = { matchId: `l-r${round - 1}-m${slot * 2 + 1}`, outcome: "winner" };
          match.source2 = { matchId: `l-r${round - 1}-m${slot * 2 + 2}`, outcome: "winner" };
        }

        losersMatches.push(match);
      }
    }
  }

  const grandFinals: Match[] = [
    {
      id: "gf-1",
      bracket: "GF",
      round: 1,
      slot: 0,
      player1Id: null,
      player2Id: null,
      winnerId: null,
      status: "waiting",
      tableNumber: null,
      raceTo: 1,
      source1: { matchId: `w-r${totalWinnerRounds}-m1`, outcome: "winner" },
      source2: totalWinnerRounds > 1 ? { matchId: `l-r${2 * (totalWinnerRounds - 1)}-m1`, outcome: "winner" } : { matchId: `w-r${totalWinnerRounds}-m1`, outcome: "loser" },
    },
    {
      id: "gf-2",
      bracket: "GF",
      round: 2,
      slot: 0,
      player1Id: null,
      player2Id: null,
      winnerId: null,
      status: "waiting",
      tableNumber: null,
      raceTo: 1,
      source1: { matchId: "gf-1", outcome: "winner" },
      source2: { matchId: "gf-1", outcome: "loser" },
    },
  ];

  return propagateBracket([...winnerMatches, ...losersMatches, ...grandFinals], "double-elim");
}

export function createBracketMatches(players: Player[], settings: TournamentSettings) {
  return settings.bracketType === "double-elim"
    ? createDoubleElimMatches(players, settings)
    : createSingleElimMatches(players, settings);
}

export function getMatchLoserId(match: Match) {
  if (!match.winnerId || !match.player1Id || !match.player2Id) return null;
  return match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
}

export function getMatchOrderValue(match: Match) {
  if (match.bracket === "W") return match.round * 100 + match.slot;
  if (match.bracket === "L") return 1000 + match.round * 100 + match.slot;
  return 2000 + match.round * 100 + match.slot;
}

export function getResolvedSourcePlayer(matchesById: Map<string, Match>, source?: MatchSource | null) {
  if (!source) return null;
  const sourceMatch = matchesById.get(source.matchId);
  if (!sourceMatch) return null;
  return source.outcome === "winner" ? sourceMatch.winnerId ?? null : getMatchLoserId(sourceMatch);
}

/** A match that can never be played because nobody could ever arrive in it. */
export function isVoidMatch(match: Match) {
  return match.status === "finished" && !match.winnerId && !match.player1Id && !match.player2Id;
}

/** Byes and voids are bookkeeping, not games — never show them, never count them. */
export function isPhantomMatch(match: Match) {
  return isByeMatch(match) || isVoidMatch(match);
}

export function propagateBracket(matches: Match[], bracketType: BracketType) {
  const copy = matches.map((match) => ({ ...match }));
  const byId = new Map(copy.map((match) => [match.id, match]));
  const ordered = [...copy].sort((a, b) => getMatchOrderValue(a) - getMatchOrderValue(b));

  const winnerFinal = [...copy]
    .filter((match) => match.bracket === "W")
    .sort((a, b) => b.round - a.round || a.slot - b.slot)[0] ?? null;

  /** A source is settled once its match is done, so we know if it yields anyone. */
  const isSettled = (source?: MatchSource | null) => {
    if (!source) return true;
    const src = byId.get(source.matchId);
    return !src || src.status === "finished";
  };

  const signature = () =>
    copy.map((m) => `${m.id}:${m.player1Id}:${m.player2Id}:${m.winnerId}:${m.status}`).join("|");

  // Resolving a walkover can unblock the match downstream of it, so run the
  // pass until nothing changes rather than relying on a single ordered sweep.
  for (let pass = 0; pass < copy.length + 2; pass += 1) {
    const before = signature();
    runPass();
    if (signature() === before) break;
  }

  return copy;

  function runPass() {
  for (const match of ordered) {
    if (match.source1) match.player1Id = getResolvedSourcePlayer(byId, match.source1);
    if (match.source2) match.player2Id = getResolvedSourcePlayer(byId, match.source2);

    if (match.id === "gf-2" && bracketType === "double-elim") {
      const gf1 = byId.get("gf-1");
      const wbWinnerId = winnerFinal?.winnerId ?? null;
      if (!gf1?.winnerId || !wbWinnerId || gf1.winnerId === wbWinnerId) {
        match.player1Id = null;
        match.player2Id = null;
        match.winnerId = null;
        if (match.status !== "finished") match.status = "waiting";
        match.tableNumber = null;
        continue;
      }
    }

    if (match.status !== "finished" && match.status !== "inProgress") {
      match.winnerId = null;
      match.status = "waiting";
      match.tableNumber = null;
    }

    // Only true first-round winner-bracket byes should auto-advance.
    // Do NOT auto-advance later rounds just because one side is still waiting
    // on an upstream match. That was causing one team to jump all the way
    // to the final before the bracket was actually played.
    const isInitialWinnerBracketBye =
      match.bracket === "W" &&
      match.round === 1 &&
      !match.source1 &&
      !match.source2 &&
      ((match.player1Id && !match.player2Id) || (!match.player1Id && match.player2Id));

    // A sourced match whose upstream results are ALL settled but which still
    // has an empty slot can never be played — a bye upstream produced a winner
    // but no loser. Before this, those matches sat "waiting" forever and every
    // double-elimination bracket with byes (i.e. most of them) deadlocked:
    // the losers final never resolved, so the grand final never filled.
    const hasSources = Boolean(match.source1 || match.source2);
    const upstreamSettled = hasSources && isSettled(match.source1) && isSettled(match.source2);
    const bothEmpty = !match.player1Id && !match.player2Id;
    const oneEmpty = Boolean(match.player1Id) !== Boolean(match.player2Id);

    if (match.status !== "inProgress" && match.status !== "finished") {
      if (isInitialWinnerBracketBye || (upstreamSettled && oneEmpty)) {
        // Walkover: the lone arrival advances.
        match.winnerId = match.player1Id ?? match.player2Id;
        match.status = "finished";
        match.tableNumber = null;
      } else if (upstreamSettled && bothEmpty) {
        // Void: nobody can ever arrive here. Settle it so the next round moves.
        match.winnerId = null;
        match.status = "finished";
        match.tableNumber = null;
      }
    }

    if (!match.player1Id && !match.player2Id && match.status !== "finished" && match.status !== "inProgress") {
      match.status = "waiting";
      match.tableNumber = null;
    }
  }
  }
}

export function getMatchStageDepth(match: Match, matchesById: Map<string, Match>, memo = new Map<string, number>()): number {
  if (memo.has(match.id)) return memo.get(match.id)!;
  const deps = [match.source1?.matchId, match.source2?.matchId]
    .filter(Boolean)
    .map((id) => matchesById.get(id as string))
    .filter((dep): dep is Match => Boolean(dep));
  const depth = deps.length === 0 ? 1 : 1 + Math.max(...deps.map((dep) => getMatchStageDepth(dep, matchesById, memo)));
  memo.set(match.id, depth);
  return depth;
}

export function getBracketPriority(match: Match) {
  // alternate W/L based on round
  if (match.bracket === "GF") return 2;
  return match.round % 2 === 0
    ? (match.bracket === "L" ? 0 : 1)
    : (match.bracket === "W" ? 0 : 1);
}

export function getPlayerLastFinishedRound(matches: Match[], playerId: string | null) {
  if (!playerId) return 0;
  let lastRound = 0;
  for (const match of matches) {
    if (match.status === "finished" && (match.player1Id === playerId || match.player2Id === playerId)) {
      lastRound = Math.max(lastRound, match.round);
    }
  }
  return lastRound;
}

export function getBottomCardOrder(matches: Match[], bracketType?: BracketType) {
  const grandFinals = matches
    .filter((m) => m.bracket === "GF")
    .sort((a, b) => a.round - b.round || a.slot - b.slot);

  // For single elim or no losers bracket, just sort by round+slot
  const hasLosers = matches.some((m) => m.bracket === "L");
  if (bracketType !== "double-elim" || !hasLosers) {
    const nonGF = matches
      .filter((m) => m.bracket !== "GF")
      .sort((a, b) => a.round - b.round || a.slot - b.slot);
    return [...nonGF, ...grandFinals];
  }

  // Double elim: all W-R1 first, then alternate W then L by play order.
  // After W-R1 completes: W-R2 (drops losers into L-R1), then L-R1,
  // then W-R3, then L-R2, L-R3, then W-R4, then L-R4, L-R5, etc.
  // Interleave position: W round r → r-2, L round r → r-1.5
  // This puts W-R2 (0) before L-R1 (-0.5)... adjust so W always comes first within a wave:
  // W round r → (r - 2) * 2       → W2=0, W3=2, W4=4, W5=6
  // L round r → (r - 1) * 2 - 1   → L1=1, L2=3, L3=5, L4=7
  const interleavePos = (m: Match) => {
    if (m.bracket === "W") return (m.round - 2) * 2;
    if (m.bracket === "L") return (m.round - 1) * 2 - 1;
    return Number.MAX_SAFE_INTEGER;
  };

  const roundOneWinners = matches
    .filter((m) => m.bracket === "W" && m.round === 1)
    .sort((a, b) => a.slot - b.slot);

  const remaining = matches
    .filter((m) => !(m.bracket === "W" && m.round === 1) && m.bracket !== "GF")
    .sort((a, b) => {
      const posDiff = interleavePos(a) - interleavePos(b);
      if (posDiff !== 0) return posDiff;
      return a.slot - b.slot;
    });

  return [...roundOneWinners, ...remaining, ...grandFinals];
}

export function applyQueue(matches: Match[], readySlots: number = DEFAULT_TABLE_COUNT): Match[] {
  const copy: Match[] = matches.map((match): Match => ({
    ...match,
    status:
      match.status === "finished"
        ? "finished"
        : match.status === "inProgress"
        ? "inProgress"
        : "waiting",
    tableNumber: match.status === "inProgress" ? match.tableNumber : null,
  }));

  const inProgress = copy.filter((match) => match.status === "inProgress");
  const busyPlayers = new Set(
    inProgress.flatMap((match) => [match.player1Id, match.player2Id]).filter(Boolean)
  );
  const byId = new Map(copy.map((match) => [match.id, match]));
  const depthMemo = new Map<string, number>();

  const ready = copy
    .filter(
      (match) =>
        match.status !== "finished" &&
        match.status !== "inProgress" &&
        match.player1Id &&
        match.player2Id &&
        !busyPlayers.has(match.player1Id) &&
        !busyPlayers.has(match.player2Id)
    )
    .sort((a, b) => {
      const aDepth = getMatchStageDepth(a, byId, depthMemo);
      const bDepth = getMatchStageDepth(b, byId, depthMemo);
      if (aDepth !== bDepth) return aDepth - bDepth;

      const aPriority = getBracketPriority(a);
      const bPriority = getBracketPriority(b);
      if (aPriority !== bPriority) return aPriority - bPriority;

      const aRest = Math.min(
        getPlayerLastFinishedRound(copy, a.player1Id),
        getPlayerLastFinishedRound(copy, a.player2Id)
      );
      const bRest = Math.min(
        getPlayerLastFinishedRound(copy, b.player1Id),
        getPlayerLastFinishedRound(copy, b.player2Id)
      );
      if (aRest !== bRest) return aRest - bRest;

      if (a.round !== b.round) return a.round - b.round;
      return a.slot - b.slot;
    });

  // Ready one match per table (minimum two, so "next up / on deck" always
  // reads correctly) instead of a hard-coded pair — otherwise a club running
  // three or more tables could never fill more than two of them.
  const slots = Math.max(2, clampTableCount(readySlots));
  ready.slice(0, slots).forEach((match, index) => {
    match.status = index === 0 ? "nextUp" : "onDeck";
  });

  return copy;
}

export function clampTableCount(count: number | undefined) {
  return Math.max(1, Math.min(MAX_TABLE_COUNT, Math.round(count || DEFAULT_TABLE_COUNT)));
}

export function getOpenTable(matches: Match[], tableCount: number = DEFAULT_TABLE_COUNT) {
  const used = new Set(
    matches.filter((m) => m.status === "inProgress" && m.tableNumber).map((m) => m.tableNumber)
  );
  const total = clampTableCount(tableCount);
  for (let table = 1; table <= total; table += 1) {
    if (!used.has(table)) return table;
  }
  return null;
}

/** Table numbers to render for a tournament. */
export function getTableNumbers(settings: TournamentSettings) {
  return Array.from({ length: clampTableCount(settings.tableCount) }, (_, i) => i + 1);
}

export function createTournament(name: string, playerText: string, settings: TournamentSettings, includeInClubStats = false): Tournament {
  const players = shuffleArray(buildPlayers(playerText)).map((player, index) => ({ ...player, seed: index + 1 }));
  const matches = applyQueue(createBracketMatches(players, settings), settings.tableCount);
  return {
    id: uid(),
    name,
    status: "live",
    players,
    matches,
    settings,
    createdAt: new Date().toISOString(),
    includeInClubStats,
    statsSaved: false,
  };
}

export function startMatch(tournament: Tournament, matchId: string) {
  const openTable = getOpenTable(tournament.matches, tournament.settings.tableCount);
  if (!openTable) return tournament;

  const matches = tournament.matches.map((m) =>
    m.id === matchId
      ? { ...m, status: "inProgress" as const, tableNumber: openTable, startedAt: new Date().toISOString() }
      : { ...m }
  );

  return { ...tournament, matches: applyQueue(matches, tournament.settings.tableCount) };
}

export function getTournamentChampionIdFromMatches(matches: Match[], bracketType: BracketType) {
  if (bracketType === "single-elim") {
    const finalMatch = [...matches]
      .filter((match) => match.bracket === "W")
      .sort((a, b) => b.round - a.round || a.slot - b.slot)[0];
    return finalMatch?.winnerId ?? null;
  }

  const wbFinal = [...matches]
    .filter((match) => match.bracket === "W")
    .sort((a, b) => b.round - a.round || a.slot - b.slot)[0];
  const gf1 = matches.find((match) => match.id === "gf-1");
  const gf2 = matches.find((match) => match.id === "gf-2");

  if (gf2?.status === "finished" && gf2.winnerId) return gf2.winnerId;
  if (gf1?.status === "finished" && gf1.winnerId && gf1.winnerId === wbFinal?.winnerId) return gf1.winnerId;
  return null;
}

export function getTournamentRunnerUpIdFromMatches(matches: Match[], bracketType: BracketType) {
  if (bracketType === "single-elim") {
    const finalMatch = [...matches]
      .filter((match) => match.bracket === "W")
      .sort((a, b) => b.round - a.round || a.slot - b.slot)[0];
    return finalMatch ? getMatchLoserId(finalMatch) : null;
  }

  const gf2 = matches.find((match) => match.id === "gf-2");
  if (gf2?.status === "finished") return getMatchLoserId(gf2);

  const gf1 = matches.find((match) => match.id === "gf-1");
  if (gf1?.status === "finished") return getMatchLoserId(gf1);

  return null;
}

export function isTournamentFinished(matches: Match[], bracketType: BracketType) {
  return Boolean(getTournamentChampionIdFromMatches(matches, bracketType));
}

export function finishMatch(tournament: Tournament, matchId: string, winnerId: string) {
  const matches = tournament.matches.map((match) => {
    if (match.id !== matchId) return { ...match };
    return {
      ...match,
      winnerId,
      status: "finished" as const,
      tableNumber: null,
    };
  });

  const propagated = propagateBracket(matches, tournament.settings.bracketType);
  const queued = applyQueue(propagated);
  const status = isTournamentFinished(queued, tournament.settings.bracketType) ? "finished" : tournament.status;
  return { ...tournament, matches: queued, status };
}

export function renamePlayer(tournament: Tournament, oldName: string, newName: string): { tournament: Tournament; message: string } {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to) return { tournament, message: "Enter both current and replacement names." };
  const idx = tournament.players.findIndex((p) => p.name.toLowerCase() === from.toLowerCase());
  if (idx === -1) return { tournament, message: "Could not find that current player/team name." };
  const players = tournament.players.map((p, i) => (i === idx ? { ...p, name: to } : p));
  return { tournament: { ...tournament, players }, message: `${from} is now ${to}.` };
}

export function addLatePlayerToBracket(
  tournament: Tournament,
  playerNameInput: string,
  mode: LateEntryMode
): { tournament: Tournament; message: string } {
  const trimmed = playerNameInput.trim();
  if (!trimmed) return { tournament, message: "Enter a player or team name first." };
  if (tournament.settings.teamMode === "doubles" && !trimmed.includes("/")) {
    return { tournament, message: "For doubles, enter a team like ‘Alex / Chris’." };
  }

  const newPlayer: Player = {
    id: uid(),
    name: trimmed,
    seed: tournament.players.length + 1,
    isLate: true,
  };

  const matches = tournament.matches.map((m) => ({ ...m }));

  // Round-one byes are auto-advanced the moment the bracket is built, so they
  // are always status "finished". The old lookup excluded finished matches and
  // therefore never found one — "Fill bye" could not work at all. Accept an
  // auto-advanced bye as long as the player who got it has not started their
  // next match yet.
  const advancedIds = new Set(
    matches
      .filter((m) => m.status === "inProgress" || (m.status === "finished" && m.round > 1))
      .flatMap((m) => [m.player1Id, m.player2Id])
      .filter(Boolean) as string[]
  );

  const exactBye = matches.find(
    (m) =>
      m.round === 1 &&
      m.bracket === "W" &&
      m.status !== "inProgress" &&
      ((m.player1Id && !m.player2Id) || (!m.player1Id && m.player2Id)) &&
      !advancedIds.has((m.player1Id ?? m.player2Id) as string)
  );

  if (mode === "bye" && exactBye) {
    if (!exactBye.player1Id) exactBye.player1Id = newPlayer.id;
    else exactBye.player2Id = newPlayer.id;
    exactBye.winnerId = null;
    exactBye.status = "waiting";
    const rebuilt = applyQueue(propagateBracket(matches, tournament.settings.bracketType), tournament.settings.tableCount);
    return {
      tournament: { ...tournament, players: [...tournament.players, newPlayer], matches: rebuilt },
      message: `${trimmed} inserted into an open bye slot.`,
    };
  }

  const unstartedFullRoundOne = matches.find(
    (m) => m.round === 1 && m.status === "waiting" && m.player1Id && m.player2Id
  );

  if (mode === "replace-bye-player" && unstartedFullRoundOne && tournament.settings.teamMode === "singles") {
    const replacedId = unstartedFullRoundOne.player2Id;
    unstartedFullRoundOne.player2Id = newPlayer.id;
    unstartedFullRoundOne.winnerId = null;
    const players = [...tournament.players, newPlayer].filter((p) => p.id !== replacedId);
    const rebuilt = applyQueue(propagateBracket(matches, tournament.settings.bracketType), tournament.settings.tableCount);
    return {
      tournament: { ...tournament, players, matches: rebuilt },
      message: `${trimmed} replaced ${playerName(tournament.players, replacedId)} in an unstarted match.`,
    };
  }

  const openMatch = matches.find(
    (m) =>
      m.round === 1 &&
      m.status !== "inProgress" &&
      m.status !== "finished" &&
      (!m.player1Id || !m.player2Id)
  );

  if (mode === "unstarted" && openMatch) {
    if (!openMatch.player1Id) openMatch.player1Id = newPlayer.id;
    else openMatch.player2Id = newPlayer.id;
    openMatch.winnerId = null;
    const rebuilt = applyQueue(propagateBracket(matches, tournament.settings.bracketType), tournament.settings.tableCount);
    return {
      tournament: { ...tournament, players: [...tournament.players, newPlayer], matches: rebuilt },
      message: `${trimmed} added to an unstarted round-1 match.`,
    };
  }

  return {
    tournament,
    message: "No clean late-entry move was available. Try replace mode, or edit the bracket setup directly.",
  };
}



export type LeaderboardRow = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  active: boolean;
  placementLabel: string;
  progressRound: number;
};

export function getPlacementLabel(tournament: Tournament, playerId: string) {
  const championId = getTournamentChampionIdFromMatches(tournament.matches, tournament.settings.bracketType);
  const runnerUpId = getTournamentRunnerUpIdFromMatches(tournament.matches, tournament.settings.bracketType);

  if (championId === playerId) return "1st";
  if (runnerUpId === playerId) return "2nd";

  if (tournament.settings.bracketType === "double-elim") {
    const losersFinal = [...tournament.matches]
      .filter((match) => match.bracket === "L")
      .sort((a, b) => b.round - a.round || a.slot - b.slot)[0];
    if (losersFinal?.status === "finished" && getMatchLoserId(losersFinal) === playerId) return "3rd";
    return "—";
  }

  const finalMatch = [...tournament.matches]
    .filter((match) => match.bracket === "W")
    .sort((a, b) => b.round - a.round || a.slot - b.slot)[0];
  if (!finalMatch) return "—";

  const semifinalLosers = tournament.matches
    .filter((match) => match.bracket === "W" && match.round === Math.max(finalMatch.round - 1, 1) && match.status === "finished" && match.winnerId)
    .flatMap((match) => [match.player1Id, match.player2Id].filter((id): id is string => Boolean(id && id !== match.winnerId)));

  if (semifinalLosers.includes(playerId)) return "T-3rd";

  const quarterRound = Math.max(finalMatch.round - 2, 1);
  const quarterLosers = tournament.matches
    .filter((match) => match.bracket === "W" && match.round === quarterRound && match.status === "finished" && match.winnerId)
    .flatMap((match) => [match.player1Id, match.player2Id].filter((id): id is string => Boolean(id && id !== match.winnerId)));

  if (quarterLosers.includes(playerId) && finalMatch.round >= 3) return "T-5th";
  return "—";
}

export function buildLeaderboard(tournament: Tournament): LeaderboardRow[] {
  const championId = getTournamentChampionIdFromMatches(
    tournament.matches,
    tournament.settings.bracketType
  );
  const runnerUpId = getTournamentRunnerUpIdFromMatches(
    tournament.matches,
    tournament.settings.bracketType
  );

  return tournament.players
    .map((player) => {
      let wins = 0;
      let losses = 0;
      let progressRound = 0;

      for (const match of tournament.matches) {
        const involved = match.player1Id === player.id || match.player2Id === player.id;
        if (!involved) continue;
        // A bye is not a win. Counting it inflated both the night's standings
        // and the career club stats.
        const phantom = isPhantomMatch(match);
        progressRound = Math.max(progressRound, match.round + (match.bracket === "L" ? 20 : match.bracket === "GF" ? 40 : 0));
        if (!phantom && match.status === "finished" && match.winnerId) {
          if (match.winnerId === player.id) wins += 1;
          else losses += 1;
        }
      }

      const active =
        tournament.status !== "finished" &&
        tournament.matches.some(
          (match) =>
            match.status !== "finished" &&
            (match.player1Id === player.id || match.player2Id === player.id || match.winnerId === player.id)
        );

      return {
        playerId: player.id,
        name: player.name,
        wins,
        losses,
        active,
        placementLabel: getPlacementLabel(tournament, player.id),
        progressRound,
      };
    })
    .sort((a, b) => {
      // Standings are about how far you got, not how many games you racked up.
      // Sorting on raw wins first put a losers-bracket grinder above the actual
      // champion, because they simply played more matches.
      const rank = (id: string) => (id === championId ? 0 : id === runnerUpId ? 1 : 2);
      const ra = rank(a.playerId);
      const rb = rank(b.playerId);
      if (ra !== rb) return ra - rb;
      if (a.progressRound !== b.progressRound) return b.progressRound - a.progressRound;
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.name.localeCompare(b.name);
    });
}

export function shuffleArray<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type RatingEntry = {
  aliases: string[];
  keys: string[];
  rating: number;
};

export function parseRatingEntries(rawText: string) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let namePart = "";
      let ratingPart = "";

      if (/\s+-\s+[-]?\d/.test(line)) {
        const parts = line.split(/\s+-\s+/);
        if (parts.length >= 2) {
          namePart = parts[0];
          ratingPart = parts.slice(1).join("-");
        }
      }

      if (!namePart) {
        const parts = line.split(/\s*(?:=|:|,|\t)\s*/);
        if (parts.length >= 2) {
          namePart = parts[0];
          ratingPart = parts[1];
        }
      }

      const rating = Number.parseFloat(ratingPart);
      if (!namePart || Number.isNaN(rating)) return null;

      const aliases = namePart
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);

      if (aliases.length === 0) return null;

      return {
        aliases,
        keys: aliases.map((alias) => normalizeNameKey(alias)),
        rating,
      } as RatingEntry;
    })
    .filter((entry): entry is RatingEntry => Boolean(entry));
}

export function lookupPlayerRating(name: string, entries: RatingEntry[], fallbackRating: number) {
  const key = normalizeNameKey(name);
  for (const entry of entries) {
    if (entry.keys.includes(key)) return entry.rating;
  }

  for (const entry of entries) {
    if (entry.keys.some((aliasKey) => aliasKey.includes(key) || key.includes(aliasKey) || aliasKey.startsWith(key) || key.startsWith(aliasKey))) {
      return entry.rating;
    }
  }

  return fallbackRating;
}

export function getConfiguredRatingSummary(ratingsText: string) {
  const entries = parseRatingEntries(ratingsText);
  const uniquePrimaryNames = new Set(
    entries.map((entry) => normalizeNameKey(entry.aliases[0] ?? "")).filter(Boolean)
  );
  const aliasCount = entries.reduce((sum, entry) => sum + Math.max(entry.aliases.length - 1, 0), 0);
  return {
    playerCount: uniquePrimaryNames.size,
    aliasCount,
  };
}

export function buildBalancedRandomTeams(playerText: string, ratingsText: string, lockedTeamsText = "") {
  const rawPlayers = playerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawPlayers.length < 2) {
    return { teams: [] as string[], teamText: "", message: "Enter at least 2 player names first.", sitOut: "" };
  }

  const ratingEntries = parseRatingEntries(ratingsText);
  const knownRatings = ratingEntries.map((entry) => entry.rating);
  const fallbackRating = knownRatings.length > 0 ? knownRatings.reduce((sum, rating) => sum + rating, 0) / knownRatings.length : 5;

  const basePlayers = rawPlayers.map((name) => ({
    name,
    rating: lookupPlayerRating(name, ratingEntries, fallbackRating),
  }));

  const availableByKey = new Map(basePlayers.map((player) => [normalizeNameKey(player.name), player]));
  const lockedTeams = lockedTeamsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("/").map((part) => part.trim()).filter(Boolean))
    .filter((parts) => parts.length === 2)
    .map(([aName, bName]) => {
      const a = availableByKey.get(normalizeNameKey(aName));
      const b = availableByKey.get(normalizeNameKey(bName));
      return a && b && a.name !== b.name ? [a, b] as const : null;
    })
    .filter((team): team is readonly [{ name: string; rating: number }, { name: string; rating: number }] => Boolean(team));

  const lockedPlayerKeys = new Set(lockedTeams.flatMap((team) => team.map((player) => normalizeNameKey(player.name))));
  let workingPlayers = basePlayers.filter((player) => !lockedPlayerKeys.has(normalizeNameKey(player.name)));
  let sitOut = "";

  if (workingPlayers.length % 2 === 1) {
    const sortedForSitOut = [...workingPlayers].sort((a, b) => a.rating - b.rating);
    const sitOutPool = sortedForSitOut.slice(0, Math.max(1, Math.ceil(sortedForSitOut.length / 2)));
    sitOut = sitOutPool[Math.floor(Math.random() * sitOutPool.length)].name;
    workingPlayers = workingPlayers.filter((player) => player.name !== sitOut);
  }

  const teamCount = Math.floor(workingPlayers.length / 2);
  const candidates: { teams: { name: string; rating: number }[][]; score: number }[] = [];

  for (let attempt = 0; attempt < 400; attempt++) {
    const noisySorted = shuffleArray(workingPlayers)
      .map((player) => ({
        ...player,
        noisyRating: player.rating + (Math.random() - 0.5) * 1.35,
      }))
      .sort((a, b) => b.noisyRating - a.noisyRating);

    const teams = lockedTeams.map((team) => [...team]);
    while (teams.length < lockedTeams.length + teamCount) teams.push([] as { name: string; rating: number }[]);
    const teamSums = teams.map((team) => team.reduce((sum, player) => sum + player.rating, 0));

    for (const player of noisySorted) {
      const availableIndexes = teams
        .map((team, index) => ({ index, size: team.length, sum: teamSums[index] }))
        .filter((team) => team.size < 2)
        .sort((a, b) => {
          if (a.size !== b.size) return a.size - b.size;
          return a.sum - b.sum;
        });

      const choicePool = availableIndexes.slice(0, Math.min(2, availableIndexes.length));
      const chosen = choicePool[Math.floor(Math.random() * choicePool.length)]?.index ?? availableIndexes[0].index;
      teams[chosen].push({ name: player.name, rating: player.rating });
      teamSums[chosen] += player.rating;
    }

    const completedTeams = teams.filter((team) => team.length === 2);
    const completedSums = completedTeams.map((team) => team.reduce((sum, player) => sum + player.rating, 0));
    const mean = completedSums.reduce((sum, rating) => sum + rating, 0) / Math.max(completedSums.length, 1);
    const spread = completedSums.reduce((sum, rating) => sum + (rating - mean) ** 2, 0) / Math.max(completedSums.length, 1);
    const teammateGaps = completedTeams.map((team) => Math.abs((team[0]?.rating ?? 0) - (team[1]?.rating ?? 0)));
    const internalMismatch = teammateGaps.reduce((sum, gap) => sum + gap, 0);
    const softGapPenalty = teammateGaps.reduce((sum, gap) => sum + Math.max(0, gap - 3) ** 2, 0);
    const extremeGapPenalty = teammateGaps.reduce((sum, gap) => sum + (gap >= 5 ? 6 + (gap - 5) * 2.5 : 0), 0);
    const lockedGapPenalty = lockedTeams.reduce((sum, team) => sum + Math.max(0, Math.abs(team[0].rating - team[1].rating) - 4), 0);
    const score = spread * 4 + internalMismatch * 0.35 + softGapPenalty * 1.2 + extremeGapPenalty + lockedGapPenalty * 0.35 + Math.random() * 0.45;

    candidates.push({ teams: completedTeams, score });
  }

  candidates.sort((a, b) => a.score - b.score);
  const finalistPool = candidates.slice(0, Math.min(12, candidates.length));
  const chosen = finalistPool[Math.floor(Math.random() * finalistPool.length)] ?? candidates[0];

  const orderedTeams = (chosen?.teams ?? [])
    .map((team) => ({
      players: [...team].sort((a, b) => b.rating - a.rating),
      total: team.reduce((sum, player) => sum + player.rating, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const teams = orderedTeams.map((team) => `${team.players[0]?.name ?? "TBD"} / ${team.players[1]?.name ?? "TBD"}`);

  const knownCount = basePlayers.filter((player) => {
    const key = normalizeNameKey(player.name);
    return ratingEntries.some((entry) => entry.keys.some((aliasKey) => aliasKey === key || aliasKey.includes(key) || key.includes(aliasKey) || aliasKey.startsWith(key) || key.startsWith(aliasKey)));
  }).length;
  const unratedCount = basePlayers.length - knownCount;
  const sitOutMessage = sitOut ? ` ${sitOut} sits this draw out.` : "";
  const unratedMessage = unratedCount > 0 ? ` ${unratedCount} player${unratedCount === 1 ? "" : "s"} used the fallback rating.` : "";
  const lockedMessage = lockedTeams.length > 0 ? ` ${lockedTeams.length} locked team${lockedTeams.length === 1 ? "" : "s"} preserved.` : "";

  return {
    teams,
    teamText: teams.join("\n"),
    message: `Generated ${teams.length} balanced random team${teams.length === 1 ? "" : "s"}.${lockedMessage}${sitOutMessage}${unratedMessage}`.trim(),
    sitOut,
  };
}


export function loadClubStats(): ClubStatsMap {
  try {
    const raw = localStorage.getItem(CLUB_STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveClubStats(stats: ClubStatsMap) {
  localStorage.setItem(CLUB_STATS_KEY, JSON.stringify(stats));
}

export function clubStatsNameKey(name: string) {
  return normalizeNameKey(name);
}

export function tournamentSummaryText(tournament: Tournament, clubStats?: ClubStatsMap) {
  const leaderboard = buildLeaderboard(tournament);
  const championId = getTournamentChampionIdFromMatches(tournament.matches, tournament.settings.bracketType);
  const lines = [
    `${tournament.name}`,
    `${new Date(tournament.createdAt).toLocaleString()}`,
    `${tournament.settings.gameType} · ${tournament.settings.teamMode} · ${tournament.settings.bracketType}`,
    "",
    championId ? `Champion: ${playerName(tournament.players, championId)}` : "Champion: TBD",
    "",
    "Final standings:",
    ...leaderboard.map((row, index) => {
      const career = clubStats?.[clubStatsNameKey(row.name)];
      const careerText = career ? ` | career match wins ${career.totalMatchWins}, titles ${career.tournamentWins}` : "";
      return `${index + 1}. ${row.name} | wins ${row.wins} | losses ${row.losses} | place ${row.placementLabel}${careerText}`;
    }),
    "",
    "Completed matches:",
    ...tournament.matches
      .filter((match) => match.status === "finished")
      .map((match) => `${getMatchDisplayLabel(match)}: ${playerNameForSlot(tournament.players, match, 1)} vs ${playerNameForSlot(tournament.players, match, 2)} — winner ${playerName(tournament.players, match.winnerId)}`),
  ];
  return lines.join("\n");
}

export function applyTournamentToClubStats(tournament: Tournament, existingStats: ClubStatsMap): ClubStatsMap {
  const next = JSON.parse(JSON.stringify(existingStats || {})) as ClubStatsMap;
  const championId = getTournamentChampionIdFromMatches(tournament.matches, tournament.settings.bracketType);
  const runnerUpId = getTournamentRunnerUpIdFromMatches(tournament.matches, tournament.settings.bracketType);

  for (const player of tournament.players) {
    const key = clubStatsNameKey(player.name);
    if (!next[key]) {
      next[key] = {
        name: player.name,
        totalMatchWins: 0,
        tournamentWins: 0,
        runnerUpFinishes: 0,
        tournamentsPlayed: 0,
      };
    }
    next[key].name = player.name;
    next[key].tournamentsPlayed += 1;
  }

  for (const match of tournament.matches) {
    if (match.status !== "finished" || !match.winnerId) continue;
    if (isPhantomMatch(match)) continue; // byes are not career match wins
    const winner = tournament.players.find((player) => player.id === match.winnerId);
    if (!winner) continue;
    const key = clubStatsNameKey(winner.name);
    if (!next[key]) continue;
    next[key].totalMatchWins += 1;
  }

  if (championId) {
    const champion = tournament.players.find((player) => player.id === championId);
    if (champion) next[clubStatsNameKey(champion.name)].tournamentWins += 1;
  }

  if (runnerUpId) {
    const runner = tournament.players.find((player) => player.id === runnerUpId);
    if (runner) next[clubStatsNameKey(runner.name)].runnerUpFinishes += 1;
  }

  return next;
}
export function saveTournamentLocal(tournament: Tournament) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
}

export function loadTournamentLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Tournament>;
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.matches) || !parsed.settings) return null;
    // Backfill fields added after this save was written, so an older saved
    // tournament keeps working instead of half-rendering.
    const settings: TournamentSettings = {
      ...(parsed.settings as TournamentSettings),
      tableCount: clampTableCount((parsed.settings as TournamentSettings).tableCount),
    };
    return {
      ...parsed,
      settings,
      includeInClubStats: parsed.includeInClubStats ?? false,
      statsSaved: parsed.statsSaved ?? false,
    } as Tournament;
  } catch {
    return null;
  }
}

/* --- Display helpers (pure, shared by every view) ------------------------- */

export function getMatchDisplayLabel(match: Match) {
  if (match.bracket === "W") return `W${match.round}-M${match.slot + 1}`;
  if (match.bracket === "L") return `L${match.round}-M${match.slot + 1}`;
  return match.round === 1 ? "GF-1" : "GF-2";
}

export function getRoundTitle(roundNumber: number, matchCount: number, bracket: BracketStream) {
  if (bracket === "GF") return roundNumber === 1 ? "Grand Final" : "Reset Final";
  if (bracket === "L") return `Losers R${roundNumber}`;
  return matchCount === 1 ? "Final" : matchCount === 2 ? "Semifinal" : `Round ${roundNumber}`;
}
