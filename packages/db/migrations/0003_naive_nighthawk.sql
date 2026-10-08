CREATE TABLE `business_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`opens_at` text NOT NULL,
	`closes_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `business_hours_project_idx` ON `business_hours` (`project_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `closures` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `closures_project_idx` ON `closures` (`project_id`,`date_to`);--> statement-breakpoint
ALTER TABLE `projects` ADD `slot_capacity` integer;