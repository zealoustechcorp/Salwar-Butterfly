/**
 * Provision an admin account:
 *
 *   npm run admin:create -- --name "Dharun Prakash" --email dp@example.com --role super_admin
 *
 * There is no admin sign-up endpoint and there never should be, so
 * this script is the only way an admin account comes into existence.
 *
 * The password may be supplied three ways, in order of preference:
 *
 *   1. omitted   — prompts, with the input masked (nothing reaches
 *                  your shell history or the process list)
 *   2. ADMIN_PASSWORD environment variable
 *   3. --password — convenient for scripting, but visible to any
 *                   other process on the machine via `ps`
 */

import readline from "node:readline";

import { AdminAuthService } from "../services/admin.auth.service.js";
import { ADMIN_ROLES } from "../models/admin.entity.js";
import { closeDb } from "../config/db.js";

import {
  validateAdminName,
  validateAdminEmail,
  validateAdminPassword,
  validateAdminRole,
} from "../validators/admin.rules.js";

// ============================================================
// ARGUMENT PARSING
// ============================================================

const parseArgs = (argv) => {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith("--")) continue;

    const key = token.slice(2);

    // Supports both `--key value` and `--key=value`.
    if (key.includes("=")) {
      const [name, ...rest] = key.split("=");
      args[name] = rest.join("=");
      continue;
    }

    const next = argv[i + 1];

    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
};

// ============================================================
// MASKED PASSWORD PROMPT
// ============================================================

const promptPassword = (label) =>
  new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error(
          "No TTY available for a password prompt. Pass --password or set ADMIN_PASSWORD.",
        ),
      );
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Swallow the echoed characters so the password never renders.
    let muted = false;

    rl._writeToOutput = function _writeToOutput(chunk) {
      if (!muted) {
        rl.output.write(chunk);
        return;
      }

      // Keep newlines so the cursor still advances on Enter.
      if (chunk === "\r\n" || chunk === "\n" || chunk === "\r") {
        rl.output.write(chunk);
      }
    };

    rl.question(label, (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });

    muted = true;
  });

// ============================================================
// MAIN
// ============================================================

const fail = (message) => {
  console.error(`[admin:create] ${message}`);
  process.exitCode = 1;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));

  const name = args.name;
  const email = args.email;
  const role = args.role ?? ADMIN_ROLES.ADMIN;

  // --------------------------------------------------------
  // VALIDATE IDENTITY FIELDS BEFORE ASKING FOR A SECRET
  // --------------------------------------------------------

  const nameError = validateAdminName(name, true);
  if (nameError) return fail(`--name: ${nameError}`);

  const emailError = validateAdminEmail(email, true);
  if (emailError) return fail(`--email: ${emailError}`);

  const roleError = validateAdminRole(role, true);
  if (roleError) return fail(`--role: ${roleError}`);

  // --------------------------------------------------------
  // PASSWORD
  // --------------------------------------------------------

  let password = args.password ?? process.env.ADMIN_PASSWORD;

  if (typeof password !== "string" || !password) {
    password = await promptPassword("Password: ");

    const confirmation = await promptPassword("Confirm password: ");

    if (password !== confirmation) {
      return fail("Passwords do not match");
    }
  }

  const passwordError = validateAdminPassword(password, true);
  if (passwordError) return fail(`password: ${passwordError}`);

  // --------------------------------------------------------
  // CREATE
  // --------------------------------------------------------

  const admin = await AdminAuthService.createAdmin(name, email, password, role);

  console.log("[admin:create] OK");
  console.log(`               id    ${admin.id}`);
  console.log(`               name  ${admin.name}`);
  console.log(`               email ${admin.email}`);
  console.log(`               role  ${admin.role}`);
};

try {
  await run();
} catch (error) {
  if (error?.code === "ADMIN_TABLE_MISSING" || error?.code === "42P01") {
    fail("The admins table does not exist. Run `npm run db:migrate` first.");
  } else {
    fail(error?.message ?? "Failed to create admin");
  }
} finally {
  await closeDb();
}
