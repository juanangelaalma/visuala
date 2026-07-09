## Overview

Visuala’s current visual system is dark, cinematic, and creator-focused. It feels professional and premium, with energetic neon-lime calls to action, large editorial display type, rounded pill controls, and soft glass-like panels over black surfaces.

The interface is mostly spacious and marketing-led on public pages, while the product/admin areas keep the same dark palette but become more utilitarian and dense. The system favors crisp typography, bold contrast, large rounded corners, subtle borders, and almost-flat depth with occasional glow or inner-shadow effects.

## Colors

- **Primary** (#EFF31B): Neon lime used for primary actions, active states, highlighted words, pricing badges, success messages, checkbox accents, and strong promotional panels.
- **Secondary** (#000000): Core page background and high-contrast surface color. Used for body backgrounds, top navigation overlays, form fields, dark buttons, and video/image framing.
- **Tertiary** (#e04141): Danger and urgency color used for destructive actions, error states, and “new feature” style labels.
- **Neutral** (#BABABA): Main muted text color for labels, subtitles, placeholders, section metadata, and secondary copy.
- **Surface** (#161616): Dominant panel/card/sidebar surface. Use for dashboard shells, auth cards, pricing sections, and grouped content blocks.
- **Surface Raised** (#333333): Used sparingly for avatars, media placeholders, hover surfaces, and inactive neutral blocks.
- **Text Primary** (#ffffff / near-white): Primary text on dark surfaces.
- **Text Muted** (#777777 / #555555): Supporting metadata, dividers, low-emphasis descriptions, and inactive helper text.

## Typography

- **Headline Font**: Clash Display-style display face for hero text, major section headings, uppercase feature titles, and premium campaign language.
- **Body Font**: Cera/Arial-style sans serif for general UI copy and product content.
- **Label Font**: Inter/Cera-style sans serif for labels, buttons, form controls, captions, tabs, and dashboard utility text.

Hierarchy is bold and high-contrast. Marketing headings are large, tight, and often uppercase, ranging from roughly 42px to 96px on responsive hero/feature sections. Product headings are smaller but still firm, commonly 24px–48px with tight negative tracking. Body copy is usually 14px–20px with medium or light weights. Labels are visible, usually 12px–14px, medium weight, muted gray, and sentence case in forms; badges and CTAs often use uppercase with wide tracking.

## Elevation

Depth is mostly created through layered dark surfaces, translucent borders, surface tint, blur, and rounded panels rather than heavy shadows.

Cards and panels commonly use subtle white borders at low opacity, inner 1px white shadow, backdrop blur, and black-to-near-black gradients. Featured pricing cards add a soft lime-tinted shadow. Marketing CTAs may use a lime/white glow behind the button. Media cards rely on rounded clipping, image/video contrast, bottom gradients, and slight hover scale rather than conventional drop shadows.

The overall treatment is almost flat, with glow reserved for premium highlights and primary conversion moments.

## Components

**Buttons** use full-pill shapes, semibold text, smooth transitions, and 44px–52px typical heights. Primary buttons are lime with black text and a slightly darker lime hover. Solid buttons invert between white/black depending on context and may turn lime on hover. Outline buttons use 2px borders with transparent backgrounds and subtle white or black hover fills. Destructive buttons are red with white text. Marketing CTAs often use uppercase text, bold weight, wide tracking, and optional glow.

**Inputs and forms** use dark filled fields, rounded-2xl corners, low-opacity white borders, white input text, muted placeholders, and lime focus borders. Labels sit above inputs, remain visible, and use muted gray text. Form cards use rounded-3xl corners, dark surfaces, subtle borders, inner shadow, and backdrop blur. Error messages use red borders with transparent red fills; success messages use lime borders with transparent lime fills.

**Cards** are large-radius dark panels with subtle borders or inner strokes. Common card radius is rounded-3xl for panels and pricing cards, rounded-2xl for controls and media, and rounded-xl for smaller media tiles. Cards usually have generous padding around 20px–34px. Featured cards may switch to light surfaces with black text while retaining lime border/accent treatment.

**Badges and chips** are rounded-full, compact, and high-contrast. Primary badges use lime background with black text. Secondary badges use transparent or translucent surfaces with muted text and low-opacity borders. Badge text is usually small, medium or bold, and often uppercase for marketing contexts.

**Tables/lists** appear as dark grouped content rather than traditional grid-heavy tables. Lists use compact row gaps, muted metadata, visible labels, and simple dividers. Feature lists use check icons in lime or black depending on card theme.

**Sidebar** uses a dark rounded-2xl vertical shell, white text, muted section labels, pill-shaped navigation items, and lime active states with black text. Icons are simple 24px line icons. Inactive items are flat dark with hover surface tint.

**Top navigation** is dark, rounded or blurred depending on context. Marketing navigation is an absolute black translucent bar with backdrop blur. Dashboard navigation is a rounded dark bar with pill search, circular icon actions, and a lime create button.

**Tabs** use pill containers with low-opacity borders and dark translucent backgrounds. Active tabs are lime with black text; inactive tabs are muted gray and turn white on hover.

**Modals/dialog-like panels** should follow the auth/admin card pattern: centered or contained dark surface, rounded-3xl, white/10 border, inner stroke, backdrop blur, clear heading, visible labels, and lime primary action.

**Empty states** use rounded-3xl dark panels, low-opacity white borders, centered muted text, and no heavy illustration by default.

## Do's and Don'ts

Do use black and near-black surfaces as the default canvas.
Do use #EFF31B as the single dominant action and highlight color.
Do keep primary actions pill-shaped with black text on lime.
Do use large rounded corners: rounded-full for controls, rounded-2xl for inputs/media, rounded-3xl for panels.
Do use subtle white/10 borders and inner strokes to separate dark surfaces.
Do keep labels visible above form controls.
Do use muted gray for secondary copy, placeholders, section labels, and metadata.
Do use display typography for major marketing headings and strong feature statements.
Do use uppercase and tracking for promotional CTAs, badges, and hero/feature language.
Do preserve generous marketing whitespace and tighter dashboard density.
Do use glow sparingly for hero CTAs, featured pricing, and premium emphasis only.
Do keep focus states visible with lime/blue focus outlines or lime borders.

Don’t introduce unrelated bright accent palettes.
Don’t replace the dark cinematic foundation with light default SaaS styling.
Don’t use square corners for primary cards, inputs, or buttons.
Don’t use heavy gray drop shadows as the main elevation style.
Don’t hide form labels behind placeholders only.
Don’t overuse gradients; reserve them for featured pricing cards, overlays, and subtle surface depth.
Don’t make inactive navigation items high-contrast.
Don’t use dense table borders when grouped dark cards or simple dividers fit the system better.
Don’t create new primary button colors.
Don’t add decorative elements that compete with media, video, and neon-lime action moments.
