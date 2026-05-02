import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd


@dataclass
class PlayerStats:
    points: float
    rebounds: float
    assists: float
    offensive_rebound_percentage: float
    defensive_rebound_percentage: float
    true_shooting_percentage: float
    assist_percentage: float


@dataclass
class SeasonStats:
    season: str
    team_abbreviation: str
    box_stats: PlayerStats


@dataclass
class Player:
    name: str
    seasons: list[SeasonStats]


def aggregate_player_seasons(df: pd.DataFrame) -> pd.DataFrame:
    records: list[dict[str, str | int | float]] = []

    grouped = df.groupby(["player_name", "season"], sort=True)

    for (player_name, season), season_rows in grouped:
        total_games = int(season_rows["gp"].sum())
        weighted_games = total_games if total_games > 0 else len(season_rows)
        weights = season_rows["gp"] if total_games > 0 else None

        records.append(
            {
                "player_name": str(player_name),
                "season": str(season),
                "team_abbreviation": (
                    str(season_rows["team_abbreviation"].iloc[0])
                    if len(season_rows) == 1
                    else "TOT"
                ),
                "pts": float((season_rows["pts"] * weights).sum() / weighted_games)
                if weights is not None
                else float(season_rows["pts"].mean()),
                "reb": float((season_rows["reb"] * weights).sum() / weighted_games)
                if weights is not None
                else float(season_rows["reb"].mean()),
                "ast": float((season_rows["ast"] * weights).sum() / weighted_games)
                if weights is not None
                else float(season_rows["ast"].mean()),
                "oreb_pct": float(
                    (season_rows["oreb_pct"] * weights).sum() / weighted_games
                )
                if weights is not None
                else float(season_rows["oreb_pct"].mean()),
                "dreb_pct": float(
                    (season_rows["dreb_pct"] * weights).sum() / weighted_games
                )
                if weights is not None
                else float(season_rows["dreb_pct"].mean()),
                "ts_pct": float((season_rows["ts_pct"] * weights).sum() / weighted_games)
                if weights is not None
                else float(season_rows["ts_pct"].mean()),
                "ast_pct": float(
                    (season_rows["ast_pct"] * weights).sum() / weighted_games
                )
                if weights is not None
                else float(season_rows["ast_pct"].mean()),
            }
        )

    return pd.DataFrame.from_records(records)


def build_players(df: pd.DataFrame) -> list[Player]:
    players: list[Player] = []

    for player_name, player_rows in df.groupby("player_name", sort=True):
        seasons: list[SeasonStats] = []
        player_rows = player_rows.sort_values("season")

        for _, row in player_rows.iterrows():
            seasons.append(
                SeasonStats(
                    season=str(row["season"]),
                    team_abbreviation=str(row["team_abbreviation"]),
                    box_stats=PlayerStats(
                        points=float(row["pts"]),
                        rebounds=float(row["reb"]),
                        assists=float(row["ast"]),
                        offensive_rebound_percentage=float(row["oreb_pct"]),
                        defensive_rebound_percentage=float(row["dreb_pct"]),
                        true_shooting_percentage=float(row["ts_pct"]),
                        assist_percentage=float(row["ast_pct"]),
                    ),
                )
            )

        players.append(Player(name=str(player_name), seasons=seasons))

    return players


def main() -> None:
    input_path = Path("./all_seasons.csv")
    output_path = Path("./players.json")

    df = pd.read_csv(input_path)
    aggregated_df = aggregate_player_seasons(df)
    players = build_players(aggregated_df)

    with output_path.open("w", encoding="utf-8") as output_file:
        json.dump([asdict(player) for player in players], output_file, indent=2)

    print(f"Wrote {len(players)} players to {output_path}")


if __name__ == "__main__":
    main()
