package com.bomberman.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Clock;

@Configuration
@EnableScheduling
public class SchedulingConfig {

	/** Injected into lobby timers and services so tests can freeze time. */
	@Bean
	public Clock clock() {
		return Clock.systemUTC();
	}

}
