/**
 * The shop's own identity — name, contacts, banners, trust badges.
 *
 * A module rather than an API call, and that is a deliberate line rather
 * than the last piece of the snapshot nobody moved.
 *
 * None of this is in the database. There is no settings table, no admin
 * screen that edits it, and no plausible one: a shop changes its logo or
 * its WhatsApp number a handful of times in its life, and building CRUD
 * for that would be more surface than the thing it manages. When it does
 * change, it changes in a commit, which is also the only record of when
 * and why it changed.
 *
 * The catalogue is the opposite on every count — it moves hourly, it has
 * a whole admin panel behind it, and it is read live. See catalogue.js.
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

  banners: Object.freeze([
    "https://res.cloudinary.com/ddvui6pi4/image/upload/v1781193886/shop/settings/mfdylo1mwpnsmykcw0ag.jpg",
    "https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149601/shop/settings/hjmgv0ldthb9vn99hlh9.jpg",
    "https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149742/shop/settings/d8fuqoctx9wkxvgqlh5v.jpg",
    "https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149652/shop/settings/oktrkjeec6erzhocqdjg.jpg",
    "https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149768/shop/settings/ymablyxlrytu1povjvm2.jpg",
  ]),

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
