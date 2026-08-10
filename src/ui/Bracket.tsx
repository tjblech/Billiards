import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getRoundTitle,
  getMatchDisplayLabel,
  isPhantomMatch,
  isByeSlot,
  playerNameForSlot,
  type BracketStream,
  type Match,
  type Tournament,
} from "../lib/tournament";
import { Btn, Empty, STATUS_META, StatusChip } from "./primitives";

/* ==========================================================================
   Bracket board.
   Cards are deliberately small and dense — the point of a bracket is seeing
   the whole shape at once, not reading one match at a time. Zoom + fit make
   it work from a phone up to a TV.
   ========================================================================== */

const CARD_W = 236;
const ROW_H = 30;
const HEAD_H = 22;
const CARD_H = HEAD_H + ROW_H * 2 + 8;
const GAP_Y = 24;
const GAP_X = 58;
const PAD = 16;
const TITLE_H = 34;

function seedOf(tournament: Tournament, id: string | null) {
  if (!id) return null;
  return tournament.players.find((p) => p.id === id)?.seed ?? null;
}

/* --- One match card -------------------------------------------------------- */
function BracketCard({
  tournament,
  match,
  flash,
}: {
  tournament: Tournament;
  match: Match;
  flash: boolean;
}) {
  const done = match.status === "finished";
  const w1 = done && match.winnerId === match.player1Id;
  const w2 = done && match.winnerId === match.player2Id;
  const bar = STATUS_META[match.status].bar;

  const row = (slot: 1 | 2, won: boolean) => {
    const bye = isByeSlot(match, slot);
    const id = slot === 1 ? match.player1Id : match.player2Id;
    const seed = seedOf(tournament, id);
    return (
      <div
        className={`flex items-center gap-2 px-2.5 ${
          done && !won ? "text-fg-4" : bye ? "text-fg-4 italic" : "text-fg"
        }`}
        style={{ height: ROW_H, boxShadow: won ? "inset 2px 0 0 0 var(--color-go)" : undefined }}
      >
        <span className="tnum w-4 shrink-0 font-mono text-[9px] text-fg-4">
          {seed ? String(seed).padStart(2, "0") : "··"}
        </span>
        <span
          className={`min-w-0 flex-1 truncate font-display text-[15px] leading-none ${
            won ? "text-go" : ""
          }`}
        >
          {playerNameForSlot(tournament.players, match, slot)}
        </span>
        {won ? <span className="shrink-0 font-mono text-[10px] text-go">W</span> : null}
      </div>
    );
  };

  return (
    <div
      className={`overflow-hidden rounded-[3px] border bg-panel accent-l ${
        match.status === "inProgress"
          ? "border-live/45"
          : match.status === "nextUp"
          ? "border-go/40"
          : "border-line"
      } ${flash ? "anim-flash" : ""}`}
      style={{ width: CARD_W, height: CARD_H, ["--bar" as string]: bar }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-line px-2.5"
        style={{ height: HEAD_H }}
      >
        <span className="font-mono text-[9px] tracking-[0.08em] text-fg-4">
          {getMatchDisplayLabel(match)}
        </span>
        {match.tableNumber ? (
          <span className="font-mono text-[9px] font-medium tracking-[0.08em] text-live">
            T{match.tableNumber}
          </span>
        ) : match.status === "nextUp" || match.status === "onDeck" ? (
          <StatusChip status={match.status} />
        ) : null}
      </div>
      <div className="pt-1">
        {row(1, w1)}
        {row(2, w2)}
      </div>
    </div>
  );
}

/* --- One bracket stream (winners / losers) --------------------------------- */
function StreamGraphic({
  tournament,
  matches,
  animatedMatchIds,
  title,
}: {
  tournament: Tournament;
  matches: Match[];
  animatedMatchIds: string[];
  title?: string;
}) {
  // Byes auto-advance; showing them is noise.
  const visible = matches.filter((m) => !isPhantomMatch(m));
  if (visible.length === 0) return null;

  const roundMap = new Map<number, Match[]>();
  for (const m of visible) {
    const arr = roundMap.get(m.round) ?? [];
    arr.push(m);
    roundMap.set(m.round, arr);
  }

  const rounds = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, ms]) => [n, [...ms].sort((a, b) => a.slot - b.slot)] as const);

  const stream: BracketStream = matches[0]?.bracket ?? "W";
  // Losers-bracket dependencies are not a clean binary tree, so use even row
  // spacing there instead of trying to centre on upstream matches.
  const simpleColumns = stream === "L";

  const top0 = (title ? TITLE_H : 0) + PAD;
  const step = CARD_H + GAP_Y;
  const maxRows = Math.max(...rounds.map(([, ms]) => ms.length));
  const height = top0 + maxRows * step + PAD;
  const width = rounds.length * CARD_W + Math.max(rounds.length - 1, 0) * GAP_X + PAD * 2;

  const centers = new Map<string, number>();

  function resolveCenter(m: Match | undefined): number | undefined {
    if (!m) return undefined;
    const c = centers.get(m.id);
    if (typeof c === "number") return c;
    if (m.source1) return resolveCenter(matches.find((p) => p.id === m.source1!.matchId));
    return undefined;
  }

  rounds.forEach(([roundNumber, roundMatches], roundIndex) => {
    roundMatches.forEach((match, index) => {
      let cy: number;
      if (roundIndex === 0 || simpleColumns) {
        cy = top0 + index * step + CARD_H / 2;
      } else {
        const dropIn = match.bracket === "L" && roundNumber > 1 && roundNumber % 2 === 1;
        const prevA = dropIn
          ? matches.find((m) => m.bracket === "L" && m.round === match.round - 1 && m.slot === match.slot)
          : matches.find(
              (m) => m.round === match.round - 1 && m.bracket === match.bracket && m.slot === match.slot * 2
            );
        const prevB = dropIn
          ? undefined
          : matches.find(
              (m) =>
                m.round === match.round - 1 && m.bracket === match.bracket && m.slot === match.slot * 2 + 1
            );
        const a = resolveCenter(prevA);
        const b = resolveCenter(prevB);
        if (typeof a === "number" && typeof b === "number") cy = (a + b) / 2;
        else if (typeof a === "number") cy = a;
        else if (typeof b === "number") cy = b;
        else cy = top0 + index * step + CARD_H / 2;
      }
      centers.set(match.id, cy);
    });
  });

  return (
    <div className="relative" style={{ width, height }}>
      {title ? (
        <div className="absolute left-4 top-0 flex items-center gap-2">
          <span className="eyebrow !text-fg-2">{title}</span>
          <span className="h-px w-10 bg-line-2" />
        </div>
      ) : null}

      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={width}
        height={height}
        fill="none"
        aria-hidden="true"
      >
        {rounds.slice(0, -1).flatMap(([, roundMatches], roundIndex) =>
          roundMatches.map((match) => {
            const fromY = centers.get(match.id) ?? 0;
            const fromX = PAD + roundIndex * (CARD_W + GAP_X) + CARD_W;
            const elbowX = fromX + GAP_X / 2;
            const dropIn = match.bracket === "L" && (match.round + 1) % 2 === 1 && match.round + 1 > 1;
            const nextSlot = dropIn ? match.slot : Math.floor(match.slot / 2);
            const next = matches.find(
              (m) => m.round === match.round + 1 && m.bracket === match.bracket && m.slot === nextSlot
            );
            const toY = next ? centers.get(next.id) ?? fromY : fromY;
            const advanced = match.status === "finished";
            return (
              <g
                key={`${match.id}-c`}
                stroke={advanced ? "rgba(198,255,61,0.30)" : "rgba(255,255,255,0.10)"}
                strokeWidth="1"
                shapeRendering="crispEdges"
              >
                <line x1={fromX} y1={fromY} x2={elbowX} y2={fromY} />
                <line x1={elbowX} y1={fromY} x2={elbowX} y2={toY} />
                <line x1={elbowX} y1={toY} x2={fromX + GAP_X} y2={toY} />
              </g>
            );
          })
        )}
      </svg>

      {rounds.map(([roundNumber, roundMatches], roundIndex) => {
        const left = PAD + roundIndex * (CARD_W + GAP_X);
        return (
          <div key={`${stream}-${roundNumber}`}>
            <div
              className="absolute font-mono text-[9px] uppercase tracking-[0.14em] text-fg-4"
              style={{ left, top: top0 - 16, width: CARD_W }}
            >
              {getRoundTitle(roundNumber, roundMatches.length, roundMatches[0]?.bracket ?? "W")}
            </div>
            {roundMatches.map((match) => (
              <div
                key={match.id}
                className="absolute"
                style={{ left, top: (centers.get(match.id) ?? 0) - CARD_H / 2 }}
              >
                <BracketCard
                  tournament={tournament}
                  match={match}
                  flash={animatedMatchIds.includes(match.id)}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* --- Grand finals ---------------------------------------------------------- */
function GrandFinals({
  tournament,
  matches,
  animatedMatchIds,
}: {
  tournament: Tournament;
  matches: Match[];
  animatedMatchIds: string[];
}) {
  if (matches.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-4 px-4 pb-4">
      {[...matches]
        .sort((a, b) => a.round - b.round)
        .map((match) => (
          <div key={match.id}>
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-fg-4">
              {getRoundTitle(match.round, 1, "GF")}
            </div>
            <BracketCard
              tournament={tournament}
              match={match}
              flash={animatedMatchIds.includes(match.id)}
            />
          </div>
        ))}
    </div>
  );
}

/* --- Board shell: zoom, fit, pan ------------------------------------------- */
export function BracketBoard({
  tournament,
  animatedMatchIds = [],
  minHeight = 320,
  maxHeight,
  defaultFit = true,
  chrome = true,
}: {
  tournament: Tournament;
  animatedMatchIds?: string[];
  minHeight?: number;
  maxHeight?: number;
  defaultFit?: boolean;
  chrome?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(defaultFit);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    setNatural({ w: el.scrollWidth, h: el.scrollHeight });
  }, []);

  useLayoutEffect(measure, [measure, tournament]);

  useEffect(() => {
    if (!fit) return;
    const outer = outerRef.current;
    if (!outer || !natural.w) return;
    const apply = () => {
      const avail = outer.clientWidth;
      const next = Math.min(1, Math.max(0.34, avail / natural.w));
      setZoom(Number(next.toFixed(3)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [fit, natural.w]);

  const isDouble = tournament.settings.bracketType === "double-elim";
  const winners = useMemo(() => tournament.matches.filter((m) => m.bracket === "W"), [tournament]);
  const losers = useMemo(() => tournament.matches.filter((m) => m.bracket === "L"), [tournament]);
  const finals = useMemo(() => tournament.matches.filter((m) => m.bracket === "GF"), [tournament]);

  const hasAny = tournament.matches.some((m) => !isPhantomMatch(m));
  if (!hasAny) return <Empty className="m-3.5">No matches to display</Empty>;

  const setZoomManual = (z: number) => {
    setFit(false);
    setZoom(Number(Math.min(1.6, Math.max(0.34, z)).toFixed(3)));
  };

  const scaledH = natural.h * zoom;
  const boxH = maxHeight ? Math.min(maxHeight, Math.max(minHeight, scaledH)) : Math.max(minHeight, scaledH);

  return (
    <div>
      {chrome ? (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
          <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-fg-4">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[1px] bg-live" /> Live
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[1px] bg-go" /> Next
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[1px] bg-deck" /> Deck
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Btn size="xs" variant="bare" onClick={() => setZoomManual(zoom - 0.12)} aria-label="Zoom out">
              –
            </Btn>
            <span className="tnum w-9 text-center font-mono text-[10px] text-fg-3">
              {Math.round(zoom * 100)}%
            </span>
            <Btn size="xs" variant="bare" onClick={() => setZoomManual(zoom + 0.12)} aria-label="Zoom in">
              +
            </Btn>
            <Btn
              size="xs"
              variant={fit ? "primary" : "outline"}
              onClick={() => setFit((f) => !f)}
            >
              Fit
            </Btn>
          </div>
        </div>
      ) : null}

      <div
        ref={outerRef}
        className="overflow-auto"
        style={{ height: boxH, WebkitOverflowScrolling: "touch" }}
      >
        <div
          style={{
            width: natural.w ? natural.w * zoom : undefined,
            height: natural.h ? natural.h * zoom : undefined,
          }}
        >
          <div
            ref={innerRef}
            className="inline-block origin-top-left"
            style={{ transform: `scale(${zoom})` }}
          >
            {!isDouble ? (
              <StreamGraphic
                tournament={tournament}
                matches={winners}
                animatedMatchIds={animatedMatchIds}
              />
            ) : (
              <div className="flex flex-col gap-1 pb-2">
                <StreamGraphic
                  tournament={tournament}
                  matches={winners}
                  animatedMatchIds={animatedMatchIds}
                  title="Winners"
                />
                {losers.length ? (
                  <StreamGraphic
                    tournament={tournament}
                    matches={losers}
                    animatedMatchIds={animatedMatchIds}
                    title="Losers"
                  />
                ) : null}
                {finals.length ? (
                  <div>
                    <div className="mb-2 ml-4 flex items-center gap-2">
                      <span className="eyebrow !text-fg-2">Grand Finals</span>
                      <span className="h-px w-10 bg-line-2" />
                    </div>
                    <GrandFinals
                      tournament={tournament}
                      matches={finals}
                      animatedMatchIds={animatedMatchIds}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
