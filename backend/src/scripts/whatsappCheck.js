/**
 * WhatsApp connectivity check: `npm run wa:check`
 *
 * Answers the three questions that otherwise only get answered by a real
 * order failing, in the order they bite:
 *
 *   1. is the access token still alive?          (error 190, every 24h)
 *   2. do the templates in whatsapp.policy.js    (error 132001, once)
 *      actually exist and are they approved?
 *   3. will a send reach a handset?              (--send)
 *
 * Read-only unless --send is passed. Touches no database: the outbox is
 * the order flow's business, and this is about the credentials.
 *
 * Usage:
 *   npm run wa:check                     the two read-only checks
 *   npm run wa:check -- --send           send hello_world
 *   npm run wa:check -- --send sb_order_packed
 */

import { env } from "../config/env.js";
import { WhatsAppGateway } from "../config/whatsapp.gateway.js";
import {
  NOTIFY_AUDIENCES,
  NOTIFY_EVENTS,
  templateFor,
} from "../config/whatsapp.policy.js";
import { maskPhone } from "../utils/phone.js";

const GRAPH_BASE = "https://graph.facebook.com";

const args = process.argv.slice(2);
const sendIndex = args.indexOf("--send");
const wantsSend = sendIndex !== -1;

// `--send` on its own means hello_world: it is the one template that
// exists on every new account without being approved, so it separates
// "the credentials work" from "the templates are approved" — two
// failures that otherwise look identical from here.
const sendTemplate =
  wantsSend && args[sendIndex + 1] && !args[sendIndex + 1].startsWith("--")
    ? args[sendIndex + 1]
    : "hello_world";

const say = (line = "") => console.log(line);

const graph = async (path) => {
  const response = await fetch(`${GRAPH_BASE}/${env.whatsapp.apiVersion}/${path}`, {
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
  });

  return { status: response.status, body: await response.json().catch(() => null) };
};

/** Every template the catalogue defines, once each. */
const catalogue = () => {
  const seen = [];

  for (const audience of NOTIFY_AUDIENCES) {
    for (const event of NOTIFY_EVENTS) {
      const template = templateFor(audience, event);

      if (template && !seen.some((t) => t.name === template.name)) seen.push(template);
    }
  }

  return seen;
};

// ============================================================
// THE CHECKS
// ============================================================
//
// One function with `return` for every exit, rather than top-level code
// with process.exit(). process.exit() while a fetch socket is still
// closing aborts the process on Windows — "Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)" — which looks exactly like a
// crash in the thing being checked.

