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

const timeoutDuration = 15000; // 15 seconds
const millisecondsInADay = 24 * 60 * 60 * 1000;

const buddyURLs = {
  'clientDetailUrl': '/dna/assurance/client/details',
  'deviceAssuranceUrl': '/dna/assurance/device/details',
  'deviceProvisioningUrl': '/dna/provision/devices/inventory/device-details',
  'activityTaskUrl': '/dna/activity/tasks'
}

const tokenURL = 'https://<HOST>/api/system/v1/auth/token';
const clientScanReportUrl = '/api/assurance/v1/host/<MAC>/ios-neighbor-aps';
const clientDisconnectUrl = '/api/assurance/v1/host/<MAC>/ios-disconnect-events?&entityName=macAddr&startTime=<EPOCH-START>&endTime=<EPOCH-END>';
const clientUrl = '/dna/intent/api/v1/client-detail?macAddress=<MAC>';
const commandRunnerUrl = '/dna/intent/api/v1/network-device-poller/cli/read-request';
const networkDeviceMACUrl = '/dna/intent/api/v1/network-device?macAddress=<MAC>';
const networkDeviceIPUrl = '/dna/intent/api/v1/network-device?managementIpAddress=<IP>';
const networkDeviceIdUrl = '/dna/intent/api/v1/network-device/'
const taskUrl = '/api/v1/task/<TASK-ID>';
const fileUrl = '/dna/intent/api/v1/file/<FILE-ID>';
const configArchiveUrl = '/api/v1/archive-config?filterById=<DEVICE-ID>&sortBy=createdTime&order=des'
const scheduledJobBriefUrl = '/api/schedule/v4/scheduled-job/brief?type=DEFAULT,ACTIONABLE&limit=25&sortBy=lastUpdateTime&order=DESC&module=PROVISION&aggregatedStatus=FAILED';
const deployStatusUrl = '/api/v1/template-programmer/deploy/status/<DEPLOY-ID>';
const activityInstanceUrl = '/api/schedule/v4/scheduled-job?taskId=<ACTIVITY-ID>';
const airsensePcapUrl = '/api/assurance/v1/airsense/packetcaptures?type=airsense_packets_timerange&macAddress=<MAC>&startTime=<START>&endTime=<END>';

var responsePending = false;
var timeout = null;
var errorState = false;
var host = undefined;
var token = undefined;

// once popup is loaded, execute the following
document.addEventListener('DOMContentLoaded', function () {
  // Verify if we are on a Client360/Device360 Page, otherwise inform
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url
    const urlObj = new URL(url);
    host = urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '');
    updateHost(host);

    // Check if the active tab's URL matches the specific site
    if (Object.values(buddyURLs).some(supportedUrl => url.includes(supportedUrl))) {
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
  document.getElementById('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') generateAPIToken(); });
  document.getElementById('device-action1').addEventListener('click', handleDeviceDetails);
  document.getElementById('activity-action1').addEventListener('click', handleActivityTasks);
  document.getElementById('airsense-action1').addEventListener('click', handleAirsenseDownload);
  document.getElementById('airsense-quick-30m').addEventListener('click', () => setAirsenseTimeRange(30 * 60 * 1000));
  document.getElementById('airsense-quick-1h').addEventListener('click', () => setAirsenseTimeRange(60 * 60 * 1000));
  document.getElementById('airsense-quick-5h').addEventListener('click', () => setAirsenseTimeRange(5 * 60 * 60 * 1000));

  resizePopup();
  window.addEventListener('resize', resizePopup);
}, false);

/**
 * Button handler for Client Analytics actions (action1–action3).
 * Dispatches to the appropriate client detail query based on the button pressed.
 * @param {Event} event - the click event from the action button
 */
