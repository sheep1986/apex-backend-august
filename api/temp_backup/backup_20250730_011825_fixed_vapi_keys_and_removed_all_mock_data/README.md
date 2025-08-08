# Troubleshooting: UI Changes Not Showing Up?

**Always build and serve from the correct directory!**

If you do not see your latest UI changes:
- Make sure you are in `ai_calling_saas_upgrade/ai-calling-platform` (not the project root)
- Run:
  ```sh
  npm run build
  npx serve -s dist -l 2323
  ```
- Do NOT run these commands from `/Users/seanwentz/Desktop/Apex` or any other directory.
- If you serve from the wrong place, you will see old, blank, or broken UI.

---

# AI Calling SaaS Platform

> **Troubleshooting Tip:**
> 
> **Always run all build and serve commands from this directory:**
> `/Users/seanwentz/Desktop/Apex/ai_calling_saas_upgrade/ai-calling-platform`
>
> If you run commands from the wrong directory (like `/Users/seanwentz/Desktop/Apex`), you will get errors (missing package.json) and will NOT see your latest code changes. 
>
> **After every code update:**
> 1. `rm -rf dist node_modules/.vite-temp`
> 2. `npm run build`
> 3. `npx serve -s dist -l 2323`
> 4. Open your browser at the port shown (default: http://localhost:2323)
> 5. Do a hard refresh (Cmd+Shift+R)

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```

# AI Calling Platform

A modern, production-ready AI calling SaaS platform built with React, TypeScript, and Vite.

## 🚀 Features

- **AI Assistant Management**: Create and configure AI assistants with custom voices, scripts, and behaviors
- **Multi-Language Support**: 12+ languages with native voice capabilities
- **Advanced Scheduling**: Timezone-aware working hours and custom schedules
- **Real-time Analytics**: Live call tracking, performance metrics, and conversion analytics
- **CRM Integration**: Comprehensive contact management and lead tracking
- **Campaign Management**: Full campaign lifecycle with automated workflows
- **Phone Number Management**: Dedicated number management with status tracking
- **Glassmorphism UI**: Modern, polished interface with consistent design language

## 🎨 Design System

### Typography Hierarchy

**Headers:**
- Main page titles: `text-2xl font-semibold text-white`
- Section headers: `text-lg font-bold text-white`
- Subsection headers: `text-sm font-semibold text-gray-400 uppercase tracking-wider`

**Body Text:**
- Primary text: `text-white`
- Secondary text: `text-gray-400`
- Tertiary text: `text-gray-500`
- Muted text: `text-gray-300`

**Font Sizes:**
- Large numbers/stats: `text-base font-semibold` or `text-lg font-semibold`
- Regular text: `text-sm`
- Small text: `text-xs`
- Micro text: `text-xs` with specific sizing

### Color Palette

**Primary Colors:**
- Brand Pink: `text-brand-pink` / `bg-brand-pink`
- Brand Magenta: `text-brand-magenta` / `bg-brand-magenta`
- White: `text-white`
- Black: `bg-black`

**Gray Scale:**
- Gray 300: `text-gray-300` / `bg-gray-300`
- Gray 400: `text-gray-400` / `bg-gray-400`
- Gray 500: `text-gray-500` / `bg-gray-500`
- Gray 800: `border-gray-800` / `bg-gray-800`
- Gray 900: `bg-gray-900`

**Status Colors:**
- Success: `text-green-400` / `bg-green-400`
- Warning: `text-yellow-400` / `bg-yellow-400`
- Error: `text-red-400` / `bg-red-400`
- Info: `text-blue-400` / `bg-blue-400`

### Component Styles

#### Dropdowns (Select Components)

**SelectTrigger:**
```tsx
className="w-full glassy-dropdown border border-gray-800 focus:outline-none shadow-lg rounded-xl px-4 py-3 text-sm text-white bg-gradient-to-br from-gray-900/80 via-gray-950/80 to-black/90 backdrop-blur-md transition-all"
```

**SelectContent:**
```tsx
className="glassy-dropdown-content rounded-xl shadow-2xl border border-gray-800 bg-gradient-to-br from-gray-900/90 via-gray-950/90 to-black/95 backdrop-blur-xl"
```

**SelectItem:**
```tsx
className="flex items-center gap-2 text-white text-sm py-2 px-3 rounded-lg hover:bg-brand-pink/20 transition-all"
```

#### Input Fields

**Search/Text Inputs:**
```tsx
className="w-full h-10 rounded-lg bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-gray-800 text-sm pl-8 pr-2 shadow-sm focus:outline-none focus:ring-0 placeholder:text-gray-500"
```

#### Cards & Containers

**Main Content Cards:**
```tsx
className="overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900/80 via-gray-950/80 to-black/90 backdrop-blur-md shadow-2xl"
```

**Stats Cards:**
```tsx
className="rounded-md bg-gray-900 border border-gray-800 px-3 py-2 flex flex-col items-center text-xs font-medium text-gray-300"
```

#### Tables

**Table Container:**
```tsx
className="w-full text-sm bg-gray-900 rounded-md border border-gray-800"
```

**Table Headers:**
```tsx
className="text-gray-400 border-b border-gray-800"
```

**Table Rows:**
```tsx
className="border-b border-gray-800 hover:bg-gray-800 transition-colors"
```

#### Buttons

**Primary Action Buttons:**
```tsx
className="bg-gradient-to-r from-brand-pink to-brand-magenta text-white font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition-all duration-200"
```

**Icon Buttons:**
```tsx
className="rounded-md p-1 h-7 w-7 border border-pink-400 hover:bg-pink-900/20"
```

**Secondary Buttons:**
```tsx
className="rounded-md p-1 h-7 w-7 border border-gray-600 hover:bg-gray-800"
```

#### Badges

**Status Badges:**
```tsx
className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
```

### Layout Patterns

#### Sidebar Structure
- Fixed width: `w-80`
- Background: `bg-black border-r border-gray-800`
- Scrollable content: `overflow-y-auto custom-scrollbar`

#### Main Content Area
- Background: `bg-black`
- Padding: `p-8` for headers, `px-8 pb-8` for content
- Border separators: `border-b border-gray-800`

#### Stats Grid
- Layout: `grid grid-cols-2 gap-2`
- Consistent card styling with rounded corners and borders

### Icon Usage

**Icon Sizes:**
- Small: `w-3 h-3` (for labels and small elements)
- Medium: `w-4 h-4` (for buttons and standard elements)
- Large: `w-5 h-5` (for prominent elements)

**Icon Colors:**
- Primary: `text-white`
- Secondary: `text-gray-400`
- Accent: `text-pink-400`
- Status: Use appropriate status colors

### Spacing & Layout

**Consistent Spacing:**
- Section padding: `p-6` (sidebar), `p-8` (main content)
- Element gaps: `gap-2`, `gap-4`, `gap-6`
- Margins: `mb-2`, `mb-3`, `mb-4`

**Responsive Design:**
- Mobile-first approach
- Consistent breakpoints
- Flexible grid systems

### Animation & Transitions

**Hover Effects:**
- Buttons: `hover:opacity-90 transition-all duration-200`
- Cards: `hover:bg-gray-800 transition-colors`
- Links: `hover:text-brand-magenta transition-colors`

**Smooth Transitions:**
- All interactive elements should have `transition-all`
- Duration: `duration-200` for quick interactions

### Accessibility

**Focus States:**
- Clear focus indicators
- Keyboard navigation support
- Screen reader compatibility

**Color Contrast:**
- Maintain WCAG AA compliance
- Use sufficient contrast ratios
- Provide alternative text for icons

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/           # Reusable UI components
│   ├── Layout.tsx    # Main layout component
│   └── ErrorBoundary.tsx
├── pages/
│   ├── Dashboard.tsx # Main dashboard
│   ├── CRM.tsx       # Customer relationship management
│   ├── Campaigns.tsx # Campaign management
│   └── PhoneNumbers.tsx # Phone number management
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
└── main.tsx          # Application entry point
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_URL=your_api_url_here
VITE_VAPI_KEY=your_vapi_key_here
```

## 🚀 Deployment

The application is built as a static site and can be deployed to any static hosting service:

- Vercel
- Netlify
- AWS S3 + CloudFront
- GitHub Pages

### Build Process

```bash
# Build the application
pnpm build

# The built files will be in the `dist/` directory
```

## 📝 Contributing

When adding new pages or components:

1. **Follow the Design System**: Use the established typography, colors, and component patterns
2. **Maintain Consistency**: Ensure all new elements match the existing design language
3. **Test Responsiveness**: Verify the layout works on all screen sizes
4. **Update Documentation**: Add any new patterns to this README

### Code Style Guidelines

- Use TypeScript for all new components
- Follow the established component structure
- Use the design system classes consistently
- Maintain accessibility standards
- Write clear, descriptive component names

## 📄 License

This project is licensed under the MIT License.

## 🤝 Support

For support and questions, please refer to the project documentation or create an issue in the repository.

## Dropdown (Select) Design System

All dropdowns (SelectTrigger/SelectContent) across the platform must use the following style for perfect consistency:

- **Trigger:**
  - `className="w-[220px] bg-gray-800 border border-gray-800 text-white rounded-lg"`
  - For full-width dropdowns, use `w-full` instead of `w-[220px]` as needed for layout.
- **Content:**
  - `className="glassy-dropdown-content rounded-xl shadow-2xl border border-gray-800 bg-gradient-to-br from-gray-900/90 via-gray-950/90 to-black/95 backdrop-blur-xl"`
- **Items:**
  - `className="flex items-center gap-2 text-white text-sm py-2 px-3 rounded-lg hover:bg-brand-pink/20 transition-all"`
- **Arrow Icon:**
  - Use a white chevron-down icon for the dropdown arrow.
- **General:**
  - No glassmorphism or gradient on the trigger itself—solid dark background only.
  - No pink border, only `border-gray-800`.
  - Font: `text-white text-sm`.
  - Border radius: `rounded-lg` (trigger), `rounded-xl` (content).
  - Padding: `px-4 py-3` (or as needed for compactness).

**All new dropdowns must follow these specs.**
