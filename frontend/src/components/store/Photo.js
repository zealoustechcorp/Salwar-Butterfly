"use client";

import Image from "next/image";
import { useState } from "react";

import { CATEGORY_SHAPE, GarmentArt } from "./GarmentArt";

/**
 * The shop's own photograph, with a skeleton while it loads and the brand
 * illustration if it never arrives.
 *
 * Every asset on the live shop's Cloudinary account currently 401s
 * (`cloud_name ddvui6pi4 is disabled`), so in practice the illustration is what
 * renders today. The real URL is still requested, so the moment the account is
 * restored the photographs appear with no code change.
 */
export function Photo({
  src,
  alt,
  // The category's *name*, which is what picks the silhouette. It used to be
  // the id; ids are UUIDs now and no longer say anything about the garment.
  categoryName,
  seed = 0,
  priority = false,
  sizes,
  className,
  hoverSrc = null,
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hoverFailed, setHoverFailed] = useState(false);
  const shape = CATEGORY_SHAPE[categoryName] || "straight";
  const showPhoto = src && !failed;

  return (
    <>
      {/* The illustration is for a piece with no photograph, or one whose
          photograph failed — never a stand-in while it is still loading,
          where it read as the product itself until the real one swapped in. */}
      {showPhoto ? (
        loaded ? null : <span aria-hidden="true" className="sb-skeleton absolute inset-0" />
      ) : (
        <span className="absolute inset-0">
          <GarmentArt shape={shape} seed={seed} label={alt} />
        </span>
      )}

      {showPhoto ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          // Hidden rather than faded in: callers bring their own transition
          // (a hover zoom), and a second transition class would replace it.
          className={`${className ?? ""} ${loaded ? "" : "opacity-0"}`}
        />
      ) : null}

      {showPhoto && loaded && hoverSrc && !hoverFailed ? (
        <Image
          src={hoverSrc}
          alt=""
          fill
          sizes={sizes}
          onError={() => setHoverFailed(true)}
          className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
      ) : null}
    </>
  );
}
