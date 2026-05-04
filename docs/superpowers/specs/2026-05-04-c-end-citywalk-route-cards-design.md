# C-End Citywalk Route Cards Design

## Status

Approved direction from product discussion on 2026-05-04.

## Product Positioning

The new Node full-stack product line should target C-end young users planning lightweight citywalk trips. The first version is not a general travel platform. It focuses on helping users quickly generate a themed, executable route card for a weekend, one-day, or short city trip.

The product promise is:

> Generate a route card that is easy to walk, easy to trust, easy to save, and easy to share.

## Target User

Primary user:

- Young users planning weekend citywalks or light trips.
- They value vibe, photography, cafes, food, exhibitions, night views, and shareability.
- They do not want to read dozens of guides before deciding where to go.
- They still need the route to be executable, not just visually attractive.

Primary use moments:

- "Tomorrow I want to go somewhere nearby."
- "I want a one-day themed route in Shanghai, Hangzhou, Suzhou, Chengdu, etc."
- "I saw a theme I like and want AI to generate a similar route for my date, city, and style."

## Core Product Direction

Use **B as the product skeleton, A/C as share packaging**.

### B: Route-First Core Card

The main generated artifact is a map and timeline route card. It should answer:

- What is the theme?
- Who is this route for?
- Where do I go first, next, and last?
- How long does each stop take?
- Why is each stop recommended?
- What risks should I know about?
- Can I open navigation?
- Can I save and revisit it?

This is the default card users interact with after generation.

### A: Poster-First Share Wrapper

The poster wrapper turns a confirmed route into a visually attractive cover card for collection and social posting. It emphasizes:

- Strong title.
- Vibe and theme.
- Top 2-3 stops.
- City and duration.
- A lightweight "generate same route" entry.

### C: Story-First Share Wrapper

The story wrapper turns a route into an emotional share image. It emphasizes:

- The feeling of the day.
- Photo/story framing.
- Friend/date/group context.
- A QR or link entry to generate a similar route.

## First Theme Set

The first version should ship with six themes:

1. Rain-friendly citywalk.
2. Coffee slow walk.
3. Film/photo route.
4. Night-view ending route.
5. Low-budget food route.
6. Exhibition and art route.

These are intentionally narrow. The product should not launch with a large generic tag marketplace. More themes can be added after measuring generation, save, and share behavior.

## MVP User Flow

1. User chooses or searches a city.
2. User chooses one of the six themes.
3. User chooses date and duration, initially one day or two days.
4. User optionally adds a short note, such as "less walking", "with friends", "rainy day", or "more cafes".
5. System generates the B route-first card.
6. User reviews timeline, map, reasons, risk and confidence.
7. User saves the route.
8. User exports A poster or C story share wrapper.
9. Shared card links back to a route detail or "generate similar" entry.

## MVP Functional Requirements

### Generate Route Card

- Generate one primary route card per request.
- Include city, theme, date, duration, route title, route summary, and estimated cost.
- Include 3-5 stops per day.
- Each stop must include time window, POI name, recommendation reason, tags, and map/navigation link when available.
- Include transit estimates between adjacent stops.
- Include weather, opening, distance, and confidence hints when available.
- Include degraded state when provider or AI data is unavailable.

### Save And Review

- Users can save a generated route.
- Users can see saved route cards in a list.
- Users can open a saved route detail.
- Users can delete saved routes.

### Share Packaging

- Users can export a poster-style share card.
- Users can export a story-style share card.
- Share packaging should be generated from the same route data, not as a separate itinerary.
- The share card should include a route title, city, theme, selected highlights, and entry point for generating a similar route.

## Data And Trust Requirements

The product should make trust visible without feeling clinical.

Show:

- Data source mode: provider data, AI/rules, or fallback draft.
- Confidence score or confidence tier.
- Weather or opening risk when relevant.
- Route/transit evidence when available.
- Clear degraded message when generated from fallback data.

Do not over-explain every technical detail on the card. Keep detailed evidence behind expandable panels or lightweight badges.

## Non-Goals For The First Version

- Native iOS app.
- Go backend.
- Community feed.
- Full profile personalization.
- Hotel, flight, train, or ticket booking.
- Multi-user collaboration.
- Global destination coverage.
- Large theme marketplace.
- Complex editing canvas.

## Node Full-Stack Implications

The implementation should reset the mainline to a Node/TypeScript Web product:

- Remove the active Go backend and iOS app from the current mainline.
- Build one web-first full-stack app.
- Keep AI planning, route validation, save/review, and share rendering in the Node stack.
- Use local fallback data for demo and development.
- Keep provider integrations optional through environment variables.

## Success Metrics

Early MVP success should be measured by:

- Generate completion rate.
- Save rate after generation.
- Share export rate after save.
- Click-through from shared card to "generate similar".
- Regeneration or theme switch rate.
- Qualitative feedback on whether the route feels walkable and share-worthy.

## Open Design Notes

The visual direction approved in brainstorming is:

- Core product: practical route-first card.
- Visual system: warm citywalk editorial style, not generic dashboard UI.
- Share layer: bolder, more expressive, poster/story oriented.
- UX priority: route clarity first, social vibe second.
