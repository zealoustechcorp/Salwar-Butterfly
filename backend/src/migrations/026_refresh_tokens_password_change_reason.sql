-- src/migrations/026_refresh_tokens_password_change_reason.sql
--
-- Adds 'password_change' to the reasons a session may be revoked for.
--
-- Changing a password while signed in now ends every *other* session the
-- account has (CustomerService.changePassword), the way a reset by email
-- ends all of them. The reason is recorded for the "why was I signed
-- out?" conversation, and that conversation goes differently for "you
-- reset it from the email" and "you changed it on your laptop".
--
-- Until this runs, RefreshTokenRepository.revokeAllForSubject catches the
-- CHECK violation and records 'password_reset' instead, so the
-- revocation never depends on this file — only the label does.
--
-- Widened here rather than edited in 022/024, matching how 024 added
-- 'password_reset'.

ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS refresh_tokens_reason_check;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_reason_check
    CHECK (revoked_reason IS NULL OR revoked_reason IN (
      'logout',
      'reuse_detected',
      'rotated_out',
      'password_reset',
      'password_change'
    ));
