import { LegalPage } from "@/components/store/LegalPage";
import { getShop } from "@/lib/store/catalogue";

export const metadata = {
  title: "Return & refund policy",
  description:
    "When Salwar Butterfly accepts a return, what a return has to arrive in, how refunds and exchanges are handled, and what is not covered.",
};

/**
 * The shop's published return and refund policy, in the shop's own words.
 *
 * The home page's #policy section is the three-card summary of this; this page
 * is the binding version, and the summary links here. If the two ever
 * disagree, this file is the one that is right — change it here first.
 */
const SECTIONS = [
  {
    heading: "Returns",
    body: ["Returns will be accepted only in the following circumstances:"],
    list: [
      "The product received is damaged.",
      "The incorrect product or size was delivered.",
      "The product has a manufacturing defect.",
    ],
    after: [
      "To request a return, please contact us via WhatsApp within 48 hours of receiving your order.",
      "Please provide clear photographs, a continuous unboxing video without pauses or edits showing the issue, and your order details.",
    ],
  },
  {
    heading: "Return conditions",
    body: ["To qualify for a return:"],
    list: [
      "The product must be unused and unworn.",
      "All original tags and packaging must remain intact.",
      "The product must not have been washed, altered, stained, or damaged by the customer.",
      "Products returned without prior approval may not be accepted.",
    ],
  },
  {
    heading: "Non-returnable items",
    body: ["Returns are generally not accepted for the following reasons:"],
    list: [
      "Change of mind",
      "Colour preference",
      "Minor colour variations resulting from screen or display settings",
      "Products that have been used, washed, altered, or damaged after delivery",
    ],
  },
  {
    heading: "Refunds",
    body: [
      "If a return is approved, the refund will be processed after the returned product has been received and inspected.",
      "Refunds will be issued through the original payment method or, where applicable, another payment method mutually agreed upon by both parties.",
    ],
  },
  {
    heading: "Exchanges",
    body: [
      "If we have sent the incorrect product or size, we will arrange an exchange, subject to product availability.",
    ],
  },
  {
    heading: "Return shipping",
    body: [
      "If the return is required due to an error or defect on our part, we will arrange or bear the applicable return shipping costs.",
      "Returns requested for any other reason may not be accepted.",
    ],
  },
  {
    heading: "Order cancellation",
    body: [
      "Orders cannot be cancelled once they have been placed. Please review your order details carefully before completing your purchase.",
    ],
  },
];

export default function ReturnsPage() {
  const shop = getShop();

  return (
    <LegalPage
      eyebrow="Return & Refund Policy"
      title="What we take back, and when"
      updated="August 31, 2026"
      intro="At Salwar Butterfly, we carefully inspect every product before dispatch. We are committed to ensuring that you receive your order in good condition and as described on our website."
      sections={SECTIONS}
      shop={shop}
    />
  );
}
