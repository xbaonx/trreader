#!/bin/bash

# Script để thay đổi trường name thành full_name trong toàn bộ dự án

echo "Bắt đầu refactor trường name thành full_name..."

# 1. Cập nhật db.js
echo "Đang cập nhật db.js..."
sed -i '' 's/name: sessionData.name || '\''Khách'\'',/full_name: sessionData.full_name || '\''Khách'\'',/g' db.js
sed -i '' 's/name: existingSession.name,/full_name: existingSession.full_name,/g' db.js
sed -i '' 's/name: updates.name !== undefined ? updates.name : existingSession.name,/full_name: updates.full_name !== undefined ? updates.full_name : existingSession.full_name,/g' db.js

# 2. Cập nhật server.js
echo "Đang cập nhật server.js..."
# Thay đổi trong endpoint /draw
sed -i '' 's/const { uid, name, dob } = req.body;/const { uid, full_name, dob } = req.body;/g' server.js
sed -i '' 's/name, \/\/ Thêm tên người dùng/full_name, \/\/ Thêm họ tên người dùng/g' server.js
sed -i '' 's/name: newSession.name,/full_name: newSession.full_name,/g' server.js

# Thay đổi trong webhook API
sed -i '' 's/const { uid, name, dob, cardCount = 3 } = req.body;/const { uid, full_name, dob, cardCount = 3 } = req.body;/g' server.js

# 3. Cập nhật giao diện admin
echo "Đang cập nhật giao diện admin..."
sed -i '' 's/<th>Họ tên<\/th>/<th>Họ tên đầy đủ<\/th>/g' views/admin.ejs
sed -i '' 's/<td>${session.name || "Khách"}<\/td>/<td>${session.full_name || "Khách"}<\/td>/g' views/admin.ejs

# 4. Cập nhật admin.js client
sed -i '' 's/id="edit-name"/id="edit-full_name"/g' public/js/admin.js
sed -i '' 's/value="\${session.name || ""}"/value="\${session.full_name || ""}"/g' public/js/admin.js
sed -i '' 's/const editedName = \$("#edit-name").val();/const editedFullName = \$("#edit-full_name").val();/g' public/js/admin.js
sed -i '' 's/name: editedName,/full_name: editedFullName,/g' public/js/admin.js

# 5. Cập nhật admin-routes.js
echo "Đang cập nhật admin-routes.js..."
sed -i '' 's/const { id, gptResult, name, dob } = req.body;/const { id, gptResult, full_name, dob } = req.body;/g' admin-routes.js
sed -i '' 's/const updatedSession = db.updateSession(id, { gptResult, name, dob });/const updatedSession = db.updateSession(id, { gptResult, full_name, dob });/g' admin-routes.js

# 6. Cập nhật gpt.js để thay thế tag
echo "Đang cập nhật gpt.js..."
if grep -q "generateTarotReading" gpt.js; then
  sed -i '' 's/const prompt = basePrompt.replace("{{name}}", session.name || "Khách")/const prompt = basePrompt.replace("{{name}}", session.full_name || "Khách")/g' gpt.js
fi

# 7. Cập nhật README.md
echo "Đang cập nhật README.md..."
sed -i '' 's/   - `name`: Họ tên đầy đủ của người dùng/   - `full_name`: Họ tên đầy đủ của người dùng/g' README.md
sed -i '' 's/  - Request: `{ uid: "user_id", name: "Họ tên đầy đủ", dob: "YYYY-MM-DD", count: 3 }`/  - Request: `{ uid: "user_id", full_name: "Họ tên đầy đủ", dob: "YYYY-MM-DD", count: 3 }`/g' README.md
sed -i '' 's/  - Response: `{ id: "session_id", cards: \[...\], name: "Họ tên đầy đủ", dob: "YYYY-MM-DD", timestamp: "..." }`/  - Response: `{ id: "session_id", cards: \[...\], full_name: "Họ tên đầy đủ", dob: "YYYY-MM-DD", timestamp: "..." }`/g' README.md

echo "Hoàn thành refactor trường name thành full_name!"
