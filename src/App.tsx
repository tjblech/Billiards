import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  Table2,
  Play,
  CheckCircle2,
  RefreshCw,
  Globe,
  Shield,
  Wifi,
  ArrowLeft,
  Undo2,
  UserPlus,
  AlertTriangle,
  Swords,
  Crown,
  Pencil,
  LayoutDashboard,
  BarChart3,
  Medal,
  QrCode,
  Download,
  Save,
  Copy,
} from "lucide-react";

type MatchStatus = "waiting" | "onDeck" | "nextUp" | "inProgress" | "finished";
type ViewMode = "admin" | "public";
type AdminTab = "dashboard" | "bracket" | "leaderboard";
type GameType = "8-ball" | "9-ball";
type TeamMode = "singles" | "doubles";
type BracketType = "single-elim" | "double-elim";
type LateEntryMode = "bye" | "unstarted" | "replace-bye-player";
type PublicTab = "board" | "leaderboard" | "call";
type BracketStream = "W" | "L" | "GF";
type MatchSource = {
  matchId: string;
  outcome: "winner" | "loser";
};

type Player = {
  id: string;
  name: string;
  seed: number;
  isLate?: boolean;
};

type Match = {
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
  source1?: MatchSource | null;
  source2?: MatchSource | null;
};

type TournamentSettings = {
  gameType: GameType;
  teamMode: TeamMode;
  bracketType: BracketType;
};

type Tournament = {
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

type ClubPlayerStats = {
  name: string;
  totalMatchWins: number;
  tournamentWins: number;
  runnerUpFinishes: number;
  tournamentsPlayed: number;
};

type ClubStatsMap = Record<string, ClubPlayerStats>;

const STORAGE_KEY = "billiards-github-pages-supabase-ready";
const CLUB_STATS_KEY = "billiards-club-stats-v1";

// ===== CLUB PLAYER CONFIG =====
// Edit this list to match your actual club members.
// Format: Name|Alias|Alias = Rating
// Ratings are used only for hidden team balancing and are not shown in the UI.
const CLUB_PLAYER_RATINGS = `TJ = 8.5
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

const DEFAULT_TOURNAMENT_NAME = "URI Billiards Club Weekly";

function getDefaultPlayerListFromRatings(ratingsText: string) {
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

const DEFAULT_PLAYER_LIST = getDefaultPlayerListFromRatings(CLUB_PLAYER_RATINGS);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function generateSeedOrder(size: number): number[] {
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

function getRaceTo(round: number, totalRounds: number, gameType: GameType) {
  return 1;
}

function buildPlayers(rawText: string) {
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

function playerName(players: Player[], id: string | null) {
  if (!id) return "TBD";
  return players.find((p) => p.id === id)?.name ?? "TBD";
}

function playerNameForSlot(players: Player[], match: Match, slot: 1 | 2) {
  const currentId = slot === 1 ? match.player1Id : match.player2Id;
  const otherId = slot === 1 ? match.player2Id : match.player1Id;
  if (currentId) return playerName(players, currentId);
  if (otherId) return "Bye Round";
  return "TBD";
}


function createWinnerBracketMatches(players: Player[], settings: TournamentSettings) {
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

function createSingleElimMatches(players: Player[], settings: TournamentSettings) {
  return propagateBracket(createWinnerBracketMatches(players, settings), "single-elim");
}

function createDoubleElimMatches(players: Player[], settings: TournamentSettings) {
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

function createBracketMatches(players: Player[], settings: TournamentSettings) {
  return settings.bracketType === "double-elim"
    ? createDoubleElimMatches(players, settings)
    : createSingleElimMatches(players, settings);
}

function getMatchLoserId(match: Match) {
  if (!match.winnerId || !match.player1Id || !match.player2Id) return null;
  return match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
}

function getMatchOrderValue(match: Match) {
  if (match.bracket === "W") return match.round * 100 + match.slot;
  if (match.bracket === "L") return 1000 + match.round * 100 + match.slot;
  return 2000 + match.round * 100 + match.slot;
}

function getResolvedSourcePlayer(matchesById: Map<string, Match>, source?: MatchSource | null) {
  if (!source) return null;
  const sourceMatch = matchesById.get(source.matchId);
  if (!sourceMatch) return null;
  return source.outcome === "winner" ? sourceMatch.winnerId ?? null : getMatchLoserId(sourceMatch);
}

function propagateBracket(matches: Match[], bracketType: BracketType) {
  const copy = matches.map((match) => ({ ...match }));
  const byId = new Map(copy.map((match) => [match.id, match]));
  const ordered = [...copy].sort((a, b) => getMatchOrderValue(a) - getMatchOrderValue(b));

  const winnerFinal = [...copy]
    .filter((match) => match.bracket === "W")
    .sort((a, b) => b.round - a.round || a.slot - b.slot)[0] ?? null;

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

    if (!match.player1Id && !match.player2Id && match.status !== "finished" && match.status !== "inProgress") {
      match.status = "waiting";
      match.tableNumber = null;
    }
  }

  return copy;
}

function getMatchStageDepth(match: Match, matchesById: Map<string, Match>, memo = new Map<string, number>()): number {
  if (memo.has(match.id)) return memo.get(match.id)!;
  const deps = [match.source1?.matchId, match.source2?.matchId]
    .filter(Boolean)
    .map((id) => matchesById.get(id as string))
    .filter((dep): dep is Match => Boolean(dep));
  const depth = deps.length === 0 ? 1 : 1 + Math.max(...deps.map((dep) => getMatchStageDepth(dep, matchesById, memo)));
  memo.set(match.id, depth);
  return depth;
}

function getBracketPriority(match: Match) {
  // alternate W/L based on round
  if (match.bracket === "GF") return 2;
  return match.round % 2 === 0
    ? (match.bracket === "L" ? 0 : 1)
    : (match.bracket === "W" ? 0 : 1);
}

function getPlayerLastFinishedRound(matches: Match[], playerId: string | null) {
  if (!playerId) return 0;
  let lastRound = 0;
  for (const match of matches) {
    if (match.status === "finished" && (match.player1Id === playerId || match.player2Id === playerId)) {
      lastRound = Math.max(lastRound, match.round);
    }
  }
  return lastRound;
}

function getBottomCardOrder(matches: Match[], bracketType?: BracketType) {
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

function applyQueue(matches: Match[]): Match[] {
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

  if (ready[0]) ready[0].status = "nextUp";
  if (ready[1]) ready[1].status = "onDeck";

  return copy;
}

function getOpenTable(matches: Match[]) {
  const used = new Set(matches.filter((m) => m.status === "inProgress" && m.tableNumber).map((m) => m.tableNumber));
  if (!used.has(1)) return 1;
  if (!used.has(2)) return 2;
  return null;
}

function createTournament(name: string, playerText: string, settings: TournamentSettings, includeInClubStats = false): Tournament {
  const players = shuffleArray(buildPlayers(playerText)).map((player, index) => ({ ...player, seed: index + 1 }));
  const matches = applyQueue(createBracketMatches(players, settings));
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

function startMatch(tournament: Tournament, matchId: string) {
  const openTable = getOpenTable(tournament.matches);
  if (!openTable) return tournament;

  const matches = tournament.matches.map((m) =>
    m.id === matchId ? { ...m, status: "inProgress" as const, tableNumber: openTable } : { ...m }
  );

  return { ...tournament, matches: applyQueue(matches) };
}

function getTournamentChampionIdFromMatches(matches: Match[], bracketType: BracketType) {
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

function getTournamentRunnerUpIdFromMatches(matches: Match[], bracketType: BracketType) {
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

function isTournamentFinished(matches: Match[], bracketType: BracketType) {
  return Boolean(getTournamentChampionIdFromMatches(matches, bracketType));
}

function finishMatch(tournament: Tournament, matchId: string, winnerId: string) {
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

function renamePlayer(tournament: Tournament, oldName: string, newName: string): { tournament: Tournament; message: string } {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to) return { tournament, message: "Enter both current and replacement names." };
  const idx = tournament.players.findIndex((p) => p.name.toLowerCase() === from.toLowerCase());
  if (idx === -1) return { tournament, message: "Could not find that current player/team name." };
  const players = tournament.players.map((p, i) => (i === idx ? { ...p, name: to } : p));
  return { tournament: { ...tournament, players }, message: `${from} is now ${to}.` };
}

function addLatePlayerToBracket(
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

  const exactBye = matches.find(
    (m) =>
      m.round === 1 &&
      m.status !== "inProgress" &&
      m.status !== "finished" &&
      ((m.player1Id && !m.player2Id) || (!m.player1Id && m.player2Id))
  );

  if (mode === "bye" && exactBye) {
    if (!exactBye.player1Id) exactBye.player1Id = newPlayer.id;
    else exactBye.player2Id = newPlayer.id;
    exactBye.winnerId = null;
    const rebuilt = applyQueue(propagateBracket(matches, tournament.settings.bracketType));
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
    const rebuilt = applyQueue(propagateBracket(matches, tournament.settings.bracketType));
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
    const rebuilt = applyQueue(propagateBracket(matches, tournament.settings.bracketType));
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



type LeaderboardRow = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  active: boolean;
  placementLabel: string;
  progressRound: number;
};

function getPlacementLabel(tournament: Tournament, playerId: string) {
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

function buildLeaderboard(tournament: Tournament): LeaderboardRow[] {
  return tournament.players
    .map((player) => {
      let wins = 0;
      let losses = 0;
      let progressRound = 0;

      for (const match of tournament.matches) {
        const involved = match.player1Id === player.id || match.player2Id === player.id;
        if (!involved) continue;
        progressRound = Math.max(progressRound, match.round + (match.bracket === "L" ? 20 : match.bracket === "GF" ? 40 : 0));
        if (match.status === "finished" && match.winnerId) {
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
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (a.progressRound !== b.progressRound) return b.progressRound - a.progressRound;
      return a.name.localeCompare(b.name);
    });
}

function shuffleArray<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type RatingEntry = {
  aliases: string[];
  keys: string[];
  rating: number;
};

function parseRatingEntries(rawText: string) {
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

function lookupPlayerRating(name: string, entries: RatingEntry[], fallbackRating: number) {
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

function getConfiguredRatingSummary(ratingsText: string) {
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

function buildBalancedRandomTeams(playerText: string, ratingsText: string, lockedTeamsText = "") {
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


function loadClubStats(): ClubStatsMap {
  try {
    const raw = localStorage.getItem(CLUB_STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveClubStats(stats: ClubStatsMap) {
  localStorage.setItem(CLUB_STATS_KEY, JSON.stringify(stats));
}

function clubStatsNameKey(name: string) {
  return normalizeNameKey(name);
}

function tournamentSummaryText(tournament: Tournament, clubStats?: ClubStatsMap) {
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

function applyTournamentToClubStats(tournament: Tournament, existingStats: ClubStatsMap): ClubStatsMap {
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
function saveTournamentLocal(tournament: Tournament) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
}

function loadTournamentLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Tournament>;
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.matches) || !parsed.settings) return null;
    return parsed as Tournament;
  } catch {
    return null;
  }
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ui-panel rounded-[30px] border border-white/10 bg-slate-950/55 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.30)] backdrop-blur-xl ${className}`}>{children}</div>;
}

