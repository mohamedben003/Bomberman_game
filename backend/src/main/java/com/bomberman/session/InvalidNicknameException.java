package com.bomberman.session;

/**
 * Raised when a nickname is invalid after trimming. Mapped to {@code 400 INVALID_NICKNAME}.
 */
public class InvalidNicknameException extends RuntimeException {

	public InvalidNicknameException(String message) {
		super(message);
	}

}
