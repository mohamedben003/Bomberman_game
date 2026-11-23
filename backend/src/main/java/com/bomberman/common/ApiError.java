package com.bomberman.common;

import java.time.Instant;

/**
 * Uniform error body returned by REST endpoints (see docs/PROTOCOL.md §1.1).
 */
public record ApiError(String code, String message, String timestamp, String path) {

	public static ApiError of(String code, String message, Instant timestamp, String path) {
		return new ApiError(code, message, timestamp.toString(), path);
	}

}
