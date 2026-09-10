// src/controllers/banner.controller.js
//
// The home page carousel (F-06), admin side.
//
// The public read is not here. It lives on StorefrontController, which
// is the GET-only reader anonymous callers reach — see
// routes/storefront.routes.js.

import { BannerService } from "../services/banner.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse, createdResponse } from "../utils/apiResponse.js";

/**
 * Every write below answers with the whole carousel rather than the row
 * it touched.
 *
 * Uploading appends, deleting leaves a gap, and reordering moves rows
 * the caller never named — in all three cases a client applying a delta
 * locally would have to guess at what else moved. The list is small
 * enough that sending it is cheaper than being wrong about it.
 */
const list = (res, banners, message) =>
  okResponse({
    res,
    data: banners,
    message,
    meta: {
      counts: {
        total: banners.length,
        live: banners.filter((banner) => banner.active).length,
      },
    },
  });

export const BannerController = {
  /** GET /api/banners/getBanners */
  getBanners: asyncHandler(async (req, res) => {
    const banners = await BannerService.getAll();

    return list(res, banners, "Banners fetched successfully");
  }),

  /** GET /api/banners/getBannerById/:id */
  getBannerById: asyncHandler(async (req, res) => {
    const banner = await BannerService.getById(req.params.id);

    return okResponse({
      res,
      data: banner,
      message: "Banner fetched successfully",
    });
  }),

  /**
   * POST /api/banners/createBanners
   *
   * multipart/form-data, field `images`, one to eight files.
   *
   * A batch rather than a single file because that is the gesture the
   * shop actually makes: a season's artwork is finished together and
   * dragged in together. There is nothing else in the body — no
   * position, no caption — so the form is a file picker and a button.
   */
  createBanners: asyncHandler(async (req, res) => {
    const banners = await BannerService.createMany(req.files);

    return createdResponse({
      res,
      data: banners,
      message:
        req.files.length === 1
          ? "Banner added to the carousel"
          : `${req.files.length} banners added to the carousel`,
      meta: {
        counts: {
          added: req.files.length,
          total: banners.length,
          live: banners.filter((banner) => banner.active).length,
        },
      },
    });
  }),

  /**
   * PUT /api/banners/replaceBannerImage/:id
   *
   * multipart/form-data, field `image`, exactly one file.
   *
   * Swapping the artwork without losing the slide's place in the order —
   * which is the difference between this and deleting and re-uploading,
   * and the only reason it exists.
   */
  replaceBannerImage: asyncHandler(async (req, res) => {
    const banner = await BannerService.replaceImage(req.params.id, req.file);

    return okResponse({
      res,
      data: banner,
      message: "Banner image replaced successfully",
    });
  }),

  /** PATCH /api/banners/setBannerActive/:id */
  setActive: asyncHandler(async (req, res) => {
    const banner = await BannerService.setActive(
      req.params.id,
      req.body.active,
    );

    return okResponse({
      res,
      data: banner,
      message: banner.active
        ? "Banner is back in the carousel"
        : "Banner hidden from the carousel",
    });
  }),

  /** PATCH /api/banners/reorderBanners */
  reorder: asyncHandler(async (req, res) => {
    const banners = await BannerService.reorder(req.body.ids);

    return list(res, banners, "Banners reordered successfully");
  }),

  /** DELETE /api/banners/deleteBanner/:id */
  deleteBanner: asyncHandler(async (req, res) => {
    const banners = await BannerService.remove(req.params.id);

    return list(res, banners, "Banner deleted successfully");
  }),
};
