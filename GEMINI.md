# Proscape CRM: Project Instructions

## Project Overview
Proscape CRM is a specialized production management and lead intake system for the landscaping industry. It consists of a relational API (Node.js/Express/Prisma) and a modern frontend (Vanilla JS/Vite).

## Tech Stack
- **Backend:** Node.js, Express, Prisma ORM, PostgreSQL.
- **Frontend:** Vanilla JavaScript, Vite, CSS (Modern Slate/Emerald palette).
- **Security:** JWT-based authentication.
- **Validation:** Zod (Backend/Frontend) - *Transitioning to full Zod coverage.*
- **Testing:** Jest (API), Vitest (Frontend).

## Architecture & Conventions
- **Relational Data:** Use Prisma for all database interactions. Maintain cascading deletes for `Customer` related entities (Contacts, Addresses, ServiceRequests).
- **Validation:** ALWAYS use `zod` schemas for request body and query validation in all new API endpoints. See `controllers/serviceRequestController.js` for examples.
- **Audit Logging:** Every critical change (Create/Update/Delete) must be logged via the `AuditLog` model and `middleware/audit.js`.
- **UI/UX:** Adhere to the modern design system defined in `src/style.css`. 
    - **No Inline CSS:** All styling must be done via utility classes or components in `style.css`. 
    - **Consistent Feedback:** Use the custom `showToast()` system instead of native browser `alert()` or `confirm()`.
    - **Accessibility:** Ensure all custom modals are keyboard accessible (e.g., close on `Esc`).
    - **PWA:** The app is a Progressive Web App (manifest at `/manifest.webmanifest`).
    - **Field Mode:** Includes a high-contrast, mobile-optimized UI mode for outdoor use.
- **Service Requests:** Maintain support for recurring ticket generation and business-day-aware scheduling.
- **Persistence:** The API is managed by **PM2** (`proscape-api`).

## Workflows
- **Code Changes:** Run `npm run lint` and `npm run format` before finalizing any changes.
- **Database:** Always run `npx prisma generate` after schema changes.
- **Testing:** Add or update tests in `tests/` (API) or `src/tests/` (Frontend) for every feature or fix.
- **QuickBooks Data Sync:** To sync client data, export a "Customer Contact List" from QB as a CSV. Name it `ClientsList.csv`, place it in the API root, and run `node bulk-import-relational.js`. Run `node sanitize-data.js` afterwards to normalize casing and check for missing contact info.
- **Backups:** A rolling 7-day backup is managed by `backup-db.js` and scheduled via cron. Backups are stored on the Windows host's `CommandCenterBackup` share.
- **User Documentation:** Proactively update `help.html` whenever new features or workflow changes are implemented to ensure end-users have accurate guidance.
