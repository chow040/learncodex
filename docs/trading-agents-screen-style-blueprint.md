# Trading Agents Screen Styling Blueprint

> This styling blueprint governs every Trading Agents experience—existing screens such as the command center and detail views, plus any future surfaces added to the workflow. Treat these guidelines as the shared visual contract for the entire Trading Agents product line.

## Vision & Design Principles
- **Modern Black**: Embrace a deep charcoal base with subtle gradients to signal a professional, tech-forward experience.
- **Clarity Over Flash**: Heavy use of negative space, tight typography, and deliberate use of accent colors for hierarchy.
- **Contrast & Legibility**: Ensure WCAG AA contrast on primary surfaces, especially for data tables and status banners.
- **Shadcn-First**: Leverage shadcn/ui primitives for composability and consistency (Button, Card, Command, Sheet, Table, Tabs).
- **Reference Inspiration**: Mirror the ui.shadcn.com landing experience (hero screenshot provided) — flat black foundation, soft vignette gradients, elevated cards with muted borders, and monochrome typography punctuated by neon-like accent pills.

## Theme Palette & Tokens
- Background layers (HSL):
  - `--background`: `222 47% 7%` (charcoal black)
  - `--card`: `222 43% 9%` with translucent gradient overlays
  - `--muted`: `222 35% 12%`
  - `--border`: `222 25% 20%` (thin, 1px separators)
- Accents:
  - Primary accent: electric cyan `190 95% 55%`
  - Secondary accent: violet `268 90% 65%`
  - Success: emerald `155 75% 55%`
  - Warning/alert: amber `40 95% 60%`
- Update `src/index.css` dark theme tokens or add a `trading-agents` theme scope (CSS variables inside `.trading-theme`) so other screens retain existing palette.
- Apply subtle radial gradient overlays on page wrapper (`bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.12),transparent_45%),...]`).

## Typography & Iconography
- Title: `text-3xl font-semibold tracking-tight` (e.g. `font-display` if available).
- Body copy: `text-sm leading-6 text-muted-foreground`.
- Section labels: uppercase microcopy with letter spacing (`text-xs uppercase tracking-[0.3em] text-slate-200/70`).
- Iconography: lucide-react icons; size 16–20px; lighten in inactive states with opacity.

## Layout Structure
- **Container**: Max width `1200px`, centered with `px-6 lg:px-12 py-10`.
- **Grid**:
  - Responsive split: `lg:grid lg:grid-cols-[minmax(350px,420px)_minmax(0,1fr)] lg:gap-8`.
  - On mobile stack vertically with `space-y-6`.
- **Panels**:
  - Configuration: sticky on large screens (`lg:sticky lg:top-20`), using `Card` component with padded sections.
  - History table & run feedback reside in primary content column.
- **Hero Treatment**: Optional top-of-page hero to echo shadcn reference — large heading (`text-4xl`), supporting copy, CTA cluster, subtle pill badge highlighting “New trading run” similar to `ui.shadcn.com` hero badge styling.

## Component Mapping (shadcn)
- **Form Controls**:
  - Ticker input → `Input` with `variant="glass"` (custom class: `bg-card/70 border-border/60 focus-visible:ring-cyan-400`).
  - Model dropdown → `Select` with `SelectTrigger` styled to match input; populate from models API.
  - Analyst selector → `Card` with nested `Checkbox` + label; use `FormField` wrappers for validation states.
- **Action Buttons**:
  - Primary: `Button` variant `default` with custom classes `bg-cyan-500 hover:bg-cyan-400 text-black font-semibold tracking-wide uppercase`.
  - Secondary/ghost: `variant="outline"` with border `border-border/40` and hover fill `bg-white/5`.
- **Progress & Status**:
  - Reuse existing `TradingProgress` but update tokens for new palette (accent cyan, success emerald).
  - Use `Badge` or `Chip` components for analyst tags (`Badge` variant `outline` with accent border).
- **History Table**:
  - `Table`, `TableHeader`, `TableRow`, with zebra stripes `odd:bg-card` / `even:bg-muted/40`.
  - Decision text truncated with tooltip (`HoverCard` or `Tooltip`).
  - Row hover: `hover:bg-muted/50 hover:border-cyan-500/40 cursor-pointer`.
- **Detail Page**:
  - Use `Tabs` for sections (Summary, Analyst Breakdowns, Raw JSON).
  - Display cards using `CardHeader`, `CardContent` in a responsive grid `md:grid-cols-2`.

## Micro Interactions
- Inputs: animate focus with `focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
- Run button: add loading indicator via `Button` `disabled` state and `Spinner` icon.
- Analyst checkboxes: use `Checkbox` with `transition transform` (scale to 95% on press).
- Table row click: show subtle transform `translate-x-1` on hover for affordance.

## Accessibility
- Ensure checkbox group exposes `aria-describedby` explaining selections.
- History table rows should include `aria-label` summarizing decision.
- Maintain keyboard focus outlines (avoid removing default focus).
- Provide high-contrast theme toggle fallback (if theme not supported, fall back to default dark variables).

## Responsive Guidance
- Mobile:
  - Stack configuration, progress, history sequentially.
  - Convert history table to cards (use `Card` per record with key-value pairs).
- Tablet:
  - Maintain two-column layout but reduce side padding.
- Desktop:
  - Use sticky config panel + scrollable history table with `max-h-[420px] overflow-y-auto` if list expands.

## Implementation Steps
1. ✅ `trading-theme` CSS variables scoped in `src/index.css` so the Equity Insight palette remains untouched.
2. ✅ `<TradingAgentsLayout>` wraps the screen with gradients, sticky config panel, and container sizing.
3. Style configuration form using shadcn `Form`, `Input`, `Select`, `Checkbox`, `Button`.
4. Update `TradingProgress` to accept theme overrides (props for accent colors or CSS variables).
5. Build history table with responsive conversions (table vs stacked cards).
6. Apply detail page styling with `Tabs`, `Card`, `ScrollArea` for JSON view.
7. Validate contrast (use Figma or Stark) and adjust tokens for AA compliance.

## Development Checklist
- [x] Define/override theme tokens for modern black palette in `src/index.css`.
- [x] Implement `TradingAgentsLayout` component applying background gradients and spacing.
- [x] Style configuration form using shadcn form primitives with updated palette.
- [x] Implement analyst selector card group with hover/focus states.
- [x] Style primary CTA and loading states with cyan accent.
- [ ] Apply new palette to `TradingProgress` component or wrap with themed container. *(Currently inherits styling from layout; consider swapping stage colors to cyan/emerald for full parity.)*
- [ ] Build history table with hover states, responsive fallback cards, and shadcn Table components.
- [x] Style assessment detail view using Tabs and Cards.
- [ ] Verify accessibility (focus, contrast, keyboard navigation).
- [ ] Document theming approach in `docs/` and share Figma references if available. *(Add screenshots + contrast notes once palette locks in.)*

### Status Notes
- Layout shell, hero, and configuration panel now live in `src/pages/TradingAgents.tsx` using the new tokens.
- Equity Insight sidebar links to the new screen; legacy tab UI removed.
- Modern-black palette is now the global default (see `src/index.css`), so all Trading Agents surfaces inherit the contract automatically.
- History module and TradingProgress accent refresh remain outstanding for the next pass.

## Open Questions
- Do we need a global dark-mode toggle or is the trading screen always dark?
- Should palette tie into future design system tokens (e.g., configurable via parameter maintenance module)?
- Are there branding constraints (logos, colors) that must be incorporated?
