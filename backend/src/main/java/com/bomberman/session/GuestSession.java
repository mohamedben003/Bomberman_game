package com.bomberman.session;

import java.time.Instant;
import java.util.UUID;

/**
 * In-memory guest identity. The {@code sessionId} is the only credential a client presents,
 * and it is used once, on WebSocket {@code JOIN}. Nothing here is persisted.
 */
public record GuestSession(UUID sessionId, UUID playerId, String nickname, Instant createdAt) {
}
