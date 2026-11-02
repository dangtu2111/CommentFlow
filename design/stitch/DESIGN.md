---
name: CommentFlow AI Design System
colors:
  surface: '#f5faff'
  surface-dim: '#cedce7'
  surface-bright: '#f5faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf5ff'
  surface-container: '#e2f0fb'
  surface-container-high: '#dceaf5'
  surface-container-highest: '#d7e4f0'
  on-surface: '#101d25'
  on-surface-variant: '#3f484b'
  inverse-surface: '#25323b'
  inverse-on-surface: '#e5f3fe'
  outline: '#6f797c'
  outline-variant: '#bec8cc'
  surface-tint: '#00687a'
  primary: '#005868'
  on-primary: '#ffffff'
  primary-container: '#0b7285'
  on-primary-container: '#bdf0ff'
  inverse-primary: '#82d2e7'
  secondary: '#633cd5'
  on-secondary: '#ffffff'
  secondary-container: '#7c59ef'
  on-secondary-container: '#fffbff'
  tertiary: '#77440b'
  on-tertiary: '#ffffff'
  tertiary-container: '#945b23'
  on-tertiary-container: '#ffe3cf'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#abedff'
  primary-fixed-dim: '#82d2e7'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#e7deff'
  secondary-fixed-dim: '#ccbdff'
  on-secondary-fixed: '#1f0060'
  on-secondary-fixed-variant: '#4d1ebf'
  tertiary-fixed: '#ffdcc1'
  tertiary-fixed-dim: '#ffb779'
  on-tertiary-fixed: '#2e1500'
  on-tertiary-fixed-variant: '#6c3a02'
  background: '#f5faff'
  on-background: '#101d25'
  surface-variant: '#d7e4f0'
typography:
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  title-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 19px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

### Brand Personality & Philosophy
This design system powers a high-velocity, omnichannel customer communication platform built for online retailers and agencies. The visual tone is precise, dependable, and intelligent. It prioritizes clarity over ornamentation, designed to reduce cognitive load during 8-hour operational shifts handling thousands of customer interactions across Facebook, Instagram, and TikTok.

### Design Movement
The design system adopts a **Modern Corporate Utility** aesthetic with subtle ergonomic enhancements:
- **High-Density Productivity Workspace**: UI panels conform to compact, structured layouts reminiscent of advanced helpdesks and financial consoles.
- **Dedicated AI Dialect**: AI-driven actions, confidence ratings, and automated response suggestions are visually partitioned from manual workflows through an exclusive color domain, ensuring agents retain immediate contextual awareness of machine-generated versus human actions.
- **Controlled Flatness**: Hierarchy relies on deliberate border dividers and neutral surface layer shifts rather than aggressive drop shadows.

## Colors

### Primary Palette (Flow Teal)
Used for operational navigation, primary user actions, links, active conversation tabs, and global system states.
- `primary-50`: `#E3FAFC` (Row hover states, active list selections, subtle badges)
- `primary-100`: `#C5F6FA` (Light borders, soft chip backgrounds)
- `primary-500`: `#1098AD` (Hover states for primary interactive elements)
- `primary-600`: `#0B7285` (Core brand primary, default active buttons, icons)
- `primary-700`: `#095C6B` (Active click states, high-contrast dark accents)

### Specialized AI Palette (Spark Violet)
Reserved exclusively for AI-generated text, bot confidence indicators, training knowledge base cues, auto-suggestions, and automated rules. Never to be repurposed for generic brand styling or standard interaction points.
- `ai-50`: `#F3F0FF` (AI draft message background, auto-tag chips)
- `ai-300`: `#B197FC` (Subtle boundary borders for AI preview panels)
- `ai-500`: `#7950F2` (Interactive toggles for AI mode, regenerate triggers)
- `ai-600`: `#6741D9` (Core AI primary icon, confidence score bars, active automation indicators)

### Neutrals (Foundation & Canvas)
Engineered specifically to prevent eye fatigue under long exposure while preserving sharp text legibility.
- `bg-canvas`: `#F6F8F9` (Application root background, outer window rail)
- `bg-surface`: `#FFFFFF` (Conversation cards, inbox panels, modal dialogs)
- `border-default`: `#DDE3E7` (Structural panel boundaries, input borders, dividers)
- `border-subtle`: `#ECEFF2` (List separators, table row rules)
- `text-primary`: `#0F1C24` (High-contrast body text, customer messages, headers)
- `text-muted`: `#4A5A66` (Timestamps, channel identifiers, metadata, labels)

### Status & Feedback
Calibrated for accessible, unambiguous status signaling across fast-paced triage flows.
- `success`: `#237A36` (Resolved tickets, successfully delivered, positive sentiment)
- `warning`: `#B35C00` (Escalation pending, expiring response SLAs, medium sentiment)
- `danger`: `#C92A2A` (Negative sentiment, failed delivery, spam reports)
- `info`: `#0B7285` (Informational alerts, platform updates)

## Typography

### Character & Optimization
Typography is anchored entirely by **Be Vietnam Pro** across all weights and roles. Selected for its native support of complex Vietnamese diacritics and modern geometric numerals, it maintains crystal-clear vertical alignment even in dense data grids and rapid chat threads.

### Typographic Hierarchy Rules
- **Conversation Stream**: Customer message content relies on `body-md` (13px/19px) to optimize message density while preserving effortless scanning.
- **Metadata & Timestamps**: Applied via `label-md` or `label-sm` in `text-muted`, maintaining secondary visual importance.
- **Contextual Status Headers**: Chat panel heads and customer name banners employ `title-md` and `title-sm` with semi-bold weights for rapid user recognition.

