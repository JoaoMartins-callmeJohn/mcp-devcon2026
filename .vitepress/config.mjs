import { defineConfig } from "vitepress";

function normalizeBase(input) {
  if (!input) {
    return "/";
  }

  const withLeadingSlash = input.startsWith("/") ? input : `/${input}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

const base = normalizeBase(process.env.VITEPRESS_BASE_PATH || "/");
const withBase = (path) => `${base}${path.replace(/^\//, "")}`;

export default defineConfig({
  title: "DevCon MCP Workshop",
  description:
    "Build, connect, and ship a Model Context Protocol system end-to-end.",

  base,

  srcDir: "src",
  cleanUrls: true,

  markdown: {
    config: (md) => {
      const defaultLinkOpen =
        md.renderer.rules.link_open ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };
      md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        const hrefIdx = tokens[idx].attrIndex("href");
        if (hrefIdx >= 0) {
          const href = tokens[idx].attrs[hrefIdx][1];
          if (
            href.startsWith("/code-states") ||
            href.startsWith(withBase("code-states"))
          ) {
            tokens[idx].attrSet("target", "_blank");
            tokens[idx].attrSet("rel", "noopener");
          }
        }
        return defaultLinkOpen(tokens, idx, options, env, self);
      };
    },
  },

  head: [
    ["link", { rel: "icon", href: withBase("favicon.webp"), type: "image/webp" }],
  ],

  appearance: "dark",

  themeConfig: {
    logo: null,

    nav: [
      { text: "Home", link: "/" },
      { text: "Start Workshop", link: "/01-establishing-mcp-communication" },
      { text: "Source Code", link: "/code-states" },
      {
        text: "Download Slides",
        link: withBase("Workshop%20MCP%20Devcon%2014-04-2026.pdf"),
        target: "_blank",
      },
    ],

    sidebar: [
      {
        text: "Workshop",
        items: [
          {
            text: "Prerequisites",
            link: "/prerequisites",
          },
          {
            text: "1 - Establishing MCP Communication",
            link: "/1-establishing-mcp-communication",
          },
          {
            text: "2 - Linking with External Tools",
            link: "/2-linking-with-external-tools",
          },
          {
            text: "3 - Connecting Autodesk APS (2-Legged)",
            link: "/3-connecting-autodesk-aps",
          },
          {
            text: "4 - User Authentication with APS (3-Legged)",
            link: "/4-three-legged-aps",
          },
          {
            text: "5 - Advanced: Custom Client & Agent",
            link: "/5-advanced",
          },
          {
            text: "Production Checklist",
            link: "/production-checklist",
          },
          {
            text: "Source Code",
            link: "/code-states",
          },
        ],
      },
    ],

    socialLinks: [
      {
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.57 20"><path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0S5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10s0 4.6496 0.597366 6.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20s8.9347 0 11.1618-0.5974C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768 28.5701 14.6496 28.5701 10 28.5701 10s-0.0024-4.64958-0.5974-6.87676Z" fill="currentColor"/><path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="var(--vp-c-bg)"/></svg>',
        },
        link: "#",
        ariaLabel: "YouTube Playlist (Coming Soon)",
      },
    ],

    footer: {
      message: "DevCon MCP Workshop",
      copyright: `© ${new Date().getFullYear()} Nacorm`,
    },

    search: {
      provider: "local",
    },
  },
});
