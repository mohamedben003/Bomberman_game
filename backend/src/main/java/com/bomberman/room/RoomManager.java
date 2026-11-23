package com.bomberman.room;

import com.bomberman.session.GuestSession;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Matchmaking in phase 0: place a joining player in the first open {@code WAITING} room,
 * otherwise create a new room. Rooms are removed as soon as they become empty.
 *
 * <p>All mutations are serialized on this component, so a room can never exceed four players
 * through a check-then-act race.</p>
 */
@Component
public class RoomManager {

	private final Map<UUID, Room> rooms = new LinkedHashMap<>();
	private final Clock clock;

	public RoomManager(Clock clock) {
		this.clock = clock;
	}

	public synchronized Room.Snapshot join(GuestSession guest) {
		Room target = rooms.values()
			.stream()
			.filter(room -> room.phase() == RoomPhase.WAITING && !room.isFull())
			.findFirst()
			.orElse(null);

		if (target == null) {
			target = new Room(UUID.randomUUID(), clock.instant());
			rooms.put(target.id(), target);
		}
		else if (target.hasNickname(guest.nickname())) {
			throw new NicknameTakenException(guest.nickname());
		}

		target.add(guest);
		return target.snapshot();
	}

	public synchronized Optional<Room.Snapshot> leave(UUID roomId, UUID playerId) {
		Room room = rooms.get(roomId);
		if (room == null) {
			return Optional.empty();
		}
		boolean removed = room.remove(playerId);
		if (room.isEmpty()) {
			rooms.remove(roomId);
			return Optional.empty();
		}
		return removed ? Optional.of(room.snapshot()) : Optional.empty();
	}

	public synchronized Optional<Room.Snapshot> snapshot(UUID roomId) {
		Room room = rooms.get(roomId);
		return room == null ? Optional.empty() : Optional.of(room.snapshot());
	}

	public synchronized int roomCount() {
		return rooms.size();
	}

	public synchronized List<Room.Snapshot> snapshots() {
		List<Room.Snapshot> snapshots = new ArrayList<>(rooms.size());
		rooms.values().forEach(room -> snapshots.add(room.snapshot()));
		return List.copyOf(snapshots);
	}

}