function handleClientDetailQueries(event) {
  updateStatus("Validating request...");
  displayErrorMessage("")
  errorState = false;

  timeout = setTimeout(() => {
    displayErrorMessage("Request not successfull after " + timeoutDuration / 1000 + " seconds.");
  }, timeoutDuration);

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url
    const urlParams = new URLSearchParams(new URL(activeTab.url).search);

    // Check if the active tab's URL matches the specific site
    if (url.includes(buddyURLs.clientDetailUrl)) {

      // query the API for scan reports and more
      if (host && token) {
        updateStatus("Checking client details...")
        const eventId = event.target.id;
        switch (eventId) {
          case 'action1':
            await getClientDetails(urlParams.get('macAddress'));
            break;
          case 'action2':
            await getWLCScanReport(urlParams.get('macAddress'));
            break;
          case 'action3':
            await sendAndGetWLCScanReport(urlParams.get('macAddress'));
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

/**
 * Button handler for Device360 actions (device-action1).
 * Dispatches to the appropriate device detail query based on the button pressed.
 * @param {Event} event - the click event from the action button
 */
function handleDeviceDetails(event) {
  updateStatus("Validating request...");
  displayErrorMessage("")
  errorState = false;

  timeout = setTimeout(() => {
    displayErrorMessage("Request not successfull after " + timeoutDuration / 1000 + " seconds.");
  }, timeoutDuration);

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url
    const urlParams = new URLSearchParams(new URL(activeTab.url).search);

    // Check if the active tab's URL matches the specific site
    if (url.includes(buddyURLs.deviceAssuranceUrl) || url.includes(buddyURLs.deviceProvisioningUrl)) {
      // query the API for scan reports and more
      if (host && token) {
        updateStatus("Checking device details...")
        const eventId = event.target.id;
        switch (eventId) {
          case 'device-action1':
            let deviceId = urlParams.get('deviceId');
            if (deviceId == null)
              deviceId = urlParams.get('id');
            await loadConfigArchive(deviceId);
            break;
        }
      } else {
        updateStatus("Token or Host undefined", isError = true);
      }
    } else {
      updateStatus("Please Go To Device360 Page");
    }
    clearTimeout(timeout);
  });
}

/**
 * Button handler for Activity Tasks actions (activity-action1).
 * Dispatches to the appropriate activity query based on the button pressed.
 * @param {Event} event - the click event from the action button
 */
function handleActivityTasks(event) {
  updateStatus("Validating request...");
  displayErrorMessage("");
  errorState = false;

  timeout = setTimeout(() => {
    displayErrorMessage("Request not successful after " + timeoutDuration / 1000 + " seconds.");
  }, timeoutDuration);

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url;
    if (url.includes(buddyURLs.activityTaskUrl)) {
      if (host && token) {
        await loadFailedJobs();
      } else {
        updateStatus("Token or Host undefined", isError = true);
      }
    } else {
      updateStatus("Please Go To Activity Tasks Page");
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

/**
 * Reads the active tab URL and shows the appropriate action section.
 * Routes to airsense, client analytics, activity tasks, or device actions
 * based on the current page path and query parameters.
 */
function showActions() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url;
    const urlParams = new URLSearchParams(new URL(url).search);
    if (url.includes(buddyURLs.clientDetailUrl) && urlParams.get('view') === 'airsense') {
      showAirsenseActionButton(urlParams.get('macAddress'));
    } else if (url.includes(buddyURLs.clientDetailUrl)) {
      showActionButton();
    } else if (url.includes(buddyURLs.activityTaskUrl)) {
      showActivityActionButton();
    } else {
      showDeviceActionButton();
    }
  });
}


// FUNCTIONALITY
// Overall 
/**
 * Reads username/password from the login form and requests an API token
 * from Catalyst Center. On success, stores the token and shows the action section.
 */
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
      showActions();
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

/**
 * Verify if the current stored token is actually still valid
 * 
 * @param {string} host - Catalyst Center Host - IP Address/FQDN
 * @param {string} token - X-Auth Token generated in login procedure
 */
function validateToken(hostParam, tokenParam) {
  const catc_2_3_x = `https://${hostParam}/api/system/v1/maglev/release/current`;
  const catc_3_1_x = `https://${hostParam}/api/v1/system-orchestrator/software-management/releases/installed`;

  const fetchOptions = {
    method: 'GET',
    headers: {
      'X-Auth-Token': tokenParam,
      'Content-Type': 'application/json'
    },
    credentials: 'omit'
  };

  fetch(catc_2_3_x, fetchOptions).then(response => {
    if (!response.ok) {
      return fetch(catc_3_1_x, fetchOptions);
    } else {
      return response;
    }
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
        showActions();
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

// Client 360 / Client Analytics
/**
 * Load from Catalyst Center Details (ios-neighbor, ios-disconnect-reason)
 * for specific MAC and display result
 * can be useful for Samsung/Intel/MacBook as the iOS Analytics tab is not shown
 * 
 * @param {string} mac - the wireless client MAC we are getting additional information 
 */
async function getClientDetails(mac) {
  cleanTable();
  let data = await getRequest(clientScanReportUrl.replace('<MAC>', mac));
  if (data) {
    renderResponseTable(data.response);
  }

  data = await getRequest(clientDisconnectUrl.replace('<MAC>', mac).replace("<EPOCH-END>", Date.now()).replace("<EPOCH-START>", Date.now() - millisecondsInADay));
  if (data) {
    renderResponseTable(data.response, type = "catc-disconnect");
  }

}

/**
 * Parse the Command Runner file response for WLC scan data.
 * Returns the parsed scan report list, or null if the response is invalid.
 * @param {string} fileData - raw text response from the Command Runner file endpoint
 */
function processWLCScanData(fileData) {
  const fileDataJson = JSON.parse(fileData);
  const keys = Object.keys(fileDataJson[0].commandResponses.SUCCESS);
  if (!keys || keys.length === 0) {
    updateStatus("Response in Command Runner invalid", isError = true);
    return null;
  }
  updateStatus("Processing Response...");
  const tableRecord = fileDataJson[0].commandResponses.SUCCESS[keys[0]];
  if (!tableRecord) {
    updateStatus("No Valid response from WLC", isError = true);
    return null;
  }
  return parseTableRecord(tableRecord);
}

/**
 *
 * Query the WLC for the current Scan Report information
 * on WLC direct and display data
 * this involves multiple steps
 * a.) finding the proper Client -> AP -> WLC relation ship
 * b.) use command runner to query the WLC data (execute, task, result)
 * c.) parsing WLC data
 * d.) enriching data (BSSID => AP Name)
 * e.) displaying data
 * @param {string} mac Client MAC Address
 * @returns 
 */
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
  let wlcMac = convertMacAddressForWLC(mac);
  wlcMac = wlcMac.replace(/\./g, '%2E');
  const command = "test platform software database get ewlc_oper/client_wsa_info;client_mac=<MAC>".replace('<MAC>', wlcMac);
  const fileData = await commandRunnerForDevice(wlcUuid, [command]);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return;
  }

  // Step c.) parse + d.) enrich + e.) render
  const scanReportList = processWLCScanData(fileData);
  if (!scanReportList) return;
  enhanceAndRenderWLCScanReport(scanReportList);

}

/**
 * Leverage the Command Runner to trigger Scan Report
 * Request towards client and collect data afterwards
 * @param {string} mac Client MAC Address
 * @returns 
 */
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
  let wlcMac = convertMacAddressForWLC(mac);
  const commandSent = await sendRadioMeassurementRequest(wlcMac, wlcUuid);
  if (!commandSent) {
    updateStatus("Could not send fresh request, querying for current state", isError = true);
  }
  //Delay 2 sec for client to respond/data to be available
  await sleep(2000);

  // Query response
  wlcMac = wlcMac.replace(/\./g, '%2E');
  const command = "test platform software database get ewlc_oper/client_wsa_info;client_mac=<MAC>".replace('<MAC>', wlcMac);
  const fileData = await commandRunnerForDevice(wlcUuid, [command]);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return;
  }

  // Step c.) parse + d.) enrich + e.) render
  const scanReportList = processWLCScanData(fileData);
  if (!scanReportList) return;
  enhanceAndRenderWLCScanReport(scanReportList);
}

