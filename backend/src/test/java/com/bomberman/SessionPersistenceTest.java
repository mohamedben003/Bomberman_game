package com.bomberman;

import com.bomberman.persistence.entity.PlayerEntity;
import com.bomberman.persistence.repository.PlayerRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full-stack REST + Flyway + JPA check against Testcontainers PostgreSQL.
 * Requires Docker; unit-only runs can exclude this class and are recorded in the audit.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SessionPersistenceTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private PlayerRepository players;

	@AfterEach
	void cleanUp() {
		players.deleteAll();
	}

	@Test
	void createsASessionAndPersistsATrimmedPlayer() throws Exception {
		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"nickname":"  Ada  "}
						"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.nickname").value("Ada"))
			.andExpect(jsonPath("$.playerId").isNotEmpty())
			.andExpect(jsonPath("$.sessionId").isNotEmpty());

		List<PlayerEntity> saved = players.findAll();
		assertThat(saved).hasSize(1);
		assertThat(saved.getFirst().getNickname()).isEqualTo("Ada");
		assertThat(saved.getFirst().getCreatedAt()).isNotNull();
	}

	@Test
	void rejectsAnInvalidNicknameWithoutPersistingAnything() throws Exception {
		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"nickname":"   "}
						"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_NICKNAME"));

		assertThat(players.count()).isZero();
	}

}
