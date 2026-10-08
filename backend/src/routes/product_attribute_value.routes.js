// src/routes/product_attribute_value.routes.js

import express from "express";
import { AttributeValueController } from "../controllers/product_attribute_value.controller.js";
import {
  validateCreateAttributeValue,
  validateUpdateAttributeValue,
} from "../validators/product_attribute_value.validator.js";

const router = express.Router();

router.post(
  "/createAttributeValue",
  validateCreateAttributeValue,
  AttributeValueController.create,
);

// The whole register, grouped. `?activeOnly=true` is what the product
// form asks for — retired values stay out of new products.
router.get("/getAllAttributeValues", AttributeValueController.getAll);

router.get(
  "/getAttributeValuesByGroup/:groupName",
  AttributeValueController.getByGroup,
);

router.put(
  "/updateAttributeValue/:id",
  validateUpdateAttributeValue,
  AttributeValueController.update,
);

router.patch(
  "/updateAttributeValueStatus/:id",
  AttributeValueController.updateStatus,
);

router.delete("/deleteAttributeValue/:id", AttributeValueController.delete);

export default router;
