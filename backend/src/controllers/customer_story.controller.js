// src/controllers/customer_story.controller.js
//
// What customers have sent the shop (F-06.08), admin side.
//
// The public read is not here. It lives on StorefrontController, which
// is the GET-only reader anonymous callers reach — see
// routes/storefront.routes.js.

import { CustomerStoryService } from "../services/customer_story.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse, createdResponse } from "../utils/apiResponse.js";

/**
 * Every write answers with the whole list rather than the row it
 * touched.
 *
 * Creating inserts at the front and renumbers everything behind it,
 * deleting leaves a gap, and reordering moves rows the caller never
 * named — in all three cases a client applying a delta locally would
 * have to guess at what else moved.
 */
const list = (res, stories, message, extra = {}) =>
  okResponse({
    res,
    data: stories,
    message,
    meta: {
      counts: {
        ...extra,
        total: stories.length,
        published: stories.filter((story) => story.published).length,
      },
    },
  });

export const CustomerStoryController = {
  /** GET /api/customerStories/getCustomerStories */
  getCustomerStories: asyncHandler(async (req, res) => {
    const stories = await CustomerStoryService.getAll();

    return list(res, stories, "Customer stories fetched successfully");
  }),

  /** GET /api/customerStories/getCustomerStoryById/:id */
  getCustomerStoryById: asyncHandler(async (req, res) => {
    const story = await CustomerStoryService.getById(req.params.id);

    return okResponse({
      res,
      data: story,
      message: "Story fetched successfully",
    });
  }),

  /**
   * POST /api/customerStories/createCustomerStories
   *
   * multipart/form-data, field `images`, one to eight files.
   *
   * The only way in: a set of photographs, one story each, no text. A
   * story must carry a picture (019), so there is nothing to create
   * without one. Naming the customer or quoting them is an edit
   * afterwards, on the few cards that need it.
   */
  createFromImages: asyncHandler(async (req, res) => {
    const stories = await CustomerStoryService.createFromImages(req.files);

    return createdResponse({
      res,
      data: stories,
      message:
        req.files.length === 1
          ? "Story added"
          : `${req.files.length} stories added`,
      meta: {
        counts: {
          added: req.files.length,
          total: stories.length,
          published: stories.filter((story) => story.published).length,
        },
      },
    });
  }),

  /**
   * PUT /api/customerStories/updateCustomerStory/:id
   *
   * A full replace of the three typed fields — see the repository for
   * why it is a replace and not a patch. The photograph is untouched.
   */
  updateCustomerStory: asyncHandler(async (req, res) => {
    const story = await CustomerStoryService.update(req.params.id, req.body);

    return okResponse({
      res,
      data: story,
      message: "Story updated successfully",
    });
  }),

  /**
   * PUT /api/customerStories/replaceStoryImage/:id
   *
   * multipart/form-data, field `image`, exactly one file. Swaps the
   * photograph, or gives one to a story that was words alone.
   */
  replaceStoryImage: asyncHandler(async (req, res) => {
    const story = await CustomerStoryService.replaceImage(
      req.params.id,
      req.file,
    );

    return okResponse({
      res,
      data: story,
      message: "Photograph updated successfully",
    });
  }),

  /** PATCH /api/customerStories/setStoryPublished/:id */
  setPublished: asyncHandler(async (req, res) => {
    const story = await CustomerStoryService.setPublished(
      req.params.id,
      req.body.published,
    );

    return okResponse({
      res,
      data: story,
      message: story.published
        ? "Story is on the home page"
        : "Story hidden from the home page",
    });
  }),

  /** PATCH /api/customerStories/reorderCustomerStories */
  reorder: asyncHandler(async (req, res) => {
    const stories = await CustomerStoryService.reorder(req.body.ids);

    return list(res, stories, "Customer stories reordered successfully");
  }),

  /** DELETE /api/customerStories/deleteCustomerStory/:id */
  deleteCustomerStory: asyncHandler(async (req, res) => {
    const stories = await CustomerStoryService.remove(req.params.id);

    return list(res, stories, "Story deleted successfully");
  }),
};