/**
 * Triggers a Radio Measurement Request on the WLC via Command Runner.
 * Requires an EEM applet configured on the WLC to translate the show command
 * into an actual scan-report request to the client.
 * @param {string} mac - client MAC in WLC dot notation (e.g. 1234.5678.ABCD)
 * @param {string} wlcUuid - device UUID of the WLC in Catalyst Center
 * @param {string} type - scan report mode (default: 'table')
 * @returns {boolean} true if the WLC confirmed the request was executed
 */
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
  const fileData = await commandRunnerForDevice(wlcUuid, [command]);
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return false;
  }
  if (fileData.includes("finished run of catalyst center test")) {
    return true;
  }
  return false;
}

/**
 * Resolves the WLC device UUID for a given wireless client MAC.
 * First checks the topology nodes in the client detail response;
 * falls back to looking up the WLC via the associated AP if not found directly.
 * @param {string} mac - client MAC address
 * @returns {string|undefined} WLC device UUID, or undefined if not found
 */
async function getWlcForMac(mac) {
  var wlcUuid = undefined;
  const data = await getRequest(clientUrl.replace('<MAC>', mac));
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
            const apdetails = await getRequest(queryUrl);
            const wlcIp = apdetails?.response?.associatedWlcIp;
            // find wlc
            if (wlcIp) {
              const wlcUrl = networkDeviceIPUrl.replace("<IP>", wlcIp);
              const wlcdata = await getRequest(wlcUrl);
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

/**
 * Resolves the AP name for a given BSSID MAC address.
 * @param {string} bssid - AP BSSID in colon-separated format
 * @returns {string|undefined} AP name, or undefined if not a Unified AP
 */
async function getAPNameForBssid(bssid) {
  const deviceDetail = await getRequest(networkDeviceMACUrl.replace("<MAC>", bssid));
  if (deviceDetail?.response[0]?.family && deviceDetail?.response[0]?.family == "Unified AP") {
    const value = deviceDetail?.response[0]?.hostname;
    return value;
  }
}

/**
 * Executes CLI commands on a device via the Catalyst Center Command Runner.
 * Submits the command, polls the resulting task, then fetches and returns the file output.
 * @param {string} deviceUuid - device UUID to run commands on
 * @param {string[]} commands - list of CLI commands to execute
 * @returns {string|undefined} raw text output from the command, or undefined on failure
 */
async function commandRunnerForDevice(deviceUuid, commands) {
  const payload = {
    "description": "Catalyst Center Assistant running Command Runner",
    "name": "catc-assist-runner",
    "commands": commands,
    "deviceUuids": [deviceUuid],
    "timeout": 10
  }

  // response will be task id
  const taskIdresponse = await postData(commandRunnerUrl, payload);
  const taskId = taskIdresponse?.response?.taskId;
  if (!taskId) {
    updateStatus("Could not find Task Id for Command Runner", isError = true);
    return;
  }
  updateStatus("Waiting for response from device...");


  // task id response will be file
  const taskStatus = await checkTaskProgress(taskId);
  if (!taskStatus || taskStatus?.response?.isError) {
    updateStatus("Task did not suceed", isError = true);
    return;
  }

  // file will contain data
  const fileId = JSON.parse(taskStatus?.response?.progress)?.fileId;
  updateStatus("Response received, collecting it...");

  if (!fileId) {
    updateStatus("Response not found.", isError = true);
    return;
  }

  //loading file
  const fileData = await getRequest(fileUrl.replace("<FILE-ID>", fileId), 'text');
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    return;
  }
  return fileData;
}

/**
 * Enriches a WLC scan report by resolving each unique BSSID to an AP name,
 * then renders the result table.
 * @param {object[]} scanReportList - parsed scan report entries from the WLC
 */
async function enhanceAndRenderWLCScanReport(scanReportList) {
  const bssid_ap_map = {};
  const unique_bssid = Array.from(
    new Set(scanReportList.map(entry => {
      const baseMac = entry.bssid.slice(0, -1) + "0";
      return baseMac.replace(/\./g, '')  // Remove all dots
        .match(/.{1,2}/g)    // Match every two characters
        .join(':');
    })))


  for (const bssid of unique_bssid) {
    const apname = await getAPNameForBssid(bssid);
    bssid_ap_map[bssid] = apname;
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

// Device360 / DeviceDetails
/**
 * Loads the configuration archive for a device and renders it as a table.
 * @param {string} deviceUuid - device UUID in Catalyst Center
 */
async function loadConfigArchive(deviceUuid) {
  updateStatus("Loading config archive of device...");
  cleanTable();
  data = await getRequest(configArchiveUrl.replace('<DEVICE-ID>', deviceUuid));
  if (data) {
    // prepare response data for display
    if (data?.archiveResultlist?.[0]?.deviceId !== deviceUuid) {
      errorState = true;
      updateStatus("Loading Config Archive failed...");
      displayErrorMessage("Could not locate Config Archive for Device");
      return
    }
    const deviceName = data?.archiveResultlist?.[0]?.deviceName;
    const deviceEntry = data?.archiveResultlist?.[0];
    updateStatus(`Loaded ${deviceEntry.versions.length} configs`)

    const renderData = flattenArchiveResponse(deviceEntry);
    renderResponseTable(renderData, type = "config-archive");
  }
}


/**
 * Function called as part of Button Event Listener
 * to download file.
 */
async function downloadConfigFileVersion(btn, deviceUuid, versionId, fileId, deviceName, type, timestamp) {
  btn.disabled = true;
  btn.textContent = '⏳...';
  const downloadUrl = `/api/v1/archive-config/network-device/${deviceUuid}/version/${versionId}/file/${fileId}?processed=true`;
  const fileData = await getRequest(downloadUrl, 'text');
  if (!fileData) {
    updateStatus("No Data in Response found", isError = true);
    btn.disabled = false;
    btn.textContent = '💾';
    return;
  }
  try {
    const time = formatTime(timestamp, 'yyyy-mm-dd_hh-MM');
    const blob = new Blob([fileData], { type: 'text/plain' });
    triggerBlobDownload(blob, `${deviceName}_${time}_${type}.cfg`);
  } catch (error) {
    console.error('Download failed:', error);
    updateStatus("Error during download", true);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾';
  }
}

/**
 * Flattens a config archive device entry into a flat array of version records
 * suitable for table rendering, including startup and running config file IDs.
 * @param {object} deviceEntry - a single entry from archiveResultlist
 * @returns {object[]} flat list of version records
 */
function flattenArchiveResponse(deviceEntry = {}) {
  const { deviceId, deviceName, ipAddress, versions = [] } = deviceEntry;

  return versions.map(version => {
    const fileMap = Object.fromEntries(
      (version.files || []).map(file => [file.fileType, file])
    );

    return {
      deviceId: deviceId ?? null,
      deviceName: deviceName ?? null,
      ipAddress: ipAddress ?? null,
      versionId: version.id ?? null,
      createdTime: version.createdTime ?? null,
      startupFileId: fileMap.STARTUPCONFIG?.fileId ?? null,
      startupChangeMagnitude: fileMap.STARTUPCONFIG?.changeMagnitude ?? null,
      runningFileId: fileMap.RUNNINGCONFIG?.fileId ?? null,
      runningChangeMagnitude: fileMap.RUNNINGCONFIG?.changeMagnitude ?? null,
      userName: version.syslogConfigEventDto?.userName ?? null
    };
  });
}

/**
 * Returns an icon, color, and label representing a config change magnitude value.
 * @param {string} magnitudeStr - magnitude as a string (e.g. '0', '3.5', '12')
 * @returns {{icon: string, color: string, label: string}}
 */
function getMagnitudeIcon(magnitudeStr) {
  const value = Number.parseFloat(magnitudeStr ?? '0'); // safe parse
  if (Number.isNaN(value)) {
    return { icon: '⚪ NaN', color: '#9ea1b4', label: 'Unknown' };
  }

  if (value === 0) {
    return { icon: '🟢 No Change', color: '#22c55e', label: 'No change' };
  }

  if (value < 5) {
    return { icon: '🟡 Minor', color: '#facc15', label: 'Minor change' };
  }

  if (value < 10) {
    return { icon: '🟠 Moderate', color: '#fb923c', label: 'Moderate change' };
  }

  return { icon: '🔴 Major', color: '#f87171', label: 'Major change' };
}

/**
 * Creates a 💾 button that triggers a config file download when clicked.
 * @param {string} deviceUuid - device UUID
 * @param {string} version - version ID of the archive
 * @param {string} fileId - file ID to download
 * @param {string} deviceName - device name used in the filename
 * @param {string} type - 'startup' or 'running'
 * @param {number} timestamp - creation timestamp (epoch ms) used in the filename
 * @returns {HTMLButtonElement}
 */
function getFileDownloadButton(deviceUuid, version, fileId, deviceName, type, timestamp) {
  const btn = document.createElement('button');
  btn.innerHTML = '💾';
  btn.addEventListener('click', () => {
    downloadConfigFileVersion(btn, deviceUuid, version, fileId, deviceName, type, timestamp);
  });
  return btn;
}


// Activity Tasks
/**
 * Fetches the latest failed provisioning jobs and renders them as a table.
 */
async function loadFailedJobs() {
  updateStatus("Loading failed jobs...");
  cleanTable();
  const data = await getRequest(scheduledJobBriefUrl);
  if (data?.response?.length) {
    renderResponseTable(data.response, 'job-list');
  } else {
    updateStatus("No failed jobs found");
  }
}

/**
 * Loads the deployment details for a specific activity/job instance.
 * Handles both TEMPLATES (shows per-device deploy status + CSV export)
 * and DEVICES (informs user to use the GUI).
 * @param {string} activityInstanceUuid - the instanceUuid of the scheduled job
 */
async function loadJobDetails(activityInstanceUuid) {
  updateStatus("Loading job details...");
  cleanTable();

  const activityData = await getRequest(activityInstanceUrl.replace('<ACTIVITY-ID>', activityInstanceUuid));
  if (!activityData) {
    errorState = true;
    updateStatus("Loading Job Details failed...", isError = true);
    displayErrorMessage("Could not locate Job Details for Activity");
    return;
  }


  const taskId = activityData?.response?.[0]?.triggeredJobs?.[0]?.triggeredJobTaskId;
  if (!taskId) {
    updateStatus("Could not retrieve Task ID from Activity", isError = true);
    displayErrorMessage("Could not locate Job Details for Task");
    return;
  }

  // check now if this was a CLI Template provisioning or a Device > Inventory provisioning job
  const taskSubModule = activityData?.response?.[0]?.paramNamesAndValues?.subModule;

  // can be either "subModule": "TEMPLATES" or "subModule": "DEVICES"
  // if it is templates, we process it, if it is a provisioning job
  // we stop and return with an information.

  if (taskSubModule === "DEVICES") {
    updateStatus("Please use GUI");
    const container = document.getElementById('table-container');
    const header = document.createElement('div');
    header.innerHTML = "<strong>For Provisioning Jobs from Inventory use GUI</strong>";
    container.appendChild(header);

  } else if (taskSubModule === "TEMPLATES") {
    const task = await getRequest(taskUrl.replace('<TASK-ID>', taskId));
    const deployId = task?.response?.data;
    if (!deployId) {
      updateStatus("Could not retrieve deploy ID from task", isError = true);
      displayErrorMessage("Could not locate Deploy Details for Task");
      return;
    }

    const deployStatus = await getRequest(deployStatusUrl.replace('<DEPLOY-ID>', deployId));
    if (!deployStatus) {
      updateStatus("Could not retrieve deploy status", isError = true);
      displayErrorMessage("Could not locate Deploy Details for Task");
      return;
    }

    const deployment = deployStatus?.[0];
    if (!deployment) {
      updateStatus("No deployment information found", isError = true);
      displayErrorMessage("Could not locate Deploy Details for Task");
      return;
    }


    const container = document.getElementById('table-container');
    const header = document.createElement('div');
    header.innerHTML = `<strong>${deployment.templateName}</strong> &nbsp; ${deployment.startTime}`;
    const exportBtn = document.createElement('button');
    exportBtn.className = 'button button-secondary';
    exportBtn.style.cssText = 'width:auto; margin-left:10px;';
    exportBtn.textContent = '⬇ Export CSV';
    exportBtn.addEventListener('click', () => exportDeployDetailsCSV(deployment.templateName, deployment.startTime, deployment.devices));
    header.appendChild(exportBtn);
    container.appendChild(header);

    renderResponseTable(deployment.devices, 'job-details');
    updateStatus("Job details loaded");
  }
}

/**
 * Exports deployment device results as a CSV file download.
 * @param {string} jobName - template job name
 * @param {string} startTime - job start time string
 * @param {object[]} devices - array of device result objects
 */
function exportDeployDetailsCSV(jobName, startTime, devices) {
  const rows = [['Execution Time', 'Job Name', 'Device Name', 'IP Address', 'Status']];
  devices.forEach(d => rows.push([startTime, jobName, d.name, d.ipAddress, d.status]));
  const csv = rows.map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const blobUrl = URL.createObjectURL(blob);
  const tempLink = document.createElement('a');
  tempLink.href = blobUrl;
  tempLink.download = `${jobName}_${formatTime(Date.now(), 'yyyy-mm-dd_hh-MM')}_failed-jobs.csv`;
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
  URL.revokeObjectURL(blobUrl);
}

// Client 360 Intelligent Capture / Packet Capture Download

/**
 * Fetches basic client info (hostname, IP, identifier) and displays it
 * in the airsense section header.
 * @param {string} mac - client MAC address
 */
async function loadAirsenseClientInfo(mac) {
  const data = await getRequest(clientUrl.replace('<MAC>', mac));
  const hostname = data?.detail?.hostName ?? 'N/A';
  const identifier = data?.detail?.identifier ?? 'N/A';
  const ip = data?.detail?.hostIpV4 ?? 'N/A';
  document.getElementById('airsense-client-info').textContent = `${identifier} | ${mac} | ${ip} | ${hostname}`;
}

/**
 * Sets the airsense start/end datetime inputs.
 * End time is set to now; start time is set to now minus the given duration.
 * @param {number} durationMs - duration in milliseconds to look back from now
 */
function setAirsenseTimeRange(durationMs) {
  const now = Date.now();
  document.getElementById('airsense-end').value = formatTime(now, 'yyyy-mm-ddThh:MM');
  document.getElementById('airsense-start').value = formatTime(now - durationMs, 'yyyy-mm-ddThh:MM');
}

/**
 * Button handler for the AirSense PCAP download button.
 * Validates the selected time range and delegates to downloadAirSensePcap.
 */
async function handleAirsenseDownload() {
  updateStatus("Preparing PCAP download...");
  displayErrorMessage("");
  errorState = false;

  timeout = setTimeout(() => {
    displayErrorMessage("Request not successful after " + timeoutDuration / 1000 + " seconds.");
  }, timeoutDuration);

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    const urlParams = new URLSearchParams(new URL(activeTab.url).search);
    const mac = urlParams.get('macAddress');
    if (!mac) {
      updateStatus("Could not determine client MAC", isError = true);
      clearTimeout(timeout);
      return;
    }
    if (host && token) {
      const startVal = document.getElementById('airsense-start').value;
      const endVal = document.getElementById('airsense-end').value;
      const startTime = new Date(startVal).getTime();
      const endTime = new Date(endVal).getTime();
      if (!startVal || !endVal || isNaN(startTime) || isNaN(endTime)) {
        updateStatus("Invalid time range", isError = true);
        clearTimeout(timeout);
        return;
      }
      if (startTime >= endTime) {
        updateStatus("Start time must be before end time", isError = true);
        clearTimeout(timeout);
        return;
      }
      await downloadAirSensePcap(mac, startTime, endTime);
    } else {
      updateStatus("Token or Host undefined", isError = true);
    }
    clearTimeout(timeout);
  });
}

/**
 * Downloads an AirSense onboarding packet capture for the given client and time range.
 * Saves the file as icap_onboarding_<mac>_<endtime>.pcap.
 * @param {string} mac - client MAC address
 * @param {number} startTime - start of capture window (epoch ms)
 * @param {number} endTime - end of capture window (epoch ms)
 */
async function downloadAirSensePcap(mac, startTime, endTime) {
  updateStatus("Downloading PCAP...");
  const btn = document.getElementById('airsense-action1');
  btn.disabled = true;
  btn.textContent = '⏳...';

  const urlpath = airsensePcapUrl
    .replace('<MAC>', encodeURIComponent(mac))
    .replace('<START>', startTime)
    .replace('<END>', endTime);
  const blob = await getRequest(urlpath, 'blob');
  if (!blob) {
    updateStatus("No PCAP data received", isError = true);
    btn.disabled = false;
    btn.textContent = '⬇ Download PCAP';
    return;
  }
  try {
    const safeMac = mac.replace(/:/g, '-');
    const time = formatTime(endTime, 'yyyy-mm-dd_hh-MM');
    triggerBlobDownload(blob, `icap_onboarding_${safeMac}_${time}.pcap`);
    updateStatus("PCAP downloaded");
  } catch (error) {
    console.error('Download failed:', error);
    updateStatus("Error during download", true);
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ Download PCAP';
  }
}

// Helper functions for Popup
/**
 * Clears the table container and the render timestamp.
 */
function cleanTable() {
  const container = document.getElementById('table-container');
  container.textContent = "";
  updateRenderTimestamp('');
}

/**
 * Renders an array of data objects as an HTML table in the table container.
 * The columns shown depend on the type parameter.
 * @param {object[]} data - array of data records to display
 * @param {string} type - table layout type: 'catc-scan' | 'wlc-scan' | 'catc-disconnect' |
 *                        'config-archive' | 'job-list' | 'job-details'
 */
function renderResponseTable(data, type = "catc-scan") {
  let keysToDisplay;
  let keysToDisplayNames;
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
    case 'config-archive':
      keysToDisplay = ['createdTime', 'userName', 'startupChangeMagnitude', 'startupFileId', 'runningChangeMagnitude', 'runningFileId'];
      keysToDisplayNames = ['Timestamp', 'User', 'Startup Changes', '💾', 'Running Changes', '💾'];
      break;
    case 'job-list':
      keysToDisplay = ['description', 'startTime', 'instanceUuid'];
      keysToDisplayNames = ['Job Name', 'Start Time', 'Load Details'];
      break;
    case 'job-details':
      keysToDisplay = ['name', 'ipAddress', 'status', 'detailedStatusMessage'];
      keysToDisplayNames = ['Device', 'IP', 'Status', 'Message'];
      break;
  }


  const responsedata = data;

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
        var td = document.createElement('td');
        if (key == 'timestamp' || key == 'received_time' || key == 'createdTime' || key == 'startTime') {
          td.textContent = item[key] !== undefined ? formatTime(item[key]) : ''; // Safely handle missing keys
        } else {
          if (key.includes("Magnitude")) {
            td.textContent = item[key] !== undefined ? getMagnitudeIcon(item[key]).icon : ''; // Safely handle missing keys
          } else {
            if (key === 'instanceUuid') {
              const btn = document.createElement('button');
              btn.textContent = 'Details';
              btn.addEventListener('click', () => loadJobDetails(item[key]));
              td.appendChild(btn);
            } else if (key.includes("FileId")) {
              const btn = getFileDownloadButton(item.deviceId, item.versionId, item[key], item.deviceName, (key.includes('startup') ? 'startup' : 'running'), item.createdTime);
              td.appendChild(btn);
            } else {
              td.textContent = item[key] !== undefined ? item[key] : ''; // Safely handle missing keys  
            }
          }

        }
        row.appendChild(td);
      });
      table.appendChild(row);

    });
    container.appendChild(table);
    updateRenderTimestamp("Result rendered@" + formatTime(Date.now()));
    updateStatus("Details loaded")
  } else {
    updateStatus("No additional Details available", isError = true);
  }

}

