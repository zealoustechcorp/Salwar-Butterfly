-- src/migrations/023_create_whatsapp_notifications.sql
--
-- Telling people what happened to a parcel.
--
-- Until now the shop found out an order had been paid for by opening the
-- admin panel and looking, and the shopper found out their parcel had
-- shipped by asking. There has never been an outbound channel of any
-- kind here — no email, no SMS, nothing. The storefront's only WhatsApp
-- was a wa.me link in the footer, which is a way to start a
-- conversation, not a way to be told anything.
--
-- Three tables and two columns, and the division between them is the
-- whole design:
--
--   whatsapp_recipients        WHO on the shop's side gets told
--   whatsapp_recipient_events  WHICH events each of them cares about
--   whatsapp_messages          WHAT was actually sent, or not, and why
--
-- The customer side needs no recipients table. There is exactly one
-- customer per order and their number is already snapshotted on it.
--
-- whatsapp_messages is an OUTBOX, not a log, and the difference is the
-- reason this migration exists in the shape it does. A log is written
-- after the fact and nothing depends on it. A row here is written in the
-- same transaction as the status change it describes, and it is the
-- row's own UNIQUE key that stops the same message being sent twice.
-- Deleting from this table re-opens the door to a duplicate; it is not a
-- table to prune casually.

-- ============================================================
-- OPT-IN, ON THE ORDER
-- ============================================================
--
-- Meta requires opt-in before a business may message somebody, so this
-- is where the tickbox at checkout is recorded.
--
-- On `orders` rather than on `customers`, for two reasons. Guest
-- checkout has no customers row at all — 008 made customer_id nullable
-- on purpose — so an account-level column would leave every guest
-- permanently unreachable. And consent is given for the number typed
-- into *this* checkout; the same reasoning that snapshots contact_phone
-- rather than joining to the live customer row applies to the permission
-- to use it.
--
-- DEFAULT TRUE because the box at checkout is ticked by default and the
-- shopper unticks it. That is a decision taken deliberately about
-- transactional order updates for someone who is actively buying — it is
-- not the right default for marketing, and this column must never be
-- read as consent for anything but the order it sits on.
--
-- Existing rows inherit TRUE, which is the correct reading only because
-- this table's messages are strictly about the order in hand. On
-- PostgreSQL 11+ a NOT NULL column with a constant default is a
-- metadata-only change: no table rewrite, no lock held while every
-- historical order is touched.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

-- When, not just whether. "Whether" satisfies the code; "when" is what
-- answers somebody asking why a message was sent, and it is the same
-- reasoning that made refresh_tokens.revoked_at a timestamp rather than
-- a boolean. NULL on every order placed before the box existed.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ NULL;


-- ============================================================
-- RECIPIENTS — the shop's own numbers
-- ============================================================
--
-- A table and not an environment variable, because the person who needs
-- to add a number when somebody new starts helping with the packing is
-- not the person who can redeploy the API.
--
-- No foreign key to `admins`, and that is not an oversight. A recipient
-- is a phone number that should be told about orders. That is frequently
-- an admin and frequently somebody who has no login at all — the tailor,
-- whoever does the courier drops. Requiring an account in order to
-- receive a message would mean creating accounts for people who must
-- never have one.

CREATE TABLE IF NOT EXISTS whatsapp_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who this is, for the settings screen. Never sent to Meta.
  label VARCHAR(120) NOT NULL,

  -- E.164 WITH the leading '+', which is the form a human recognises and
  -- the form utils/phone.js emits. The gateway strips the '+' at the
  -- wire because the Cloud API wants bare digits; that is the gateway's
  -- business and not the schema's.
  --
  -- 16 characters is the true ceiling ('+' plus at most fifteen digits).
  -- 20 is what orders.contact_phone already uses, and matching it rather
  -- than being clever means the two columns can be compared without a
  -- cast.
  phone VARCHAR(20) NOT NULL,

  -- The toggle in the settings row. Separate from deletion so that
  -- silencing somebody who is away does not lose which events they were
  -- subscribed to.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Who added this number, so "why is my phone buzzing" has an answer.
  -- ON DELETE SET NULL: removing an admin account must not quietly
  -- remove the shop's notification routing along with it.
  created_by UUID NULL REFERENCES admins(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per number. Adding the same phone twice is not two
  -- recipients, it is two copies of every alert.
  CONSTRAINT uq_whatsapp_recipients_phone
    UNIQUE (phone),

  -- A cheap shape check at the boundary Postgres owns. The real
  -- normalisation is utils/phone.js, and tests/phone.test.js asserts
  -- that everything it emits satisfies exactly this pattern. What this
  -- catches is a number that never went through it — a psql session, a
  -- fixture, a seed script — reaching a column the gateway will hand to
  -- Meta.
  CONSTRAINT whatsapp_recipients_phone_check
    CHECK (phone ~ '^\+[1-9][0-9]{7,14}$')
);

