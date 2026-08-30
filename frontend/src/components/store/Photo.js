"use client";

import Image from "next/image";
import { useState } from "react";

import { CATEGORY_SHAPE, GarmentArt } from "./GarmentArt";

/**
 * The shop's own photograph, with the brand illustration behind it.
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
  const [hoverFailed, setHoverFailed] = useState(false);
  const shape = CATEGORY_SHAPE[categoryName] || "straight";

  return (
    <>
      {/* The illustration is always the bottom layer, so it is in the server
          HTML too: a failed photo reveals it instead of a broken-image icon,
          and a client with no JS still sees something. */}
      <span className="absolute inset-0">
        <GarmentArt shape={shape} seed={seed} label={alt} />
      </span>

      {src && !failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          onError={() => setFailed(true)}
          className={className}
        />
      ) : null}

      {src && !failed && hoverSrc && !hoverFailed ? (
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