/**
 * Formats a timestamp into a string using a token-based format.
 * Supported tokens: yyyy, mm, m, dd, d, hh, h, MM, M, ss, s.
 * Default format: 'yyyy-mm-dd hh:MM:ss'.
 * @param {number|string|Date} time - the timestamp to format
 * @param {string} [format] - format string with tokens
 * @returns {string} formatted date/time string
 */
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

/**
 * Resizes the popup body to at most 1/3 of the screen dimensions,
 * capped at 800×600px.
 */
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

/**
 * Updates the status text and last-update timestamp in the header.
 * @param {string} message - status message to display
 * @param {boolean} isError - if true, applies error styling to the status text
 */
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

/**
 * Updates the host label in the header.
 * @param {string} hostname - the Catalyst Center hostname or IP:port
 */
function updateHost(hostname) {
  const host = document.getElementById('host');
  host.textContent = "Host: " + hostname;

}

/**
 * Displays or clears the error message banner in the footer.
 * @param {string} message - error text to show; pass empty string to clear
 */
function displayErrorMessage(message = "") {
  const footer = document.getElementById('errorMessage');
  footer.textContent = message;
  if (message) {
    footer.classList.add('error-message');
    updateStatus("Error happened", isError = true);
  } else {
    footer.classList.remove('error-message');
  }
}

