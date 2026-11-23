package com.bomberman.common.validation;

import com.bomberman.session.dto.CreateSessionRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class NicknameValidatorTest {

	private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

	@Test
	void acceptsATrimmedNicknameWithinTheLimit() {
		assertThat(validate("Ada")).isEmpty();
		assertThat(validate("  Ada  ")).isEmpty();
		assertThat(validate("a".repeat(20))).isEmpty();
	}

	@Test
	void rejectsNullBlankAndOverlongNicknames() {
		assertThat(validate(null)).isNotEmpty();
		assertThat(validate("")).isNotEmpty();
		assertThat(validate("     ")).isNotEmpty();
		assertThat(validate("a".repeat(21))).isNotEmpty();
	}

	@Test
	void rejectsControlCharacters() {
		assertThat(validate("Ada\u0000")).isNotEmpty();
		assertThat(validate("Ada\nLovelace")).isNotEmpty();
	}

	private Set<ConstraintViolation<CreateSessionRequest>> validate(String nickname) {
		return validator.validate(new CreateSessionRequest(nickname));
	}

}
