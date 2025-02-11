/*
       Copyright (c) 2025 Cisco and/or its affiliates.

This software is licensed to you under the terms of the Cisco Sample
Code License, Version 1.0 (the "License"). You may obtain a copy of the
License at

               https://developer.cisco.com/docs/licenses

All use of the material herein must be in accordance with the terms of
the License. All rights not expressly granted by the License are
reserved. Unless required by applicable law or agreed to separately in
writing, software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied.

Author: shoneder@cisco.com

*/

const timeoutDuration = 15000; // 5 seconds
const millisecondsInADay = 24 * 60 * 60 * 1000;

const tokenURL = 'https://<HOST>/api/system/v1/auth/token';
const clientDetailUrl = '/dna/assurance/client/details';
const clientScanReportUrl = '/api/assurance/v1/host/<MAC>/ios-neighbor-aps';
const clientDisconnectUrl = '/api/assurance/v1/host/<MAC>/ios-disconnect-events?&entityName=macAddr&startTime=<EPOCH-START>&endTime=<EPOCH-END>';
const clientUrl = '/dna/intent/api/v1/client-detail?macAddress=<MAC>';
const commandRunnerUrl = '/dna/intent/api/v1/network-device-poller/cli/read-request';
const networkDeviceMACUrl = '/dna/intent/api/v1/network-device?macAddress=<MAC>';
const networkDeviceIPUrl = '/dna/intent/api/v1/network-device?managementIpAddress=<IP>';
const networkDeviceIdUrl = '/dna/intent/api/v1/network-device/'
const taskUrl = '/api/v1/task/<TASK-ID>';
const fileUrl = '/dna/intent/api/v1/file/<FILE-ID>';

var responsePending = false;
var timeout = null;
var errorState = false;
var host = undefined;
var token = undefined;

// once popup is loaded, execute the following
document.addEventListener('DOMContentLoaded', function () {

  // Verify if we are on a Client360 Page, otherwise inform
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url
    urlObj = new URL(url);
    host = urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '');
    updateHost(host);

    // Check if the active tab's URL matches the specific site
    if (url.includes(clientDetailUrl)) {
      // if we are, display the login and check if a token exists
      showLogin();

      // check if we have a token
      responsePending = true;

      // response, if available will hide Login, and display the actions
      chrome.runtime.sendMessage({ type: 'popup', action: 'get-api-token' });
    }
  });

  document.getElementById('action1').addEventListener('click', handleClientDetailQueries);
  document.getElementById('action2').addEventListener('click', handleClientDetailQueries);
  document.getElementById('action3').addEventListener('click', handleClientDetailQueries);
  document.getElementById('login-btn').addEventListener('click', generateAPIToken);

  resizePopup();
  window.addEventListener('resize', resizePopup);
}, false);

// Common Handler for the Client Details Query Buttons
function handleClientDetailQueries(event) {
  updateStatus("Validating request...");
  displayErrorMessage("")

  timeout = setTimeout(() => {
    displayErrorMessage("Request not successfull after " + timeoutDuration / 1000 + " seconds.");
  }, timeoutDuration);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url
    const urlParams = new URLSearchParams(new URL(activeTab.url).search);

    // Check if the active tab's URL matches the specific site
    if (url.includes(clientDetailUrl)) {

      // query the API for scan reports and more
      if (host && token) {
        updateStatus("Checking client details...")
        const eventId = event.target.id;
        switch (eventId) {
          case 'action1':
            getClientDetails(urlParams.get('macAddress'));
            break;
          case 'action2':
            getWLCScanReport(urlParams.get('macAddress'));
            break;
          case 'action3':
            sendAndGetWLCScanReport(urlParams.get('macAddress'));
            break;
        }
      } else {
        updateStatus("Token or Host undefined", isError = true);
      }
    } else {
      updateStatus("Please Go To Client360 Page");
    }
    clearTimeout(timeout);
  });
}

// Listener for receiving message to PopUp
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    if (responsePending == false) {
      displayErrorMessage("Message received but nothing pending!");
      return;
    }
    // reset
    responsePending = false;
    clearTimeout(timeout);

    // process message
    switch (request.type) {
      case 'service_worker': {
        switch (request.action) {
          case 'token':
            updateStatus("Token received");
            updateHost(host);
            validateToken(host, request.token);
            updateStatus("Validate Token");
            token = request.token;
            break;
          case 'no-token':
            updateStatus("No Token set, please Login", isError = true);
            showLogin();
            break;
        }
        break;
      }
    }
  }
);


