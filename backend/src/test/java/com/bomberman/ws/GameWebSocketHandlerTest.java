package com.bomberman.ws;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GameWebSocketHandlerTest {

	@Test
	void trimsChatText() {
		assertThat(GameWebSocketHandler.sanitizeChat("  hello room  ")).isEqualTo("hello room");
	}

	@Test
	void stripsControlCharacters() {
		assertThat(GameWebSocketHandler.sanitizeChat("he\u0000llo\nworld")).isEqualTo("helloworld");
	}

	@Test
	void acceptsExactlyThreeHundredCharacters() {
		assertThat(GameWebSocketHandler.sanitizeChat("a".repeat(300))).isEqualTo("a".repeat(300));
	}

	@Test
	void rejectsNullOrBlankMessages() {
		assertThat(GameWebSocketHandler.sanitizeChat(null)).isNull();
		assertThat(GameWebSocketHandler.sanitizeChat("")).isNull();
		assertThat(GameWebSocketHandler.sanitizeChat("   ")).isNull();
		assertThat(GameWebSocketHandler.sanitizeChat("\u0000\u0001")).isNull();
	}

	@Test
	void rejectsMessagesLongerThanThreeHundredCharactersBeforeStripping() {
		assertThat(GameWebSocketHandler.sanitizeChat("a".repeat(301))).isNull();
		assertThat(GameWebSocketHandler.sanitizeChat(("a".repeat(301)) + "\u0000")).isNull();
	}

}
