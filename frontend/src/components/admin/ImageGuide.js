"use client";

/**
 * What to upload, in words, on the two screens that take artwork.
 *
 * Both home-page screens crop what they are given: the picture is scaled
 * until it fills the frame and whatever falls outside is cut off. That is
 * a good default and a bad surprise — a portrait photograph dropped into
 * the carousel loses most of its sides, and nothing on the screen said so
 * before the upload. This is that "before".
 *
 * A dialog, unlike everything else that was one on these screens. It is
 * reference rather than a decision: it changes nothing, it is read once
 * before picking a file and dismissed, and there is no state underneath
 * it that the shop needs to see while reading.
 *
 * The numbers are not prose: they are the same constants the upload
 * refuses past, imported rather than retyped, so the guide cannot drift
 * from what the API actually accepts.
 */

import { Info } from "lucide-react";

import { Button, Modal } from "./ui";
import { MAX_BANNERS, MAX_PER_UPLOAD as MAX_BANNERS_PER_UPLOAD } from "@/lib/api/banners";
import {
  MAX_STORIES,
  MAX_PER_UPLOAD as MAX_STORIES_PER_UPLOAD,
} from "@/lib/api/customerStories";

/** The carousel in the first fold of the home page. */
export const BANNER_GUIDE = {
  title: "What to upload for the carousel",
  shape: "16:9 landscape — design at 1920 × 1080 px",
  rows: [
    {
      term: "Best shape",
      detail:
        "16:9 landscape. 1920 × 1080 px is the size to design at; anything from about 1600 px wide up stays sharp on a large monitor.",
    },
    {
      term: "The picture is cropped, not letterboxed",
      detail:
        "Artwork is scaled until it fills the slide and whatever falls outside is cut off. A portrait photograph loses most of its sides, so upload something already landscape wherever possible.",
    },
    {
      term: "The band gets wider than 16:9",
      detail:
        "It runs 16:9 on a phone, about 21:9 on a tablet and 2.7:1 on a wide monitor — the top and bottom are trimmed as the window widens. Keep faces, prices and any words inside the middle band of the artwork.",
    },
    {
      term: "If the slide links to a piece",
      detail:
        "its name is printed in a corner of the banner on the home page, so leave that corner free of anything that matters.",
    },
    {
      term: "Files",
      detail: `JPEG, PNG or WebP · up to 5 MB each · ${MAX_BANNERS_PER_UPLOAD} at a time · ${MAX_BANNERS} banners in total, shown and hidden together.`,
    },
  ],
};

/** The customer wall further down the home page. */
export const STORY_GUIDE = {
  title: "What to upload for customer stories",
  shape: "9:16 portrait — design at 1080 × 1920 px",
  rows: [
    {
      term: "Best shape",
      detail:
        "9:16 portrait. 1080 × 1920 px is the size to aim for — a photograph taken on a phone held upright is already this shape.",
    },
    {
      term: "The picture is cropped, not letterboxed",
      detail:
        "The photograph is scaled until it fills its card and whatever falls outside is cut off. A wide photograph or a screenshot loses its left and right edges.",
    },
    {
      term: "The cards are not all the same shape",
      detail:
        "The wall runs 3:4, 9:16, square and 4:5 down the rail, so the same photograph is cropped differently depending on where it lands. Keep the person, and the garment, near the middle.",
    },
    {
      term: "Leave the bottom clear",
      detail:
        "A name and a quote are printed over the bottom of the picture on a dark fade, so anything important down there is covered.",
    },
    {
      term: "Files",
      detail: `JPEG, PNG or WebP · up to 5 MB each · ${MAX_STORIES_PER_UPLOAD} at a time · ${MAX_STORIES} stories in total, published and hidden together.`,
    },
  ],
};

/**
 * The button that opens the guide.
 *
 * Carries its own word rather than being a bare ⓘ: the whole point of this
 * pair is that a glyph on its own does not say what it will do.
 */
export function ImageGuideButton({ onOpen, size = "sm" }) {
  return (
    <Button size={size} variant="secondary" onClick={onOpen}>
      <Info className="size-3.5" aria-hidden="true" />
      Image guide
    </Button>
  );
}

/**
 * The guide itself.
 *
 * @param {object} props
 * @param {object} props.guide  BANNER_GUIDE or STORY_GUIDE
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 */
export function ImageGuide({ guide, open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={guide.title}
      description={guide.shape}
      footer={
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <dl className="space-y-3">
        {guide.rows.map((row) => (
          <div key={row.term} className="text-xs leading-relaxed">
            <dt className="font-semibold text-ink-800">{row.term}</dt>
            <dd className="text-ink-600">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
