CREATE TABLE `affirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affirmations_category_position` ON `affirmations` (`category`,`position`);--> statement-breakpoint
ALTER TABLE `workout_sessions` DROP COLUMN `affirmation`;--> statement-breakpoint
ALTER TABLE `workout_sessions` DROP COLUMN `affirmation_requested_at`;