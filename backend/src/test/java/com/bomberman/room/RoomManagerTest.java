package com.bomberman.room;

import com.bomberman.session.GuestSession;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomManagerTest {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-23T18:00:00Z"), ZoneOffset.UTC);

	private final RoomManager rooms = new RoomManager(CLOCK);

	@Test
	void placesPlayersInTheSameWaitingRoomInJoinOrder() {
		Room.Snapshot first = rooms.join(guest("Ada"));
		Room.Snapshot second = rooms.join(guest("Bob"));

		assertThat(second.id()).isEqualTo(first.id());
		assertThat(second.members()).extracting(GuestSession::nickname).containsExactly("Ada", "Bob");
		assertThat(rooms.roomCount()).isOne();
	}

	@Test
	void createsAnotherRoomWhenTheFirstIsFull() {
		for (int i = 0; i < Room.MAX_PLAYERS; i++) {
			rooms.join(guest("Player" + i));
		}
		Room.Snapshot extra = rooms.join(guest("Player4"));

		assertThat(rooms.roomCount()).isEqualTo(2);
		assertThat(extra.members()).extracting(GuestSession::nickname).containsExactly("Player4");
	}

	@Test
	void rejectsADuplicateNicknameCaseInsensitivelyInTheTargetRoom() {
		rooms.join(guest("Ada"));

		assertThatThrownBy(() -> rooms.join(guest("  ada  ".strip())))
			.isInstanceOf(NicknameTakenException.class);
		assertThat(rooms.roomCount()).isOne();
	}

	@Test
	void allowsTheSameNicknameInADifferentRoom() {
		for (int i = 0; i < Room.MAX_PLAYERS; i++) {
			rooms.join(guest("Player" + i));
		}
		Room.Snapshot second = rooms.join(guest("Player0"));

		assertThat(rooms.roomCount()).isEqualTo(2);
		assertThat(second.members()).extracting(GuestSession::nickname).containsExactly("Player0");
	}

	@Test
	void removesTheRoomWhenTheLastPlayerLeaves() {
		GuestSession ada = guest("Ada");
		Room.Snapshot room = rooms.join(ada);

		rooms.leave(room.id(), ada.playerId());

		assertThat(rooms.roomCount()).isZero();
		assertThat(rooms.snapshot(room.id())).isEmpty();
	}

	@Test
	void leavingAnUnknownRoomOrPlayerIsHarmless() {
		GuestSession ada = guest("Ada");
		Room.Snapshot room = rooms.join(ada);

		assertThat(rooms.leave(UUID.randomUUID(), ada.playerId())).isEmpty();
		assertThat(rooms.leave(room.id(), UUID.randomUUID())).isEmpty();
		assertThat(rooms.snapshot(room.id())).isPresent();
	}

	@Test
	void reportsEveryRoomSnapshot() {
		rooms.join(guest("Ada"));
		rooms.join(guest("Bob"));
		for (int i = 0; i < Room.MAX_PLAYERS; i++) {
			rooms.join(guest("Extra" + i));
		}

		List<Room.Snapshot> snapshots = rooms.snapshots();
		assertThat(snapshots).hasSize(2);
		assertThat(snapshots.get(0).members()).hasSize(Room.MAX_PLAYERS);
		assertThat(snapshots.get(1).members()).hasSize(2);
	}

	private static GuestSession guest(String nickname) {
		return new GuestSession(UUID.randomUUID(), UUID.randomUUID(), nickname, CLOCK.instant());
	}

}
