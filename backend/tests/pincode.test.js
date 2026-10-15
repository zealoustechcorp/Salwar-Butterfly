// tests/pincode.test.js
//
// PIN code lookup for the address forms (F-05.03, F-08.05).
//
// No database — the service reads src/data/pincodes.json and nothing
// else. These check the committed file as much as the code: the state
// names have to match the checkout dropdown, and a rebuild that broke the
// office-name cleanup would show up here before it showed up in a form.
//
// Run with: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.NODE_ENV = "test";

const { PincodeService } = await import("../src/services/pincode.service.js");

const lookupError = async (pincode) => {
  try {
    await PincodeService.lookup(pincode);
  } catch (error) {
    return error;
  }

  assert.fail(`expected ${pincode} to be refused`);
};

describe("PincodeService.lookup", () => {
  it("answers a known pincode with the city, state and areas", async () => {
    const result = await PincodeService.lookup("600017");

    assert.equal(result.pincode, "600017");
    assert.equal(result.city, "Chennai");
    assert.equal(result.state, "Tamil Nadu");
    assert.ok(result.areas.includes("Thygarayanagar"));
  });

  it("strips the office type from area names", async () => {
    const { areas } = await PincodeService.lookup("641012");

    assert.deepEqual(areas, ["Gandhipuram", "Tatabad"]);
  });

  it("writes a metro's city rather than its administrative zone", async () => {
    assert.equal((await PincodeService.lookup("110024")).city, "Delhi");
    assert.equal((await PincodeService.lookup("560001")).city, "Bengaluru");
  });

  it("trims whitespace around the pincode", async () => {
    assert.equal((await PincodeService.lookup(" 600017 ")).pincode, "600017");
  });

  it("refuses anything that is not a six-digit pincode with a 400", async () => {
    for (const bad of ["", "60001", "6000171", "060017", "abcdef", null, undefined]) {
      assert.equal((await lookupError(bad)).statusCode, 400, `for ${bad}`);
    }
  });

  it("answers a well-formed pincode the directory does not have with a 404", async () => {
    assert.equal((await lookupError("100000")).statusCode, 404);
  });
});

describe("the bundled directory", () => {
  it("only names states the checkout dropdown offers", async () => {
    const data = JSON.parse(
      await readFile(new URL("../src/data/pincodes.json", import.meta.url), "utf8"),
    );
    const source = await readFile(
      new URL("../../frontend/src/lib/states.js", import.meta.url),
      "utf8",
    );

    for (const state of data.states) {
      assert.ok(source.includes(`"${state}"`), `${state} is missing from STATES`);
    }
  });
});
