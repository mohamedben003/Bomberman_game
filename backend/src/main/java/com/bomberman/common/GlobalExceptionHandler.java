package com.bomberman.common;

import com.bomberman.session.InvalidNicknameException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;

@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	private final Clock clock;

	public GlobalExceptionHandler(Clock clock) {
		this.clock = clock;
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ApiError> handleInvalidBody(MethodArgumentNotValidException exception,
			HttpServletRequest request) {
		boolean nickname = exception.getBindingResult()
			.getFieldErrors()
			.stream()
			.anyMatch(error -> "nickname".equals(error.getField()));
		String message = exception.getBindingResult()
			.getFieldErrors()
			.stream()
			.map(FieldError::getDefaultMessage)
			.filter(value -> value != null && !value.isBlank())
			.findFirst()
			.orElse("Invalid request.");
		String code = nickname ? "INVALID_NICKNAME" : "INVALID_REQUEST";
		return error(HttpStatus.BAD_REQUEST, code, message, request);
	}

	@ExceptionHandler(InvalidNicknameException.class)
	public ResponseEntity<ApiError> handleInvalidNickname(InvalidNicknameException exception,
			HttpServletRequest request) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_NICKNAME", exception.getMessage(), request);
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException exception,
			HttpServletRequest request) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Malformed JSON request body.", request);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
		log.error("Unhandled REST error on {}", request.getRequestURI(), exception);
		return error(HttpStatus.INTERNAL_SERVER_ERROR, "SERVER_ERROR", "Unexpected server error.", request);
	}

	private ResponseEntity<ApiError> error(HttpStatus status, String code, String message,
			HttpServletRequest request) {
		return ResponseEntity.status(status)
			.body(ApiError.of(code, message, clock.instant(), request.getRequestURI()));
	}

}
