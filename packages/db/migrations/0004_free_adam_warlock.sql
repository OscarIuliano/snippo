CREATE TABLE `widget_daily_stats` (
	`widget_id` text NOT NULL,
	`date` text NOT NULL,
	`opens` integer DEFAULT 0 NOT NULL,
	`starts` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`widget_id`, `date`),
	FOREIGN KEY (`widget_id`) REFERENCES `widgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `widget_step_stats` (
	`widget_id` text NOT NULL,
	`date` text NOT NULL,
	`step_key` text NOT NULL,
	`reached` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`widget_id`, `date`, `step_key`),
	FOREIGN KEY (`widget_id`) REFERENCES `widgets`(`id`) ON UPDATE no action ON DELETE cascade
);