## Layout & Spacing

### Layout Architecture
The application utilizes a **Multi-Column Fluid Workspace** on desktop, consisting of three primary operational columns:
1. **Left Navigation Rail / Filter Index** (64px collapsed or 240px expanded).
2. **Conversation & Comment Feed** (340px to 400px fixed width): Dense, scrollable list of customer inquiries with channel attribution.
3. **Active Chat & Intelligence Stage** (Fluid flexbox): Main conversation thread, customer CRM panel, and the AI Suggestion / Knowledge panel.

### Screen Adaptations
- **Desktop (>= 1280px)**: Three-pane layout displayed simultaneously. Zero horizontal scrolling.
- **Tablet / Small Desktop (768px - 1279px)**: Two-pane layout. Filter index collapses into an off-canvas drawer; conversation feed and active stage share horizontal space.
- **Mobile (< 768px)**: Single-pane stack view. Seamless slide navigation between the conversation list and the active reply workspace.

## Elevation & Depth

Visual hierarchy is primarily driven through **Low-Contrast Outlines** and **Tonal Layer Shifts**, complemented by deliberate, non-distracting elevation levels.

- **Level 0 (Flat Canvas)**: Used by `bg-canvas` (`#F6F8F9`) for application backdrops.
- **Level 1 (Divided Surfaces)**: Chat panels and sidebar lists rest on `bg-surface` (`#FFFFFF`) with a 1px solid border of `#DDE3E7`. No box shadows.
- **Level 2 (Active Focus & Flyouts)**: Dropdown menus, quick-filter popovers, and AI rule configurations use:
  - `box-shadow: 0 4px 12px rgba(15, 28, 36, 0.08), 0 1px 3px rgba(15, 28, 36, 0.04)`
- **Level 3 (Modals & Command Bar)**: Critical resolution dialogues and knowledge base configuration modals use:
  - `box-shadow: 0 12px 32px rgba(15, 28, 36, 0.14), 0 2px 6px rgba(15, 28, 36, 0.04)`

## Shapes

The geometric visual rules align strictly with operational clarity:
- **Interactive Controls & Cards**: Fixed `8px` (`0.5rem`) border radius across primary buttons, input fields, dropdown triggers, and message bubbles.
- **Structural Paneling**: Fixed `12px` (`0.75rem`) border radius on high-level dashboard containers, modals, and embedded knowledge base panels.
- **Metadata Badges & Chips**: Strict `999px` pill radius to differentiate metadata chips, channel identifiers, and AI confidence badges from clickable buttons and inputs.

## Components

### Buttons
- **Primary Action**: Background `primary-600` (`#0B7285`), text `#FFFFFF`, border radius `8px`. Hover: `primary-500` (`#1098AD`). Height: 36px (compact desktop) or 40px (default).
- **AI Smart Action (Generate / Auto-Reply)**: Background `ai-600` (`#6741D9`), text `#FFFFFF`, radius `8px`. Accompany with a dedicated Spark icon. Hover: `ai-500` (`#7950F2`).
- **Secondary / Outline**: Background `transparent`, border 1px solid `border-default` (`#DDE3E7`), text `text-primary` (`#0F1C24`). Hover: `bg-canvas` (`#F6F8F9`).
- **Ghost**: Zero border, text `text-muted` (`#4A5A66`), hover background `primary-50` (`#E3FAFC`) with text `primary-600`.

### Chips & Badges
- **Status & Channels**: Pill-shaped (`999px`), 22px height, font `label-sm`.
  - Facebook/Instagram/TikTok attribution: Platform icon + neutral background `#ECEFF2` with `text-primary`.
  - Sentiment badges: Positive (`#237A36` on `#EBF7ED`), Warning (`#B35C00` on `#FFF4E5`), Negative (`#C92A2A` on `#FDE8E8`).
- **AI Confidence Chip**: Background `ai-50` (`#F3F0FF`), text `ai-600` (`#6741D9`), border 1px solid `ai-300` (`#B197FC`), pill-shaped (`999px`).

### Conversation List Items
- Container: Background `#FFFFFF`, border-bottom 1px solid `border-subtle` (`#ECEFF2`), padding `space-md`.
- Unread / Active: Left border 3px solid `primary-600`, background `primary-50` (`#E3FAFC`).
- Preview: Customer name in `title-sm`, comment preview clamped to 2 lines in `body-sm`, timestamp in `label-sm`.

### Input Fields & Reply Editor
- Structure: 1px solid `border-default` (`#DDE3E7`), radius `8px`, font `body-md`. Focus ring: 2px solid `primary-600` with 0px offset.
- AI Quick-Draft Assistant: An embedded banner above the reply box tinted in `ai-50` with an action trigger labeled "Soạn thảo bằng AI" in `ai-600`.

### Cards & Panels
- Inbox Stage & Knowledge Base: Radius `12px`, background `#FFFFFF`, border 1px solid `border-default` (`#DDE3E7`). Padded with `space-lg`.
- Chat Message Bubbles:
  - Customer: Background `bg-canvas` (`#F6F8F9`), text `text-primary`, border radius `8px`.
  - Agent / Manual: Background `primary-600` (`#0B7285`), text `#FFFFFF`, border radius `8px`.
  - AI Suggested / Auto-Sent: Background `ai-50` (`#F3F0FF`), border 1px solid `ai-300`, text `text-primary`, accompanied by an AI badge.
