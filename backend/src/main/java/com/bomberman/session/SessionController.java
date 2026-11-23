package com.bomberman.session;

import com.bomberman.session.dto.CreateSessionRequest;
import com.bomberman.session.dto.SessionResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

	private final SessionService sessionService;

	public SessionController(SessionService sessionService) {
		this.sessionService = sessionService;
	}

	@PostMapping
	public ResponseEntity<SessionResponse> create(@Valid @RequestBody CreateSessionRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(sessionService.create(request.nickname()));
	}

}
