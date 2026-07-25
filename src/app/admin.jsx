// Admin console.
//
// This replaces six hand-written modules (index / dashboard / people-crm /
// settings / availability / email, about 1,300 lines) with chapter's packaged
// console. ChapterAdmin is self-contained: it fetches /api/config for the Clerk
// publishable key, mounts the sign-in widget, gates on the admin role, and
// renders the three workspaces (Dashboard / People / Settings) that this site
// already used.
//
// CSS order matters and is load-bearing:
//   1. the salt theme scope supplies the --ui-* VALUES
//   2. index.css supplies the component rules that consume them
//   3. crm/ui.css styles the CRM record panel
// The page's own inline <style> loads after all three, so the brand keeps the
// hero, cards, and typography. If the theme layer were missing, ChapterAdmin
// renders a loud red banner rather than failing silently, so a bad import order
// is visible immediately.
//
// Fonts are deliberately NOT chapter's: this brand runs Cormorant Garamond and
// Satoshi, loaded in the page head, so @odla-ai/ui/fonts/plex.css is skipped.

import "@odla-ai/ui/themes/salt/scope.css";
import "@odla-ai/ui/index.css";
import "@odla-ai/crm/ui.css";

import { render } from "preact";
import { ChapterAdmin } from "@odla-ai/chapter/ui/admin";
import { chapter } from "../chapter.config.mjs";

// The moss masthead is site chrome, not console chrome, so the page keeps it
// and the console renders embedded beneath it (chrome="embedded" is the
// default). The wordmark's ampersand needs the brand-amp span to stay upright,
// which is markup, so it lives in the page HTML rather than in copy.
render(<ChapterAdmin chapter={chapter} />, document.getElementById("console-root"));