/**
 * Updates the render timestamp label below the table.
 * @param {string} timestamp - formatted timestamp string, or empty to clear
 */
function updateRenderTimestamp(timestamp) {
  const footer = document.getElementById('updatetimestamp');
  footer.textContent = timestamp;
}

/**
 * Returns the current local time as a locale-formatted string.
 * @returns {string}
 */
function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString(); // Returns the current time in a readable format
}

/**
 * Converts a MAC address to Cisco WLC dot notation (e.g. 1234.5678.ABCD).
 * Accepts colon-separated, dash-separated, or already dot-separated formats.
 * @param {string} macAddress - MAC in any supported format
 * @returns {string|false} MAC in WLC dot notation, or false if format is unrecognized
 */
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

/**
 * Parses the raw WLC client_wsa_info table record output into an array of
 * scan report measurement objects (bssid, channel, rssi, snr, received_time).
 * @param {string} inputString - raw text output from the WLC Command Runner
 * @returns {object[]} array of measurement entries, empty if no data found
 */
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
/**
 * Core fetch wrapper used by all API calls.
 * Handles error responses and returns the body in the requested format.
 * @param {string} url - full URL to request
 * @param {string} method - HTTP method ('GET', 'POST', etc.)
 * @param {'json'|'text'|'blob'} responseType - how to parse the response body
 * @returns {object|string|Blob|undefined} parsed response, or undefined on failure
 */
