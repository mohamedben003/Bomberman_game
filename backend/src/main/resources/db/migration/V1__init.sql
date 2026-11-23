-- Bomberman schema (see docs/ARCHITECTURE.md §8).
-- Live rooms, positions, bombs, flames and chat are never stored.

CREATE TABLE players (
    id         UUID PRIMARY KEY,
    nickname   VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT players_nickname_length CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 20)
);

CREATE TABLE matches (
    id               UUID PRIMARY KEY,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ NOT NULL,
    outcome          VARCHAR(16) NOT NULL,
    winner_player_id UUID REFERENCES players (id),
    CONSTRAINT matches_time_order CHECK (ended_at >= started_at),
    CONSTRAINT matches_outcome CHECK (outcome IN ('WIN', 'DRAW')),
    CONSTRAINT matches_winner_consistency CHECK (
        (outcome = 'WIN' AND winner_player_id IS NOT NULL)
        OR (outcome = 'DRAW' AND winner_player_id IS NULL)
    )
);

CREATE TABLE participations (
    id              UUID PRIMARY KEY,
    match_id        UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    player_id       UUID NOT NULL REFERENCES players (id),
    corner          VARCHAR(16) NOT NULL,
    remaining_lives INTEGER NOT NULL,
    result          VARCHAR(16) NOT NULL,
    CONSTRAINT participations_unique_player UNIQUE (match_id, player_id),
    CONSTRAINT participations_corner CHECK (
        corner IN ('TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT')
    ),
    CONSTRAINT participations_lives CHECK (remaining_lives BETWEEN 0 AND 3),
    CONSTRAINT participations_result CHECK (
        result IN ('WINNER', 'ELIMINATED', 'DISCONNECTED', 'DRAW')
    )
);

CREATE INDEX idx_matches_ended_at ON matches (ended_at DESC);
CREATE INDEX idx_participations_match_id ON participations (match_id);
CREATE INDEX idx_participations_player_id ON participations (player_id);