// FUNCTIONALITY
function generateAPIToken() {
  let token_url = tokenURL.replace("<HOST>", host);
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  let base64 = btoa(`${username}:${password}`);

  let response = fetch(token_url, {
    method: "POST",
    mode: "cors",
    cache: "no-cache",
    credentials: "omit",
    headers: {
      "Authorization": `Basic ${base64}`,
      "Content-Type": "application/json"
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
  }).then(response => {
    if (!response.ok) {
      // Handle HTTP errors
      console.error('There was a problem with the fetch operation:', response.statusText);
      throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
    }
    return response.json(); // Parse the JSON data from the response
  })
    .then(data => {
      // Handle the data from the response
      if (!data || data?.Token == null) {
        data.Token = null;
        updateStatus("Login error, try again", isError = true);
        return
      }
      // Token generated
      token = data.Token;

      updateStatus("Token generated");
      showActionButton();
      // also store token
      chrome.runtime.sendMessage(chrome.runtime.id, { type: "popup", action: "set-api-token", value: token });
    })
    .catch(error => {
      // Handle network errors or errors from previous .then() blocks
      console.error('There was a problem with the URL operation:', error);
      displayErrorMessage(error.message);
      updateStatus("Token Error. Please relogin", isError = true);
    });
}


function validateToken(host, token) {
  fetch("https://" + host + "/api/system/v1/maglev/release/current", {
    method: 'GET',
    headers: {
      'X-Auth-Token': token,
      'Content-Type': 'application/json' // Include other headers as necessary
    },
    credentials: 'omit'
  }).then(response => {
    if (!response.ok) {
      displayErrorMessage(response.statusText);
      updateStatus("Token invalid. Please relogin", isError = true);
      errorState = true;
      throw new Error('Network response was not ok ' + response.statusText);
    }
    return response.json();
  })
    .then(data => {
      if (!errorState) {
        updateStatus("Token valid");
        showActionButton();
      }
    })
    .catch(error => {
      console.error('There was a problem with the fetch operation:', error);
      displayErrorMessage(error.message);
      updateStatus("Token invalid. Please relogin", isError = true);
      token = null;
      errorState = true;
    });
}

// Load from Catalyst Center Details (ios-neighbor, ios-disconnect-reason)
// for specific MAC and display result
// can be useful for Samsung/Intel/MacBook as the iOS Analytics tab is not shown
async function getClientDetails(mac) {
  cleanTable();
  data = await getRequest(clientScanReportUrl.replace('<MAC>', mac));
  if (data) {
    renderResponseTable(data.response);
  }

  data = await getRequest(clientDisconnectUrl.replace('<MAC>', mac).replace("<EPOCH-END>", Date.now()).replace("<EPOCH-START>", Date.now() - millisecondsInADay));
  if (data) {
    renderResponseTable(data.response, type = "catc-disconnect");
  }

}

// Query the WLC for the current Scan Report information
// on WLC direct and display data
// this involves multiple steps
// a.) finding the proper Client -> AP -> WLC relation ship
// b.) use command runner to query the WLC data (execute, task, result)
// c.) parsing WLC data
// d.) enriching data (BSSID => AP Name)
// e.) displaying data
async function getWLCScanReport(mac) {
  var wlcUuid = undefined;

  updateStatus("Start WLC Query...")
  // Step a.)

  wlcUuid = await getWlcForMac(mac);
  //if a.) not successful, stop processing
  if (!wlcUuid) {
    updateStatus("Could not find WLC for Client", isError = true);
    return;
  }

  updateStatus("WLC found, executing command");
  //updateStatus("WLC found, executing command is " + wlcUuid);
  // Step b.)
  wlcMac = convertMacAddressForWLC(mac);
  wlcMac = wlcMac.replace(/\./g, '%2E');
  const command = "test platform software database get ewlc_oper/client_wsa_info;client_mac=<MAC>".replace('<MAC>', wlcMac);
  fileData = await commandRunnerForDevice(wlcUuid, [command]);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return;
  }

  // Step c.) parsing file data
  fileDataJson = JSON.parse(fileData);
  keys = Object.keys(fileDataJson[0].commandResponses.SUCCESS);
  if (!keys) {
    updateStatus("Response in Command Runner invalid", isError = true);
    return;
  }
  updateStatus("Processing Response...");
  const tableRecord = fileDataJson[0].commandResponses.SUCCESS[keys[0]];
  if (!tableRecord) {
    updateStatus("No Valid response from WLC", isError = true);
    return;
  }
  scanReportList = parseTableRecord(tableRecord);

  // Step d.)  enrich data BSSID => AP Name
  // Step e.) displaying data
  enhanceAndRenderWLCScanReport(scanReportList);

}

