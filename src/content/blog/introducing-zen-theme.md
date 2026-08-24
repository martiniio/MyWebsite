---
title: Introducing Zen Theme
description: A clean, modern Astro blog theme with excellent readability and beautiful typography.
pubDate: 2026-05-14
tags: ["theme", "design", "zen", "astro", "blog"]
---

## Quick Start

Zen Theme is a clean and modern Astro blog theme with excellent readability and beautiful typography.

### Download

GitHub: [https://github.com/Secd0g/zen](https://github.com/Secd0g/zen)

### Installation

```bash
# Clone the repository
git clone https://github.com/Secd0g/zen.git

# Navigate to the project directory
cd zen

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
```

### Prerequisites
- Node.js (v22.12.0 or higher)
- npm or yarn package manager

## Overview

The Zen theme is a clean, modern design theme featuring a minimalistic approach with warm orange accents, excellent readability, and thoughtful typography choices.

## Key Features

### Typography
- **Font**: Inter font family for optimal readability
- **Line Height**: 1.9 for comfortable reading experience
- **Letter Spacing**: -0.01em for better text density
- **Font Size**: 17px for body text

### Color Scheme

**Light Mode:**
- Primary: #F97316 (Warm Orange)
- Background: #FFFFFF (Primary), #FAFAFA (Secondary), #F5F5F5 (Tertiary)
- Text: #18181B (Primary), #3F3F46 (Secondary), #71717A (Muted)
- Border: #E4E4E7

**Dark Mode:**
- Primary: #FB923C (Lighter Orange)
- Background: #18181B (Primary), #27272A (Secondary), #3F3F46 (Tertiary)
- Text: #FAFAFA (Primary), #D4D4D8 (Secondary), #71717A (Muted)
- Border: #3F3F46

### Layout
- **Content Width**: 700px for optimal reading line length
- **Responsive Design**: Fully responsive for mobile and desktop
- **Sidebar TOC**: Fixed table of contents for easy navigation in long articles
- **Back to Top**: Smooth scroll back to top button

### Search Functionality
- Built-in search powered by Pagefind
- Real-time search results
- Highlighted search terms
- Support for articles and sections

### Blog Features
- **Year Grouping**: Blog posts organized by year
- **Tag Pages**: Browse posts by tags
- **Search Integration**: Site-wide search capability
- **Pagination Removed**: All posts displayed in a single scrollable list

## Configuration

### Theme Variables

The theme uses CSS custom properties for easy customization:

```css
:root {
  --accent: #F97316;
  --accent-hover: #EA580C;
  --accent-light: #FDBA74;
  --text-primary: #18181B;
  --text-secondary: #3F3F46;
  --text-muted: #71717A;
  --text-faint: #A1A1AA;
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFAFA;
  --bg-tertiary: #F5F5F5;
  --border-color: #E4E4E7;
  --body-font-size: 17px;
}
```

### Dark Mode Support

The theme automatically switches between light and dark modes based on user preference. You can toggle the theme using the button in the header.

### Typography Settings

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: var(--body-font-size);
  line-height: 1.9;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

### Social Links

Configure your social media links in `src/consts.ts`:

```typescript
export const SOCIAL_LINKS = {
  github: 'https://github.com/yourusername',
  twitter: 'https://twitter.com/yourusername',
  linkedin: 'https://linkedin.com/in/yourusername',
  email: 'mailto:your@email.com',
};
```

These links will be displayed in the footer section of your blog.

## Components

### Tables
Tables feature rounded corners, subtle shadows, and hover effects for rows:

| Feature | Description | Status |
|---------|-------------|--------|
| Responsive | Works on all screen sizes | ✅ |
| Dark Mode | Full dark mode support | ✅ |
| Hover Effects | Row highlighting on hover | ✅ |
| Sticky Header | Fixed table header on scroll | ✅ |

### Code Blocks
Syntax-highlighted code blocks with proper spacing and readable fonts:

```typescript
// Example code block with syntax highlighting
const zenThemeConfig = {
  primaryColor: '#F97316',
  fontSettings: {
    family: 'Inter',
    size: '17px',
    lineHeight: 1.9
  },
  contentWidth: '700px'
};
```

### Configuration Reference

Here's how to configure the Zen theme parameters:

| Parameter | Value | File Location |
|-----------|-------|---------------|
| Accent Color | `#F97316` | `src/layouts/BlogPost.astro` (CSS variable `--accent`) |
| Font Family | Inter | `src/layouts/BlogPost.astro` |
| Font Size | 17px | `src/layouts/BlogPost.astro` (CSS variable `--body-font-size`) |
| Line Height | 1.9 | `src/layouts/BlogPost.astro` |
| Content Width | 700px | `src/layouts/BlogPost.astro` |
| Site Title | Your Blog Name | `src/consts.ts` |
| Social Links | GitHub, Twitter, etc. | `src/consts.ts` (`SOCIAL_LINKS`) |

### Callout Boxes
Tip boxes with icons for important information:

> **Tip:** The Zen theme prioritizes readability with carefully chosen font sizes and line heights.

## Design Philosophy

The Zen theme follows these core design principles:

1. **Readability First**: Every typographic choice is made with reading comfort in mind
2. **Visual Hierarchy**: Clear distinction between headings, body text, and metadata
3. **Consistency**: Uniform spacing and sizing across all components
4. **Accessibility**: Proper contrast ratios and semantic HTML
5. **Performance**: Optimized for fast loading and smooth interactions

## Configuration Files

### Site Metadata

Blog title, description, and author information are configured in `src/consts.ts`:

```typescript
export const SITE_TITLE = 'Zen Theme Blog';
export const SITE_DESCRIPTION = 'A clean, modern blog theme with excellent readability.';
export const AUTHOR_NAME = 'Your Name';
```

### Astro Configuration

The main Astro configuration file is `astro.config.mjs`:

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://your-domain.com',
  integrations: [sitemap()],
});
```

### Content Configuration

Blog posts are stored in the `src/content/blog/` directory as Markdown files with frontmatter:

```markdown
---
title: Post Title
description: Post description
pubDate: 2026-05-14
tags: ["tag1", "tag2"]
---
```

### Theme Variables

All theme colors and typography settings are defined using CSS custom properties directly in the layout files.

## Getting Started

To use the Zen theme in your project:

1. **Include the Inter font** in your HTML head
2. **Add the CSS variables** to your stylesheet
3. **Configure site metadata** in `src/consts.ts`
4. **Set up Astro** in `astro.config.mjs`
5. **Create content** in `src/content/blog/`
6. **Customize** as needed for your brand

## Conclusion

The Zen theme provides a clean, modern foundation for technical documentation and blogs. Its focus on readability and minimalism makes it perfect for content-heavy websites. The thoughtful design choices ensure that readers can focus on your content without distractions.

---