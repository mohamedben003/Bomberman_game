package com.bomberman.session;

import com.bomberman.session.dto.SessionResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SessionController.class)
@Import(SessionControllerTest.TestClockConfiguration.class)
class SessionControllerTest {

	private static final Instant NOW = Instant.parse("2026-11-23T18:00:00Z");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private SessionService sessionService;

	@Test
	void createsASession() throws Exception {
		UUID sessionId = UUID.randomUUID();
		UUID playerId = UUID.randomUUID();
		when(sessionService.create("Ada"))
			.thenReturn(new SessionResponse(sessionId, playerId, "Ada", NOW));

		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"nickname":"Ada"}
						"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.sessionId").value(sessionId.toString()))
			.andExpect(jsonPath("$.playerId").value(playerId.toString()))
			.andExpect(jsonPath("$.nickname").value("Ada"))
			.andExpect(jsonPath("$.createdAt").value("2026-11-23T18:00:00Z"));
	}

	@Test
	void rejectsABlankNickname() throws Exception {
		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"nickname":"   "}
						"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_NICKNAME"))
			.andExpect(jsonPath("$.path").value("/api/sessions"));

		verifyNoInteractions(sessionService);
	}

	@Test
	void rejectsAMissingNickname() throws Exception {
		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_NICKNAME"));

		verifyNoInteractions(sessionService);
	}

	@Test
	void rejectsMalformedJson() throws Exception {
		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{not json"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verifyNoInteractions(sessionService);
	}

	@Test
	void mapsAnInvalidNicknameException() throws Exception {
		when(sessionService.create(anyString()))
			.thenThrow(new InvalidNicknameException("Nickname must be 1 to 20 characters."));

		mockMvc.perform(post("/api/sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"nickname":"Ada"}
						"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_NICKNAME"));
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class TestClockConfiguration {

		@Bean
		Clock clock() {
			return Clock.fixed(NOW, ZoneOffset.UTC);
		}

	}

}
