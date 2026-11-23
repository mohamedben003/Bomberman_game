package com.bomberman.ws;

import com.bomberman.common.ValidationLimits;
import com.bomberman.room.NicknameTakenException;
import com.bomberman.room.Room;
import com.bomberman.room.RoomFullException;
import com.bomberman.room.RoomManager;
import com.bomberman.session.GuestSession;
import com.bomberman.session.SessionService;
import com.bomberman.ws.WsSessionRegistry.ClientConnection;
import com.bomberman.ws.dto.ChatPayload;
import com.bomberman.ws.dto.ErrorPayload;
import com.bomberman.ws.dto.RoomStatePayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.time.Clock;
import java.util.List;
import java.util.UUID;

/**
 * Native JSON WebSocket endpoint at {@code /ws}.
 *
 * <p>Phase 0 supports the first-message {@code JOIN}, {@code ROOM_STATE}, room-scoped
 * {@code CHAT} and the {@code ERROR} envelope. All live state is in memory; nothing here
 * is persisted.</p>
 */
@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

	private static final Logger log = LoggerFactory.getLogger(GameWebSocketHandler.class);
	private static final int SEND_TIME_LIMIT_MS = 5_000;
	private static final int SEND_BUFFER_BYTES = 512 * 1024;

	private final JsonMapper jsonMapper;
	private final WsSessionRegistry registry;
	private final WsSender sender;
	private final SessionService sessions;
	private final RoomManager rooms;
	private final Clock clock;

	public GameWebSocketHandler(JsonMapper jsonMapper, WsSessionRegistry registry, WsSender sender,
			SessionService sessions, RoomManager rooms, Clock clock) {
		this.jsonMapper = jsonMapper;
		this.registry = registry;
		this.sender = sender;
		this.sessions = sessions;
		this.rooms = rooms;
		this.clock = clock;
	}

	@Override
	public void afterConnectionEstablished(WebSocketSession session) {
		session.setTextMessageSizeLimit(ValidationLimits.MAX_WS_MESSAGE_BYTES);
		session.setBinaryMessageSizeLimit(ValidationLimits.MAX_WS_MESSAGE_BYTES);
		registry.add(new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_BYTES));
		log.debug("WebSocket opened: {}", session.getId());
	}

	@Override
	protected void handleTextMessage(WebSocketSession session, TextMessage message) {
		JsonNode root;
		try {
			root = jsonMapper.readTree(message.getPayload());
		}
		catch (JacksonException exception) {
			sendError(session, "INVALID_MESSAGE", "Malformed JSON.", false);
			return;
		}

		if (root == null || !root.isObject()) {
			sendError(session, "INVALID_MESSAGE", "A message must be a JSON object.", false);
			return;
		}
		JsonNode typeNode = root.get("type");
		if (typeNode == null || !typeNode.isTextual()) {
			sendError(session, "INVALID_MESSAGE", "A message must have a textual type.", false);
			return;
		}
		JsonNode data = root.get("data");
		if (data != null && !data.isNull() && !data.isObject()) {
			sendError(session, "INVALID_MESSAGE", "The data field must be an object.", false);
			return;
		}

		ClientConnection connection = registry.get(session.getId()).orElse(null);
		if (connection == null) {
			return;
		}

		String type = typeNode.asText();
		if (connection.guest() == null) {
			if (!"JOIN".equals(type)) {
				sendError(session, "INVALID_MESSAGE", "The first message must be JOIN.", false);
				return;
			}
			handleJoin(session, connection, data);
			return;
		}

		switch (type) {
			case "JOIN" -> sendError(session, "ALREADY_IN_ROOM", "You are already in a room.", false);
			case "CHAT" -> handleChat(session, connection, data);
			default -> sendError(session, "UNKNOWN_TYPE", "Unsupported message type: " + type, false);
		}
	}

	private void handleJoin(WebSocketSession session, ClientConnection connection, JsonNode data) {
		synchronized (connection) {
			if (connection.guest() != null) {
				sendError(session, "ALREADY_IN_ROOM", "You are already in a room.", false);
				return;
			}

			UUID sessionId = readUuid(data, "sessionId");
			if (sessionId == null) {
				sendErrorAndClose(session, "INVALID_SESSION", "Missing or malformed session id.");
				return;
			}

			GuestSession guest = sessions.find(sessionId).orElse(null);
			if (guest == null) {
				sendErrorAndClose(session, "INVALID_SESSION", "Unknown or expired session.");
				return;
			}
			if (registry.isSessionOwned(sessionId)) {
				sendError(session, "ALREADY_IN_ROOM", "This session is already connected.", false);
				return;
			}

			Room.Snapshot snapshot;
			try {
				snapshot = rooms.join(guest);
			}
			catch (NicknameTakenException exception) {
				sendErrorAndClose(session, "NICKNAME_TAKEN",
						"That nickname is already used in this room.");
				return;
			}
			catch (RoomFullException exception) {
				sendError(session, "ROOM_FULL", "The room is full. Please retry.", false);
				return;
			}

			if (!registry.bind(session.getId(), guest, snapshot.id())) {
				rooms.leave(snapshot.id(), guest.playerId());
				sendError(session, "ALREADY_IN_ROOM", "This session is already connected.", false);
				return;
			}

			broadcastRoomState(snapshot.id());
			broadcastSystemChat(snapshot.id(), guest.nickname() + " joined the room.");
		}
	}

	private void handleChat(WebSocketSession session, ClientConnection connection, JsonNode data) {
		String rawText = null;
		if (data != null) {
			JsonNode textNode = data.get("text");
			if (textNode != null && textNode.isTextual()) {
				rawText = textNode.asText();
			}
		}

		String text = sanitizeChat(rawText);
		if (text == null) {
			sendError(session, "CHAT_INVALID", "Chat messages must be 1 to 300 characters.", false);
			return;
		}

		GuestSession guest = connection.guest();
		ChatPayload payload = new ChatPayload(UUID.randomUUID(),
				new ChatPayload.ChatAuthor(guest.playerId(), guest.nickname()), text,
				clock.instant().toString(), false);
		sender.broadcast(connection.roomId(), WsMessage.of("CHAT", payload));
	}

	private void broadcastRoomState(UUID roomId) {
		List<ClientConnection> connections = registry.connectionsInRoom(roomId);
		if (connections.isEmpty()) {
			return;
		}
		rooms.snapshot(roomId).ifPresent(snapshot -> {
			for (ClientConnection connection : connections) {
				GuestSession guest = connection.guest();
				if (guest != null) {
					sender.send(connection.session(),
							WsMessage.of("ROOM_STATE", RoomStatePayload.forPlayer(snapshot, guest)));
				}
			}
		});
	}

	private void broadcastSystemChat(UUID roomId, String text) {
		ChatPayload payload = new ChatPayload(UUID.randomUUID(), null, text, clock.instant().toString(), true);
		sender.broadcast(roomId, WsMessage.of("CHAT", payload));
	}

	private void sendError(WebSocketSession session, String code, String message, boolean fatal) {
		WebSocketSession target = registry.get(session.getId())
			.map(ClientConnection::session)
			.orElse(session);
		sender.send(target, WsMessage.of("ERROR", new ErrorPayload(code, message, fatal)));
	}

	private void sendErrorAndClose(WebSocketSession session, String code, String message) {
		sendError(session, code, message, true);
		WebSocketSession target = registry.get(session.getId())
			.map(ClientConnection::session)
			.orElse(session);
		try {
			if (target.isOpen()) {
				target.close(CloseStatus.POLICY_VIOLATION);
			}
		}
		catch (IOException exception) {
			log.debug("Could not close WebSocket {}: {}", session.getId(), exception.getMessage());
		}
	}

	@Override
	protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
		try {
			session.close(new CloseStatus(1003, "Binary frames are not supported."));
		}
		catch (IOException exception) {
			log.debug("Could not close WebSocket {}: {}", session.getId(), exception.getMessage());
		}
	}

	@Override
	public void handleTransportError(WebSocketSession session, Throwable exception) {
		log.debug("WebSocket transport error on {}: {}", session.getId(), exception.getMessage());
		cleanup(session.getId());
		try {
			if (session.isOpen()) {
				session.close(CloseStatus.SERVER_ERROR);
			}
		}
		catch (IOException closeFailure) {
			log.debug("Could not close WebSocket {}: {}", session.getId(), closeFailure.getMessage());
		}
	}

	@Override
	public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
		cleanup(session.getId());
	}

	private void cleanup(String webSocketId) {
		ClientConnection connection = registry.remove(webSocketId);
		if (connection == null || connection.guest() == null) {
			return;
		}
		GuestSession guest = connection.guest();
		UUID roomId = connection.roomId();
		sessions.remove(guest.sessionId());
		rooms.leave(roomId, guest.playerId()).ifPresent(snapshot -> {
			broadcastRoomState(roomId);
			broadcastSystemChat(roomId, guest.nickname() + " left the room.");
		});
		log.debug("WebSocket {} closed; {} left room {}", webSocketId, guest.nickname(), roomId);
	}

	static String sanitizeChat(String raw) {
		if (raw == null) {
			return null;
		}
		String trimmed = raw.strip();
		if (trimmed.length() > ValidationLimits.CHAT_MAX_LEN) {
			return null;
		}
		String sanitized = trimmed.replaceAll("\\p{Cntrl}", "").strip();
		return sanitized.isEmpty() ? null : sanitized;
	}

	private static UUID readUuid(JsonNode data, String field) {
		if (data == null) {
			return null;
		}
		JsonNode node = data.get(field);
		if (node == null || !node.isTextual()) {
			return null;
		}
		try {
			return UUID.fromString(node.asText());
		}
		catch (IllegalArgumentException exception) {
			return null;
		}
	}

}
