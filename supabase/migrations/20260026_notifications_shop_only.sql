-- Migration 026: notifiche admin solo per il GM Shop
-- Le notifiche GC, franchigie e roster non esistono più: lo stato "effettuata" per notifica
-- (admin_notification_state) non serve, perché gli acquisti usano già admin_processed_at e cancelled_at.

DROP TABLE IF EXISTS admin_notification_state;
