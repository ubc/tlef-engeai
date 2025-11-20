# Authentication System Rationale: req.user vs req.session.globalUser

## Question: Why do we need both `req.user` and `req.session.globalUser`?

This document explains the rationale for maintaining both user objects and evaluates whether we can eliminate one.

---

## Current State: Two User Objects

### 1. `req.user` (Passport Session Object)

**Source**: Set by Passport during authentication  
**Storage**: Passport's session serialization  
**Lifecycle**: Created during login, serialized to session, deserialized on each request

**Contains**:
```typescript
{
  username: string,        // From SAML: cwlLoginName or local: 'student'/'instructor'
  puid: string,            // From SAML: cwlLoginKey or local: FAKE_PUID
  firstName: string,       // From SAML: givenName (NOT in GlobalUser)
  lastName: string,         // From SAML: sn (NOT in GlobalUser)
  affiliation: string,     // From SAML: eduPersonAffiliation
  email: string,           // From SAML: email
  sessionIndex: string,    // SAML-specific: needed for logout
  nameID: string,         // SAML-specific
  nameIDFormat: string    // SAML-specific
}
```

### 2. `req.session.globalUser` (MongoDB Database Object)

**Source**: Queried from MongoDB `active-users` collection  
**Storage**: Express session (`req.session`)  
**Lifecycle**: Created/fetched during login, stored in session, available on all requests

**Contains**:
```typescript
{
  name: string,                    // Full name: "FirstName LastName"
  puid: string,                    // Privacy-focused Unique Identifier
  userId: string,                   // Generated unique ID (key identifier)
  coursesEnrolled: string[],       // Array of course IDs
  affiliation: 'student' | 'faculty',
  status: 'active' | 'inactive',
  createdAt: Date,
  updatedAt: Date
}
```

---

## Why Both Exist: Current Rationale

### 1. **Passport Architecture Requirement**

**Critical Dependency**: `req.isAuthenticated()` requires `req.user`

**Code Evidence**:
- `src/middleware/requireAuth.ts` (line 24): `if ((req as any).isAuthenticated())`
- `src/middleware/asyncHandler.ts` (line 14): `if (!(req as any).isAuthenticated())`
- `src/routes/auth.ts` (multiple locations): Uses `req.isAuthenticated()`

**How Passport Works**:
- `req.isAuthenticated()` is a Passport method that checks if `req.user` exists
- Passport's `deserializeUser()` populates `req.user` from session
- Without `req.user`, `req.isAuthenticated()` returns `false`

**Conclusion**: `req.user` is **required** for Passport's authentication mechanism to work.

---

### 2. **Username Not Stored in GlobalUser**

**Current Usage**: `req.user.username` is used in API responses

**Code Evidence**:
- `src/routes/auth.ts` (lines 353, 447): `username: sessionUser.username, // Keep username from session (not in GlobalUser)`

**Why Not in GlobalUser?**:
- GlobalUser stores `name` (full name), not `username`
- `username` comes from SAML (`cwlLoginName`) or local auth
- Frontend expects `username` in user object

**Could We Eliminate?**: 
- ✅ **YES** - We could add `username` field to GlobalUser interface
- ✅ **YES** - Store username during GlobalUser creation
- ✅ **YES** - Remove dependency on `req.user.username`

---

### 3. **SAML Logout Requirements**

**Current Usage**: SAML Single Log-Out (SLO) requires `sessionIndex`

**Code Evidence**:
- `src/routes/auth.ts` (line 228): `samlStrategy.logout(req as any, ...)`
- `src/middleware/passport.ts` (line 81): `sessionIndex: profile.sessionIndex`

**Why Needed**:
- SAML SLO requires `sessionIndex` to identify the session at the IdP
- Stored in `req.user.sessionIndex` during authentication
- Used by `samlStrategy.logout()` to terminate IdP session

**Could We Eliminate?**:
- ⚠️ **PARTIALLY** - We could store `sessionIndex` separately in `req.session.samlSessionIndex`
- ⚠️ **BUT** - Passport's SAML strategy expects it in `req.user`
- ❌ **NO** - Without `req.user`, SAML logout won't work properly

---

### 4. **Initial Login Data Extraction**

**Current Usage**: Extract data from `req.user` to create GlobalUser

**Code Evidence**:
- `src/routes/auth.ts` (lines 56-60): Extracts `puid`, `firstName`, `lastName`, `affiliation` from `req.user`
- Used to create GlobalUser if it doesn't exist

**Why Needed**:
- During first login, GlobalUser doesn't exist yet
- Need to extract data from authentication provider (SAML/local)
- `req.user` is the only source of this data at that moment

**Could We Eliminate?**:
- ✅ **YES** - After GlobalUser is created, we could use `req.session.globalUser` exclusively
- ✅ **YES** - `req.user` is only needed during the login callback
- ⚠️ **BUT** - Still needed for Passport's `req.isAuthenticated()` check

---

### 5. **Validation Between Sources**

**Current Usage**: Validate that `req.user` matches `req.session.globalUser`

**Code Evidence**:
- `src/routes/auth.ts` (lines 338-340, 432-434): Compares `affiliation` between both objects

