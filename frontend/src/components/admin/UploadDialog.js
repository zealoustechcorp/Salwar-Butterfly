"use client";

import { CloudUpload, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";

import { readUploads, readUploadsOnServer, subscribeUploads } from "@/lib/api/uploads";

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Blocks the panel while a file upload is in flight.
 *
 * Mounted once in AdminShell and fed by the API client, so every screen
 * that uploads gets it without asking. Deliberately not the shared Modal:
 * there is no close button, the backdrop does not dismiss it and Escape
 * does nothing. Leaving mid-upload abandons the request, and the bulk
 * screen in particular would leave products created without their
 * photographs. Closing or reloading the tab gets the browser's own
 * "leave site?" prompt for the same reason.
 */
export function UploadDialog() {
  const uploads = useSyncExternalStore(subscribeUploads, readUploads, readUploadsOnServer);
  const open = uploads.count > 0;

  useEffect(() => {
    if (!open) return undefined;

    const warn = (event) => {
      event.preventDefault();
      // Older browsers still want a returnValue before they will prompt.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open]);

  const percent =
    uploads.total > 0 ? Math.min(100, Math.round((uploads.loaded / uploads.total) * 100)) : null;

  // No byte count yet (the first progress event has not arrived) and the
  // bytes-all-sent wait on the API both read as an indeterminate bar.
  const indeterminate = percent === null || uploads.processing;

  const heading = uploads.processing ? "Saving images…" : "Uploading images…";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="upload-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="upload-dialog-title"
            aria-describedby="upload-dialog-warning"
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-ink-900/10"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <CloudUpload className="size-5 animate-pulse" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="upload-dialog-title" className="text-sm font-semibold text-ink-900">
                  {heading}
                </h2>
                <p className="text-xs text-ink-500">
                  {uploads.processing
                    ? "Almost done. Storing your photographs."
                    : uploads.total > 0
                      ? `${megabytes(uploads.loaded)} of ${megabytes(uploads.total)}`
                      : "Starting upload…"}
                  {uploads.count > 1 ? ` · ${uploads.count} batches` : ""}
                </p>
              </div>
              {!indeterminate ? (
                <span className="ml-auto text-sm font-semibold tabular-nums text-brand-700">
                  {percent}%
                </span>
              ) : null}
            </div>

            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={indeterminate ? undefined : percent}
              className="relative mt-4 h-2 overflow-hidden rounded-full bg-ink-100"
            >
              {indeterminate ? (
                <motion.div
                  className="absolute inset-y-0 w-1/3 rounded-full bg-brand-600"
                  initial={{ left: "-33%" }}
                  animate={{ left: "100%" }}
                  transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
                />
              ) : (
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-200 ease-out"
                  style={{ width: `${percent}%` }}
                />
              )}
            </div>

            <div
              id="upload-dialog-warning"
              className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-xs text-amber-900">
                <strong className="font-semibold">Don&apos;t close or refresh this page</strong> until
                the upload finishes, or the images may be lost.
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
