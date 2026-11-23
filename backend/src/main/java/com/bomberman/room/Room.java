package com.bomberman.room;

import com.bomberman.session.GuestSession;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * One in-memory room. Membership is kept in join order. Only the lobby phase is implemented
 * in phase 0; timers, matches and spectators are added by later phases.
 */
public final class Room {

	public static final int MAX_PLAYERS = 4;

	private final UUID id;
	private final Instant createdAt;
	private final Map<UUID, GuestSession> members = new LinkedHashMap<>();
	private RoomPhase phase = RoomPhase.WAITING;

	public Room(UUID id, Instant createdAt) {
		this.id = id;
		this.createdAt = createdAt;
	}

	public UUID id() {
		return id;
	}

	public Instant createdAt() {
		return createdAt;
	}

	public synchronized RoomPhase phase() {
		return phase;
	}

	public synchronized void phase(RoomPhase phase) {
		this.phase = phase;
	}

	public synchronized boolean hasNickname(String nickname) {
		return members.values()
			.stream()
			.anyMatch(member -> member.nickname().equalsIgnoreCase(nickname));
	}

	public synchronized boolean contains(UUID playerId) {
		return members.containsKey(playerId);
	}

	public synchronized int size() {
		return members.size();
	}

	public synchronized boolean isFull() {
		return members.size() >= MAX_PLAYERS;
	}

	public synchronized boolean isEmpty() {
		return members.isEmpty();
	}

	/**
	 * Adds a member in join order.
	 *
	 * @throws NicknameTakenException when the trimmed nickname collides case-insensitively
	 * @throws RoomFullException when four players are already present
	 */
	public synchronized void add(GuestSession member) {
		if (members.size() >= MAX_PLAYERS) {
			throw new RoomFullException();
		}
		if (hasNickname(member.nickname())) {
			throw new NicknameTakenException(member.nickname());
		}
		members.put(member.playerId(), member);
	}

	public synchronized boolean remove(UUID playerId) {
		return members.remove(playerId) != null;
	}

	public synchronized Snapshot snapshot() {
		return new Snapshot(id, phase, List.copyOf(members.values()));
	}

	public record Snapshot(UUID id, RoomPhase phase, List<GuestSession> members) {
	}

}
