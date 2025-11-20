# PUID Privacy & userId Type Migration Plan

## Overview
This plan addresses two critical issues:
1. **PUID Privacy**: PUID (Privacy-focused Unique Identifier) should only be stored in the `activecourse` collection, not in `courseusers` collections or sent to frontend
2. **userId Type**: Change `userId` from `number` to `string` to match `courseId` format

## Current State Analysis

### PUID Storage Locations (Current - WRONG)
- ✅ `GlobalUser` collection - **CORRECT** (this is the only place PUID should exist)
- ❌ `CourseUser` collection (`{courseName}_users`) - **WRONG** (should only store userId)
- ❌ Frontend API responses (`/auth/current-user`, `/auth/me`) - **WRONG** (privacy leak)
- ❌ Frontend code using `puid` directly - **WRONG** (should use userId)

### userId Type Issues (Current - WRONG)
- `GlobalUser.userId`: `number` (should be `string`)
- `CourseUser.userId`: `number` (should be `string`)
- Generated as: `parseInt(uniqueIDGenerator(...).substring(0, 8), 16)` (should return string)

## Migration Plan

### Phase 1: Type System Updates

#### 1.1 Update Type Definitions
**File**: `src/functions/types.ts`
- Change `GlobalUser.userId` from `number` to `string`
- Change `CourseUser.userId` from `number` to `string`
- **Remove** `puid` field from `CourseUser` interface
- Update `FlagReport.userId` from `number` to `string` (if exists)

#### 1.2 Update ID Generator
**File**: `src/functions/unique-id-generator.ts`
- Change `userId` generation to return string instead of parseInt
- Update any methods that generate userId to return string format

### Phase 2: Backend API Changes

#### 2.1 Remove PUID from API Responses
**Files**: 
- `src/routes/auth.ts` - Remove `puid` from `/auth/current-user` and `/auth/me` responses
- Only send `userId` from `globalUser` object

#### 2.2 Update MongoDB Methods
**File**: `src/functions/EngEAI_MongoDB.ts`

**Methods to Update:**
- `findStudentByPUID` → Change to `findStudentByUserId` (use userId instead of puid)
- `getUserChats` → Change parameter from `puid` to `userId`
- `getUserChatsMetadata` → Change parameter from `puid` to `userId`
- `addChatToUser` → Change parameter from `puid` to `userId`
- `updateUserChat` → Change parameter from `puid` to `userId`
- `addMessageToChat` → Change parameter from `puid` to `userId`
- `updateChatTitle` → Change parameter from `puid` to `userId`
- `markChatAsDeleted` → Change parameter from `puid` to `userId`
- `deleteChatFromUser` → Change parameter from `puid` to `userId`
- `createStudent` → Remove `puid` from stored data, only store `userId`
- `findUserByUserId` → Update return type (userId is now string)
- `batchFindUsersByUserIds` → Update to use string userIds

**Key Changes:**
- All course-specific operations should use `userId` instead of `puid`
- Only `GlobalUser` operations should use `puid` (for lookup)
- When creating `CourseUser`, only store `userId`, not `puid`

#### 2.3 Update Route Handlers
**Files**:
- `src/routes/chat-app.ts` - Replace all `puid` usage with `userId` from `globalUser`
- `src/routes/course-entry.ts` - Remove `puid` from CourseUser creation
- `src/routes/user-management.ts` - Update to use `userId` instead of `puid`
- `src/routes/RAG-App.ts` - Update `uploadedBy` field (if it uses puid)

### Phase 3: Frontend Updates

#### 3.1 Update Auth Service
**File**: `public/scripts/services/AuthService.ts`
- Remove `puid` from user context
- Use `userId` from `globalUser` instead
- Update all references to use `userId`

#### 3.2 Update Chat Manager
**File**: `public/scripts/feature/chat.ts`
- Replace `this.config.userContext.puid` with `this.config.userContext.userId`
- Update all API calls to send `userId` instead of `puid`

#### 3.3 Update Other Frontend Files
**Files**:
- `public/scripts/student-mode.ts` - Use `userId` instead of `puid`
- `public/scripts/instructor-mode.ts` - Use `userId` instead of `puid`
- `public/scripts/onboarding/student-onboarding.ts` - Use `userId` instead of `puid`
- `public/scripts/feature/flags.ts` - Update `userPuid` to `userId` if needed

### Phase 4: Database Migration Considerations

#### 4.1 Existing Data
- **CourseUser collections**: Need to remove `puid` field from existing documents
- **userId values**: Need to convert from number to string format
- **GlobalUser collection**: No changes needed (already has both puid and userId)

#### 4.2 Migration Strategy
1. Create migration script to:
   - Convert all `userId` values from number to string in `GlobalUser` collection
   - Convert all `userId` values from number to string in all `{courseName}_users` collections
   - Remove `puid` field from all `{courseName}_users` collections
   - Verify data integrity

### Phase 5: Testing Checklist

- [ ] Verify GlobalUser still stores PUID correctly
- [ ] Verify CourseUser no longer stores PUID
- [ ] Verify API responses don't include PUID
- [ ] Verify frontend uses userId instead of puid
- [ ] Verify chat operations work with userId
- [ ] Verify course entry works correctly
- [ ] Verify all MongoDB queries use userId instead of puid
- [ ] Verify userId is stored as string in database

## Implementation Order

1. **Type Definitions** (Phase 1.1) - Foundation for all changes
2. **ID Generator** (Phase 1.2) - Ensure userId generation returns string
3. **MongoDB Methods** (Phase 2.2) - Core data layer changes
4. **Route Handlers** (Phase 2.1, 2.3) - API layer changes
5. **Frontend Updates** (Phase 3) - Client-side changes
6. **Database Migration** (Phase 4) - Data transformation
7. **Testing** (Phase 5) - Verification

## Security Notes

- PUID should NEVER be sent to frontend
- PUID should ONLY exist in GlobalUser collection
- All course-specific operations should use userId
- userId is safe to expose (it's not a privacy identifier)

## Rollback Plan

If issues arise:
1. Keep backup of current code before migration
2. Database changes can be reverted by restoring `puid` field in CourseUser collections
3. Type changes can be reverted by changing back to `number` and adding `puid` back to CourseUser