-- "Everyone who is listening right now." Partial, because an inactive
-- recipient is never what this lookup is looking for.
CREATE INDEX IF NOT EXISTS idx_whatsapp_recipients_active
  ON whatsapp_recipients (id)
  WHERE is_active;


-- ============================================================
-- PER-EVENT SUBSCRIPTIONS
-- ============================================================
--
-- A child table rather than five boolean columns, and rather than a
-- TEXT[] on the row above.
--
-- Five columns would mean a migration every time an event is added, and
-- the whole argument of order.policy.js is that adding to a vocabulary
-- should be a change to one policy module. A presence row costs nothing
-- and lets the vocabulary stay in JavaScript.
--
-- An array would work and would be one table fewer, but "who should be
-- told about order_paid" then becomes a containment scan over an array
-- rather than an index seek, and the settings screen's save — replace
-- this recipient's whole set — is a DELETE and an INSERT in one
-- transaction either way.
--
-- A row present means subscribed. There is deliberately no `enabled`
-- column: the absence of the row IS the off state, and a table with both
-- a row and a flag has two ways to say the same thing and eventually
-- says both at once.

CREATE TABLE IF NOT EXISTS whatsapp_recipient_events (
  recipient_id UUID NOT NULL
    REFERENCES whatsapp_recipients(id) ON DELETE CASCADE,

  -- Mirrors NOTIFY_EVENT in src/config/whatsapp.policy.js. Duplicated
  -- here as a CHECK for the same reason 008 duplicates the status list:
  -- that module decides which events exist, and this only stops a value
  -- nobody defined from reaching the table, including through psql.
  --
  -- tests/whatsapp.policy.test.js reads this file and asserts the two
  -- lists are identical, so the duplication cannot silently drift.
  event VARCHAR(32) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (recipient_id, event),

  CONSTRAINT whatsapp_recipient_events_event_check
    CHECK (event IN (
      'order_paid',
      'order_packed',
      'order_shipped',
      'order_delivered',
      'order_cancelled'
    ))
);

-- The hot lookup in this whole feature: "an order was just paid for —
-- who needs to know?" Leading with `event` because that is the equality
-- the query starts from. The primary key above leads with recipient_id
-- and answers the settings screen's question instead; both are cheap,
-- and they are different questions.
CREATE INDEX IF NOT EXISTS idx_whatsapp_recipient_events_event
  ON whatsapp_recipient_events (event, recipient_id);


