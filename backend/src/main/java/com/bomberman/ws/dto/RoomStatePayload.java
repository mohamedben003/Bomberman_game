package com.bomberman.ws.dto;

import com.bomberman.room.Room;
import com.bomberman.room.RoomPhase;
import com.bomberman.session.GuestSession;

import java.util.List;
import java.util.UUID;

/**
 * {@code ROOM_STATE} payload. {@code you} is per recipient; everything else is identical for
 * the room. Slots are {@code null} until {@code MATCH_START}.
 */
public record RoomStatePayload(UUID roomId, RoomPhase phase, YouPlayer you, List<LobbyPlayer> players, int count,
		int maxPlayers, LobbyTimer timer) {

	public static RoomStatePayload forPlayer(Room.Snapshot room, GuestSession you) {
		List<LobbyPlayer> players = room.members()
			.stream()
			.map(member -> new LobbyPlayer(member.playerId(), member.nickname(), null, true))
			.toList();
		return new RoomStatePayload(room.id(), room.phase(),
				new YouPlayer(you.playerId(), you.nickname(), null), players, players.size(),
				Room.MAX_PLAYERS, null);
	}

	public record YouPlayer(UUID playerId, String nickname, Integer slot) {
	}

	public record LobbyPlayer(UUID playerId, String nickname, Integer slot, boolean connected) {
	}

	public record LobbyTimer(String kind, long secondsLeft, long endsAtEpochMs) {
	}

}
