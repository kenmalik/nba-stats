import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd


@dataclass
class BoxStats:
    games_played: int
    points: float
    rebounds: float
    assists: float


@dataclass
class SeasonStats:
    season: str
    team_abbreviation: str
    box_stats: BoxStats


@dataclass
class Player:
    name: str
    seasons: list[SeasonStats]


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
                    box_stats=BoxStats(
                        games_played=int(row["gp"]),
                        points=float(row["pts"]),
                        rebounds=float(row["reb"]),
                        assists=float(row["ast"]),
                    ),
                )
            )

        players.append(Player(name=str(player_name), seasons=seasons))

    return players


def main() -> None:
    input_path = Path("./all_seasons.csv")
    output_path = Path("./players.json")

    df = pd.read_csv(input_path)
    players = build_players(df)

    with output_path.open("w", encoding="utf-8") as output_file:
        json.dump([asdict(player) for player in players], output_file, indent=2)

    print(f"Wrote {len(players)} players to {output_path}")


if __name__ == "__main__":
    main()
