package com.bomberman.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Nickname constraint applied to REST request DTOs. Trims before checking length.
 */
@Documented
@Constraint(validatedBy = NicknameValidator.class)
@Target({ ElementType.RECORD_COMPONENT, ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER,
		ElementType.ANNOTATION_TYPE })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidNickname {

	String message() default "Nickname must be 1 to 20 characters.";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
