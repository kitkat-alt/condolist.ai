// --- CONFIGURATION ---
const FOLDER_NAME_IMAGES = "Condolist_Images";
const FOLDER_NAME_CONTRACTS = "Condolist_Contracts";
const SHEET_NAME_DATA = "Properties";
const SHEET_NAME_SETTINGS = "Settings";

// *** ใส่ GEMINI API KEY ของคุณที่นี่ (ปลอดภัย 100% เพราะอยู่หลังบ้าน) ***
const GEMINI_API_KEY = "AIzaSyA2Jymojz2L5Cu4JDE3hRK7q54IhMv0TcM"; 

// --- INITIAL SETUP ---
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Properties Sheet
  let sheet = ss.getSheetByName(SHEET_NAME_DATA);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_DATA);
    sheet.appendRow(["id", "timestamp", "type", "status", "images", "unit", "floor", "size", "saleType", "price", "contractOwner", "rentedStart", "rentedEnd", "contractTenant", "description"]);
  } else {
    // Auto-migrate
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes("description")) {
       sheet.getRange(1, headers.length + 1).setValue("description");
    }
  }

  // 2. Setup Settings Sheet
  let settingSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  if (!settingSheet) {
    settingSheet = ss.insertSheet(SHEET_NAME_SETTINGS);
    settingSheet.appendRow(["Key", "Value"]);
    settingSheet.appendRow(["profileName", "Condo Agent"]);
    settingSheet.appendRow(["profileDesc", "บริการรับฝาก เช่า-ขาย คอนโดติดรถไฟฟ้า"]);
    settingSheet.appendRow(["profileImage", "https://via.placeholder.com/150"]);
    settingSheet.appendRow(["lineUrl", "https://line.me/"]);
    settingSheet.appendRow(["mapUrl", "https://maps.google.com"]);
    settingSheet.appendRow(["adminPassword", "1234"]);
  }

  // 3. Setup Drive Folders
  const folders = DriveApp.getFoldersByName(FOLDER_NAME_IMAGES);
  if (!folders.hasNext()) DriveApp.createFolder(FOLDER_NAME_IMAGES);
  const contracts = DriveApp.getFoldersByName(FOLDER_NAME_CONTRACTS);
  if (!contracts.hasNext()) DriveApp.createFolder(FOLDER_NAME_CONTRACTS);
}

// --- API HANDLERS ---
function doGet(e) {
  const action = e.parameter.action;
  if (action === "getData") return getData();
  return ContentService.createTextOutput("API is running.");
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "saveProperty") return saveProperty(data);
    else if (action === "deleteProperty") return deleteProperty(data);
    else if (action === "saveSettings") return saveSettings(data);
    else if (action === "login") return checkLogin(data);
    else if (action === "aiGenerate") return generateAIContent(data.prompt); // New AI Handler

    return responseJSON({ status: "error", message: "Invalid action" });
  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

// --- AI FUNCTION (Backend) ---
function generateAIContent(prompt) {
  if (!GEMINI_API_KEY) return responseJSON({ status: "error", message: "API Key not configured" });
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  
  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    if (json.error) {
       return responseJSON({ status: "error", message: json.error.message });
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "AI ไม่สามารถตอบได้";
    return responseJSON({ status: "success", text: text });
    
  } catch (e) {
    return responseJSON({ status: "error", message: e.toString() });
  }
}

// --- LOGIC FUNCTIONS ---
function getData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(SHEET_NAME_DATA);
  const settingSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);

  const rows = dataSheet.getDataRange().getValues();
  const headers = rows.shift();
  const properties = rows.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).reverse();

  const settingsRows = settingSheet.getDataRange().getValues();
  const settings = {};
  settingsRows.forEach(row => {
    if(row[0] !== "Key") settings[row[0]] = row[1];
  });

  return responseJSON({ status: "success", properties, settings });
}

function checkLogin(data) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const settingSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
   const rows = settingSheet.getDataRange().getValues();
   let currentPass = "1234";
   for(let i=0; i<rows.length; i++){
     if(rows[i][0] === "adminPassword") currentPass = rows[i][1].toString();
   }
   if(data.password === currentPass) return responseJSON({ status: "success" });
   else return responseJSON({ status: "error", message: "Incorrect password" });
}

function saveProperty(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_DATA);
  
  const processFiles = (filesData, folderName) => {
    if (!filesData) return "[]";
    let files = Array.isArray(filesData) ? filesData : [filesData];
    let urls = files.map(file => {
      if (typeof file === 'string' && file.startsWith("http")) return file;
      if (!file) return null;
      return uploadToDrive(file, folderName);
    }).filter(url => url !== null && url !== "");
    return JSON.stringify(urls);
  };

  const imagesJson = processFiles(data.images, FOLDER_NAME_IMAGES);
  const ownerContractsJson = processFiles(data.contractOwner, FOLDER_NAME_CONTRACTS);
  const tenantContractsJson = processFiles(data.contractTenant, FOLDER_NAME_CONTRACTS);

  const rowData = [
    data.id || Utilities.getUuid(),
    new Date(),
    data.type,
    data.status,
    imagesJson,
    data.unit,
    data.floor,
    data.size,
    data.saleType,
    data.price,
    ownerContractsJson,
    data.rentedStart || "",
    data.rentedEnd || "",
    tenantContractsJson,
    data.description || ""
  ];

  if (data.id) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] == data.id) {
        rowData[1] = values[i][1];
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return responseJSON({ status: "success", message: "Updated" });
      }
    }
  } 
  
  sheet.appendRow(rowData);
  return responseJSON({ status: "success", message: "Created" });
}

function deleteProperty(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_DATA);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.id) {
      sheet.deleteRow(i + 1);
      return responseJSON({ status: "success", message: "Deleted" });
    }
  }
  return responseJSON({ status: "error", message: "ID not found" });
}

function saveSettings(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const rows = sheet.getDataRange().getValues();
  
  const updateOrAppend = (key, value) => {
    let found = false;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([key, value]);
  };

  if(data.profileImage && !data.profileImage.startsWith("http")) {
     data.profileImage = uploadToDrive(data.profileImage, FOLDER_NAME_IMAGES);
  }

  updateOrAppend("profileName", data.profileName);
  updateOrAppend("profileDesc", data.profileDesc);
  if(data.profileImage) updateOrAppend("profileImage", data.profileImage);
  updateOrAppend("lineUrl", data.lineUrl);
  updateOrAppend("mapUrl", data.mapUrl);
  if(data.adminPassword && data.adminPassword.trim() !== "") {
    updateOrAppend("adminPassword", data.adminPassword);
  }

  return responseJSON({ status: "success", message: "Settings Saved" });
}

function uploadToDrive(base64Data, folderName) {
  try {
    if (!base64Data || typeof base64Data !== 'string') return "";
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    const parts = base64Data.split(",");
    if (parts.length < 2) return ""; 
    
    const contentType = parts[0].split(":")[1].split(";")[0];
    const data = Utilities.base64Decode(parts[1]);
    const blob = Utilities.newBlob(data, contentType, "file_" + new Date().getTime());
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (e) { return ""; }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
