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


let api_token = null;

/*
DEFINE LISTENERS
*/
// reset api_token on login
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ api_token: null });
});


// Add Listener for receiving messages
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    switch (request.type) {
      case 'popup': {
        processPopupMessage(request.action, request?.value);
        break;
      }
    }
  }
);

/*
IMPLEMENT FUNCTIONALITY
*/

function processPopupMessage(action, value = null) {
  switch (action) {
    case 'get-api-token':
      // verify if token is set and if we can query Catalyst Center API
      if (!api_token) {
        chrome.storage.session.get(["api_token"]).then((result) => {
          if (!result.api_token) {
            chrome.runtime.sendMessage(chrome.runtime.id, { type: "service_worker", action: "no-token" });
          } else {
            api_token = result.api_token;
            chrome.runtime.sendMessage(chrome.runtime.id, { type: "service_worker", action: "token", token: api_token });
          }
        });
      } else {
        chrome.runtime.sendMessage(chrome.runtime.id, { type: "service_worker", action: "token", token: api_token });
      }
      break;
    case 'set-api-token':
      apiToken = value;
      chrome.storage.session.set({ api_token: apiToken });
      break;
    case 'reset-api-token':
      chrome.storage.session.set({ api_token: null });
      break;
  }
}

function onError(tabs) {
  console.error(`Error: ${error}`);
}