async function sendAndGetWLCScanReport(mac) {
  var wlcUuid = undefined;

  updateStatus("Start WLC Query...")
  // Step a.)

  wlcUuid = await getWlcForMac(mac);
  //if a.) not successful, stop processing
  if (!wlcUuid) {
    updateStatus("Could not find WLC for Client", isError = true);
    return;
  }

  updateStatus("WLC found, executing command");
  //updateStatus("WLC found, executing command is " + wlcUuid);
  // Step b.)
  // Send request
  wlcMac = convertMacAddressForWLC(mac);
  commandSent = await sendRadioMeassurementRequest(wlcMac, wlcUuid);
  if (!commandSent) {
    updateStatus("Could not send fresh request, querying for current state", isError = true);
  }
  //Delay 2 sec for client to respond/data to be available
  await sleep(2000);

  // Query response
  wlcMac = wlcMac.replace(/\./g, '%2E');
  const command = "test platform software database get ewlc_oper/client_wsa_info;client_mac=<MAC>".replace('<MAC>', wlcMac);
  fileData = await commandRunnerForDevice(wlcUuid, [command]);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return;
  }

  // Step c.) parsing file data
  fileDataJson = JSON.parse(fileData);
  keys = Object.keys(fileDataJson[0].commandResponses.SUCCESS);
  if (!keys) {
    updateStatus("Response in Command Runner invalid", isError = true);
    return;
  }
  updateStatus("Processing Response...");
  const tableRecord = fileDataJson[0].commandResponses.SUCCESS[keys[0]];
  if (!tableRecord) {
    updateStatus("No Valid response from WLC", isError = true);
    return;
  }
  scanReportList = parseTableRecord(tableRecord);

  // Step d.) enrich data BSSID => AP Name
  // Step e.) render data
  enhanceAndRenderWLCScanReport(scanReportList);
}

async function sendRadioMeassurementRequest(mac, wlcUuid, type = 'table') {
  // prerequisite for this to work is following config on WLC:
  //
  /*
  event manager applet sendRadioMeassurementRequest
    event cli pattern "show wireless client mac-address (.+) call-info chassis active R0" sync yes
    action 1.0 puts "Executing catalyst center test command"
    action 2.0 regexp "show wireless client mac-address (.+) call.*" "$_cli_msg" match mac
    action 2.2 puts "mac is $mac"
    action 2.3 cli command "wireless client mac-address $mac scan-report once mode table bssid all ssid current operating-class network channel all delay default duration default"
    action 3.0 puts "finished run of catalyst center test command"
  */
  const command = "show wireless client mac-address <MAC> call-info chassis active R0".replace("<MAC>", mac);
  fileData = await commandRunnerForDevice(wlcUuid, [command]);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return false;
  }
  if (fileData.includes("finished run of catalyst center test")) {
    return true;
  }
  return false;
}

async function getWlcForMac(mac) {
  var wlcUuid = undefined;
  data = await getRequest(clientUrl.replace('<MAC>', mac));
  if (data) {
    const wirelessClient = data?.detail?.hostType;
    if (wirelessClient && wirelessClient == 'WIRELESS') {
      const devices = data?.topology?.nodes;
      if (devices) {
        devices.forEach(item => {
          if (item['family'] == "Wireless Controller") {
            wlcUuid = item['id'];
          }
        });
      }
      if (!wlcUuid) {
        //not found directly, try through AP
        try {
          // through the AP info
          if (data?.detail?.connectedDevice[0]?.type == 'AP') {
            const lastApId = data?.detail?.connectedDevice[0]?.id;
            const queryUrl = networkDeviceIdUrl + lastApId;
            // get details on AP
            apdetails = await getRequest(queryUrl);
            const wlcIp = apdetails?.response?.associatedWlcIp;
            // find wlc
            if (wlcIp) {
              const wlcUrl = networkDeviceIPUrl.replace("<IP>", wlcIp);
              wlcdata = await getRequest(wlcUrl);
              if (wlcdata?.response[0]?.family && wlcdata?.response[0]?.family == "Wireless Controller") {
                wlcUuid = wlcdata?.response[0]?.id;
              }

            }
          }
        } catch (error) {
          console.log("Could not find WLC through alternative either");
        }
      }
    } else {
      console.log("not a wireless client");
    }

  }
  return wlcUuid;
}

