package com.bomberman.session;

import com.bomberman.common.ValidationLimits;
import com.bomberman.persistence.entity.PlayerEntity;
import com.bomberman.persistence.repository.PlayerRepository;
import com.bomberman.session.dto.SessionResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Creates guest players, persists the player row and keeps the opaque session in memory.
 * Sessions disappear when their WebSocket closes (no reconnect/rejoin support).
 */
@Service
public class SessionService {

	public static final long SESSION_TTL_MINUTES = 30;

	private final PlayerRepository players;
	private final Clock clock;
	private final ConcurrentMap<UUID, GuestSession> sessions = new ConcurrentHashMap<>();

	public SessionService(PlayerRepository players, Clock clock) {
		this.players = players;
		this.clock = clock;
	}

	@Transactional
	public SessionResponse create(String rawNickname) {
		String nickname = normalizeNickname(rawNickname);
		Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);

		PlayerEntity player = players.save(new PlayerEntity(nickname, now));
		GuestSession session = new GuestSession(UUID.randomUUID(), player.getId(), nickname, now);
		sessions.put(session.sessionId(), session);

		return new SessionResponse(session.sessionId(), session.playerId(), session.nickname(),
				session.createdAt());
	}

	public Optional<GuestSession> find(UUID sessionId) {
		return sessionId == null ? Optional.empty() : Optional.ofNullable(sessions.get(sessionId));
	}

	public void remove(UUID sessionId) {
		if (sessionId != null) {
			sessions.remove(sessionId);
		}
	}

	public int activeSessionCount() {
		return sessions.size();
	}

	/** Trims and re-validates defensively; controllers already validated the DTO. */
	public static String normalizeNickname(String rawNickname) {
		String nickname = rawNickname == null ? "" : rawNickname.strip();
		if (nickname.isEmpty() || nickname.length() > ValidationLimits.NICKNAME_MAX
				|| nickname.codePoints().anyMatch(Character::isISOControl)) {
			throw new InvalidNicknameException("Nickname must be 1 to 20 characters.");
		}
		return nickname;
	}

}
