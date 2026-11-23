package com.bomberman.session.dto;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(UUID sessionId, UUID playerId, String nickname, Instant createdAt) {
}
