package com.bomberman.common;

/**
 * Validation and transport limits shared by REST and WebSocket entry points.
 * Gameplay numbers live in {@code GameConstants} once the engine exists.
 */
public final class ValidationLimits {

	public static final int NICKNAME_MAX = 20;
	public static final int CHAT_MAX_LEN = 300;
	public static final int MAX_WS_MESSAGE_BYTES = 4096;

	private ValidationLimits() {
	}

}
