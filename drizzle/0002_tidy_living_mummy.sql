CREATE TABLE `billing_checkout` (
	`user_id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`checkout_id` text,
	`interval` text NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `billing_customer` (
	`user_id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customer_customer_id_unique` ON `billing_customer` (`customer_id`);--> statement-breakpoint
CREATE TABLE `billing_paid_period` (
	`order_id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`refunded` integer NOT NULL,
	`modified_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_paid_period_subscription_idx` ON `billing_paid_period` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `billing_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`interval` text NOT NULL,
	`status` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`cancel_at_period_end` integer NOT NULL,
	`revoked` integer NOT NULL,
	`pending_interval` text,
	`pending_at` integer,
	`modified_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `billing_subscription_user_idx` ON `billing_subscription` (`user_id`);