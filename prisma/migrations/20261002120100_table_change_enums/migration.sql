-- Ручная смена стола администратором: действие в истории и уведомление гостю.
ALTER TYPE "AuditAction" ADD VALUE 'booking_table_changed';
ALTER TYPE "NotificationType" ADD VALUE 'booking_table_changed';