async function urlRequest(url, method, responseType = 'json') {
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
    if (responseType === 'blob') return response.blob();
    if (responseType === 'text') return response.text();
    return response.json();
  } catch (error) {
    console.error('There was a problem with the URL operation:', error);
    displayErrorMessage(error.message);
    updateStatus("Could not execute URL request", isError = true);
    errorState = true;
  }
}

/**
 * Sends a POST request to the given absolute URL.
 * @param {string} url - full URL
 * @returns {object|undefined}
 */
async function postRequest(url = "") {
  return urlRequest(url, "POST");
}

/**
 * Sends an authenticated GET request to a Catalyst Center API path.
 * @param {string} urlpath - API path (e.g. '/dna/intent/api/v1/...')
 * @param {'json'|'text'|'blob'} responseType - how to parse the response
 * @returns {object|string|Blob|undefined}
 */
async function getRequest(urlpath = "", responseType = 'json') {
  return await urlRequest("https://" + host + urlpath, "GET", responseType);
}

/**
 * Trigger a file download from a Blob object.
 * @param {Blob} blob - the data to download
 * @param {string} fileName - the file name to save as
 */
function triggerBlobDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const tempLink = document.createElement('a');
  tempLink.href = blobUrl;
  tempLink.download = fileName;
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Sends an authenticated POST request with a JSON body to a Catalyst Center API path.
 * @param {string} urlpath - API path
 * @param {object} data - request payload
 * @returns {object|undefined} parsed JSON response
 */
