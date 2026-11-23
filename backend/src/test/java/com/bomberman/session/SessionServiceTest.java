package com.bomberman.session;

import com.bomberman.persistence.entity.PlayerEntity;
import com.bomberman.persistence.repository.PlayerRepository;
import com.bomberman.session.dto.SessionResponse;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionServiceTest {

	private static final Instant NOW = Instant.parse("2026-11-23T18:00:00Z");
	private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

	private final PlayerRepository players = mock(PlayerRepository.class);
	private final SessionService service = new SessionService(players, CLOCK);

	@Test
	void createsASessionWithATrimmedNicknameAndPersistsThePlayer() {
		UUID playerId = UUID.randomUUID();
		PlayerEntity saved = mock(PlayerEntity.class);
		when(saved.getId()).thenReturn(playerId);
		when(players.save(any(PlayerEntity.class))).thenReturn(saved);

		SessionResponse response = service.create("  Ada  ");

		assertThat(response.nickname()).isEqualTo("Ada");
		assertThat(response.playerId()).isEqualTo(playerId);
		assertThat(response.sessionId()).isNotNull();
		assertThat(response.createdAt()).isEqualTo(NOW);

		ArgumentCaptor<PlayerEntity> captor = ArgumentCaptor.forClass(PlayerEntity.class);
		verify(players).save(captor.capture());
		assertThat(captor.getValue().getNickname()).isEqualTo("Ada");
		assertThat(captor.getValue().getCreatedAt()).isEqualTo(NOW);
	}

	@Test
	void findsAndRemovesASession() {
		UUID playerId = UUID.randomUUID();
		PlayerEntity saved = mock(PlayerEntity.class);
		when(saved.getId()).thenReturn(playerId);
		when(players.save(any(PlayerEntity.class))).thenReturn(saved);

		SessionResponse response = service.create("Ada");

		Optional<GuestSession> found = service.find(response.sessionId());
		assertThat(found).isPresent();
		assertThat(found.orElseThrow().nickname()).isEqualTo("Ada");

		service.remove(response.sessionId());
		assertThat(service.find(response.sessionId())).isEmpty();
		assertThat(service.activeSessionCount()).isZero();
	}

	@Test
	void rejectsInvalidNicknamesDefensively() {
		assertThatThrownBy(() -> service.create("   ")).isInstanceOf(InvalidNicknameException.class);
		assertThatThrownBy(() -> service.create(null)).isInstanceOf(InvalidNicknameException.class);
		assertThatThrownBy(() -> service.create("a".repeat(21))).isInstanceOf(InvalidNicknameException.class);
		assertThatThrownBy(() -> service.create("Ada\nLovelace")).isInstanceOf(InvalidNicknameException.class);
	}

}