function StatusPill({ status }: { status: MatchStatus }) {
  const classes =
    status === "nextUp"
      ? "bg-emerald-400 text-black"
      : status === "onDeck"
      ? "bg-cyan-300 text-black"
      : status === "inProgress"
      ? "bg-amber-300 text-black"
      : status === "finished"
      ? "bg-slate-600 text-white"
      : "bg-slate-700 text-white";

  const label =
    status === "nextUp"
      ? "Next Up"
      : status === "onDeck"
      ? "On Deck"
      : status === "inProgress"
      ? "In Progress"
      : status === "finished"
      ? "Finished"
      : "Waiting";

  return <Pill className={classes}>{label}</Pill>;
}

function ConfettiOverlay({ show }: { show: boolean }) {
  const pieces = Array.from({ length: 30 }, (_, i) => i);
  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece}
          className="absolute top-[-10%] h-3 w-2 animate-[confetti_3s_ease-in_forwards] rounded-sm"
          style={{
            left: `${(piece * 97) % 100}%`,
            backgroundColor: ["#34d399", "#67e8f9", "#fbbf24", "#ffffff"][piece % 4],
            transform: `rotate(${piece * 19}deg)`,
            animationDelay: `${(piece % 10) * 0.08}s`,
          }}
        />
      ))}
      <style>{`@keyframes confetti {0% {transform: translateY(0) rotate(0deg); opacity:1;} 100% {transform: translateY(120vh) rotate(540deg); opacity:0;}}`}</style>
    </div>
  );
}

