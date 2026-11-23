package com.bomberman.ws.dto;

public record ErrorPayload(String code, String message, boolean fatal) {
}
