/**
 * The shop's own identity — name, contacts, trust badges.
 *
 * A module rather than an API call, and that is a deliberate line rather
 * than the last piece of the snapshot nobody moved.
 *
 * None of what is left here is in the database. There is no settings
 * table, no admin screen that edits it, and no plausible one: a shop
 * changes its logo or its WhatsApp number a handful of times in its
 * life, and building CRUD for that would be more surface than the thing
 * it manages. When it does change, it changes in a commit, which is also
 * the only record of when and why it changed.
 *
 * The catalogue is the opposite on every count — it moves hourly, it has
 * a whole admin panel behind it, and it is read live. See catalogue.js.
 *
 * ------------------------------------------------------------
 * THE BANNERS USED TO BE HERE
 * ------------------------------------------------------------
 *
 * They were an array of five Cloudinary URLs, and the paragraph above
 * covered them along with everything else. It was wrong about them, and
 * only about them.
 *
 * A logo changes a handful of times in a shop's life; a banner set is
 * seasonal. A festival run, a new drop, a sale that ends on Sunday — the
 * shop changes those on its own schedule, and having to ask a developer
 * meant the home page showed last season for as long as that took. They
 * are now the `banners` table, seeded from exactly the five that were
 * here, with an admin screen over it. See lib/store/banners.js.
 *
 * That is one line moving, not the argument collapsing. Everything below
 * is still a commit.
 *
 * This block previously lived inside live-catalogue.json, where the
 * export script had to read it back out of the file it was about to
 * overwrite so that regenerating the catalogue would not strip the
 * shop's branding. That hack is what this file removes.
 */

export const SHOP = Object.freeze({
  name: "Salwar Butterfly",
  tagline: "Fashion meets comfort",

  phone: "8778921938",
  email: "salwarbutterfly1213@gmail.com",

  logo: "https://res.cloudinary.com/ddvui6pi4/image/upload/v1781285233/shop/settings/njxy2ex9nvieh7r6vhpq.jpg",

  instagram: "https://www.instagram.com/salwar_butterfly/",
  whatsapp: "https://wa.me/918778921938",

  // The shop's own words, kept as the shop wrote them.
  features: Object.freeze([
    {
      title: "Delivery time 10 working days",
      detail: "Freeshipping all over India",
    },
    {
      title: "Gst registered brand",
      detail: "Trusted seller",
    },
    {
      title: "Limited edition",
      detail: "Book fast before stock out",
    },
    {
      title: "Watsapp support",
      detail: "No cod only online payment",
    },
  ]),
});
