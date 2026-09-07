CREATE TABLE `github_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lane_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`repository` text NOT NULL,
	`only_assigned` integer DEFAULT false NOT NULL,
	`labels` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_connection_user_lane` ON `github_connection` (`user_id`,`lane_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_connection_user_repository` ON `github_connection` (`user_id`,`repository_id`);--> statement-breakpoint
CREATE INDEX `github_connection_routing` ON `github_connection` (`installation_id`,`repository_id`);--> statement-breakpoint
ALTER TABLE `account` ADD `issuer` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `account` SET `issuer` = CASE WHEN `provider_id` = 'credential' THEN 'local:credential' ELSE 'local:oauth:' || `provider_id` END;--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_subject` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_one_github_per_user` ON `account` (`user_id`) WHERE "account"."provider_id" = 'github';