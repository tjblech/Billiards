import { useMemo } from "react";
import {
  buildLeaderboard,
  clubStatsNameKey,
  type ClubStatsMap,
  type Tournament,
} from "../lib/tournament";
import { Tag } from "./primitives";

/* ==========================================================================
   Standings. Tabular numerals, right-aligned counts, rank as a mono column.
   Career columns only appear when there is career data to show.
   ========================================================================== */

export function Leaderboard({
  tournament,
  clubStats = {},
  compact = false,
}: {
  tournament: Tournament;
  clubStats?: ClubStatsMap;
  compact?: boolean;
}) {
  const rows = useMemo(() => buildLeaderboard(tournament), [tournament]);
  const hasCareer = useMemo(
    () =>
      rows.some((r) => {
        const c = clubStats[clubStatsNameKey(r.name)];
        return Boolean(c && (c.totalMatchWins || c.tournamentWins));
      }),
    [rows, clubStats]
  );

  const cols = hasCareer && !compact
    ? "minmax(0,1fr) 46px 46px 62px 52px 74px 62px"
    : "minmax(0,1fr) 46px 46px 74px 62px";

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[440px]">
        <div
          className="grid items-center gap-2 border-b border-line px-3.5 py-2"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="eyebrow">Player</div>
          <div className="eyebrow text-right">W</div>
          <div className="eyebrow text-right">L</div>
          {hasCareer && !compact ? <div className="eyebrow text-right">Career</div> : null}
          {hasCareer && !compact ? <div className="eyebrow text-right">Titles</div> : null}
          <div className="eyebrow">Status</div>
          <div className="eyebrow text-right">Place</div>
        </div>

        <ul className="divide-y divide-line">
          {rows.map((row, i) => {
            const career = clubStats[clubStatsNameKey(row.name)];
            const medal = i === 0 ? "text-go" : "";
            return (
              <li
                key={row.playerId}
                className="grid items-center gap-2 px-3.5 py-2 transition-colors hover:bg-panel-2/60"
                style={{ gridTemplateColumns: cols }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="tnum w-5 shrink-0 font-mono text-[10px] text-fg-4">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={`truncate font-display text-[17px] leading-none ${medal || "text-fg"}`}>
                    {row.name}
                  </span>
                </div>
                <div className="tnum text-right font-mono text-[12px] text-fg">{row.wins}</div>
                <div className="tnum text-right font-mono text-[12px] text-fg-3">{row.losses}</div>
                {hasCareer && !compact ? (
                  <div className="tnum text-right font-mono text-[12px] text-fg-3">
                    {career?.totalMatchWins ?? 0}
                  </div>
                ) : null}
                {hasCareer && !compact ? (
                  <div className="tnum text-right font-mono text-[12px] text-fg-3">
                    {career?.tournamentWins ?? 0}
                  </div>
                ) : null}
                <div>
                  {row.active ? <Tag tone="go">In</Tag> : <Tag tone="muted">Out</Tag>}
                </div>
                <div className="text-right font-mono text-[11px] text-fg-2">{row.placementLabel}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