async function getAPNameForBssid(bssid) {
  deviceDetail = await getRequest(networkDeviceMACUrl.replace("<MAC>", bssid));
  if (deviceDetail?.response[0]?.family && deviceDetail?.response[0]?.family == "Unified AP") {
    const value = deviceDetail?.response[0]?.hostname;
    return value;
  }
}

async function commandRunnerForDevice(deviceUuid, commands) {
  payload = {
    "description": "Catalyst Center Assistant running Command Runner",
    "name": "catc-assist-runner",
    "commands": commands,
    "deviceUuids": [deviceUuid],
    "timeout": 10
  }

  // response will be task id
  taskIdresponse = await postData(commandRunnerUrl, payload);
  taskId = taskIdresponse?.response?.taskId;
  if (!taskId) {
    updateStatus("Could not find Task Id for Command Runner", isError = true);
    return;
  }
  updateStatus("Waiting for response from device...");


  // task id response will be file
  taskStatus = await checkTaskProgress(taskId);
  if (!taskStatus || taskStatus?.response?.isError) {
    updateStatus("Task did not suceed", isError = true);
    return;
  }

  // file will contain data
  fileId = JSON.parse(taskStatus?.response?.progress)?.fileId;
  updateStatus("Response received, collecting it...");

  if (!fileId) {
    updateStatus("Response not found.", isError = true);
    return;
  }

  //loading file
  fileData = await getRequest(fileUrl.replace("<FILE-ID>", fileId), returnAsText = true);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return;
  }
  return fileData;
}

async function enhanceAndRenderWLCScanReport(scanReportList) {
  bssid_ap_map = {};
  const unique_bssid = Array.from(
    new Set(scanReportList.map(entry => {
      baseMac = entry.bssid.slice(0, -1) + "0";
      baseMac = baseMac.replace(/\./g, '')  // Remove all dots
        .match(/.{1,2}/g)    // Match every two characters
        .join(':');
      return baseMac
    })))


  for (elem in unique_bssid) {
    const apname = await getAPNameForBssid(unique_bssid[elem]);
    bssid_ap_map[unique_bssid[elem]] = apname;
  }

  scanReportList.map(scanreport => {
    const catc_bssid_format = (scanreport['bssid'].slice(0, -1) + "0")
      .replace(/\./g, '')  // Remove all dots
      .match(/.{1,2}/g)    // Match every two characters
      .join(':');
    scanreport['bssid'] = bssid_ap_map[catc_bssid_format] ?? scanreport['bssid'];;
  });

  cleanTable();
  renderResponseTable(scanReportList, type = "wlc-scan");
}

// Helper functions for Popup
function cleanTable() {
  const container = document.getElementById('table-container');
  container.textContent = "";
  updateRenderTimestamp('');
}


