package com.bomberman.room;

public class NicknameTakenException extends RuntimeException {

	public NicknameTakenException(String nickname) {
		super("Nickname already used in this room: " + nickname);
	}

}