async function main() {
  // ---- 0. configured at all -------------------------------

  if (!env.whatsapp.enabled) {
    console.error(
      "[wa:check] WhatsApp is off — WHATSAPP_ACCESS_TOKEN and " +
        "WHATSAPP_PHONE_NUMBER_ID must both be set in backend/.env",
    );

    return 1;
  }

  say(`[wa:check] api version      ${env.whatsapp.apiVersion}`);
  say(`[wa:check] phone number id  ${env.whatsapp.phoneNumberId}`);
  say(
    `[wa:check] receipts         ${
      env.whatsapp.receiptsEnabled ? "on" : "off (APP_SECRET/VERIFY_TOKEN missing)"
    }`,
  );
  say(
    `[wa:check] test recipient   ${
      env.whatsapp.testRecipient
        ? `${env.whatsapp.testRecipient} — EVERY message is redirected here`
        : "none — messages go to their real recipients"
    }`,
  );
  say();

  // ---- 1. the token ---------------------------------------

  const number = await graph(
    `${env.whatsapp.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
  );

  if (number.body?.error) {
    const { code, message } = number.body.error;

    console.error(`[wa:check] token FAILED (code ${code}): ${message}`);

    // The overwhelmingly likely one, and the fix is not obvious from
    // Meta's message, which only says the session expired.
    if (Number(code) === 190) {
      console.error(
        "\n           A token from the API Setup page lasts 24 hours. For one that does not\n" +
          "           expire: Business Settings -> Users -> System Users -> Add, give it\n" +
          "           the WhatsApp app with full control, then Generate token with\n" +
          "           whatsapp_business_messaging and whatsapp_business_management.",
      );
    }

    return 1;
  }

  say(
    `[wa:check] token OK — sending as ${number.body.verified_name} ` +
      `(${number.body.display_phone_number})`,
  );
  say(
    `[wa:check] quality ${number.body.quality_rating ?? "n/a"}, ` +
      `verification ${number.body.code_verification_status ?? "n/a"}`,
  );
  say();

  // ---- 2. the templates -----------------------------------
  //
  // whatsapp.policy.js names ten templates. Every one has to exist in
  // WhatsApp Manager, in the language the catalogue asks for, with
  // exactly the placeholder count the builder produces — and none of
  // that is visible until an order tries to send and is rejected with
  // 132001 or 132000.

  if (!env.whatsapp.businessAccountId) {
    say("[wa:check] templates skipped — WHATSAPP_BUSINESS_ACCOUNT_ID is not set");
  } else {
    const templates = await graph(
      `${env.whatsapp.businessAccountId}/message_templates?fields=name,language,status&limit=200`,
    );

    if (templates.body?.error) {
      say(`[wa:check] templates unreadable: ${templates.body.error.message}`);
      say("           (sending still works — this needs whatsapp_business_management)");
    } else {
      const live = new Map(
        (templates.body?.data ?? []).map((t) => [`${t.name}:${t.language}`, t.status]),
      );

      let missing = 0;

      for (const template of catalogue()) {
        const status = live.get(`${template.name}:${template.language}`);
        const ok = status === "APPROVED";

        if (!ok) missing += 1;

        say(
          `           ${ok ? "OK     " : "MISSING"} ${template.name} ` +
            `(${template.language}, ${template.paramCount} params)` +
            `${status && !ok ? ` — ${status}` : ""}`,
        );
      }

      say();
      say(
        missing === 0
          ? "[wa:check] every template in whatsapp.policy.js is approved"
          : `[wa:check] ${missing} template(s) not approved — order events using them fail with 132001`,
      );
    }
  }

  // ---- 3. an actual message -------------------------------

  if (!wantsSend) {
    say();
    say("[wa:check] add --send to put a real message on a real phone");

    return 0;
  }

  if (!env.whatsapp.testRecipient) {
    console.error(
      "\n[wa:check] refusing to send — WHATSAPP_TEST_RECIPIENT is not set, so there is\n" +
        "           nothing stopping this reaching a number that did not ask for it.",
    );

    return 1;
  }

  // The destination is the test recipient by construction: the gateway
  // redirects every send while that variable is set, so what is passed
  // here is only what the message is nominally addressed to.
  const to = env.whatsapp.testRecipient;

  // The catalogue knows the language of everything it defines; Meta's
  // sample hello_world is the one that is not in it, and it is en_US.
  const language =
    catalogue().find((t) => t.name === sendTemplate)?.language ?? "en_US";

  say();
  say(`[wa:check] sending ${sendTemplate} (${language}) to ${maskPhone(to)} ...`);

  try {
    // Sent with no parameters. hello_world takes none; anything else is
    // deliberately being sent short, because this script has no order to
    // build parameters from and a count mismatch is itself worth seeing
    // (132000) rather than being papered over with placeholder text.
    const result = await WhatsAppGateway.sendTemplate({
      to,
      name: sendTemplate,
      language,
      params: [],
    });

    say(`[wa:check] sent — ${result.messageId}`);
    say("           that is 'Meta accepted it', not 'it is on the handset'.");
    say("           The delivery receipt says the rest; see WHATSAPP_APP_SECRET.");

    return 0;
  } catch (error) {
    console.error(
      `[wa:check] send FAILED [${error.kind}] ${error.code}: ${error.detail ?? error.message}`,
    );

    return 1;
  }
}

process.exitCode = await main();
