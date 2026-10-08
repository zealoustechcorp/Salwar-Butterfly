// src/controllers/review.controller.js

import { ReviewService } from "../services/review.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { createdResponse, okResponse, successResponse } from "../utils/apiResponse.js";

export const ReviewController = {
  getReviews: asyncHandler(async (req, res) => {
    try {
      const {
        productId,
        rating,
        published,
        search,
        sort,
        page = 1,
        limit = 25,
      } = req.query;

      logger.info("Get reviews endpoint called", { productId, rating, page });

      const result = await ReviewService.listReviews({
        productId,
        rating,
        published,
        search,
        sort,
        page,
        limit,
      });

      return successResponse({
        res,
        data: result.data,
        meta: {
          pagination: result.pagination,
          summary: result.summary,
        },
        message: "Reviews retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get reviews endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to fetch reviews");
    }
  }),

  getRatingSummary: asyncHandler(async (req, res) => {
    try {
      const { productId } = req.query;

      logger.info("Get rating summary endpoint called", { productId });

      const summary = await ReviewService.getRatingSummary({ productId });

      return okResponse({
        res,
        data: summary,
        message: "Rating summary retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get rating summary endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the rating summary");
    }
  }),

  getReviewById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Get review by id endpoint called", { reviewId: id });

      const review = await ReviewService.getReviewById(id);

      return okResponse({
        res,
        data: review,
        message: "Review retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get review by id endpoint error", {
        reviewId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the review");
    }
  }),

  createReview: asyncHandler(async (req, res) => {
    try {
      logger.info("Create review endpoint called", {
        productId: req.body?.productId,
      });

      const review = await ReviewService.createReview(req.body);

      return createdResponse({
        res,
        data: review,
        message: `Review by ${review.authorName} saved`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Create review endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to save the review");
    }
  }),

  updateReview: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Update review endpoint called", { reviewId: id });

      const review = await ReviewService.updateReview(id, req.body);

      return okResponse({
        res,
        data: review,
        message: "Review updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update review endpoint error", {
        reviewId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the review");
    }
  }),

  setPublished: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { published } = req.body;

      logger.info("Set review visibility endpoint called", {
        reviewId: id,
        published,
      });

      const review = await ReviewService.setPublished(id, published);

      return okResponse({
        res,
        data: review,
        message: published
          ? "Review published to the storefront"
          : "Review hidden from the storefront",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Set review visibility endpoint error", {
        reviewId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the review");
    }
  }),

  deleteReview: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Delete review endpoint called", { reviewId: id });

      const result = await ReviewService.deleteReview(id);

      return okResponse({
        res,
        data: result,
        message: "Review deleted successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Delete review endpoint error", {
        reviewId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete the review");
    }
  }),
};
