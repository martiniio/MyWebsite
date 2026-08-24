# Zen Theme

A clean, modern Astro blog theme with excellent readability and beautiful typography.

## Features

- 🎨 **Clean Design**: Minimalistic design with warm orange accents
- 🔤 **Inter Font**: Optimal readability with Inter typeface
- 🎯 **Responsive Design**: Fully responsive for mobile and desktop
- 🌙 **Dark Mode**: Automatic theme switching based on time and user preference
- 🔍 **Search**: Built-in search functionality with Pagefind
- 📝 **Markdown Support**: Full markdown support
- 📊 **Beautiful Tables**: Styled tables with hover effects
- 📱 **Sidebar TOC**: Fixed table of contents for easy navigation
- ⬆️ **Back to Top**: Smooth scroll back to top button
- 🏷️ **Tag Pages**: Browse posts by tags
- 📅 **Year Grouping**: Blog posts organized by year

## Tech Stack

- **Astro** - Static site generator
- **Pagefind** - Search functionality
- **Inter Font** - Typography

## Getting Started

### Prerequisites

- Node.js (v22.12.0 or higher)
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/Secd0g/zen

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

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
├── src/
│   ├── components/          # Reusable components
│   │   ├── BaseHead.astro   # Base head component
│   │   ├── Code.astro       # Code block component
│   │   ├── Footer.astro     # Footer component
│   │   ├── FormattedDate.astro # Date formatting
│   │   ├── Header.astro     # Header component
│   │   ├── HeaderLink.astro # Header link component
│   │   └── SearchModal.astro # Search modal component
│   ├── content/            # Blog content
│   │   └── blog/           # Blog posts
│   ├── layouts/            # Page layouts
│   │   └── BlogPost.astro   # Blog post layout
│   ├── pages/              # Page routes
│   │   ├── blog/           # Blog listing (index.astro)
│   │   ├── tags/           # Tag pages (index.astro, [tag].astro)
│   │   ├── about.astro     # About page
│   │   └── index.astro     # Home page
│   └── consts.ts           # Site constants
├── astro.config.mjs        # Astro configuration
├── package.json            # Project dependencies
└── README.md               # This file
```

## Configuration

### Site Metadata

Edit `src/consts.ts` to configure your site:

```typescript
export const SITE_TITLE = 'Zen Theme Blog';
export const SITE_DESCRIPTION = 'A clean, modern blog theme with excellent readability.';
export const AUTHOR_NAME = 'Your Name';

export const SOCIAL_LINKS = {
  github: 'https://github.com/Secd0g/zen',
  twitter: 'https://twitter.com/yourusername',
  linkedin: 'https://linkedin.com/in/yourusername',
  email: 'mailto:your@email.com',
};
```

### Theme Variables

Theme colors are defined in `src/layouts/BlogPost.astro`:

```css
:root {
  --accent: #F97316;          /* Primary color */
  --accent-hover: #EA580C;     /* Accent hover */
  --accent-light: #FDBA74;     /* Light accent */
  --text-primary: #18181B;     /* Primary text */
  --text-secondary: #3F3F46;   /* Secondary text */
  --text-muted: #71717A;       /* Muted text */
  --bg-primary: #FFFFFF;       /* Background */
  --bg-secondary: #FAFAFA;     /* Secondary background */
  --bg-tertiary: #F5F5F5;      /* Tertiary background */
  --border-color: #E4E4E7;     /* Border color */
  --body-font-size: 17px;      /* Body font size */
}
```

### Adding Blog Posts

Create new markdown files in `src/content/blog/`:

```markdown
---
title: Post Title
description: Post description
pubDate: 2026-05-14
tags: ["tag1", "tag2"]
---

Your content here...
```

## Customization

### Changing Colors

Modify the CSS variables in `src/layouts/BlogPost.astro`:

- `--accent`: Primary accent color (default: #F97316)
- `--text-primary`: Main text color
- `--bg-primary`: Background color
- `--border-color`: Border color

### Changing Fonts

The theme uses Inter font by default. You can change the font in `src/layouts/BlogPost.astro`:

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

## Features Overview

### Typography
- Inter font family for optimal readability
- Line height: 1.9 for comfortable reading
- Letter spacing: -0.01em for better text density
- Font size: 17px for body text

### Color Scheme

**Light Mode:**
- Primary: #F97316 (Warm Orange)
- Background: #FFFFFF
- Text: #18181B, #3F3F46, #71717A

**Dark Mode:**
- Primary: #FB923C (Lighter Orange)
- Background: #18181B
- Text: #FAFAFA, #D4D4D8, #71717A

### Layout
- Content Width: 700px for optimal reading line length
- Responsive Design: Works on all screen sizes
- Sidebar TOC: Fixed table of contents for long articles

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available for personal use.

## Acknowledgments

- Built with [Astro](https://astro.build/)
- Search powered by [Pagefind](https://pagefind.app/)
- Font by [Inter](https://fonts.google.com/specimen/Inter)