**Why Needed**:
- Security check: Ensure session data hasn't been tampered with
- Consistency check: Verify authentication data matches database
- Detects session corruption or data inconsistency

**Could We Eliminate?**:
- ✅ **YES** - We could validate against database directly
- ✅ **YES** - We could remove this validation if we trust session data
- ⚠️ **BUT** - Validation provides security benefit

---

## Analysis: Can We Eliminate One?

### Option 1: Eliminate `req.user` (Use Only `req.session.globalUser`)

**Challenges**:
1. ❌ **Passport Dependency**: `req.isAuthenticated()` requires `req.user`
   - Would need to replace all `req.isAuthenticated()` checks
   - Would need custom authentication middleware
   - Breaks Passport integration

2. ❌ **SAML Logout**: Requires `sessionIndex` in `req.user`
   - Passport's SAML strategy expects it there
   - Would need to modify Passport behavior or use workaround

3. ⚠️ **Architecture Change**: Would require significant refactoring
   - Replace Passport authentication checks
   - Custom session management
   - Potential compatibility issues

**Benefits**:
- ✅ Single source of truth (`req.session.globalUser`)
- ✅ Simpler data model
- ✅ No duplicate data storage

**Verdict**: **NOT RECOMMENDED** - Too much refactoring, breaks Passport integration

---

### Option 2: Eliminate `req.session.globalUser` (Use Only `req.user`)

**Challenges**:
1. ❌ **Missing Data**: `req.user` doesn't have:
   - `userId` (critical identifier)
   - `coursesEnrolled` array
   - `status` field
   - `createdAt`/`updatedAt` timestamps

2. ❌ **Database Source of Truth**: GlobalUser is the authoritative record
   - `req.user` is just authentication data
   - Database has the complete user profile
   - Need database lookups anyway

3. ❌ **Privacy**: Would need to store PUID in `req.user` (already there, but not ideal)

4. ⚠️ **Data Freshness**: `req.user` is static after login
   - Database can be updated (coursesEnrolled changes)
   - Would need to query database anyway for fresh data

**Benefits**:
- ✅ Single user object
- ✅ Less session storage

**Verdict**: **NOT RECOMMENDED** - Missing critical data, database is source of truth

---

### Option 3: Keep Both (Current Approach) - RECOMMENDED

**Rationale**:

1. **Separation of Concerns**:
   - `req.user` = **Authentication state** (who authenticated, how, when)
   - `req.session.globalUser` = **Database state** (user profile, courses, status)
   - Clear distinction between authentication and user data

2. **Passport Integration**:
   - Works with Passport's standard patterns
   - `req.isAuthenticated()` works out of the box
   - SAML logout works correctly
   - No custom workarounds needed

3. **Data Completeness**:
   - `req.user`: Authentication-specific data (username, SAML fields)
   - `req.session.globalUser`: Complete user profile from database
   - Both serve different purposes

4. **Security**:
   - Validation between sources detects tampering
   - Database is source of truth
   - Session data validated on each request

5. **Flexibility**:
   - Can update GlobalUser in database without affecting authentication
   - Can add fields to GlobalUser without breaking Passport
   - Clear separation allows independent evolution

---

## Recommended Approach: Optimize Current System

### What We Can Improve:

1. **Add `username` to GlobalUser**:
   - Store `username` during GlobalUser creation
   - Use `globalUser.username` instead of `req.user.username`
   - Reduces dependency on `req.user` for username

2. **Simplify Validation**:
   - Only validate critical fields (userId, affiliation)
   - Remove redundant checks if data is trusted

3. **Document the Distinction**:
   - Clear documentation that `req.user` = authentication, `globalUser` = database
   - Code comments explaining when to use which

4. **Future Consideration**:
   - If Passport is ever replaced, `req.user` could be eliminated
   - For now, it's required for Passport integration

---

## Summary

### Why Both Exist:

| Aspect | `req.user` (Passport) | `req.session.globalUser` (Database) |
|--------|----------------------|-------------------------------------|
| **Purpose** | Authentication state | User profile data |
| **Source** | Passport serialization | MongoDB query |
| **Contains** | username, SAML fields | userId, courses, status |
| **Required For** | `req.isAuthenticated()`, SAML logout | Database operations, userId lookups |
| **Can Eliminate?** | ❌ No (Passport dependency) | ❌ No (Source of truth) |

### Key Insight:

**They serve different purposes:**
- `req.user` = **"Who authenticated and how?"** (authentication metadata)
- `req.session.globalUser` = **"What is the user's profile?"** (database record)

**Both are needed because:**
1. Passport requires `req.user` for authentication checks
2. Database operations require `globalUser` for userId and profile data
3. They represent different concerns (authentication vs. user data)
4. Eliminating either would require significant architectural changes

### Recommendation:

**Keep both**, but:
- ✅ Add `username` to GlobalUser to reduce `req.user` dependency
- ✅ Use `globalUser` as primary source for user data
- ✅ Use `req.user` only for authentication checks and SAML-specific needs
- ✅ Document the distinction clearly

This maintains Passport compatibility while using the database as the source of truth for user data.