async function postData(urlpath = "", data = {}) {
  const url = "https://" + host + urlpath;

  // Default options are marked with *
  try {
    const datastring = JSON.stringify(data);
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

    const jsonData = response.json();
    return jsonData; // parses JSON response into native JavaScript objects
  } catch (error) {
    console.error('There was a problem with the URL operation:', error);
    displayErrorMessage(error.message);
    updateStatus("Could not execute URL request", isError = true);
    errorState = true;
  }
}

/**
 * Polls a Catalyst Center task until it finishes or the retry limit is reached.
 * @param {string} taskId - task ID returned by a command runner or provisioning call
 * @returns {object|false} task status response when complete, or false on timeout
 */
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
    const taskStatus = await getRequest(urlpath);
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

/**
 * Returns a Promise that resolves after the given number of milliseconds.
 * @param {number} ms - delay in milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Shows the login section and hides all action sections.
 */
function showLogin() {
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'block'
  document.getElementById('action-section').style.display = 'none'
  document.getElementById('device-action-section').style.display = 'none'
  document.getElementById('activity-action-section').style.display = 'none'
  document.getElementById('airsense-action-section').style.display = 'none'
}

/**
 * Shows the Client Analytics action section and hides all others.
 */
function showActionButton() {
  displayErrorMessage();
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'none'
  document.getElementById('action-section').style.display = 'flex'
  document.getElementById('device-action-section').style.display = 'none'
  document.getElementById('activity-action-section').style.display = 'none'
  document.getElementById('airsense-action-section').style.display = 'none'
}

