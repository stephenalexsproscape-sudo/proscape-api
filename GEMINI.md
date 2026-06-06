# Proscape CRM: Project Instructions

## Project Overview
Proscape CRM is a specialized production management and lead intake system for the landscaping industry. It consists of a relational API (Node.js/Express/Prisma) and a modern frontend (Vanilla JS/Vite).

## Tech Stack
- **Backend:** Node.js, Express, Prisma ORM, PostgreSQL.
- **Frontend:** Vanilla JavaScript, Vite, CSS (Modern Slate/Emerald palette).
- **Security:** JWT-based authentication, Helmet security headers, rate limiting.
- **Validation:** Zod (Full-stack dual-layer validation).
- **Testing:** Jest (API Integration & RBAC Matrix), Vitest (Frontend Logic & DOM).

## Architecture & Conventions
- **Relational Data:** Use Prisma for all database interactions. Maintain cascading deletes for `Customer` related entities (Contacts, Addresses, ServiceRequests).
- **Validation:** Every entry point must be protected by `zod` schemas. We use dual-layer validation: catch errors in the UI for instant feedback, and enforce them in the API for security.
- **Audit Logging:** Every critical change (Create/Update/Delete) must be logged via the `AuditLog` model and `middleware/audit.js`.
- **UI/UX:** Adhere to the modern design system defined in `src/style.css`. 
    - **No Inline CSS:** All styling must be done via utility classes or components in `style.css`. 
    - **Consistent Feedback:** Use the custom `showToast()` system instead of native browser `alert()` or `confirm()`.
    - **Accessibility:** Ensure all custom modals are keyboard accessible (e.g., close on `Esc`).
    - **PWA:** The app is a Progressive Web App (manifest at `/manifest.webmanifest`).
    - **Field Mode:** Includes a high-contrast, mobile-optimized UI mode for outdoor use.
- **Service Requests:** Maintain support for recurring ticket generation and business-day-aware scheduling.
- **Persistence:** The API is managed by **PM2** (`proscape-api`).

## Mobile App Strategy
We use a **Hybrid Strategy** for mobile access:
- **PWA (Live):** The app is a Progressive Web App. Users can "Add to Home Screen" from their mobile browser for a full-screen, app-like experience.
- **Native (Capacitor):** We use **Capacitor** to wrap the web app for iOS and Android.
    - Native projects are located in `proscape-frontend/android` and `proscape-frontend/ios`.
    - **Workflow:** 
        1. Make changes in the web code.
        2. Run `npm run build` in `proscape-frontend`.
        3. Run `npx cap sync` to push changes to the native projects.
        4. Open Android Studio (`npx cap open android`) or Xcode (`npx cap open ios`) to build and deploy to the stores.

## Workflows
- **Code Changes:** Run `npm run lint` and `npm run format` before finalizing any changes.
- **Database:** Always run `npx prisma generate` after schema changes.
- **Testing:**
    - **API:** Run `npm test` in `proscape-api` to execute Jest suites, including the exhaustive RBAC Matrix (`rbac.test.js`).
    - **Frontend:** Run `npm test` in `proscape-frontend` to execute Vitest suites for validation and rendering logic.
- **QuickBooks Data Sync:** To sync client data, export a "Customer Contact List" from QB as a CSV. Name it `ClientsList.csv`, place it in the API root, and run `node bulk-import-relational.js`. Run `node sanitize-data.js` afterwards to normalize casing and check for missing contact info.
- **Backups:** A rolling 7-day backup is managed by `backup-db.js` and scheduled via cron. Backups are stored on the Windows host's `CommandCenterBackup` share.
- **User Documentation:** Proactively update `help.html` whenever new features or workflow changes are implemented to ensure end-users have accurate guidance.
