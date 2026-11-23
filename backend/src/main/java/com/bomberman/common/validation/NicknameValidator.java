package com.bomberman.common.validation;

import com.bomberman.common.ValidationLimits;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Validates a nickname after trimming: 1–20 characters, no ISO control characters.
 * Duplicate checking is room-scoped and happens on WebSocket {@code JOIN}.
 */
public class NicknameValidator implements ConstraintValidator<ValidNickname, String> {

	@Override
	public boolean isValid(String value, ConstraintValidatorContext context) {
		if (value == null) {
			return false;
		}
		String trimmed = value.strip();
		if (trimmed.isEmpty() || trimmed.length() > ValidationLimits.NICKNAME_MAX) {
			return false;
		}
		return trimmed.codePoints().noneMatch(Character::isISOControl);
	}

}
