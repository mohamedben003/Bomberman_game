package com.bomberman;

import org.springframework.boot.SpringApplication;

public class TestBombermanApplication {

	public static void main(String[] args) {
		SpringApplication.from(BombermanApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