function renderResponseTable(data, type = "catc-scan") {
  switch (type) {
    case 'catc-scan':
      keysToDisplay = ['apName', 'channel', 'RSSI',];
      keysToDisplayNames = ['AP Name', 'Channel', 'RSSI',];
      break;
    case 'wlc-scan':
      keysToDisplay = ['bssid', 'channel', 'rssi', 'snr', 'received_time'];
      keysToDisplayNames = ['AP Name', 'Channel', 'RSSI', 'SNR', 'Timestamp'];
      break;
    case 'catc-disconnect':
      keysToDisplay = ['apName', 'name', 'timestamp', 'location'];
      keysToDisplayNames = ['AP Name', 'Failure Reason', 'Timestamp', 'Location'];
      break;
  }


  responsedata = data;

  const container = document.getElementById('table-container');
  const status = document.getElementById('table-status');

  const table = document.createElement('table');


  if (Array.isArray(responsedata) && responsedata.length > 0) {
    const headerRow = document.createElement('tr');

    // Create table headers for the specified keys
    keysToDisplayNames.forEach(key => {
      const th = document.createElement('th');
      th.textContent = key;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    // Create table rows for the specified keys
    responsedata.forEach(item => {
      const row = document.createElement('tr');
      keysToDisplay.forEach(key => {
        const td = document.createElement('td');
        if (key == 'timestamp' || key == 'received_time') {
          td.textContent = item[key] !== undefined ? formatTime(item[key]) : ''; // Safely handle missing keys
        } else {
          td.textContent = item[key] !== undefined ? item[key] : ''; // Safely handle missing keys
        }
        row.appendChild(td);
      });
      table.appendChild(row);

    });
    container.appendChild(table);
    updateRenderTimestamp("Result rendered@" + formatTime(Date.now()));
    updateStatus("Client Details loaded")
  } else {
    updateStatus("No additional Details available", isError = true);
  }

}

function formatTime(time, format) {
  time = typeof time == 'number' ? new Date(time) : time;
  time = typeof time == 'string' ? new Date(time) : time;
  format = format || 'yyyy-mm-dd hh:MM:ss';
  var add0 = function (t) { return t < 10 ? '0' + t : t; };
  var year = time.getFullYear();
  var month = time.getMonth() + 1; // 0 indexed
  var date = time.getDate();
  var hours = time.getHours();
  var minutes = time.getMinutes();
  var seconds = time.getSeconds();
  var replaceMent = {
    'yyyy': year,
    'mm': add0(month),
    'm': month,
    'dd': add0(date),
    'd': date,
    'hh': add0(hours),
    'h': hours,
    'MM': add0(minutes),
    'M': minutes,
    'ss': add0(seconds),
    's': seconds
  }
  for (var key in replaceMent) {
    format = format.replace(key, replaceMent[key]);
  }
  return format;
}

function resizePopup() {
  // Get the current window size
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  // Determine popup size based on screen size
  // Example: Make popup a third of the screen size or limited to max constraints
  const popupWidth = Math.min(800, screenWidth / 3); // Limit width to a maximum of 800px
  const popupHeight = Math.min(600, screenHeight / 3); // Limit height to a maximum of 600px


  // Apply the calculated size to the popup
  document.body.style.width = `${popupWidth}px`;
  document.body.style.height = `${popupHeight}px`;
}


function updateStatus(message, isError = false) {
  const status = document.getElementById('statusText');
  if (isError) {
    status.classList.add('iserror');
  } else {
    status.classList.remove('iserror');
  }

  status.textContent = "Status: " + message;

  const lastUpdateElement = document.getElementById('last-update');
  const timestamp = getCurrentTime();
  lastUpdateElement.textContent = `Last update: ${timestamp}`;
}

function updateHost(hostname) {
  const host = document.getElementById('host');
  host.textContent = "Host: " + hostname;

}

function displayErrorMessage(message) {
  const footer = document.getElementById('errorMessage');
  footer.textContent = message;
  if (message) {
    footer.classList.add('error-message');
    updateStatus("Error happened", isError = true);
  } else {
    footer.classList.remove('error-message');
  }
}

function updateRenderTimestamp(timestamp) {
  const footer = document.getElementById('updatetimestamp');
  footer.textContent = timestamp;
}

function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString(); // Returns the current time in a readable format
}

function convertMacAddressForWLC(macAddress) {
  // Regular expressions for both valid MAC address formats
  const colonSeparatedRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
  const dashSeparatedRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/;
  const dotSeparatedRegex = /^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;

  if (colonSeparatedRegex.test(macAddress) || dashSeparatedRegex.test(macAddress)) {
    // If the MAC address is in the colon-separated format, convert it
    const cleanedMac = macAddress.replace(/:/g, '').replace(/-/g, '');
    return cleanedMac.match(/.{1,4}/g).join('.').toUpperCase();
  } else if (dotSeparatedRegex.test(macAddress)) {
    // If the MAC address is already in the dot-separated format, return it as is
    return macAddress.toUpperCase();
  } else {
    // If the MAC address does not match any recognized format, return an error message
    return false;
  }
}

// Parse the client_wsa_info record containint Scan report
function parseTableRecord(inputString) {
  // Check if the input contains 'Table Record Index'
  if (!inputString.includes('Table Record Index')) {
    return [];
  }

  // Regular expression to match and capture the meas_list section
  const measListRegex = /\[6\] meas_list = \[(.*?)\]\n/s;
  const match = inputString.match(measListRegex);

  if (!match || !match[1]) {
    return [];
  }

  // Extract the list and split it into individual measurement entries
  const measListString = match[1];


  const entryRegex = /{([^}]*)}/g;
  let element;
  const result = [];

  while ((element = entryRegex.exec(measListString)) !== null) {
    const entry = element[1];
    const obj = {};

    // Regex to match key-value pairs, handling received_time field separately
    //const attributeRegex = /(\w+)\s*:\s*([^,]+)(?=\s*,\s*\w+\s*:|\s*$)/g;
    const attributeRegex = /(\w+)\s*:\s*(\w{1,4}, \d{1,2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}|[^,]+)(?=\s*,\s*[\w+]+\s*:|\s*$)/g;
    // (\w+)\s* << key
    // :
    // (\w{ 1, 4 }, \d{ 1, 2 } \w{ 3 } \d{ 4 } \d{ 2 }: \d{ 2 }: \d{ 2 } [+-]\d{ 4 } <<< received time value
    // [^,] + <<< other values
    // example bssid : 	345D.A80C.FB6B, 	channel : 	132, 	rssi : 	-77, 	received_time : 	Wed, 22 Jan 2025 10:59:47 +0000, 	snr : 	18
    let attrMatch;
    while ((attrMatch = attributeRegex.exec(entry)) !== null) {
      const key = attrMatch[1].trim();
      const value = attrMatch[2].trim();
      obj[key] = value;
    }

    result.push(obj);
  }

  return result;
}

