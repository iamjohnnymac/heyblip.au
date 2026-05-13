import { NextResponse } from "next/server";

const catalog = {
  linkset: [
    {
      anchor: "https://blip-auth.john-mckean.workers.dev",
      "service-doc": [
        {
          href: "https://heyblip.au/tech",
          type: "text/html",
          title: "Blip technical specs",
        },
      ],
    },
    {
      anchor: "https://blip-relay.john-mckean.workers.dev",
      "service-doc": [
        {
          href: "https://heyblip.au/tech",
          type: "text/html",
          title: "Blip technical specs",
        },
      ],
    },
    {
      anchor: "https://blip-cdn.john-mckean.workers.dev",
      "service-doc": [
        {
          href: "https://heyblip.au/tech",
          type: "text/html",
          title: "Blip technical specs",
        },
      ],
    },
  ],
};

export function GET() {
  return new NextResponse(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
