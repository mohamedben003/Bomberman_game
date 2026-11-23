package com.bomberman.ws;

/**
 * JSON envelope used in both directions: {@code {"type":"...","data":{...}}}.
 * The payload is serialized with its runtime type.
 */
public record WsMessage(String type, Object data) {

	public static WsMessage of(String type, Object data) {
		return new WsMessage(type, data);
	}

}