function MatchCard({
  tournament,
  match,
  admin,
  onStart,
  onFinish,
}: {
  tournament: Tournament;
  match: Match;
  admin: boolean;
  onStart: (matchId: string) => void;
  onFinish: (matchId: string, winnerId: string) => void;
}) {
  const p1 = playerNameForSlot(tournament.players, match, 1);
  const p2 = playerNameForSlot(tournament.players, match, 2);
  const openTable = getOpenTable(tournament.matches);

  const isRealWin = match.status === "finished";
  const winner1 = isRealWin && match.winnerId === match.player1Id;
  const winner2 = isRealWin && match.winnerId === match.player2Id;

  return (
    <div className="match-card rounded-2xl border border-white/10 bg-slate-950/50 p-4 transition-transform duration-150 hover:-translate-y-1 hover:border-emerald-300/30">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm text-slate-400">{getMatchDisplayLabel(match)}</div>
          <div className="text-xs text-slate-500">{match.bracket === "GF" ? getRoundTitle(match.round, 1, "GF") : `${match.bracket === "L" ? "Losers" : "Winners"} Round ${match.round}`} · Single game match</div>
        </div>
        <div className="flex items-center gap-2">
          {match.tableNumber ? <Pill className="bg-amber-300 text-black">Table {match.tableNumber}</Pill> : null}
          <StatusPill status={match.status} />
        </div>
      </div>

      <div className={`rounded-xl px-3 py-2 ${winner1 ? "bg-emerald-500/15 text-emerald-200" : "bg-black/25"}`}>
        {p1}
      </div>
      <div className={`rounded-xl px-3 py-2 ${winner2 ? "bg-emerald-500/15 text-emerald-200" : "bg-black/25"}`}>
        {p2}
      </div>

      {admin ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(match.status === "nextUp" || match.status === "onDeck") && openTable ? (
            <button
              onClick={() => onStart(match.id)}
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              <Play className="mr-2 inline h-4 w-4" /> Start on Table {openTable}
            </button>
          ) : null}

          {match.status === "inProgress" && match.player1Id ? (
            <button
              onClick={() => onFinish(match.id, match.player1Id as string)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-slate-100"
            >
              <CheckCircle2 className="mr-2 inline h-4 w-4" /> {p1} wins
            </button>
          ) : null}

          {match.status === "inProgress" && match.player2Id ? (
            <button
              onClick={() => onFinish(match.id, match.player2Id as string)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-slate-100"
            >
              <CheckCircle2 className="mr-2 inline h-4 w-4" /> {p2} wins
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}



function getMatchDisplayLabel(match: Match) {
  if (match.bracket === "W") return `W${match.round}-M${match.slot + 1}`;
  if (match.bracket === "L") return `L${match.round}-M${match.slot + 1}`;
  return match.round === 1 ? "GF-1" : "GF-2";
}

function getRoundTitle(roundNumber: number, matchCount: number, bracket: BracketStream) {
  if (bracket === "GF") return roundNumber === 1 ? "Grand Final" : "Reset Final";
  if (bracket === "L") return `Losers R${roundNumber}`;
  return matchCount === 1 ? "Final" : matchCount === 2 ? "Semifinal" : `Round ${roundNumber}`;
}

function SingleBracketGraphic({
  tournament,
  matches,
  compact = false,
  animatedMatchIds = [],
  title,
}: {
  tournament: Tournament;
  matches: Match[];
  compact?: boolean;
  animatedMatchIds?: string[];
  title?: string;
}) {
  if (matches.length === 0) return null;

  const roundMap = new Map<number, Match[]>();
  for (const match of matches) {
    const arr = roundMap.get(match.round) ?? [];
    arr.push(match);
    roundMap.set(match.round, arr);
  }

  const orderedRounds = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, roundMatches]) => [roundNumber, [...roundMatches].sort((a, b) => a.slot - b.slot)] as const);

  const matchHeight = compact ? 154 : 186;
  const firstRoundGap = compact ? 38 : 58;
  const cardWidth = compact ? 290 : 330;
  const colGap = compact ? 72 : 92;
  const roundHeaderHeight = title ? 96 : 44; 
  const innerPad = 18;
  const bottomBuffer = compact ? 96 : 128;

  const firstRoundCount = orderedRounds[0][1].length;
  const firstRoundStep = matchHeight + firstRoundGap;
  const bodyHeight = Math.max(firstRoundCount * matchHeight + Math.max(firstRoundCount - 1, 0) * firstRoundGap + bottomBuffer, matchHeight + bottomBuffer);
  const totalHeight = roundHeaderHeight + innerPad + bodyHeight + innerPad * 2;
  const totalWidth = orderedRounds.length * cardWidth + Math.max(orderedRounds.length - 1, 0) * colGap + innerPad * 2;

  const centersByMatch = new Map<string, number>();
  const topsByMatch = new Map<string, number>();

  orderedRounds.forEach(([_, roundMatches], roundIndex) => {
    roundMatches.forEach((match, index) => {
      let centerY = 0;
      if (roundIndex === 0) {
        centerY = roundHeaderHeight + innerPad + index * firstRoundStep + matchHeight / 2;
      } else {
        const prevA = matches.find((m) => m.round === match.round - 1 && m.slot === match.slot * 2);
        const prevB = matches.find((m) => m.round === match.round - 1 && m.slot === match.slot * 2 + 1);
        const fallbackTop = roundHeaderHeight + innerPad + index * firstRoundStep;
        const aCenter = prevA ? centersByMatch.get(prevA.id) : undefined;
        const bCenter = prevB ? centersByMatch.get(prevB.id) : undefined;
        if (typeof aCenter === "number" && typeof bCenter === "number") centerY = (aCenter + bCenter) / 2;
        else if (typeof aCenter === "number") centerY = aCenter;
        else if (typeof bCenter === "number") centerY = bCenter;
        else centerY = fallbackTop + matchHeight / 2;
      }
      centersByMatch.set(match.id, centerY);
      topsByMatch.set(match.id, centerY - matchHeight / 2);
    });
  });

  return (
    <div className="bracket-board w-full overflow-x-auto overflow-y-visible rounded-3xl border border-white/10 bg-black/20 p-3 pb-8">
      <div
        className="relative min-w-full overflow-visible"
        style={{
          width: `${Math.max(totalWidth, 760)}px`,
          height: `${totalHeight}px`,
          minHeight: `${totalHeight}px`,
          paddingBottom: `${innerPad}px`,
        }}
      >
        {title ? (
  <div className="absolute left-0 top-0 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200/90">
    {title}
  </div>
) : null}

        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={Math.max(totalWidth, 760)}
          height={totalHeight}
          viewBox={`0 0 ${Math.max(totalWidth, 760)} ${totalHeight}`}
          fill="none"
        >
          {orderedRounds.slice(0, -1).flatMap(([_, roundMatches], roundIndex) =>
            roundMatches.map((match) => {
              const fromCenterY = centersByMatch.get(match.id) ?? 0;
              const fromX = innerPad + roundIndex * (cardWidth + colGap) + cardWidth;
              const elbowX = fromX + colGap / 2;
              const nextMatch = matches.find((m) => m.round === match.round + 1 && m.slot === Math.floor(match.slot / 2));
              const toCenterY = nextMatch ? centersByMatch.get(nextMatch.id) ?? fromCenterY : fromCenterY;

              return (
                <g key={`${match.id}-connector`} stroke="rgba(110, 231, 183, 0.32)" strokeWidth="1.5" strokeLinecap="round">
                  <line x1={fromX} y1={fromCenterY} x2={elbowX} y2={fromCenterY} />
                  <line x1={elbowX} y1={fromCenterY} x2={elbowX} y2={toCenterY} />
                  <line x1={elbowX} y1={toCenterY} x2={fromX + colGap} y2={toCenterY} />
                </g>
              );
            })
          )}
        </svg>

        {orderedRounds.map(([roundNumber, roundMatches], roundIndex) => {
          const columnLeft = innerPad + roundIndex * (cardWidth + colGap);
          return (
            <div key={roundNumber} className="absolute top-0" style={{ left: `${columnLeft}px`, width: `${cardWidth}px` }}>
              <div className="mb-3 h-11 pt-6 text-center text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200/90">
                {getRoundTitle(roundNumber, roundMatches.length, roundMatches[0]?.bracket ?? "W")}
              </div>

              {roundMatches.map((match) => {
                const top = topsByMatch.get(match.id) ?? roundHeaderHeight + innerPad;
                const isRealWin = match.status === "finished";

                const winner1 = isRealWin && match.winnerId === match.player1Id;
                const winner2 = isRealWin && match.winnerId === match.player2Id;

                return (
                  <div
                    key={match.id}
                    className="absolute left-0"
                    style={{ top: `${top}px`, width: `${cardWidth}px`, height: `${matchHeight}px` }}
                  >
                    <div className={`bracket-match flex h-full flex-col rounded-[22px] border border-white/10 bg-[#081325]/95 px-3 pb-4 pt-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.28)] overflow-visible transition-all duration-300 ${animatedMatchIds.includes(match.id) ? "animate-[queueSlide_0.42s_ease-out]" : ""}`}>
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>{getMatchDisplayLabel(match)}</span>
                        <StatusPill status={match.status} />
                      </div>
                      <div className="mt-1 flex-1 space-y-2 text-[15px] min-h-0">
                        <div className={`truncate rounded-xl px-4 py-3 ${winner1 ? "bg-emerald-500/18 text-emerald-100 ring-1 ring-emerald-300/20" : "bg-white/[0.06]"}`}>
                          {playerNameForSlot(tournament.players, match, 1)}
                        </div>
                        <div className={`truncate rounded-xl px-4 py-3 ${winner2 ? "bg-emerald-500/18 text-emerald-100 ring-1 ring-emerald-300/20" : "bg-white/[0.06]"}`}>
                          {playerNameForSlot(tournament.players, match, 2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GrandFinalGraphic({
  tournament,
  matches,
  animatedMatchIds = [],
}: {
  tournament: Tournament;
  matches: Match[];
  animatedMatchIds?: string[];
}) {
  if (matches.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {matches.sort((a, b) => a.round - b.round).map((match) => {
        const winner1 = match.winnerId === match.player1Id && match.winnerId;
        const winner2 = match.winnerId === match.player2Id && match.winnerId;
        return (
          <div key={match.id} className={`bracket-match rounded-[22px] border border-white/10 bg-[#081325]/95 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.28)] ${animatedMatchIds.includes(match.id) ? "animate-[queueSlide_0.42s_ease-out]" : ""}`}>
            <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>{getRoundTitle(match.round, 1, "GF")}</span>
              <StatusPill status={match.status} />
            </div>
            <div className="space-y-2">
              <div className={`truncate rounded-xl px-4 py-3 ${winner1 ? "bg-emerald-500/18 text-emerald-100 ring-1 ring-emerald-300/20" : "bg-white/[0.06]"}`}>
                {playerNameForSlot(tournament.players, match, 1)}
              </div>
              <div className={`truncate rounded-xl px-4 py-3 ${winner2 ? "bg-emerald-500/18 text-emerald-100 ring-1 ring-emerald-300/20" : "bg-white/[0.06]"}`}>
                {playerNameForSlot(tournament.players, match, 2)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BracketGraphic({ tournament, compact = false, animatedMatchIds = [] }: { tournament: Tournament; compact?: boolean; animatedMatchIds?: string[] }) {
  if (tournament.settings.bracketType === "single-elim") {
    return (
      <SingleBracketGraphic
        tournament={tournament}
        matches={tournament.matches.filter((match) => match.bracket === "W")}
        compact={compact}
        animatedMatchIds={animatedMatchIds}
      />
    );
  }

  const winnerMatches = tournament.matches.filter((match) => match.bracket === "W");
  const loserMatches = tournament.matches.filter((match) => match.bracket === "L");
  const grandFinals = tournament.matches.filter((match) => match.bracket === "GF");

  return (
    <div className="space-y-6">
      <SingleBracketGraphic tournament={tournament} matches={winnerMatches} compact={compact} animatedMatchIds={animatedMatchIds} title="Winners Bracket" />
      {loserMatches.length > 0 ? (
        <SingleBracketGraphic tournament={tournament} matches={loserMatches} compact={compact} animatedMatchIds={animatedMatchIds} title="Losers Bracket" />
      ) : null}
      <div className="rounded-3xl border border-emerald-300/10 bg-black/20 p-4">
        <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200/90">Grand Finals</div>
        <GrandFinalGraphic tournament={tournament} matches={grandFinals} animatedMatchIds={animatedMatchIds} />
      </div>
    </div>
  );
}

function LeaderboardTable({ tournament, clubStats = {} }: { tournament: Tournament; clubStats?: ClubStatsMap }) {
  const rows = useMemo(() => buildLeaderboard(tournament), [tournament]);

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-300/10 bg-black/20">
      <div className="grid grid-cols-[minmax(0,1.7fr)_80px_80px_100px_92px_92px_100px] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-400">
        <div>Player</div>
        <div>Wins</div>
        <div>Losses</div>
        <div>Career Wins</div>
        <div>Titles</div>
        <div>Status</div>
        <div>Place</div>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((row, index) => {
          const career = clubStats[clubStatsNameKey(row.name)];
          return (
            <div key={row.playerId} className="grid grid-cols-[minmax(0,1.7fr)_80px_80px_100px_92px_92px_100px] items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : ""}{row.name}</div>
              </div>
              <div>{row.wins}</div>
              <div>{row.losses}</div>
              <div>{career?.totalMatchWins ?? 0}</div>
              <div>{career?.tournamentWins ?? 0}</div>
              <div>{row.active ? <Pill className="bg-emerald-400 text-black">Active</Pill> : <Pill className="bg-white/10 text-white">Out</Pill>}</div>
              <div className="text-slate-300">{row.placementLabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublicBracketView({
  tournament,
  clubStats = {},
  animatedMatchIds = [],
}: {
  tournament: Tournament;
  clubStats?: ClubStatsMap;
  animatedMatchIds?: string[];
}) {
  const [publicTab, setPublicTab] = useState<PublicTab>("board");
  const nextUp = tournament.matches.find((m) => m.status === "nextUp");
  const onDeck = tournament.matches.find((m) => m.status === "onDeck");
  const championId = getTournamentChampionIdFromMatches(tournament.matches, tournament.settings.bracketType);
  const champion = championId ? playerName(tournament.players, championId) : "";
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?public=1`
      : "?public=1";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`;

  return (
    <div className="space-y-6">
      <Panel className="border-emerald-300/15 bg-black/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">
              Public Tournament Board
            </div>
            <div className="mt-2 text-3xl font-bold">{tournament.name}</div>
            <div className="mt-1 text-sm text-slate-300">
              {tournament.settings.gameType} · {tournament.settings.teamMode} · {tournament.settings.bracketType}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-emerald-500/10 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Next Up</div>
              <div className="mt-1 text-xl font-semibold">
                {nextUp
                  ? `${playerName(tournament.players, nextUp.player1Id)} vs ${playerName(
                      tournament.players,
                      nextUp.player2Id
                    )}`
                  : "Waiting..."}
              </div>
            </div>
            <div className="rounded-2xl bg-cyan-500/10 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">On Deck</div>
              <div className="mt-1 text-xl font-semibold">
                {onDeck
                  ? `${playerName(tournament.players, onDeck.player1Id)} vs ${playerName(
                      tournament.players,
                      onDeck.player2Id
                    )}`
                  : "Waiting..."}
              </div>
            </div>
          </div>
        </div>

        {champion ? (
          <div className="mt-4 rounded-2xl bg-emerald-500/12 px-4 py-3 text-emerald-100">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">
              Current Champion
            </div>
            <div className="mt-1 text-2xl font-bold">{champion}</div>
          </div>
        ) : null}
      </Panel>

      <Panel className="border-white/10 bg-black/35">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Share Public View</div>
            <div className="mt-2 break-all text-sm text-slate-300">{publicUrl}</div>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={qrUrl}
              alt="QR code for public bracket view"
              className="h-24 w-24 rounded-2xl border border-white/10 bg-white p-2"
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <button
            onClick={() => setPublicTab("call")}
            className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${
              publicTab === "call" ? "bg-emerald-300 text-black" : "bg-white/10 text-white"
            }`}
          >
            Call to Table
          </button>
          <button
            onClick={() => setPublicTab("board")}
            className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${
              publicTab === "board" ? "bg-cyan-300 text-black" : "bg-white/10 text-white"
            }`}
          >
            Bracket
          </button>
          <button
            onClick={() => setPublicTab("leaderboard")}
            className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${
              publicTab === "leaderboard" ? "bg-amber-300 text-black" : "bg-white/10 text-white"
            }`}
          >
            Leaderboard
          </button>
        </div>

        {publicTab === "call" ? (
          <CallToTableView tournament={tournament} animatedMatchIds={animatedMatchIds} />
        ) : publicTab === "board" ? (
          <>
            <div className="mb-3 text-sm uppercase tracking-[0.2em] text-slate-400">Bracket</div>
            <BracketGraphic tournament={tournament} compact={false} animatedMatchIds={animatedMatchIds} />
          </>
        ) : (
          <>
            <div className="mb-3 text-sm uppercase tracking-[0.2em] text-slate-400">Leaderboard</div>
            <LeaderboardTable tournament={tournament} clubStats={clubStats} />
          </>
        )}
      </Panel>
    </div>
  );
}

function CallToTableView({
  tournament,
  animatedMatchIds = [],
}: {
  tournament: Tournament;
  animatedMatchIds?: string[];
}) {
  const nowPlaying = tournament.matches
    .filter((m) => m.status === "inProgress")
    .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));

  const nextUp = tournament.matches.find((m) => m.status === "nextUp");
  const onDeck = tournament.matches.find((m) => m.status === "onDeck");

  const bigCard = (label: string, tone: string, content: string, animated = false) => (
    <div
      className={`rounded-[28px] border border-white/10 p-6 md:p-8 ${
        tone
      } ${animated ? "animate-[queueSlide_0.55s_ease-out]" : ""}`}
    >
      <div className="text-sm uppercase tracking-[0.28em] text-slate-300">{label}</div>
      <div className="mt-3 text-3xl font-bold leading-tight md:text-5xl">{content}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-emerald-300/15 bg-black/30 p-6 md:p-8">
        <div className="text-center text-sm uppercase tracking-[0.32em] text-emerald-200/80">
          Call to Table
        </div>
        <div className="mt-3 text-center text-4xl font-bold md:text-6xl">
          {tournament.name}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="text-center text-sm uppercase tracking-[0.28em] text-amber-200/80">
            Now Playing
          </div>
          {nowPlaying.length
            ? nowPlaying.map((match) => (
                <div
                  key={match.id}
                  className={`rounded-[28px] border border-white/10 bg-amber-500/10 p-6 md:p-8 ${
                    animatedMatchIds.includes(match.id)
                      ? "animate-[tablePop_0.55s_ease-out] ring-1 ring-amber-300/25"
                      : ""
                  }`}
                >
                  <div className="text-lg uppercase tracking-[0.2em] text-amber-200/80">
                    Table {match.tableNumber}
                  </div>
                  <div className="mt-3 text-3xl font-bold leading-tight md:text-5xl">
                    {playerNameForSlot(tournament.players, match, 1)} vs{" "}
                    {playerNameForSlot(tournament.players, match, 2)}
                  </div>
                </div>
              ))
            : bigCard("Now Playing", "bg-white/5", "No match currently live")}
        </div>

        <div className="space-y-4">
          <div className="text-center text-sm uppercase tracking-[0.28em] text-emerald-200/80">
            Up Next
          </div>
          {bigCard(
            "Next Up",
            `bg-emerald-500/10 ${
              nextUp ? "animate-[nextGlow_1.9s_ease-in-out_infinite] ring-1 ring-emerald-300/25" : ""
            }`,
            nextUp
              ? `${playerName(tournament.players, nextUp.player1Id)} vs ${playerName(
                  tournament.players,
                  nextUp.player2Id
                )}`
              : "Waiting for results",
            !!nextUp
          )}
          {bigCard(
            "On Deck",
            "bg-cyan-500/10",
            onDeck
              ? `${playerName(tournament.players, onDeck.player1Id)} vs ${playerName(
                  tournament.players,
                  onDeck.player2Id
                )}`
              : "Waiting...",
            !!onDeck && animatedMatchIds.includes(onDeck.id)
          )}
        </div>
      </div>
    </div>
  );
}

export default function BilliardsTournamentManager() {
  const [publicOnlyAccess] = useState(() => window.location.hash.includes("public") || new URLSearchParams(window.location.search).has("public"));
  const [mode, setMode] = useState<ViewMode>(() => (window.location.hash.includes("public") || new URLSearchParams(window.location.search).has("public")) ? "public" : "admin");
  const [adminTab, setAdminTab] = useState<AdminTab>("dashboard");
  const [name, setName] = useState(DEFAULT_TOURNAMENT_NAME);
  const [playerText, setPlayerText] = useState(DEFAULT_PLAYER_LIST);
  const [gameType, setGameType] = useState<GameType>("8-ball");
  const [teamMode, setTeamMode] = useState<TeamMode>("singles");
  const [bracketType, setBracketType] = useState<BracketType>("single-elim");
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [history, setHistory] = useState<Tournament[]>([]);
  const [lateName, setLateName] = useState("");
  const [lateMode, setLateMode] = useState<LateEntryMode>("bye");
  const [lateMessage, setLateMessage] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [teamRatingsText] = useState(CLUB_PLAYER_RATINGS);
  const [generatedTeamsText, setGeneratedTeamsText] = useState("");
  const [lockedTeamsText, setLockedTeamsText] = useState("");
  const [teamMakerMessage, setTeamMakerMessage] = useState("Balanced teams use your ratings when available and fall back to an average rating for anyone unranked.");
  const [includeInClubStats, setIncludeInClubStats] = useState(false);
  const [clubStats, setClubStats] = useState<ClubStatsMap>({});
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const [animatedMatchIds, setAnimatedMatchIds] = useState<string[]>([]);

  useEffect(() => {
    const existing = loadTournamentLocal();
    if (existing) setTournament(existing);
    setClubStats(loadClubStats());
  }, []);

  useEffect(() => {
    if (tournament) saveTournamentLocal(tournament);
  }, [tournament]);

  useEffect(() => {
    const onHashChange = () => {
      if (publicOnlyAccess) {
        setMode("public");
        return;
      }
      setMode(window.location.hash.includes("public") ? "public" : "admin");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [publicOnlyAccess]);

  useEffect(() => {
    if (tournament?.status === "finished") {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4200);
      return () => clearTimeout(timer);
    }
  }, [tournament?.status]);
  useEffect(() => {
    if (!tournament) return;
    const changed = tournament.matches
      .filter((match) => match.status === "nextUp" || match.status === "onDeck" || match.status === "inProgress")
      .map((match) => match.id);
    setAnimatedMatchIds(changed);
    const timer = setTimeout(() => setAnimatedMatchIds([]), 850);
    return () => clearTimeout(timer);
  }, [tournament]);

  const allMatches = useMemo(() => tournament?.matches ?? [], [tournament]);
  const nextUp = allMatches.find((m) => m.status === "nextUp");
  const onDeck = allMatches.find((m) => m.status === "onDeck");
  const inProgress = allMatches.filter((m) => m.status === "inProgress").sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));
  const championId = tournament ? getTournamentChampionIdFromMatches(tournament.matches, tournament.settings.bracketType) : null;
  const champion = tournament ? playerName(tournament.players, championId) : "";
  function pushHistory() {
    if (tournament) setHistory((prev) => [...prev, JSON.parse(JSON.stringify(tournament))]);
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
    setTeamMakerMessage("Generated teams copied into the tournament field. Mode switched to doubles.");
  }

  function handleCreateTournament() {
    const settings: TournamentSettings = { gameType, teamMode, bracketType };
    setTournament(createTournament(name, playerText, settings, includeInClubStats));
    setHistory([]);
    setLateMessage("");
    setRenameMessage("");
    window.location.hash = "admin";
  }

  function handleResetBracket() {
    if (!tournament) return;

    const settings: TournamentSettings = { ...tournament.settings };
    const currentPlayers = tournament.players.map((player) => player.name).join("\n");
    const fresh = createTournament(
      tournament.name || name || DEFAULT_TOURNAMENT_NAME,
      currentPlayers,
      settings,
      Boolean(tournament.includeInClubStats)
    );

    setTournament(fresh);
    setHistory([]);
    setLateMessage("");
    setRenameMessage("");
    window.location.hash = mode === "public" ? "public" : "admin";
  }
  function handleBackToSetup() {
    if (tournament) {
      setName(tournament.name);
      setPlayerText(tournament.players.map((p) => p.name).join("\n"));
      setGameType(tournament.settings.gameType);
      setTeamMode(tournament.settings.teamMode);
      setBracketType(tournament.settings.bracketType);
      setIncludeInClubStats(Boolean(tournament.includeInClubStats));
    }
    localStorage.removeItem(STORAGE_KEY);
    setTournament(null);
    setLateMessage("");
    setRenameMessage("");
  }

  function handleUndo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setTournament(prev);
    setHistory((old) => old.slice(0, -1));
  }

  function handleCopyPublicLink() {
    const publicUrl = `${window.location.origin}${window.location.pathname}?public=1`;
    navigator.clipboard?.writeText(publicUrl);
    setCopiedPublicLink(true);
    window.setTimeout(() => setCopiedPublicLink(false), 1400);
  }

  function handleExportResults() {
    if (!tournament) return;
    const summary = tournamentSummaryText(tournament, clubStats);
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${tournament.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "tournament"}_results.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function handleSaveTournamentToClubStats() {
    if (!tournament || !tournament.includeInClubStats || tournament.statsSaved !== false || tournament.status !== "finished") return;
    const nextStats = applyTournamentToClubStats(tournament, clubStats);
    saveClubStats(nextStats);
    setClubStats(nextStats);
    setTournament({ ...tournament, statsSaved: true });
  }

  function headerLink(target: ViewMode) {
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
    if (!result.message.startsWith("No clean") && !result.message.startsWith("For doubles") && !result.message.startsWith("Enter ")) setLateName("");
  }

  function handleRename() {
    if (!tournament) return;
    pushHistory();
    const result = renamePlayer(tournament, renameFrom, renameTo);
    setTournament(result.tournament);
    setRenameMessage(result.message);
    if (!result.message.startsWith("Could not") && !result.message.startsWith("Enter ")) {
      setRenameFrom("");
      setRenameTo("");
    }
  }


  return (
    <div className="billiards-app min-h-screen p-4 text-white sm:p-6">
      <ConfettiOverlay show={showConfetti} />
        <style>{`
          @keyframes queueSlide {
            0% { opacity: 0.35; transform: translateY(22px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes nextGlow {
            0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.16); transform: scale(1); }
            50% { box-shadow: 0 0 0 12px rgba(52, 211, 153, 0.06); transform: scale(1.025); }
          }
          @keyframes tablePop {
            0% { transform: scale(0.96); filter: brightness(0.88); }
            70% { transform: scale(1.02); filter: brightness(1.08); }
            100% { transform: scale(1); filter: brightness(1); }
          }
        `}</style>
      <div className="mx-auto max-w-7xl space-y-6">
        <Panel className="app-header relative overflow-hidden p-6 md:p-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-emerald-300">
              <Wifi className="h-4 w-4" />
              <span className="text-xs uppercase tracking-[0.28em]">Live Bracket Control System</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Billiards Tournament Manager</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              Run a cleaner club tournament with a live bracket, two-table queue, quick admin controls, and a public view players can follow from their phones.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap gap-3">
              {!publicOnlyAccess ? (
                <button onClick={() => headerLink("admin")} className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${mode === "admin" ? "bg-emerald-400 text-black" : "bg-white/10 text-white"}`}>
                  <Shield className="mr-2 inline h-4 w-4" /> Admin View
                </button>
              ) : null}
              <button onClick={() => headerLink("public")} className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${mode === "public" ? "bg-cyan-300 text-black" : "bg-white/10 text-white"}`}>
                <Globe className="mr-2 inline h-4 w-4" /> Public View
              </button>
              {!publicOnlyAccess ? (
                <button onClick={handleBackToSetup} className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5">
                  <ArrowLeft className="mr-2 inline h-4 w-4" /> Back to Setup
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!publicOnlyAccess ? (
                <>
              <button onClick={handleUndo} disabled={history.length === 0} className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-40">
                <Undo2 className="mr-2 inline h-4 w-4" /> Undo
              </button>
              <button onClick={handleExportResults} disabled={!tournament} className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-40">
                <Download className="mr-2 inline h-4 w-4" /> Export Results
              </button>
              <button onClick={handleCopyPublicLink} disabled={!tournament} className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-40">
                <QrCode className="mr-2 inline h-4 w-4" /> {copiedPublicLink ? "Copied Public Link" : "Copy Public Link"}
              </button>
              <button
                onClick={() => {
                  window.location.hash = "admin";
                  setMode("admin");
                }}
                disabled={!tournament}
                className={`mt-3 w-full rounded-2xl px-4 py-3 font-semibold transition-transform duration-150 ${
                  tournament
                    ? "bg-white/10 text-white hover:-translate-y-0.5 hover:bg-white/15"
                    : "cursor-not-allowed bg-white/5 text-slate-500"
                }`}
              >
                Return to Bracket
              </button>
                </>
              ) : null}
              {tournament ? (
                <button
                  onClick={handleResetBracket}
                  disabled={publicOnlyAccess}
                  className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <RefreshCw className="mr-2 inline h-4 w-4" />
                  Reset Bracket
                </button>
              ) : null}
            </div>
          </div>
        </Panel>

        {!tournament ? (
          publicOnlyAccess ? (
            <Panel>
              <div className="text-xl font-semibold text-cyan-200">Public View</div>
              <div className="mt-2 text-sm text-slate-300">
                No active tournament is available on this device yet.
              </div>
            </Panel>
          ) : (
          <div className="setup-layout grid gap-6 lg:grid-cols-[440px_1fr]">
            <Panel>
              <div className="mb-4 flex items-center gap-2 text-2xl font-semibold">
                <Users className="h-6 w-6 text-emerald-300" /> Create Tournament
              </div>
              <label className="mb-2 block text-sm text-slate-300">Tournament Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />

              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Game</label>
                  <select value={gameType} onChange={(e) => setGameType(e.target.value as GameType)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none">
                    <option value="8-ball">8-ball</option>
                    <option value="9-ball">9-ball</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Mode</label>
                  <select value={teamMode} onChange={(e) => setTeamMode(e.target.value as TeamMode)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none">
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Bracket</label>
                  <select value={bracketType} onChange={(e) => setBracketType(e.target.value as BracketType)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none">
                    <option value="single-elim">Single Elim</option>
                    <option value="double-elim">Double Elim</option>
                  </select>
                </div>
              </div>

              <label className="mb-2 block text-sm text-slate-300">Players or Teams (one per line)</label>
              <textarea value={playerText} onChange={(e) => setPlayerText(e.target.value)} className="min-h-[280px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
              <div className="mt-2 text-xs leading-6 text-slate-400">This default list now comes from the hidden club config. If old names still show up in an active bracket, that means a saved tournament is loaded from local storage — hit <span className="font-semibold text-white">Reset Bracket</span> or <span className="font-semibold text-white">Back to Setup</span> to clear it.</div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                <input type="checkbox" checked={includeInClubStats} onChange={(e) => setIncludeInClubStats(e.target.checked)} className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40" />
                <span>
                  <span className="font-semibold text-white">Count this tournament toward club stats</span>
                  <span className="mt-1 block text-xs text-slate-400">Leave this off when you are testing, messing around, or using the app for personal practice so the long-term leaderboard does not get polluted.</span>
                </span>
              </label>
              <button onClick={handleCreateTournament} className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-emerald-300">
                Build Bracket + Queue
              </button>
              <button
                onClick={() => {
                  window.location.hash = "admin";
                  setMode("admin");
                }}
                disabled={!tournament}
                className={`mt-3 w-full rounded-2xl px-4 py-3 font-semibold transition-transform duration-150 ${
                  tournament
                    ? "bg-white/10 text-white hover:-translate-y-0.5 hover:bg-white/15"
                    : "cursor-not-allowed bg-white/5 text-slate-500"
                }`}
              >
                Return to Bracket
              </button>
            </Panel>

            <div className="space-y-6">
              <Panel>
                <div className="text-2xl font-semibold">Random Team Maker</div>
                <div className="mt-2 text-sm text-slate-300">Build balanced doubles teams with some randomness so the draw does not always come out the same. Ratings stay hidden in the app and are only used behind the scenes for balancing.</div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Balanced randomizer ready</div>
                      <div className="mt-1 text-sm text-slate-300">Uses your hidden club-strength config behind the scenes and keeps some randomness so the same teams do not come out every time.</div>
                    </div>
                    <Pill className="bg-white/10 text-white">Private config</Pill>
                  </div>
                </div>
                <label className="mt-4 mb-2 block text-sm text-slate-300">Locked Teams (optional)</label>
                <textarea value={lockedTeamsText} onChange={(e) => setLockedTeamsText(e.target.value)} placeholder={"One locked team per line\nLawrence / Felip"} className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
                <div className="mt-2 text-xs leading-6 text-slate-400">Locked teams stay together first. Everyone else is balanced around them. This is useful for siblings, rides, or pre-picked pairings.</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={handleGenerateTeams} className="rounded-2xl bg-cyan-300 px-4 py-3 font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-cyan-200">Generate Balanced Teams</button>
                  <button onClick={handleUseGeneratedTeams} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5">Use These Teams</button>
                </div>
                <div className={`mt-4 rounded-2xl p-4 text-sm ${generatedTeamsText ? "bg-emerald-500/10 text-emerald-100" : "bg-white/5 text-slate-300"}`}>{teamMakerMessage}</div>
                <label className="mt-4 mb-2 block text-sm text-slate-300">Generated Teams</label>
                <textarea value={generatedTeamsText} onChange={(e) => setGeneratedTeamsText(e.target.value)} placeholder="Generated doubles teams will appear here." className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
              </Panel>

              <Panel>
                <div className="text-2xl font-semibold">Release Notes</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-white/5 p-4"><div className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-300">vNext</div><div className="font-semibold text-white">Randomized bracket seeding</div><div className="mt-1 text-sm text-slate-300">Every new bracket draw now shuffles entrants before seeding so the tournament is not built the same way every time.</div></div>
                  <div className="rounded-2xl bg-white/5 p-4"><div className="mb-2 text-xs uppercase tracking-[0.18em] text-cyan-300">vNext</div><div className="font-semibold text-white">Balanced random teams</div><div className="mt-1 text-sm text-slate-300">Doubles teams can now be generated from ratings, with fallback handling for unranked players and light randomness to keep results fresh.</div></div>
                  <div className="rounded-2xl bg-white/5 p-4"><div className="mb-2 text-xs uppercase tracking-[0.18em] text-amber-300">vPrev</div><div className="font-semibold text-white">Public leaderboard</div><div className="mt-1 text-sm text-slate-300">Players can switch between the public bracket and the leaderboard without seeing admin-only controls.</div></div>
                  <div className="rounded-2xl bg-white/5 p-4"><div className="mb-2 text-xs uppercase tracking-[0.18em] text-violet-300">vPrev</div><div className="font-semibold text-white">Safer live controls</div><div className="mt-1 text-sm text-slate-300">Rename, late entry, leaderboard, undo, and local save recovery all stay in place while the dashboard stays cleaner.</div></div>
                </div>
              </Panel>
            </div>
          </div>
          )
        ) : mode === "public" ? (
          <PublicBracketView tournament={tournament} clubStats={clubStats} animatedMatchIds={animatedMatchIds}/>
        ) : (
          <>
            {champion ? (
              <Panel className="border-emerald-400/30 bg-emerald-500/10">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-emerald-300"><Crown className="h-5 w-5" /> Champion</div>
                    <div className="text-3xl font-bold">{champion}</div>
                    <div className="mt-1 text-sm text-slate-300">{tournament.settings.gameType} · {tournament.settings.teamMode} · {tournament.settings.bracketType}</div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {tournament.status === "finished" ? <div className="self-center text-lg font-semibold text-emerald-200">Tournament Complete</div> : null}
                    {tournament.includeInClubStats ? (
                      <button onClick={handleSaveTournamentToClubStats} disabled={tournament.status !== "finished" || Boolean(tournament.statsSaved)} className="rounded-2xl bg-black/25 px-4 py-2 font-semibold text-emerald-100 transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-50">
                        <Save className="mr-2 inline h-4 w-4" /> {tournament.statsSaved ? "Saved to Club Stats" : "Save to Club Stats"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </Panel>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => setAdminTab("dashboard")} className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${adminTab === "dashboard" ? "bg-emerald-400 text-black" : "bg-white/10 text-white"}`}>
                <LayoutDashboard className="mr-2 inline h-4 w-4" /> Dashboard
              </button>
              <button onClick={() => setAdminTab("bracket")} className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${adminTab === "bracket" ? "bg-cyan-300 text-black" : "bg-white/10 text-white"}`}>
                <Swords className="mr-2 inline h-4 w-4" /> Bracket
              </button>
              <button onClick={() => setAdminTab("leaderboard")} className={`rounded-2xl px-4 py-2 font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${adminTab === "leaderboard" ? "bg-amber-300 text-black" : "bg-white/10 text-white"}`}>
                <BarChart3 className="mr-2 inline h-4 w-4" /> Leaderboard
              </button>
            </div>

            {adminTab === "dashboard" ? (
            <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <Panel><div className="text-xs uppercase text-slate-400">Tournament</div><div className="mt-1 text-2xl font-semibold">{tournament.name}</div></Panel>
              <Panel><div className="text-xs uppercase text-slate-400">Players</div><div className="mt-1 text-2xl font-semibold">{tournament.players.length}</div></Panel>
              <Panel><div className="text-xs uppercase text-slate-400">Game</div><div className="mt-1 text-2xl font-semibold">{tournament.settings.gameType}</div></Panel>
              <Panel><div className="text-xs uppercase text-slate-400">Mode</div><div className="mt-1 text-2xl font-semibold">{tournament.settings.teamMode}</div></Panel>
              <Panel><div className="text-xs uppercase text-slate-400">Bracket</div><div className="mt-1 text-2xl font-semibold">{tournament.settings.bracketType}</div></Panel>
              <Panel><div className="text-xs uppercase text-slate-400">Open Table</div><div className="mt-1 text-2xl font-semibold">{getOpenTable(tournament.matches) ? `T${getOpenTable(tournament.matches)}` : "0"}</div></Panel>
            </div>

            <Panel className="border-white/10 bg-black/30">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Public View</div>
                  <div className="mt-2 text-sm text-slate-300 break-all">{typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?public=1` : "?public=1"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?public=1` : "?public=1")}`} alt="QR code for public bracket view" className="h-20 w-20 rounded-2xl border border-white/10 bg-white p-2" />
                  <button onClick={handleCopyPublicLink} className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5">
                    <Copy className="mr-2 inline h-4 w-4" /> {copiedPublicLink ? "Copied" : "Copy Link"}
                  </button>
                </div>
              </div>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-6">
                <Panel>
                  <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><Table2 className="h-5 w-5 text-amber-300" /> Live Tables</div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    {[1, 2].map((table) => {
                      const live = inProgress.find((m) => m.tableNumber === table);
                      return (
                        <div key={table} className="live-table-card rounded-2xl bg-white/5 p-4">
                          <div className="mb-2 text-sm uppercase tracking-[0.18em] text-amber-300">Table {table}</div>
                          <div className="text-lg font-semibold">{live ? `${playerName(tournament.players, live.player1Id)} vs ${playerName(tournament.players, live.player2Id)}` : "Open"}</div>
                          <div className="mt-1 text-sm text-slate-400">{live ? "Single game match" : "Ready for the next match"}</div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel>
                  <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><Play className="h-5 w-5 text-emerald-300" /> Queue</div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <div className={`rounded-2xl bg-emerald-500/10 p-4 transition-all duration-300 ${nextUp ? "animate-[slowPulse_2.8s_ease-in-out_infinite] ring-1 ring-emerald-300/25" : ""}`}>
                      <div className="mb-2 text-sm uppercase tracking-[0.2em] text-emerald-300">Next Up</div>
                      <div className="text-2xl font-semibold">{nextUp ? `${playerName(tournament.players, nextUp.player1Id)} vs ${playerName(tournament.players, nextUp.player2Id)}` : "Waiting..."}</div>
                      <div className="mt-2 text-sm text-slate-300">{nextUp ? "Single game match" : "No ready match"}</div>
                    </div>
                    <div className={`rounded-2xl bg-cyan-500/10 p-4 transition-all duration-300 ${onDeck ? "animate-[queueSlide_0.42s_ease-out]" : ""}`}>
                      <div className="mb-2 text-sm uppercase tracking-[0.2em] text-cyan-300">On Deck</div>
                      <div className="text-2xl font-semibold">{onDeck ? `${playerName(tournament.players, onDeck.player1Id)} vs ${playerName(tournament.players, onDeck.player2Id)}` : "Waiting..."}</div>
                      <div className="mt-2 text-sm text-slate-300">{onDeck ? "Single game match" : "Pending results"}</div>
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><UserPlus className="h-5 w-5 text-cyan-300" /> Late Arrival</div>
                  <input value={lateName} onChange={(e) => setLateName(e.target.value)} placeholder={tournament.settings.teamMode === "doubles" ? "Team name or Player A / Player B" : "Late player name"} className="mb-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
                  <div className="mb-3 grid grid-cols-3 gap-3">
                    <button onClick={() => setLateMode("bye")} className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${lateMode === "bye" ? "bg-emerald-400 text-black" : "bg-white/10 text-white"}`}>Fill Bye</button>
                    <button onClick={() => setLateMode("unstarted")} className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${lateMode === "unstarted" ? "bg-cyan-300 text-black" : "bg-white/10 text-white"}`}>Open Slot</button>
                    <button onClick={() => setLateMode("replace-bye-player")} className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 ${lateMode === "replace-bye-player" ? "bg-amber-300 text-black" : "bg-white/10 text-white"}`}>Replace</button>
                  </div>
                  <button onClick={handleLateAdd} className="w-full rounded-2xl bg-white px-4 py-3 font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-slate-100">Add Late Entry</button>
                  {lateMessage ? <div className={`mt-3 rounded-2xl p-3 text-sm ${lateMessage.startsWith("No clean") || lateMessage.startsWith("For doubles") ? "bg-amber-500/10 text-amber-100" : "bg-emerald-500/10 text-emerald-100"}`}>{lateMessage}</div> : null}
                </Panel>

                <Panel>
                  <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><Pencil className="h-5 w-5 text-emerald-300" /> Rename / Replace Player</div>
                  <input value={renameFrom} onChange={(e) => setRenameFrom(e.target.value)} placeholder="Current player or team name" className="mb-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
                  <input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="New player or team name" className="mb-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
                  <button onClick={handleRename} className="w-full rounded-2xl bg-white px-4 py-3 font-semibold text-black transition-transform duration-150 hover:-translate-y-0.5 hover:bg-slate-100">Apply Name Change</button>
                  {renameMessage ? <div className={`mt-3 rounded-2xl p-3 text-sm ${renameMessage.startsWith("Could not") || renameMessage.startsWith("Enter ") ? "bg-amber-500/10 text-amber-100" : "bg-emerald-500/10 text-emerald-100"}`}>{renameMessage}</div> : null}
                </Panel>
              </div>

              <div className="min-w-0">
                <Panel>
                  <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><Swords className="h-5 w-5 text-emerald-300" /> Quick Bracket</div>
                  <div className="mb-3 text-sm uppercase tracking-[0.18em] text-slate-400">Live bracket board</div>
                  <BracketGraphic tournament={tournament} compact={true} animatedMatchIds={animatedMatchIds} />
                </Panel>
              </div>
            </div>
            </>
            ) : adminTab === "bracket" ? (
              <Panel>
                <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><Swords className="h-5 w-5 text-emerald-300" /> Admin Bracket Control</div>
                <div className="mb-6 min-w-0">
                  <div className="mb-3 text-sm uppercase tracking-[0.18em] text-slate-400">Bracket Graphic</div>
                  <BracketGraphic tournament={tournament} compact={true} animatedMatchIds={animatedMatchIds} />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {getBottomCardOrder(allMatches, tournament.settings.bracketType).map((match) => (
                    <MatchCard
                      key={match.id}
                      tournament={tournament}
                      match={match}
                      admin={true}
                      onStart={wrappedStart}
                      onFinish={wrappedFinish}
                    />
                  ))}
                </div>
              </Panel>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <Panel>
                  <div className="mb-4 flex items-center gap-2 text-xl font-semibold"><Medal className="h-5 w-5 text-amber-300" /> Leaderboard</div>
                  <div className="mb-4 text-sm text-slate-300">Simple standings for club use: wins, losses, active status, and final placement when the tournament finishes.</div>
                  <LeaderboardTable tournament={tournament} clubStats={clubStats} />
                </Panel>
                <Panel>
                  <div className="mb-4 text-xl font-semibold">Quick Summary</div>
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Tournament</div><div className="mt-1 text-lg font-semibold text-white">{tournament.name}</div></div>
                    <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Champion</div><div className="mt-1 text-lg font-semibold text-white">{champion || "Not decided yet"}</div></div>
                    <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Players</div><div className="mt-1 text-lg font-semibold text-white">{tournament.players.length}</div></div>
                    <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Next Up</div><div className="mt-1 text-lg font-semibold text-white">{nextUp ? `${playerName(tournament.players, nextUp.player1Id)} vs ${playerName(tournament.players, nextUp.player2Id)}` : "Waiting..."}</div></div>
                  </div>
                </Panel>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
