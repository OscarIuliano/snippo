-- Email verification is now required to sign in. Accounts created before it keep working:
-- they count as verified.
UPDATE `users` SET `email_verified` = 1 WHERE `email_verified` = 0;
