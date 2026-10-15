/**
 * Every Indian state and union territory, as the address forms spell them.
 *
 * The south first, in the order the shop ships to most, then the rest
 * alphabetically — the dropdown is scanned top-down and most parcels go to
 * the first five.
 *
 * All thirty-six, not just the ones orders have come from so far. The PIN
 * code lookup fills the state from India Post's directory, and a select
 * given a value it has no option for shows the first option instead — a
 * Ladakh pincode would have quietly become Tamil Nadu. The spellings match
 * backend/src/scripts/buildPincodes.js; tests/pincode.test.js in the backend
 * fails if the two drift.
 */
export const STATES = [
  "Tamil Nadu",
  "Kerala",
  "Karnataka",
  "Andhra Pradesh",
  "Telangana",
  "Puducherry",
  "Andaman and Nicobar Islands",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];
