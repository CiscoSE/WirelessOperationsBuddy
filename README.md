## Welcome to Wireless Operations Buddy Chrome Extension

This sample code is a Chrome Extension that helps you leverage
additional information for Client Troubleshooting especially
in case of Client Analytics. It allows you to query scan report data from Catalyst Center as well as from the Wireless Controller with the help of Catalyst Center Command Runner.



## Architecture

Chrome Extension with popup and service worker.

Clicking on the extension, the Popup window will ask you to navigate to Client 360 page on Catalyst Center.

The first time in a session when you open the extension on Client 360 page it will ask you to login to your Catalyst Center with a user that has API privileges. After this, the authentication token will be preserved for a session. Credentials will not be stored.

Once logged in you will be presented with 3 actions you can execute.

1. Query Catalyst Center data through API for scan report information and disconnect reasons
2. Use Catalyst Center Command Runner to query the WLC for the client it is connected to for current scan report data
3. Use Catalyst Center Command Runner to send an on-demand query through WLC to the client and collect the result


## Instructions

### Requirements

- Access to your Catalyst Center
- Chrome
- _[Optional]_ Access to your Wireless Controller

### Versions

Tested with Google Chrome 132.0.6834.110, Catalyst Center 2.3.7.x, C9800 17.12.x

### Steps

1. Download
   ```
   git clone https://github.com/CiscoSE/WirelessOperationsBuddy.git
   ```

2. _[Optional]_ Add the following applet into your C9800 configuration

   In order to be able to send on-demand requests to your clients (Action #3) and visualize the result this needs to be added.

   If you don't plan to add this configuration to your C9800, On Demand requests (Action #3) will not succeed.

   ```
    event manager applet sendRadioMeassurementRequest
     event cli pattern "show wireless client mac-address (.+) call-info chassis active R0" sync yes
     action 1.0 puts "Executing catalyst center test command"
     action 2.0 regexp "show wireless client mac-address (.+) call.*" "$_cli_msg" match mac
     action 2.2 puts "mac is $mac"
     action 2.3 cli command "wireless client mac-address $mac scan-report once mode table bssid all ssid current operating-class network channel all delay default duration default"
     action 3.0 puts "finished run of catalyst center test command"
   ```
   
3. Adding the unpacked extension to Chrome
   
   To be able to add the extension, you need to navigate to [Chrome Extensions](chrome://extensions)
   
   Within there, select _Developer Mode_ and select _Load Unpacked_. Now you can select the downloaded folder and the extension is ready to be used.

## Troubleshooting

A common error is that  Catalyst Center does not have a valid certificate. If you see any certificate warning, e.g. _Not Secure_ or _Not valid_ and experience errors during the Login process, please resolve those certificate warnings by adding the Catalyst Center System Certificate issuing CA as a trusted CA to your System.

## License

Check the [LICENSE][LICENSE] file attached to the project to see all the 
details.

[LICENSE]: ./LICENSE.md