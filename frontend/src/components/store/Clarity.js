import Script from "next/script";

/**
 * Microsoft Clarity — session recordings, heatmaps and rage-click
 * detection for the storefront.
 *
 * Mounted from the storefront layout rather than the root one, and that
 * is the deliberate part. The root layout also wraps /admin, where the
 * screens on display are order lists and customer records: real names,
 * phone numbers and delivery addresses, recorded to a third party at
 * full fidelity every time the shop owner works through the day's
 * orders. Clarity masks text it recognises as sensitive, but it cannot
 * recognise "this whole table is customers", so the panel is kept out
 * of its reach entirely. To record the admin too, move this into
 * app/layout.js — and read Clarity's masking settings first.
 *
 * No project id means no script tag, which is the state in development:
 * a laptop's clicks are not a signal and the free tier's quota is
 * better spent on real visits. Set NEXT_PUBLIC_CLARITY_PROJECT_ID to
 * switch it on.
 *
 * `afterInteractive` rather than `beforeInteractive`: nothing on the
 * page waits on analytics, and loading it ahead of hydration would put
 * a third-party request in front of the first product photo. Clarity
 * buffers what happened before it loaded, so the recording does not
 * start late.
 *
 * The snippet is Clarity's own, from Settings -> Setup -> Install
 * manually, with the project id interpolated.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "";

export function Clarity() {
  if (!PROJECT_ID) {
    return null;
  }

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", ${JSON.stringify(PROJECT_ID)});`}
    </Script>
  );
}
