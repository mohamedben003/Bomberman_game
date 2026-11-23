package com.bomberman.ws;

import com.bomberman.TestcontainersConfiguration;
import com.bomberman.session.SessionService;
import com.bomberman.session.dto.SessionResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end WebSocket check for the phase 0 contract: JOIN, per-recipient ROOM_STATE,
 * room-scoped CHAT and fatal JOIN errors. Requires Docker for PostgreSQL.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class GameWebSocketIntegrationTest {

	private static final Duration TIMEOUT = Duration.ofSeconds(5);

	@LocalServerPort
	private int port;

	@Autowired
	private SessionService sessions;

	@Autowired
	private JsonMapper jsonMapper;

	private final List<Client> clients = new ArrayList<>();

	@AfterEach
	void closeClients() {
		clients.forEach(Client::close);
	}

	@Test
	void twoClientsJoinTheSameRoomExchangeChatAndSeeDepartures() throws Exception {
		SessionResponse ada = sessions.create("Ada");
		SessionResponse bob = sessions.create("Bob");
		Client clientA = connect();
		Client clientB = connect();

		clientA.join(ada.sessionId());
		JsonNode stateA = clientA.await(message -> "ROOM_STATE".equals(type(message)));
		assertThat(stateA.at("/data/phase").asText()).isEqualTo("WAITING");
		assertThat(stateA.at("/data/count").asInt()).isOne();
		assertThat(stateA.at("/data/you/nickname").asText()).isEqualTo("Ada");
		assertThat(stateA.at("/data/players").size()).isOne();

		clientB.join(bob.sessionId());
		JsonNode stateB = clientB.await(message -> "ROOM_STATE".equals(type(message))
				&& message.at("/data/count").asInt() == 2);
		assertThat(stateB.at("/data/you/nickname").asText()).isEqualTo("Bob");
		assertThat(stateB.at("/data/players").size()).isEqualTo(2);

		JsonNode updatedA = clientA.await(message -> "ROOM_STATE".equals(type(message))
				&& message.at("/data/count").asInt() == 2);
		assertThat(updatedA.at("/data/roomId").asText()).isEqualTo(stateA.at("/data/roomId").asText());

		JsonNode joinedNotice = clientA.await(message -> "CHAT".equals(type(message))
				&& message.at("/data/system").asBoolean()
				&& message.at("/data/text").asText().contains("Bob joined"));
		assertThat(joinedNotice.at("/data/text").asText()).contains("Bob joined");

		clientA.send("""
				{"type":"CHAT","data":{"text":"  hello room  "}}""");
		JsonNode chatA = clientA.await(message -> "CHAT".equals(type(message))
				&& !message.at("/data/system").asBoolean());
		JsonNode chatB = clientB.await(message -> "CHAT".equals(type(message))
				&& !message.at("/data/system").asBoolean());
		assertThat(chatA.at("/data/text").asText()).isEqualTo("hello room");
		assertThat(chatB.at("/data/text").asText()).isEqualTo("hello room");
		assertThat(chatA.at("/data/from/nickname").asText()).isEqualTo("Ada");
		assertThat(chatA.at("/data/messageId").asText())
			.isEqualTo(chatB.at("/data/messageId").asText());

		clientA.close();
		JsonNode leftNotice = clientB.await(message -> "CHAT".equals(type(message))
				&& message.at("/data/system").asBoolean()
				&& message.at("/data/text").asText().contains("Ada left"));
		assertThat(leftNotice.at("/data/text").asText()).contains("Ada left");
		JsonNode remaining = clientB.await(message -> "ROOM_STATE".equals(type(message))
				&& message.at("/data/count").asInt() == 1);
		assertThat(remaining.at("/data/you/nickname").asText()).isEqualTo("Bob");
	}

	@Test
	void duplicateNicknameIsRejectedFatal() throws Exception {
		SessionResponse ada = sessions.create("Ada");
		SessionResponse duplicate = sessions.create("ada");
		Client clientA = connect();
		Client clientB = connect();

		clientA.join(ada.sessionId());
		clientA.await(message -> "ROOM_STATE".equals(type(message)));

		clientB.join(duplicate.sessionId());
		JsonNode error = clientB.await(message -> "ERROR".equals(type(message)));
		assertThat(error.at("/data/code").asText()).isEqualTo("NICKNAME_TAKEN");
		assertThat(error.at("/data/fatal").asBoolean()).isTrue();
	}

	@Test
	void invalidSessionIsRejectedFatal() throws Exception {
		Client client = connect();
		client.send("""
				{"type":"JOIN","data":{"sessionId":"00000000-0000-0000-0000-000000000000"}}""");

		JsonNode error = client.await(message -> "ERROR".equals(type(message)));
		assertThat(error.at("/data/code").asText()).isEqualTo("INVALID_SESSION");
		assertThat(error.at("/data/fatal").asBoolean()).isTrue();
	}

	@Test
	void nonJoinFirstMessageIsRejected() throws Exception {
		Client client = connect();
		client.send("""
				{"type":"CHAT","data":{"text":"too soon"}}""");

		JsonNode error = client.await(message -> "ERROR".equals(type(message)));
		assertThat(error.at("/data/code").asText()).isEqualTo("INVALID_MESSAGE");
	}

	@Test
	void malformedJsonIsRejectedWithoutClosingTheSocket() throws Exception {
		Client client = connect();
		client.send("{not json");

		JsonNode error = client.await(message -> "ERROR".equals(type(message)));
		assertThat(error.at("/data/code").asText()).isEqualTo("INVALID_MESSAGE");
		assertThat(error.at("/data/fatal").asBoolean()).isFalse();
	}

	private Client connect() throws Exception {
		Client client = new Client();
		clients.add(client);
		client.open();
		return client;
	}

	private static String type(JsonNode message) {
		return message.path("type").asText();
	}

	private final class Client extends TextWebSocketHandler {

		private final BlockingQueue<JsonNode> incoming = new LinkedBlockingQueue<>();
		private final List<JsonNode> seen = new ArrayList<>();
		private WebSocketSession session;

		void open() throws Exception {
			session = new StandardWebSocketClient()
				.execute(this, "ws://localhost:" + port + "/ws")
				.get(10, TimeUnit.SECONDS);
		}

		@Override
		protected void handleTextMessage(WebSocketSession session, TextMessage message) {
			incoming.add(jsonMapper.readTree(message.getPayload()));
		}

		void send(String json) throws Exception {
			session.sendMessage(new TextMessage(json));
		}

		void join(java.util.UUID sessionId) throws Exception {
			send("""
					{"type":"JOIN","data":{"sessionId":"%s"}}""".formatted(sessionId));
		}

		JsonNode await(Predicate<JsonNode> predicate) throws InterruptedException {
			long deadline = System.nanoTime() + TIMEOUT.toNanos();
			while (true) {
				for (JsonNode message : seen) {
					if (predicate.test(message)) {
						return message;
					}
				}
				long remainingNanos = deadline - System.nanoTime();
				if (remainingNanos <= 0) {
					throw new AssertionError("Timed out; received: " + seen);
				}
				JsonNode message = incoming.poll(Math.min(remainingNanos, TimeUnit.MILLISECONDS.toNanos(50)),
						TimeUnit.NANOSECONDS);
				if (message != null) {
					seen.add(message);
				}
			}
		}

		void close() {
			try {
				if (session != null && session.isOpen()) {
					session.close();
				}
			}
			catch (Exception ignored) {
				// test cleanup
			}
		}

	}

}
