"use client";

import { useState } from "react";

export function SnippetBox({ siteId }: { siteId: string }) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script>(function(d,s,src,site){var e=d.createElement(s);e.async=true;e.src=src+'?site='+site;d.head.appendChild(e);})(document,'script','https://www.940digital.com/tracker.js','${siteId}');</script>`;

  return (
    <div className="mt-3">
      <pre className="overflow-x-auto rounded-lg bg-charcoal-dark p-4 text-xs text-grey-light">
        <code>{snippet}</code>
      </pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(snippet);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-2 rounded-md border border-charcoal-text/15 px-3 py-1.5 text-xs font-medium text-charcoal-text hover:border-blue-accent hover:text-blue-accent"
      >
        {copied ? "Copied" : "Copy snippet"}
      </button>
    </div>
  );
}
