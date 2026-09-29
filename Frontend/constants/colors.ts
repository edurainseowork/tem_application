/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#14213d',
    tint: '#ff6b4a',

    // Core surfaces
    background: '#f6f7fb',
    foreground: '#14213d',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#14213d',

    // Primary action color (buttons, links, active states)
    primary: '#ff6b4a',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#eef0f7',
    secondaryForeground: '#14213d',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#eef0f7',
    mutedForeground: '#74809a',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#fff0eb',
    accentForeground: '#d94d35',

    // Destructive actions (delete, error states)
    destructive: '#e05252',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e4e7ef',
    input: '#dce1ec',

    // Brand-specific surfaces
    navy: '#14213d',
    navyMuted: '#263555',
    coral: '#ff6b4a',
    teal: '#1d9a9c',
    gold: '#f5b94c',
    lavender: '#8d7cf5',
    mint: '#e5f6f2',
    sky: '#e8f1ff',
    inkSubtle: '#74809a',
    success: '#1d9a78',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
