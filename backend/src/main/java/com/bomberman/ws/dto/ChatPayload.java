package com.bomberman.ws.dto;

import java.util.UUID;

public record ChatPayload(UUID messageId, ChatAuthor from, String text, String sentAt, boolean system) {

	public record ChatAuthor(UUID playerId, String nickname) {
	}

}
