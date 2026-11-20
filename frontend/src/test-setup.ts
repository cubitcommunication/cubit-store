// Tests run without the server, so give the app the store details the server would normally write into the page.
const g = globalThis as unknown as { window?: Record<string, unknown> };
g.window = Object.assign(g.window ?? {}, {
  __BRAND__: { name: "Test Store", phoneE164: "910000000000", phoneDisplay: "+91 00000 00000", email: "hello@example.com", siteUrl: "https://example.com", websiteLabel: "example.com" },
});
