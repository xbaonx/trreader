#!/bin/bash

# Script để cập nhật hệ thống tarot-card-backend với tính năng họ tên và ngày sinh

# 1. Cập nhật endpoint /draw trong server.js
sed -i '' '206,212s/    \/\/ Tạo session mới\n    const newSession = db.addSession({\n      uid,\n      cards: selectedCards,\n      paid: false,\n      gptResult: null,\n    });/    \/\/ Tạo session mới\n    const newSession = db.addSession({\n      uid,\n      name, \/\/ Thêm họ tên\n      dob,  \/\/ Thêm ngày sinh\n      cards: selectedCards,\n      paid: false,\n      gptResult: null,\n    });/' server.js

# 2. Cập nhật webhook Chatfuel trong server.js
sed -i '' '268s/    const { uid, cardCount = 3 } = req.body;/    const { uid, name, dob, cardCount = 3 } = req.body;/' server.js

sed -i '' '334,340s/    \/\/ Tạo session mới\n    const newSession = db.addSession({\n      uid,\n      cards: selectedCards,\n      paid: false,\n      gptResult: null,\n    });/    \/\/ Tạo session mới\n    const newSession = db.addSession({\n      uid,\n      name, \/\/ Thêm họ tên\n      dob,  \/\/ Thêm ngày sinh\n      cards: selectedCards,\n      paid: false,\n      gptResult: null,\n    });/' server.js

# 3. Cập nhật GPT generation trong gpt.js
if grep -q "generateTarotReading" gpt.js; then
  # Đảm bảo thay thế mã cho tạo prompt và thẻ thay thế
  sed -i '' 's/  const prompt = `${basePrompt}\n\nCác lá bài đã rút: ${cardList}`;/  const prompt = basePrompt.replace("{{name}}", session.name || "Khách").replace("{{dob}}", session.dob || "");\n  const finalPrompt = `${prompt}\n\nCác lá bài đã rút: ${cardList}`;/' gpt.js
  
  # Tìm và thay thế câu lệnh gọi API OpenAI
  sed -i '' 's/      prompt: prompt,/      prompt: finalPrompt,/' gpt.js
fi

# 4. Cập nhật admin-routes.js để hiển thị và xử lý name và dob
sed -i '' 's/  <th>UID<\/th>/  <th>UID<\/th>\n              <th>Họ tên<\/th>\n              <th>Ngày sinh<\/th>/' views/admin.ejs

sed -i '' 's/  <td>${session.uid}<\/td>/  <td>${session.uid}<\/td>\n              <td>${session.name || "Khách"}<\/td>\n              <td>${session.dob || ""}<\/td>/' views/admin.ejs

# 5. Cập nhật admin.js để bao gồm trường name và dob trong form chỉnh sửa
sed -i '' 's/const sessionFormHTML = `\n    <h3>Chỉnh sửa phiên<\/h3>/const sessionFormHTML = `\n    <h3>Chỉnh sửa phiên<\/h3>\n    <div class="form-group">\n      <label>Họ tên:<\/label>\n      <input type="text" id="edit-name" class="form-control" value="\${session.name || ""}">\n    <\/div>\n    <div class="form-group">\n      <label>Ngày sinh (YYYY-MM-DD):<\/label>\n      <input type="text" id="edit-dob" class="form-control" value="\${session.dob || ""}" placeholder="YYYY-MM-DD">\n    <\/div>/' public/js/admin.js

sed -i '' 's/    const editedResult = $("#edit-result").val();/    const editedResult = $("#edit-result").val();\n    const editedName = $("#edit-name").val();\n    const editedDob = $("#edit-dob").val();/' public/js/admin.js

sed -i '' 's/    fetch("\/admin\/edit", {\n      method: "POST",\n      headers: {\n        "Content-Type": "application\/json"\n      },\n      body: JSON.stringify({\n        id: sessionId,\n        gptResult: editedResult\n      })/    fetch("\/admin\/edit", {\n      method: "POST",\n      headers: {\n        "Content-Type": "application\/json"\n      },\n      body: JSON.stringify({\n        id: sessionId,\n        gptResult: editedResult,\n        name: editedName,\n        dob: editedDob\n      })/' public/js/admin.js

# 6. Cập nhật admin-routes.js để xử lý thay đổi của name và dob
sed -i '' 's/  router.post("\/edit", (req, res) => {\n    try {\n      const { id, gptResult } = req.body;/  router.post("\/edit", (req, res) => {\n    try {\n      const { id, gptResult, name, dob } = req.body;/' admin-routes.js

sed -i '' 's/      const updatedSession = db.updateSession(id, { gptResult });/      const updatedSession = db.updateSession(id, { gptResult, name, dob });/' admin-routes.js

echo "Hoàn thành việc cập nhật tính năng tên và ngày sinh vào hệ thống."
