package com.bomberman.ws;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.UUID;

/**
 * Serializes each outgoing frame once and sends it through the decorated sessions.
 * Send failures are logged and never propagate into room or game code.
 */
@Component
public class WsSender {

	private static final Logger log = LoggerFactory.getLogger(WsSender.class);

	private final JsonMapper jsonMapper;
	private final WsSessionRegistry registry;

	public WsSender(JsonMapper jsonMapper, WsSessionRegistry registry) {
		this.jsonMapper = jsonMapper;
		this.registry = registry;
	}

	public void send(WebSocketSession session, WsMessage message) {
		String json = serialize(message);
		if (json != null) {
			sendJson(session, json);
		}
	}

	public void broadcast(UUID roomId, WsMessage message) {
		String json = serialize(message);
		if (json == null) {
			return;
		}
		List<WebSocketSession> sessions = registry.sessionsInRoom(roomId);
		for (WebSocketSession session : sessions) {
			sendJson(session, json);
		}
	}

	private String serialize(WsMessage message) {
		try {
			return jsonMapper.writeValueAsString(message);
		}
		catch (RuntimeException exception) {
			log.error("Could not serialize WebSocket message {}", message.type(), exception);
			return null;
		}
	}

	private void sendJson(WebSocketSession session, String json) {
		if (session == null || !session.isOpen()) {
			return;
		}
		try {
			session.sendMessage(new TextMessage(json));
		}
		catch (Exception exception) {
			log.warn("Could not send WebSocket message to session {}: {}", session.getId(),
					exception.getMessage());
		}
	}

}
