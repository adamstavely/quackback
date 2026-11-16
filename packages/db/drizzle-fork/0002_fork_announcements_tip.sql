-- Pro Tip banners (kind 'tip'): widen the kind check. Existing rows all pass.
ALTER TABLE "fork_announcements" DROP CONSTRAINT "fork_announcements_kind_check";--> statement-breakpoint
ALTER TABLE "fork_announcements" ADD CONSTRAINT "fork_announcements_kind_check" CHECK ("kind" IN ('info', 'warning', 'critical', 'maintenance', 'success', 'tip'));
