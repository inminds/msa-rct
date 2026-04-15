CREATE TABLE `law_change_logs` (
	`id` varchar PRIMARY KEY NOT NULL,
	`tribute` varchar NOT NULL,
	`jurisdiction` varchar NOT NULL,
	`description` text NOT NULL,
	`detected_at` timestamp DEFAULT now(),
	`previous_content` text,
	`new_content` text,
	`source_url` text
);
--> statement-breakpoint
CREATE TABLE `ncm_items` (
	`id` varchar PRIMARY KEY NOT NULL,
	`ncm_code` varchar(8) NOT NULL,
	`description` text,
	`product_name` text,
	`upload_id` varchar NOT NULL,
	`created_at` timestamp DEFAULT now(),
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`sid` varchar PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tributes` (
	`id` varchar PRIMARY KEY NOT NULL,
	`type` varchar NOT NULL,
	`rate` real,
	`jurisdiction` varchar NOT NULL,
	`law_source` text,
	`effective_from` timestamp,
	`effective_to` timestamp,
	`ncm_item_id` varchar NOT NULL,
	`validated` timestamp,
	`validated_by` varchar,
	FOREIGN KEY (`ncm_item_id`) REFERENCES `ncm_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`validated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` varchar PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`file_type` varchar NOT NULL,
	`description` text,
	`uploaded_at` timestamp DEFAULT now(),
	`user_id` varchar NOT NULL,
	`status` varchar DEFAULT 'PENDING',
	`processed_at` timestamp,
	`error_message` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar PRIMARY KEY NOT NULL,
	`email` varchar,
	`first_name` varchar,
	`last_name` varchar,
	`profile_image_url` varchar,
	`role` varchar DEFAULT 'USER',
	`created_at` timestamp DEFAULT now(),
	`updated_at` timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);