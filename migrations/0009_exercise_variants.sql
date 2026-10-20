CREATE TABLE `exercise_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_variants_exercise` ON `exercise_variants` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `planned_set_variant_weights` (
	`planned_set_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`last_weight_grams` integer NOT NULL,
	PRIMARY KEY(`planned_set_id`, `variant_id`),
	FOREIGN KEY (`planned_set_id`) REFERENCES `planned_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `exercise_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `planned_sets` ADD `variant_id` text REFERENCES exercise_variants(id);--> statement-breakpoint
ALTER TABLE `set_logs` ADD `variant_id` text;