package com.bomberman.config;

import com.bomberman.ws.GameWebSocketHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.Arrays;

/**
 * One native JSON WebSocket endpoint at {@code /ws}; no SockJS and no STOMP.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

	private final GameWebSocketHandler handler;
	private final String[] allowedOrigins;

	public WebSocketConfig(GameWebSocketHandler handler,
			@Value("${app.websocket.allowed-origins:http://localhost:4200}") String allowedOrigins) {
		this.handler = handler;
		this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
			.map(String::trim)
			.filter(origin -> !origin.isEmpty())
			.toArray(String[]::new);
	}

	@Override
	public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
		registry.addHandler(handler, "/ws").setAllowedOrigins(allowedOrigins);
	}

}
