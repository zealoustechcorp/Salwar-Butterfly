import { LegalPage } from "@/components/store/LegalPage";
import { getShop } from "@/lib/store/catalogue";

export const metadata = {
  title: "Privacy policy",
  description:
    "How Salwar Butterfly collects, uses, shares and protects the information you give us when you enquire or place an order.",
};

/**
 * The shop's published privacy policy, in the shop's own words.
 *
 * The wording is the business's and is deliberately not rewritten to match the
 * marketing voice of the home page: it is what the shop is bound by. The only
 * details that are interpolated are the contact ones, which <LegalPage> pulls
 * from SHOP so they cannot drift from the header and footer.
 */
const SECTIONS = [
  {
    heading: "Information we collect",
    body: ["When you contact us or place an order, we may collect information such as:"],
    list: [
      "Name",
      "Mobile / WhatsApp number",
      "Email address, if provided",
      "Delivery address",
      "Order and product details",
      "Information you provide while contacting us",
    ],
  },
  {
    heading: "How we use your information",
    body: ["We use your information to:"],
    list: [
      "Process and confirm your orders",
      "Arrange delivery of your products",
      "Communicate with you regarding your order",
      "Respond to enquiries and customer support requests",
      "Improve our products and website",
    ],
  },
  {
    heading: "Payment information",
    body: [
      "Payments may be processed through third-party payment service providers. We do not intentionally collect or store your complete card, UPI, or banking credentials on our website.",
    ],
  },
  {
    heading: "Sharing your information",
    body: [
      "We do not sell or rent your personal information.",
      "We may share necessary information with trusted service providers, such as delivery partners and payment providers, only when required to complete your order or provide our services.",
    ],
  },
  {
    heading: "WhatsApp communication",
    body: [
      "If you contact Salwar Butterfly through WhatsApp, the information you provide may be used to respond to your enquiry, confirm orders, and provide order-related updates.",
    ],
  },
  {
    heading: "Cookies",
    body: [
      "Our website may use cookies or similar technologies to improve website functionality and understand how visitors use our website.",
    ],
  },
  {
    heading: "Data security",
    body: [
      "We take reasonable steps to protect your personal information from unauthorized access, misuse, or disclosure. However, no online method of transmission or storage can be guaranteed to be completely secure.",
    ],
  },
  {
    heading: "Children's privacy",
    body: [
      "Our website is not intended for children, and we do not knowingly collect personal information from children.",
    ],
  },
  {
    heading: "Changes to this privacy policy",
    body: [
      "We may update this Privacy Policy from time to time. Any changes will be posted on this page with the updated date.",
    ],
  },
];

export default function PrivacyPage() {
  const shop = getShop();

  return (
    <LegalPage
      eyebrow="Privacy Policy"
      title="Your details, and what we do with them"
      updated="August 31, 2026"
      intro="At Salwar Butterfly, we respect your privacy and are committed to protecting your personal information when you visit our website or place an order with us."
      sections={SECTIONS}
      shop={shop}
    />
  );
}
