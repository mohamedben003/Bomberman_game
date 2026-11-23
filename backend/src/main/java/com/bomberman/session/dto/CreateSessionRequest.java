package com.bomberman.session.dto;

import com.bomberman.common.validation.ValidNickname;

public record CreateSessionRequest(@ValidNickname String nickname) {
}