-- ============================================================
-- THE OUTBOX
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ----------------------------------------------------------
  -- THE IDEMPOTENCY KEY
  -- ----------------------------------------------------------
  --
  -- The load-bearing column of this table, and the reason the table
  -- exists at all rather than a log written after the send.
  --
  -- '<order_id>.<event>.<phone>', dot-separated because a UUID, an event
  -- word and an E.164 number contain no dots between them, so the parts
  -- cannot run together and mint a collision.
  --
  -- Every emit is an INSERT ... ON CONFLICT (dedupe_key) DO NOTHING
  -- RETURNING id. No id back means this exact message was already
  -- decided on, and the caller does nothing further — no enqueue, no
  -- error, no second WhatsApp. That is the same shape as
  -- PaymentRepository.settle's `alreadyPaid`: a guarded write that
  -- reports "nothing to do" rather than raising.
  --
  -- This is deliberately NOT delegated to the BullMQ job id. BullMQ's
  -- dedupe lasts only as long as its completed set keeps the id — hours
  -- — while an order's lifecycle runs for days; it lives in Redis, which
  -- this codebase treats as optional and which a flush empties; and it
  -- cannot answer "was this customer told", which is a question the
  -- shop asks out loud. The job id is a second layer, not the first.
  --
  -- A manual resend appends '.r<n>', which is how the settings screen's
  -- "send again" gets past a key that is otherwise final.
  --
  -- TEXT rather than VARCHAR(n): a UUID plus an event plus a number is
  -- about 60 characters, but a cap here would be an arbitrary number
  -- that only ever fails at the worst moment, and Postgres stores the
  -- two identically.
  dedupe_key TEXT NOT NULL,

  -- ----------------------------------------------------------
  -- WHAT THIS IS ABOUT
  -- ----------------------------------------------------------

  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  event VARCHAR(32) NOT NULL,

  audience VARCHAR(16) NOT NULL,

  -- NULL for a customer message, and for an admin message whose
  -- recipient row has since been deleted. The number below is the record
  -- of where it actually went; this is only the link back to the setting
  -- that caused it.
  recipient_id UUID NULL
    REFERENCES whatsapp_recipients(id) ON DELETE SET NULL,

  -- E.164, with the '+'. Snapshotted rather than joined, for the same
  -- reason 008 snapshots the shipping address: somebody who changes
  -- their number must not thereby rewrite where last month's alert went.
  to_phone VARCHAR(20) NOT NULL,

  -- ----------------------------------------------------------
  -- WHAT WAS SENT
  -- ----------------------------------------------------------
  --
  -- The template's name and language as they were when this row was
  -- written, because a template can be renamed, re-approved in another
  -- language, or paused between the emit and the send.
  --
  -- `params` is the ordered list of body parameters, already built and
  -- already sanitised, so that a send is a pure function of this one
  -- row. The alternative — rebuilding the parameters from the order at
  -- send time — reads an order that may have moved on, and renders "your
  -- order has shipped" from a row that now says cancelled. An order is a
  -- snapshot; so is a message about one.

  template_name VARCHAR(128) NOT NULL,

  template_language VARCHAR(16) NOT NULL,

  params JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- ----------------------------------------------------------
  -- LIFECYCLE
  -- ----------------------------------------------------------
  --
  -- pending    written, not yet handed to Meta. The sweeper's queue.
  -- sending    claimed by a worker or a sweep. A row stuck here is a
  --            process that died mid-call; the sweeper reclaims it after
  --            ten minutes and treats it as an unknown outcome.
  -- sent       Meta accepted it and gave us a wamid. NOT the same as
  --            arrived — see delivered.
  -- delivered  an inbound receipt said it reached the handset.
  -- read       ditto, and it was opened.
  -- failed     it will not be sent. error_code says why.
  -- skipped    it was never going to be sent, and that is not a failure:
  --            no opt-in, an unusable number, WhatsApp not configured on
  --            this deployment, nobody subscribed. Recorded rather than
  --            dropped, because "we never told her" is the question the
  --            shop will ask and silence is not an answer to it.

  status VARCHAR(16) NOT NULL DEFAULT 'pending',

  -- Counted here and not in BullMQ, because two different things send
  -- from this table — the worker and the sweeper — and a counter living
  -- inside one of them resets when the other takes over.
  --
  -- It is also what caps the one genuinely dangerous retry. A send whose
  -- outcome is unknown (a timeout, a 2xx we could not parse) may already
  -- have reached the handset, and Meta's /messages endpoint has no
  -- idempotency key to collapse a repeat. That case is allowed exactly
  -- one more attempt, counted from here.
  attempts SMALLINT NOT NULL DEFAULT 0,

  -- The sweeper's cursor. Pushed forward when a worker claims the row,
  -- so that the queue and the sweeper cannot send the same message at
  -- the same moment.
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ----------------------------------------------------------
  -- WHAT META SAID
  -- ----------------------------------------------------------
  --
  -- 'wamid.HBgM...' — the handle that matches an inbound delivery
  -- receipt back to the row that sent it. NULL until a send succeeds,
  -- and permanently NULL for a message that never got out, which is the
  -- ordinary case for a failure.

  provider_message_id VARCHAR(128) NULL,

  -- Meta's numeric code as text ('131026', '132001'), or one of ours
  -- ('NO_OPT_IN', 'UNUSABLE_PHONE', 'NOT_CONFIGURED', 'NO_RECIPIENTS',
  -- 'UNKNOWN_OUTCOME'). Read by people and by the settings screen; never
  -- the basis of a retry decision, which whatsapp.gateway.js makes and
  -- this column merely records.
  error_code VARCHAR(32) NULL,

  error_detail TEXT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  failed_at    TIMESTAMPTZ NULL,

  CONSTRAINT uq_whatsapp_messages_dedupe
    UNIQUE (dedupe_key),

  CONSTRAINT whatsapp_messages_audience_check
    CHECK (audience IN (
      'admin',
      'customer'
    )),

  CONSTRAINT whatsapp_messages_event_check
    CHECK (event IN (
      'order_paid',
      'order_packed',
      'order_shipped',
      'order_delivered',
      'order_cancelled'
    )),

  CONSTRAINT whatsapp_messages_status_check
    CHECK (status IN (
      'pending',
      'sending',
      'sent',
      'delivered',
      'read',
      'failed',
      'skipped'
    )),

  -- A parameter list is an array. A template rendered from an object
  -- would silently drop every {{n}} and send the shopper a message with
  -- holes in it.
  CONSTRAINT whatsapp_messages_params_check
    CHECK (jsonb_typeof(params) = 'array')
);

-- ============================================================
-- INDEXES
-- ============================================================

-- The sweeper: "what is owed, oldest first". Partial and narrow,
-- because a sent row is the overwhelming majority of this table within
-- a month and is never what the sweep is looking for.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_due
  ON whatsapp_messages (next_attempt_at)
  WHERE status IN ('pending', 'sending');

-- The strip on the admin order page: every message about one order.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order
  ON whatsapp_messages (order_id, created_at DESC);

-- Matching an inbound delivery receipt back to the row that sent it.
-- Partial and unique: a row with no wamid can never be the answer, and
-- two rows sharing one would make the match ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_provider_id
  ON whatsapp_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- "What is failing, and has it been failing all week." The screen
-- somebody opens when a customer says they were never told.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_failed
  ON whatsapp_messages (failed_at DESC)
  WHERE status = 'failed';
