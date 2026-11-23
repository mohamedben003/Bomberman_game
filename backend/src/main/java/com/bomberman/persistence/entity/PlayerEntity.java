package com.bomberman.persistence.entity;

import com.bomberman.common.ValidationLimits;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Persisted guest player row. Reusing a nickname later does not imply the same player:
 * identity is the generated id.
 */
@Entity
@Table(name = "players")
public class PlayerEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, length = ValidationLimits.NICKNAME_MAX)
	private String nickname;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected PlayerEntity() {
		// for JPA
	}

	public PlayerEntity(String nickname, Instant createdAt) {
		this.nickname = nickname;
		this.createdAt = createdAt;
	}

	public UUID getId() {
		return id;
	}

	public String getNickname() {
		return nickname;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
