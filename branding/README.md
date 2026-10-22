# Kuito brand

The official Kuito caracal artwork is maintained as the vector master under `apps/website/public/kuito-mark.svg`.

Generate consistent native starter assets by running `npm run brand:export` from `apps/website`. This writes 1024px app icons and a transparent splash logo under `templates/app/assets`, and extra master exports under `branding/generated`.

The generated images should be committed before packaging the framework so a newly created app has the Kuito icon and splash without needing image tooling installed.

**Native branding policy**

- A developer's explicitly configured app icon or splash overrides the default.
- Starters show the Kuito caracal until the app supplies its own.
- Development shells without branding should get the Kuito fallback once the native config migration is complete.
- Production release tooling should warn when app-specific artwork is absent.
- Android foreground art must stay inside the adaptive-icon safe area.

