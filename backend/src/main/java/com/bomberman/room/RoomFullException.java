package com.bomberman.room;

public class RoomFullException extends RuntimeException {

	public RoomFullException() {
		super("The room already has four players.");
	}

}
