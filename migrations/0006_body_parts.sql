CREATE TABLE `body_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_body_parts` (
	`exercise_id` text NOT NULL,
	`body_part_id` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `body_part_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`body_part_id`) REFERENCES `body_parts`(`id`) ON UPDATE no action ON DELETE restrict
);
