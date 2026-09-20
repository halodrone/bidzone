# Emergent Auth — Testing Playbook (saved per integration playbook instruction)

Auth-Gated App Testing Playbook (Emergent managed Google sign-in)

Step 1: Create Test User & Session (MongoDB, backend session store)
mongosh --eval "
use('bidzone_db');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"

Step 2: Test Backend API
# Test auth endpoint (cookie preferred, Authorization header fallback)
curl -X GET "https://your-app.com/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"

Step 3: Browser Testing
// Set cookie and navigate
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "your-app.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
}]);
await page.goto("https://your-app.com");

Quick Debug
mongosh --eval "
use('bidzone_db');
db.users.find().limit(2).pretty();
db.user_sessions.find().limit(2).pretty();
"

# Clean test data
mongosh --eval "
use('bidzone_db');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
"

Checklist
- User document has user_id field (custom UUID, MongoDB's _id is separate/internal)
- Session user_id matches user's user_id exactly
- All queries use {"_id": 0} projection to exclude MongoDB's _id
- Backend queries use user_id (not _id or id)
- API returns user data with user_id field (not 401/404)
- Browser loads app (not login page)
- Callback detection uses useLocation().hash (reactive), not window.location.hash
- AuthProvider skips /auth/me check when location.hash contains session_id= (race-condition fix)

Success Indicators
- /api/auth/me returns user data
- App loads without redirect
- Protected operations work

Failure Indicators
- "User not found" errors
- 401 Unauthorized responses
- Redirect to login page

Test Identity Tracking
- Save allowed Google test accounts + linked app users to /app/memory/test_credentials.md
- Do NOT store passwords for Google OAuth flows (Google does not use app-managed passwords)