// REQUESTS
async function urlRequest(url, method, returnAsText = false) {
  // Default options are marked with *
  try {
    let response = await fetch(url, {
      method: method,
      mode: "cors",
      cache: "no-cache",
      credentials: "omit",
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json'
      },
      redirect: "follow",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      displayErrorMessage(response.statusText);
      updateStatus("Could not execute URL request", isError = true);
      errorState = true;
      throw new Error('Network response was not ok ' + response.statusText);
    }
    if (response.status == 204) {
      displayErrorMessage("");
      updateStatus("No Data was returned");
      return ({ response: [] });
    }
    if (returnAsText) {
      return response.text();
    }
    return response.json();
    //return response.json(); // parses JSON response into native JavaScript objects
  } catch (error) {
    console.error('There was a problem with the URL operation:', error);
    displayErrorMessage(error.message);
    updateStatus("Could not execute URL request", isError = true);
    errorState = true;
  }
}

async function postRequest(url = "") {
  return urlRequest(url, "POST");
}

async function getRequest(urlpath = "", returnAsText = false) {
  return await urlRequest("https://" + host + urlpath, "GET", returnAsText);
}

async function postData(urlpath = "", data = {}) {
  url = "https://" + host + urlpath;

  // Default options are marked with *
  try {
    datastring = JSON.stringify(data);
    let response = await fetch(url, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      credentials: "omit",
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json'
      },
      body: datastring,

    });
    if (!response.ok) {
      displayErrorMessage(response.statusText);
      updateStatus("Could not execute URL request", isError = true);
      errorState = true;
      throw new Error('Network response was not ok ' + response.statusText);
    }

    jsonData = response.json();
    return jsonData; // parses JSON response into native JavaScript objects
  } catch (error) {
    console.error('There was a problem with the URL operation:', error);
    displayErrorMessage(error.message);
    updateStatus("Could not execute URL request", isError = true);
    errorState = true;
  }
}

async function checkTaskProgress(taskId) {
  /*
{
    "response": {
        "endTime": 1737493845015,
        "progress": "{\"fileId\":\"0dd071c5-013c-4f40-9416-7f9c08e28b09\"}",
        "startTime": 1737493844647,
        "version": 1737493845015,
        "lastUpdate": 1737493845014,
        "isError": false,
        "serviceType": "Command Runner Service",
        "username": "admin",
        "instanceTenantId": "5c023662eb28e7004c7f8a50",
        "id": "01948ab4-12a7-77d5-972c-b4f5d64490a0"
    },
    "version": "1.0"
}
  */
  const urlpath = taskUrl.replace("<TASK-ID>", taskId);
  const retry = 5;
  const retrytimer = 1000; //in [msec]
  for (let i = 0; i < retry; i++) {
    taskStatus = await getRequest(urlpath);
    let isError = taskStatus?.response?.isError;
    let endTime = taskStatus?.response?.endTime;
    if (isError) {
      updateStatus("Error on Excuting the task", isError = true);
      return taskStatus;
    }
    if (endTime) {
      updateStatus("Task finished");
      return taskStatus;
    }
    await sleep(retrytimer);
  }

  updateStatus("Task did not finish in time", isError = true);
  return false;
}

// Define a sleep function that returns a Promise
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showLogin() {
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'block'
  document.getElementById('action-section').style.display = 'none'
}

function showActionButton() {
  displayErrorMessage();
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'none'
  document.getElementById('action-section').style.display = 'flex'
}