/**
 * Shows the Device Config Archive action section and hides all others.
 */
function showDeviceActionButton() {
  displayErrorMessage();
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'none'
  document.getElementById('action-section').style.display = 'none'
  document.getElementById('device-action-section').style.display = 'flex'
  document.getElementById('activity-action-section').style.display = 'none'
  document.getElementById('airsense-action-section').style.display = 'none'
}

/**
 * Shows the Activity Tasks action section and hides all others.
 */
function showActivityActionButton() {
  displayErrorMessage();
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'none'
  document.getElementById('action-section').style.display = 'none'
  document.getElementById('device-action-section').style.display = 'none'
  document.getElementById('activity-action-section').style.display = 'flex'
  document.getElementById('airsense-action-section').style.display = 'none'
}

/**
 * Shows the AirSense Packet Capture section and hides all others.
 * Pre-fills the time range to the last 1 hour and loads client info.
 * @param {string} mac - client MAC address from the URL parameter
 */
function showAirsenseActionButton(mac) {
  displayErrorMessage();
  document.getElementById('info-section').style.display = 'none'
  document.getElementById('login-section').style.display = 'none'
  document.getElementById('action-section').style.display = 'none'
  document.getElementById('device-action-section').style.display = 'none'
  document.getElementById('activity-action-section').style.display = 'none'
  document.getElementById('airsense-action-section').style.display = 'flex'
  setAirsenseTimeRange(60 * 60 * 1000);
  loadAirsenseClientInfo(mac);
}
