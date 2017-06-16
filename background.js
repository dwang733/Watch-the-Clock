"use strict";

/****************** EVENTS *********************/

// Fires when new page is loaded
chrome.webNavigation.onCompleted.addListener(details => {
    // Only occurs if page is fully loaded
    if (details.frameId === 0) {
        console.log(`Loading new page!`);
        chrome.tabs.get(details.tabId, tab => {
            chrome.windows.get(tab.windowId, window => {
                if (tab.active && window.focused) {
                    console.log(`Loaded on focused, active tab!`);
                    updateWithCurrentTab();
                } else {
                    console.log(`Loaded elsewhere (new tab, etc.)!`);
                    console.log(`---------------------------------`);
                }
            });
        });
    }
});

// Fires when a different/no window is in focus
chrome.windows.onFocusChanged.addListener(async function(windowId) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        console.log(`Chrome unfocused!`);
        stopTracking();
    } else {
        console.log(`Chrome changed focus!`);
        updateWithCurrentTab();
    }
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(async function(activeInfo) {
    // If window is closing, tab not found and throws error, so ignore.
    try {
        var tab = await safeChromeOp(chrome.tabs.get, activeInfo.tabId);
    } catch (err) {
        return; 
    }

    console.log(`New active tab!`);
    try {
        const prevTab = (await safeChromeOp(chrome.storage.local.get, 
            "prevTab"))["prevTab"];
        if (tab.status !== "complete") {
            console.log(`Tab still loading!`);
            // stopTracking();
            console.log(`---------------------------------`);
        } else if (tab.windowId === prevTab.windowId) {
            console.log(`Active tab in same window!`);
            updateWithCurrentTab();
        } else {
            console.log(`Active tab in different window!`);
            console.log(`---------------------------------`);
        }
    } catch (err) {
        console.error(err);
    }
});

// Detect if user is idle or not
chrome.idle.onStateChanged.addListener(async function(newState) {
    console.log(`Machine is ${newState}.`);
    if (newState !== "active") {
        stopTracking();
    } else {
        try {
            const prevTab = (await safeChromeOp(chrome.storage.local.get, 
                "prevTab"))["prevTab"];
            chrome.windows.get(prevTab.windowId, window => {
                if (prevTab.active && window.focused) {
                    console.log(`Returned to same tab!`);
                    updateWithCurrentTab();
                }
            });
        } catch (err) {
            console.error(err);
        }
    }
});

// Update time when alarm called
chrome.alarms.onAlarm.addListener(alarm => {
    console.log(`Update from alarm at ${new Date().toLocaleTimeString()}`);
    updateWithCurrentTab();
});

// Set time interval when user is active.
chrome.runtime.onInstalled.addListener(async function(details) {
    console.log(`Installing...`);
    chrome.idle.setDetectionInterval(15);
    await trackCurrentTab();
    console.log(`---------------------------------`);
});

/****************** TIME TRACKING ******************/

async function updateWithCurrentTab() {
    try {
        await updateTime();
        await trackCurrentTab();
        console.log(`Setting alarm.`);
        console.log(`---------------------------------`);
        chrome.alarms.create("Update Time", {"delayInMinutes": 1});
    } catch (err) {
        console.error(err);
    }
}

async function stopTracking() {
    try {
        await updateTime();
        console.log(`Stopping time tracking.`);
        await safeChromeOp(chrome.storage.local.remove, "prevStart");
        console.log(`Clearing alarm.`);
        console.log(`---------------------------------`);
        chrome.alarms.clear("Update Time");
    } catch (err) {
        console.error(err);
    }
}

async function updateTime() {
    const prev = await safeChromeOp(chrome.storage.local.get, ["prevStart", "prevTab"]);
    const prevStart = prev["prevStart"];
    const prevURL = getTLD(prev["prevTab"].url);
    const prevURLResult = await safeChromeOp(chrome.storage.local.get, {[prevURL]: 0});
    const prevURLTime = prevURLResult[prevURL];
    const timeSpent = (new Date().getTime() - prevStart) / 1000;
    // Only add time if we're tracking time and time spent is less than
    // alarm time (since chrome probably closed)
    if (prevStart && timeSpent < 60 * 1.1) {
        console.log(`Updating website time!`);
        console.log(`Prev url: ${prevURL}`);
        console.log(`Time just spent on prev URL: ${timeSpent}`);
        const setObj = {[prevURL]: prevURLTime + timeSpent};
        await safeChromeOp(chrome.storage.local.set, setObj);
    }
}

function trackCurrentTab() {
    console.log(`Tracking current tab!`);
    return new Promise((resolve, reject) => {
        chrome.tabs.query({currentWindow: true, active: true}, tabs => {
            const setObj = {
                "prevStart": new Date().getTime(),
                "prevTab": tabs[0]
            };
            console.log(`Current url: ${getTLD(tabs[0].url)}`);
            resolve(safeChromeOp(chrome.storage.local.set, setObj));
        });
    });
}

/**************** HELPER/DEBUGGER FUNCTIONS ******************/

chrome.storage.onChanged.addListener((changes, areaName) => {
    for (const i in changes) {
        console.log(`Key: ${i} \n` + `oldValue: ${changes[i]["oldValue"]} \n` +
            `newValue: ${changes[i]["newValue"]}`);
    }
});

// Get top level domain name
// E.g. http://store.google.com/xyz -> http://store.google.com
function getTLD(thisURL) {
    const regex = /^(\S+?:\/\/[^\/]+).*$/;
    return thisURL.match(regex)[1];
}

// Performs the memory op with the given arg and checks that it succeeded
function safeChromeOp(op, arg) {
    return new Promise((resolve, reject) => {
        op(arg, retVal => chrome.runtime.lastError ? 
            reject(chrome.runtime.lastError) : resolve(retVal));
    });
}