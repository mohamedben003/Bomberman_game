package com.bomberman.ws;

import com.bomberman.session.GuestSession;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Maps raw WebSocket transports to their decorated sender, guest session and room.
 * A guest session may be bound to at most one socket for its lifetime.
 */
@Component
public class WsSessionRegistry {

	private final ConcurrentMap<String, ClientConnection> connections = new ConcurrentHashMap<>();
	private final ConcurrentMap<UUID, String> sessionOwners = new ConcurrentHashMap<>();

	public void add(WebSocketSession decoratedSession) {
		connections.put(decoratedSession.getId(), new ClientConnection(decoratedSession));
	}

	public Optional<ClientConnection> get(String webSocketId) {
		return Optional.ofNullable(connections.get(webSocketId));
	}

	public boolean isBound(String webSocketId) {
		ClientConnection connection = connections.get(webSocketId);
		return connection != null && connection.guest() != null;
	}

	public boolean isSessionOwned(UUID sessionId) {
		return sessionOwners.containsKey(sessionId);
	}

	/**
	 * Binds a socket to its guest session and room exactly once.
	 *
	 * @return {@code false} when the socket is already bound or the session belongs to
	 * another socket
	 */
	public boolean bind(String webSocketId, GuestSession guest, UUID roomId) {
		ClientConnection connection = connections.get(webSocketId);
		if (connection == null) {
			return false;
		}
		synchronized (connection) {
			if (connection.guest() != null) {
				return false;
			}
			String owner = sessionOwners.putIfAbsent(guest.sessionId(), webSocketId);
			if (owner != null && !owner.equals(webSocketId)) {
				return false;
			}
			connection.bind(guest, roomId);
			return true;
		}
	}

	/** Removes a socket exactly once; safe to call from every close path. */
	public ClientConnection remove(String webSocketId) {
		ClientConnection connection = connections.remove(webSocketId);
		if (connection != null && connection.guest() != null) {
			sessionOwners.remove(connection.guest().sessionId(), webSocketId);
		}
		return connection;
	}

	public List<ClientConnection> connectionsInRoom(UUID roomId) {
		return connections.values()
			.stream()
			.filter(connection -> roomId.equals(connection.roomId()))
			.toList();
	}

	public List<WebSocketSession> sessionsInRoom(UUID roomId) {
		return connectionsInRoom(roomId).stream()
			.map(ClientConnection::session)
			.filter(WebSocketSession::isOpen)
			.toList();
	}

	public static final class ClientConnection {

		private final WebSocketSession session;
		private volatile GuestSession guest;
		private volatile UUID roomId;

		private ClientConnection(WebSocketSession session) {
			this.session = session;
		}

		public WebSocketSession session() {
			return session;
		}

		public GuestSession guest() {
			return guest;
		}

		public UUID roomId() {
			return roomId;
		}

		private void bind(GuestSession guest, UUID roomId) {
			this.guest = guest;
			this.roomId = roomId;
		}

	}

}
