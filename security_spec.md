# Security Specification — Veritas ISO Document Control & QMS Switchboard

## 1. Data Invariants

1. **Authentication & Email Verification Invariant**: Every read and write operation across `/documents`, `/dcrRequests`, `/changeLogs`, and `/distributions` requires an authenticated user with `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Ownership & Query Isolation Invariant**: Every record in `/documents/{docId}`, `/dcrRequests/{dcrId}`, `/changeLogs/{logId}`, and `/distributions/{distId}` must have `ownerId == request.auth.uid` on creation, and `resource.data.ownerId == request.auth.uid` (or `isAdmin()`) on `get`, `list`, `update`, and `delete`. Blanket `allow list: if isSignedIn();` is strictly forbidden.
3. **Path Variable Hardening Invariant**: Every single-document operation (`get`, `create`, `update`, `delete`) validates its path ID (`docId`, `dcrId`, `logId`, `distId`, `adminId`) via `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Strict Schema & Anti-Update-Gap Invariant**: Every `create` and `update` operation invokes `isValidIsoDocument(incoming())`, `isValidDcrRequest(incoming())`, `isValidDocumentChangeLog(incoming())`, or `isValidDocumentDistribution(incoming())` checking exact key sets (`hasAll` and `hasOnly`), field types, string/regex boundaries, and enum constraints.
5. **Temporal & Immutable Field Invariant**:
   - On `create`: `incoming().createdAt == request.time` (and `incoming().updatedAt == request.time` where present).
   - On `update`: `incoming().createdAt == existing().createdAt`, `incoming().ownerId == existing().ownerId`, and `incoming().updatedAt == request.time`.
   - `/changeLogs/{logId}` is strictly append-only (`allow update, delete: if false;`).
6. **Terminal State Locking Invariant**:
   - `/documents/{docId}`: Once `existing().status == 'CANCELLED'`, no non-admin updates are permitted.
   - `/dcrRequests/{dcrId}`: Once `existing().status in ['APPROVED', 'REJECTED']`, no non-admin updates are permitted.
   - `/distributions/{distId}`: Once `existing().distributionStatus == 'RECALLED'`, no non-admin updates are permitted.

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on Create)**: Creating a `DcrRequest` where `ownerId` is `"victim_uid_999"` while authenticated as `"attacker_uid_111"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Spoof Attack on Admin)**: Authenticated with `email: "itdecode7@gmail.com"` but `email_verified: false` attempting to read or write another user's `IsoDocument`. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow Field Injection on Create)**: Creating an `IsoDocument` with all required fields plus an undeclared `"isSuperVerified": true` ghost property. -> `PERMISSION_DENIED`
4. **Payload 4 (Shadow Field Injection on Update)**: Updating a `DcrRequest` status while injecting an unauthorized field `"bypassQmg": true`. -> `PERMISSION_DENIED`
5. **Payload 5 (Terminal State Mutation on Approved DCR)**: Attempting to update `draftContent` or `status` on a `DcrRequest` whose existing `status` is already `"APPROVED"`. -> `PERMISSION_DENIED`
6. **Payload 6 (Terminal State Mutation on Cancelled Document)**: Attempting to update `revision` or `summary` on an `IsoDocument` whose existing `status` is `"CANCELLED"`. -> `PERMISSION_DENIED`
7. **Payload 7 (Immutable Audit Log Tampering)**: Attempting to `update` or `delete` an existing `DocumentChangeLog` record in `/changeLogs/{logId}`. -> `PERMISSION_DENIED`
8. **Payload 8 (Client Timestamp Forgery)**: Creating a `DcrRequest` with a backdated `createdAt` timestamp instead of `request.time`. -> `PERMISSION_DENIED`
9. **Payload 9 (Immortal Field Mutation on Update)**: Updating an `IsoDocument` while mutating `createdAt` or `ownerId` or `docCode`. -> `PERMISSION_DENIED`
10. **Payload 10 (Denial of Wallet / Oversized String Poisoning)**: Updating `justification` in `DcrRequest` with a 10,000-character string exceeding `maxLength: 1500`. -> `PERMISSION_DENIED`
11. **Payload 11 (Path ID Poisoning)**: Attempting to create `/documents/invalid$id!with*spaces` that violates `^[a-zA-Z0-9_\-]+$`. -> `PERMISSION_DENIED`
12. **Payload 12 (Unauthorized Cross-Tenant List Scrape)**: Executing an unconstrained `list` query on `/dcrRequests` without filtering `ownerId == request.auth.uid`. -> `PERMISSION_DENIED`
