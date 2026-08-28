---
name: design-tokens
description: Generate and manage design tokens (colors, typography, spacing) for consistent UI/UX
user-invocable: true
---

# Design Tokens Skill

This skill helps generate, manage, and apply design tokens for consistent UI/UX across the Compliance Engineering Platform. Design tokens ensure visual consistency, improve developer experience, and make design updates more manageable.

## Usage

Manage design tokens for your project:

```bash
# Generate a base set of design tokens
/design-tokens init --palette compliance --typography modern --spacing 4px

# Create color tokens from brand colors
/design-tokens colors --primary "#1E40AF" --secondary "#64748B" --success "#10B981" --warning "#F59E0B" --error "#EF4444"

# Generate typography scale
/design-tokens typography --base 16px --scale 1.25 --weights "400,500,600,700"

# Create spacing scale
/design-tokens spacing --base 4 --scale 2 --steps 10

# Generate CSS custom properties file
/design-tokens export --format css --output src/styles/tokens.css

# Generate Tailwind configuration
/design-tokens export --format tailwind --output tailwind.tokens.config.js

# Validate current token usage
/design-tokens validate --src src/

# Show token documentation
/design-tokens docs --format markdown
```

## Token Categories

The skill manages these token categories:

### Color Tokens
- **Brand Colors**: Primary, secondary, accent colors
- **Semantic Colors**: Success, warning, error, info states
- **Neutral Colors**: Background, text, border colors
- **Interactive Colors**: Hover, focus, active states
- **Accessibility**: WCAG-compliant color combinations

### Typography Tokens
- **Font Families**: Display, body, mono, utility faces
- **Font Sizes**: Base scale with responsive steps
- **Font Weights**: Light, regular, medium, bold, etc.
- **Line Heights**: Optimal readability values
- **Letter Spacing**: Tracking for different text styles

### Spacing Tokens
- **Margin/Padding**: Consistent spacing scale
- **Border Radius**: Corner radius values
- **Shadows**: Elevation and depth tokens
- **Transitions**: Duration and easing functions
- **Z-index**: Layering system

### Layout Tokens
- **Container Widths**: Responsive breakpoints
- **Grid Systems**: Column counts and gutter sizes
- **Max Widths**: Content container constraints

## Implementation

When generating tokens, the skill will:
1. Create a tokens.json file with all design decisions
2. Generate platform-specific formats (CSS custom properties, Tailwind config)
3. Provide documentation and usage examples
4. Ensure WCAG 2.1/2.2 compliance for color contrast
5. Integrate with existing Tailwind and shadcn/ui setup
6. Create a token reference guide for developers

## Example Output

When initializing design tokens:
```
✅ Design tokens initialized
Created: src/styles/tokens.json
Generated: src/styles/tokens.css (CSS custom properties)
Generated: tailwind.tokens.config.js (Tailwind configuration)
Generated: DESIGN_TOKENS.md (documentation)

Token Summary:
- Colors: 28 tokens (10 brand, 8 semantic, 6 neutral, 4 interactive)
- Typography: 16 tokens (4 sizes, 4 weights, 4 line heights, 4 letter spacing)
- Spacing: 12 tokens (margin/padding, border radius, shadows)
- Layout: 8 tokens (containers, grids, breakpoints)
```

## Validation

The skill includes validation features to:
- Check color contrast ratios (WCAG AA/AAA)
- Verify token naming consistency
- Ensure proper token usage in components
- Detect unused or duplicate tokens
- Validate responsive breakpoints

## Integration

Generated tokens integrate with:
- Existing Tailwind CSS configuration
- shadcn/ui component library
- PostCSS configuration
- TypeScript token types (if desired)
- Storybook for component documentation
